import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import api from "../src/api";
import {
  connectSocket,
  joinRoom,
  leaveRoom,
  onSocketStatusChange,
} from "../src/services/socket";
import {
  broadcastPosition,
  resetBroadcaster,
} from "../src/services/positionBroadcaster";
import {
  initSpatialAudio,
  setLocalAudioMute,
  connectToPeer,
  hasPeer,
  updateSpatialAudioVolumes,
  stopSpatialAudio,
} from "../src/services/spatialAudio";
import {
  createPlacedObject,
  normalizeBuildingBlockObject,
} from "../src/components/OfficeBuilder/officeCatalog";
import {
  loadOfficeLayout,
  saveOfficeLayout,
} from "../src/services/officeLayoutStorage";
import {
  isPositionBlocked,
  getSafePosition,
} from "../src/components/OfficeBuilder/collisionService";
import BuilderToolbar from "../src/components/OfficeBuilder/BuilderToolbar";
import BuildingBlocksLibrary from "../src/components/OfficeBuilder/BuildingBlocksLibrary";
import ObjectPropertiesPanel from "../src/components/OfficeBuilder/ObjectPropertiesPanel";
import OfficeObjectRenderer from "../src/components/OfficeBuilder/OfficeObjectRenderer";
import "../src/components/OfficeBuilder/OfficeBuilder.css";
import "./VirtualOffice.css";

const PROXIMITY_RADIUS = 22;

function normalizeLayoutToMap(input) {
  if (!input) return {};

  let objectsList = [];
  if (Array.isArray(input)) {
    objectsList = input;
  } else if (input.officeLayout && Array.isArray(input.officeLayout.objects)) {
    objectsList = input.officeLayout.objects;
  } else if (input.office_layout && Array.isArray(input.office_layout.objects)) {
    objectsList = input.office_layout.objects;
  } else if (Array.isArray(input.objects)) {
    objectsList = input.objects;
  } else if (typeof input === "object") {
    objectsList = Object.entries(input)
      .filter(([k, v]) => v && typeof v === "object" && k !== "version" && k !== "objects" && k !== "officeLayout" && k !== "office_layout")
      .map(([k, v]) => ({ id: k, ...v }));
  }

  if (objectsList.length === 0) {
    return {};
  }

  const map = {};
  for (const rawObj of objectsList) {
    if (!rawObj || typeof rawObj !== "object") continue;
    const normalized = normalizeBuildingBlockObject(rawObj, rawObj.id);
    if (normalized) {
      map[normalized.id] = {
        ...rawObj,
        ...normalized,
        x: normalized.position.x,
        y: normalized.position.y,
        color: rawObj.color || normalized.color,
        icon: rawObj.icon || normalized.icon,
        category: rawObj.category || normalized.category,
      };
    }
  }
  return map;
}

function resolveZoneAt(x, y, layoutOrZones = []) {
  const items = Array.isArray(layoutOrZones)
    ? layoutOrZones
    : Object.values(layoutOrZones);

  for (const item of items) {
    if (!item || !String(item.type).startsWith("zone-")) continue;

    const zX = item.x ?? 50;
    const zY = item.y ?? 50;
    const widthPx = item.width || 180;
    const heightPx = item.height || 120;

    const halfWPct = (widthPx / 1000) * 50;
    const halfHPct = (heightPx / 600) * 50;

    if (
      x >= zX - halfWPct &&
      x <= zX + halfWPct &&
      y >= zY - halfHPct &&
      y <= zY + halfHPct
    ) {
      return {
        id: item.id,
        name: item.name || "Custom Zone",
        icon: item.icon || "📍",
        color: item.color || "#8b5cf6",
      };
    }
  }

  return { id: "hallway", name: "Main Hallway", icon: "🚶", color: "#64748b" };
}

function getDistance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

export default function VirtualOffice({
  organization,
  user,
  onBack,
  onShowToast,
}) {
  const userName =
    user?.displayName || user?.email?.split("@")[0] || "Teammate";
  const userAvatar =
    user?.photoURL ||
    (user?.uid ? localStorage.getItem(`proxispeak-avatar-${user.uid}`) : null) ||
    "🧑🏻";
  const savedAvatar = userAvatar;

  const isAvatarUrl = (val) =>
    typeof val === "string" &&
    (val.startsWith("http://") ||
      val.startsWith("https://") ||
      val.startsWith("data:image/") ||
      val.startsWith("blob:"));

  const isUserAvatarUrl = isAvatarUrl(userAvatar);
  const orgId =
    organization?.id ||
    organization?._id ||
    organization?.code ||
    organization?.invite_code ||
    organization?.firestoreId ||
    "default-office";
  const userId =
    user?.uid ||
    "user-" + (user?.email?.split("@")[0] || "guest");

  const [position, setPosition] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`proxispeak-office-pos-${orgId}-${userId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          return parsed;
        }
      }
    } catch {}
    return { x: 24, y: 48 };
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(
        `proxispeak-office-pos-${orgId}-${userId}`,
        JSON.stringify(position)
      );
    } catch {}
  }, [position, orgId, userId]);

  const [zoom, setZoom] = useState(1);
  const [activeZoneFilter, setActiveZoneFilter] = useState("All Zones");
  const [searchQuery, setSearchQuery] = useState("");
  const [status] = useState("Available");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMembersLoading, setIsMembersLoading] = useState(true);
  const [remoteUsers, setRemoteUsers] = useState({});
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [micError, setMicError] = useState("");
  const [activeSideTab, setActiveSideTab] = useState("teammates");
  const [socketStatus, setSocketStatus] = useState("connecting");
  const [isDraggingAvatar, setIsDraggingAvatar] = useState(false);
  const isDraggingAvatarRef = useRef(false);

  // Dynamic office layout state
  const [furnitureLayout, setFurnitureLayout] = useState(() => {
    try {
      const saved = loadOfficeLayout(orgId);
      if (saved && Object.keys(saved).length > 0) {
        return saved;
      }
      if (organization?.officeLayout && typeof organization.officeLayout === "object") {
        return normalizeLayoutToMap(organization.officeLayout);
      }
      if (organization?.office_layout && typeof organization.office_layout === "object") {
        return normalizeLayoutToMap(organization.office_layout);
      }
    } catch (e) {
      console.warn("Failed to initialize office layout:", e);
    }
    return {};
  });

  // Load layout from backend MongoDB API (/api/organizations/:id)
  useEffect(() => {
    if (!orgId) return;
    let isCancelled = false;

    async function fetchLayoutFromBackend() {
      try {
        const res = await api.get(`/api/organizations/${orgId}`);
        if (!isCancelled && res.data?.organization?.office_layout) {
          const dbLayout = res.data.organization.office_layout;
          const normalized = normalizeLayoutToMap(dbLayout);
          if (normalized && Object.keys(normalized).length > 0) {
            setFurnitureLayout(normalized);
            saveOfficeLayout(orgId, normalized);
            return;
          }
        }
      } catch (err) {
        console.warn("[VirtualOffice] Backend layout fetch fallback to localStorage:", err.message);
      }

      if (!isCancelled) {
        const saved = loadOfficeLayout(orgId);
        if (saved && Object.keys(saved).length > 0) {
          setFurnitureLayout(saved);
        } else if (organization?.officeLayout && typeof organization.officeLayout === "object") {
          setFurnitureLayout(normalizeLayoutToMap(organization.officeLayout));
        } else if (organization?.office_layout && typeof organization.office_layout === "object") {
          setFurnitureLayout(normalizeLayoutToMap(organization.office_layout));
        }
      }
    }

    fetchLayoutFromBackend();
    return () => {
      isCancelled = true;
    };
  }, [orgId, organization?.officeLayout, organization?.office_layout]);

  const dynamicZonesList = useMemo(() => {
    return Object.values(furnitureLayout).filter(
      (item) => item && String(item.type).startsWith("zone-")
    );
  }, [furnitureLayout]);

  const getZoneForPosition = useCallback(
    (posX, posY) => resolveZoneAt(posX, posY, dynamicZonesList),
    [dynamicZonesList]
  );

  const zoneFilters = useMemo(() => {
    const names = Array.from(new Set(dynamicZonesList.map((z) => z.name || "Zone")));
    return ["All Zones", ...names];
  }, [dynamicZonesList]);

  // Layout editing states
  const isOwnerOrAdmin =
    !organization?.ownerId ||
    organization?.ownerId === user?.uid ||
    organization?.owner_id === user?.uid ||
    organization?.role === "Owner" ||
    organization?.role === "Admin" ||
    organization?.role === "owner" ||
    organization?.role === "admin";

  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [builderMode, setBuilderMode] = useState("edit");
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [isLibraryOpen, setIsLibraryOpen] = useState(true);
  const [, setDraggedItemId] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [layoutNotice, setLayoutNotice] = useState(null);
  const [floorPlacementCoord, setFloorPlacementCoord] = useState(null);

  const [preEditLayout, setPreEditLayout] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(historyIndex);
  historyIndexRef.current = historyIndex;

  // Auto-save layout changes locally while editing
  useEffect(() => {
    if (!orgId || !isEditingLayout) return;
    const timer = setTimeout(() => {
      saveOfficeLayout(orgId, furnitureLayout);
    }, 300);
    return () => clearTimeout(timer);
  }, [furnitureLayout, orgId, isEditingLayout]);

  const snapCoord = useCallback(
    (val, step = 2) => {
      return snapToGrid ? Math.round(val / step) * step : Math.round(val);
    },
    [snapToGrid]
  );

  const pushHistory = useCallback(
    (newLayout) => {
      setHistory((prev) => {
        const nextSlice = prev.slice(0, historyIndexRef.current + 1);
        return [...nextSlice, newLayout].slice(-30);
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 29));
      if (orgId) {
        saveOfficeLayout(orgId, newLayout);
      }
    },
    [orgId]
  );

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      const targetIndex = historyIndexRef.current - 1;
      const targetLayout = history[targetIndex];
      setFurnitureLayout(targetLayout);
      setHistoryIndex(targetIndex);
      if (orgId) {
        saveOfficeLayout(orgId, targetLayout);
      }
    }
  }, [history, orgId]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < history.length - 1) {
      const targetIndex = historyIndexRef.current + 1;
      const targetLayout = history[targetIndex];
      setFurnitureLayout(targetLayout);
      setHistoryIndex(targetIndex);
      if (orgId) {
        saveOfficeLayout(orgId, targetLayout);
      }
    }
  }, [history, orgId]);

  const selectedItemName = useMemo(() => {
    if (!selectedItemId) return null;
    const item = furnitureLayout[selectedItemId];
    if (item?.name) return item.name;
    if (item?.label) return item.label;
    if (selectedItemId.startsWith("pod-")) {
      const num = selectedItemId.replace("pod-", "");
      return `Desk Pod ${num}`;
    }
    if (selectedItemId.startsWith("aisle-p")) {
      return "Aisle Plant";
    }
    return "Office Object";
  }, [selectedItemId, furnitureLayout]);

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    const item = furnitureLayout[selectedItemId];
    if (!item) return null;
    return {
      id: selectedItemId,
      name: item.name || selectedItemName || "Office Object",
      type: item.type || "furniture",
      category: item.category || "Furniture",
      icon: item.icon || "📦",
      x: item.x ?? 50,
      y: item.y ?? 50,
      width: item.width ?? 40,
      height: item.height ?? 20,
      rotation: item.rotation ?? 0,
      isSolid: item.isSolid !== false,
      canPass: item.canPass === true,
      ...item,
    };
  }, [selectedItemId, furnitureLayout, selectedItemName]);

  function handleEnterEditLayout() {
    if (!isOwnerOrAdmin) {
      setLayoutNotice({
        type: "error",
        text: "Only organization owners or administrators can edit the office layout.",
      });
      setTimeout(() => setLayoutNotice(null), 4000);
      return;
    }
    setZoom(1);
    setActiveZoneFilter("All Zones");
    setPreEditLayout({ ...furnitureLayout });
    setHistory([furnitureLayout]);
    setHistoryIndex(0);
    setIsEditingLayout(true);
    setBuilderMode("edit");
    setIsLibraryOpen(true);
    setLayoutNotice({
      type: "info",
      text: "✏️ Builder active: Drag blocks onto canvas or select objects to edit.",
    });
    setTimeout(() => setLayoutNotice(null), 3000);
  }

  function handleCancelEditLayout() {
    if (preEditLayout) {
      setFurnitureLayout(preEditLayout);
      if (orgId) {
        saveOfficeLayout(orgId, preEditLayout);
      }
    }
    setZoom(1);
    setIsEditingLayout(false);
    setBuilderMode("edit");
    setDraggedItemId(null);
    setSelectedItemId(null);
    setFloorPlacementCoord(null);
    setLayoutNotice({
      type: "info",
      text: "Layout changes discarded.",
    });
    setTimeout(() => setLayoutNotice(null), 2500);
  }

  function handleResetLayout() {
    setZoom(1);
    setFurnitureLayout({});
    pushHistory({});
    setSelectedItemId(null);
    if (orgId) {
      saveOfficeLayout(orgId, {});
    }
    setLayoutNotice({
      type: "info",
      text: "Reset layout to empty office canvas.",
    });
    setTimeout(() => setLayoutNotice(null), 2500);
  }

  const handleAddBlockToMap = useCallback(
    (blockTemplate) => {
      const newObj = createPlacedObject(blockTemplate, 46, 52);
      setFurnitureLayout((prev) => {
        const next = { ...prev, [newObj.id]: newObj };
        pushHistory(next);
        return next;
      });
      setSelectedItemId(newObj.id);
      setLayoutNotice({
        type: "info",
        text: `Added "${blockTemplate.name}" to office canvas.`,
      });
      setTimeout(() => setLayoutNotice(null), 2500);
    },
    [pushHistory]
  );

  const handleStartDragBlock = useCallback((event, blockTemplate) => {
    event.dataTransfer.setData("application/json", JSON.stringify(blockTemplate));
    event.dataTransfer.effectAllowed = "copy";
  }, []);

  const handleFloorDragOver = useCallback(
    (event) => {
      if (!isEditingLayout || builderMode !== "edit") return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      if (!floorRef.current) return;
      const rect = floorRef.current.getBoundingClientRect();
      const rawX = ((event.clientX - rect.left) / rect.width) * 100;
      const rawY = ((event.clientY - rect.top) / rect.height) * 100;
      const snappedX = Math.max(3, Math.min(95, snapCoord(rawX)));
      const snappedY = Math.max(5, Math.min(94, snapCoord(rawY)));
      setFloorPlacementCoord({ x: snappedX, y: snappedY });
    },
    [isEditingLayout, builderMode, snapCoord]
  );

  const handleFloorDrop = useCallback(
    (event) => {
      if (!isEditingLayout || builderMode !== "edit") return;
      event.preventDefault();
      setFloorPlacementCoord(null);
      try {
        const rawData = event.dataTransfer.getData("application/json");
        if (!rawData) return;
        const template = JSON.parse(rawData);
        if (!template || !template.type) return;

        const rect = floorRef.current.getBoundingClientRect();
        const rawX = ((event.clientX - rect.left) / rect.width) * 100;
        const rawY = ((event.clientY - rect.top) / rect.height) * 100;
        const dropX = Math.max(3, Math.min(95, snapCoord(rawX)));
        const dropY = Math.max(5, Math.min(94, snapCoord(rawY)));

        const newObj = createPlacedObject(template, dropX, dropY);
        setFurnitureLayout((prev) => {
          const next = { ...prev, [newObj.id]: newObj };
          pushHistory(next);
          return next;
        });
        setSelectedItemId(newObj.id);
        setLayoutNotice({
          type: "info",
          text: `Placed "${template.name}" on canvas.`,
        });
        setTimeout(() => setLayoutNotice(null), 2500);
      } catch {}
    },
    [isEditingLayout, builderMode, snapCoord, pushHistory]
  );

  const handleUpdateItem = useCallback(
    (itemId, updates) => {
      setFurnitureLayout((prev) => {
        const existing = prev[itemId] || {};
        const next = {
          ...prev,
          [itemId]: { ...existing, ...updates },
        };
        pushHistory(next);
        return next;
      });
    },
    [pushHistory]
  );

  const handleRotateItem = useCallback(
    (itemId) => {
      if (!itemId) return;
      setFurnitureLayout((prev) => {
        const existing = prev[itemId] || {};
        const currentRot = existing.rotation || 0;
        const nextRot = (currentRot + 90) % 360;
        const next = {
          ...prev,
          [itemId]: { ...existing, rotation: nextRot },
        };
        pushHistory(next);
        return next;
      });
    },
    [pushHistory]
  );

  const handleDuplicateItem = useCallback(
    (itemId) => {
      if (!itemId) return;
      const existing = furnitureLayout[itemId];
      if (!existing) return;
      const newId = `block-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newX = Math.min(94, (existing.x || existing.position?.x || 50) + 3);
      const newY = Math.min(93, (existing.y || existing.position?.y || 50) + 3);

      const cloned = normalizeBuildingBlockObject(
        {
          ...existing,
          id: newId,
          name: `${existing.name || "Object"} (Copy)`,
          x: newX,
          y: newY,
          position: { x: newX, y: newY },
        },
        newId
      );

      setFurnitureLayout((prev) => {
        const next = {
          ...prev,
          [newId]: {
            ...cloned,
            x: cloned.position.x,
            y: cloned.position.y,
            icon: existing.icon,
            category: existing.category,
            color: existing.color,
          },
        };
        pushHistory(next);
        return next;
      });
      setSelectedItemId(newId);
      setLayoutNotice({
        type: "info",
        text: `Duplicated "${existing.name || "Object"}".`,
      });
      setTimeout(() => setLayoutNotice(null), 2000);
    },
    [furnitureLayout, pushHistory]
  );

  const handleDeleteSelected = useCallback(() => {
    if (!selectedItemId) return;
    const itemToDelete = furnitureLayout[selectedItemId];
    const itemName = itemToDelete?.name || itemToDelete?.label || "element";

    setFurnitureLayout((prev) => {
      const next = { ...prev };
      delete next[selectedItemId];
      pushHistory(next);
      return next;
    });
    setSelectedItemId(null);
    setLayoutNotice({
      type: "info",
      text: `Removed "${itemName}" from office layout.`,
    });
    setTimeout(() => setLayoutNotice(null), 2500);
  }, [selectedItemId, furnitureLayout, pushHistory]);

  // Persists layout both locally and to MongoDB database backend (/api/organizations/:id/layout)
  async function handleSaveLayout() {
    setIsSavingLayout(true);
    try {
      const savedPayload = saveOfficeLayout(orgId, furnitureLayout);
      const count =
        savedPayload?.officeLayout?.objects?.length ??
        Object.keys(furnitureLayout).length;

      // Update in MongoDB database backend
      try {
        await api.put(`/api/organizations/${orgId}/layout`, {
          office_layout: savedPayload?.officeLayout || savedPayload || { version: 1, objects: Object.values(furnitureLayout) },
        });
      } catch (backendErr) {
        console.warn("[VirtualOffice] Backend layout save fallback:", backendErr.message);
      }

      // Broadcast layout update to all connected peers in room via WebSocket
      const socket = connectSocket();
      socket.emit("office:layout-update", {
        organizationId: orgId,
        officeLayout: savedPayload?.officeLayout || furnitureLayout,
      });

      setPreEditLayout({ ...furnitureLayout });
      setLayoutNotice({
        type: "success",
        text: `✓ Office layout saved! (${count} ${
          count === 1 ? "object" : "objects"
        })`,
      });
      if (onShowToast) {
        onShowToast({
          type: "success",
          title: "Layout Saved",
          message: `Office layout saved with ${count} ${
            count === 1 ? "object" : "objects"
          }.`,
        });
      }
      setTimeout(() => setLayoutNotice(null), 3000);
    } catch (err) {
      setLayoutNotice({
        type: "error",
        text: `Failed to save layout: ${err.message || "Please try again."}`,
      });
      setTimeout(() => setLayoutNotice(null), 4000);
    } finally {
      setIsSavingLayout(false);
    }
  }

  // Done button persists layout to MongoDB database backend and exits edit mode
  async function handleDone() {
    setIsSavingLayout(true);
    try {
      const savedPayload = saveOfficeLayout(orgId, furnitureLayout);
      const count =
        savedPayload?.officeLayout?.objects?.length ??
        Object.keys(furnitureLayout).length;

      // Update in MongoDB database backend
      try {
        await api.put(`/api/organizations/${orgId}/layout`, {
          office_layout: savedPayload?.officeLayout || savedPayload || { version: 1, objects: Object.values(furnitureLayout) },
        });
      } catch (backendErr) {
        console.warn("[VirtualOffice] Backend layout save fallback:", backendErr.message);
      }

      // Broadcast layout update to all peers in room via WebSocket
      const socket = connectSocket();
      socket.emit("office:layout-update", {
        organizationId: orgId,
        officeLayout: savedPayload?.officeLayout || furnitureLayout,
      });

      setPreEditLayout({ ...furnitureLayout });
      setZoom(1);
      setIsEditingLayout(false);
      setBuilderMode("edit");
      setSelectedItemId(null);
      setFloorPlacementCoord(null);

      setLayoutNotice({
        type: "success",
        text: `✓ Office layout saved successfully! (${count} ${
          count === 1 ? "object" : "objects"
        })`,
      });
      if (onShowToast) {
        onShowToast({
          type: "success",
          title: "Office Layout Saved",
          message: `✓ Office layout saved successfully with ${count} ${
            count === 1 ? "object" : "objects"
          }.`,
        });
      }
      setTimeout(() => setLayoutNotice(null), 4000);
    } catch (err) {
      setLayoutNotice({
        type: "error",
        text: `Failed to save layout: ${err.message || "Please try again."}`,
      });
      setTimeout(() => setLayoutNotice(null), 5000);
    } finally {
      setIsSavingLayout(false);
    }
  }

  function handleStartDragFurniture(event, itemId) {
    if (!isEditingLayout || builderMode !== "edit") return;
    event.preventDefault();
    event.stopPropagation();

    setSelectedItemId(itemId);
    setDraggedItemId(itemId);

    const floor = floorRef.current;
    if (!floor) return;

    const rect = floor.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const currentItem = furnitureLayout[itemId] || { x: 50, y: 50 };
    const originalX = currentItem.x;
    const originalY = currentItem.y;
    let latestLayout = furnitureLayout;
    let lastSnappedX = originalX;
    let lastSnappedY = originalY;

    function onPointerMove(moveEvent) {
      const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
      const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100;

      const rawNewX = Math.max(2, Math.min(96, originalX + deltaX));
      const rawNewY = Math.max(4, Math.min(95, originalY + deltaY));
      const snappedX = snapCoord(rawNewX);
      const snappedY = snapCoord(rawNewY);

      if (snappedX === lastSnappedX && snappedY === lastSnappedY) {
        return;
      }
      lastSnappedX = snappedX;
      lastSnappedY = snappedY;

      setFurnitureLayout((prev) => {
        const existing = prev[itemId] || {};
        const updated = {
          ...prev,
          [itemId]: {
            ...existing,
            x: snappedX,
            y: snappedY,
          },
        };
        latestLayout = updated;
        return updated;
      });
    }

    function onPointerUp() {
      setDraggedItemId(null);
      pushHistory(latestLayout);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  const floorRef = useRef(null);

  const furnitureLayoutRef = useRef(furnitureLayout);
  furnitureLayoutRef.current = furnitureLayout;
  const selectedItemIdRef = useRef(selectedItemId);
  selectedItemIdRef.current = selectedItemId;
  const builderModeRef = useRef(builderMode);
  builderModeRef.current = builderMode;
  const isEditingLayoutRef = useRef(isEditingLayout);
  isEditingLayoutRef.current = isEditingLayout;

  // Real-time WebSocket room presence, instant multi-user visibility, and audio lifecycle
  useEffect(() => {
    if (!orgId || !userId) return;

    const socket = connectSocket();

    // Join room with full user profile and coordinates
    joinRoom(orgId, {
      uid: userId,
      userId,
      name: userName,
      avatar: savedAvatar,
      status,
      isMuted,
      isSpeaking,
      x: position.x,
      y: position.y,
    });

    // Initialize spatial proximity audio with WebRTC mesh & smooth cross-fade
    initSpatialAudio(
      orgId,
      userId,
      (speaking) => setIsSpeaking(speaking),
      (err) => setMicError(err)
    );

    // Initial broadcast of avatar position
    broadcastPosition({
      organizationId: orgId,
      userId,
      x: position.x,
      y: position.y,
      name: userName,
      avatar: savedAvatar,
    });

    // 1. Initial list of users currently in the room
    function handleCurrentUsers(usersList) {
      if (!Array.isArray(usersList)) return;
      setRemoteUsers((prev) => {
        const next = { ...prev };
        usersList.forEach((u) => {
          const peerId = u.userId || u.uid || u.socketId;
          if (peerId && peerId !== userId) {
            next[peerId] = {
              ...(next[peerId] || {}),
              ...u,
              uid: peerId,
              socketId: u.socketId,
              x: typeof u.x === "number" ? u.x : 50,
              y: typeof u.y === "number" ? u.y : 50,
              lastUpdate: Date.now(),
            };
            if (u.socketId) {
              connectToPeer(u.socketId);
            }
          }
        });
        return next;
      });
      setIsMembersLoading(false);
    }

    // 2. A new user joined the room
    function handleUserJoined(userData) {
      const peerId = userData.userId || userData.uid || userData.socketId;
      if (!peerId || peerId === userId) return;

      setRemoteUsers((prev) => ({
        ...prev,
        [peerId]: {
          ...(prev[peerId] || {}),
          ...userData,
          uid: peerId,
          socketId: userData.socketId,
          x: typeof userData.x === "number" ? userData.x : 50,
          y: typeof userData.y === "number" ? userData.y : 50,
          lastUpdate: Date.now(),
        },
      }));

      // Reply with our current position so new peer sees us immediately
      broadcastPosition({
        organizationId: orgId,
        userId,
        x: position.x,
        y: position.y,
        name: userName,
        avatar: savedAvatar,
      });

      // The joining user initiates connectToPeer from handleCurrentUsers.
      // Grace period fallback: if connection not formed after 600ms, initiate offer
      setTimeout(() => {
        if (userData.socketId && !hasPeer(userData.socketId)) {
          connectToPeer(userData.socketId);
        }
      }, 600);
    }

    // 3. User left the room
    function handleUserLeft(data) {
      const peerId = data.userId || data.uid || data.socketId;
      if (!peerId) return;
      setRemoteUsers((prev) => {
        const next = { ...prev };
        delete next[peerId];
        Object.keys(next).forEach((k) => {
          if (next[k]?.socketId === data.socketId || next[k]?.uid === peerId) {
            delete next[k];
          }
        });
        return next;
      });
    }

    // 4. Remote peer moved
    function handleUserMoved(peerData) {
      const peerId = peerData.userId || peerData.uid || peerData.socketId;
      if (!peerId || peerId === userId) return;

      setRemoteUsers((prev) => ({
        ...prev,
        [peerId]: {
          ...(prev[peerId] || {}),
          uid: peerId,
          socketId: peerData.socketId || prev[peerId]?.socketId,
          name: peerData.name || prev[peerId]?.name || "Teammate",
          avatar: peerData.avatar || prev[peerId]?.avatar || "🧑🏻",
          x: peerData.x,
          y: peerData.y,
          lastUpdate: Date.now(),
        },
      }));
    }

    // 5. Remote peer mic status
    function handleMicStatus(data) {
      const peerId = data.sender || data.socketId;
      if (!peerId || peerId === userId) return;
      setRemoteUsers((prev) => {
        const targetKey = Object.keys(prev).find(
          (k) => k === peerId || prev[k]?.socketId === data.socketId || prev[k]?.uid === peerId
        );
        if (!targetKey) return prev;
        return {
          ...prev,
          [targetKey]: {
            ...prev[targetKey],
            isMuted: data.isMuted ?? prev[targetKey].isMuted,
            isSpeaking: data.isSpeaking ?? prev[targetKey].isSpeaking,
          },
        };
      });
    }

    // 6. Real-time chat messages broadcast
    function handleIncomingChat(chatMsg) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === chatMsg.id)) return prev;
        return [...prev, chatMsg].slice(-50);
      });
    }

    // 7. Remote layout update
    function handleRemoteLayoutUpdate(payload) {
      if (payload?.organizationId === orgId) {
        const incoming = payload.officeLayout || payload.layout;
        if (incoming && typeof incoming === "object") {
          const normalized = normalizeLayoutToMap(incoming);
          setFurnitureLayout((prev) => ({
            ...prev,
            ...normalized,
          }));
        }
      }
    }

    socket.on("room:current-users", handleCurrentUsers);
    socket.on("room:user-joined", handleUserJoined);
    socket.on("room:user-left", handleUserLeft);
    socket.on("user:moved", handleUserMoved);
    socket.on("mic-status", handleMicStatus);
    socket.on("user:chat", handleIncomingChat);
    socket.on("office:layout-updated", handleRemoteLayoutUpdate);

    const unsubscribeStatus = onSocketStatusChange((s) => {
      setSocketStatus(s);
      if (s === "connected") {
        setIsMembersLoading(false);
      }
    });

    const loadingTimeout = setTimeout(() => {
      setIsMembersLoading(false);
    }, 1000);

    return () => {
      clearTimeout(loadingTimeout);
      stopSpatialAudio();
      unsubscribeStatus();
      socket.off("room:current-users", handleCurrentUsers);
      socket.off("room:user-joined", handleUserJoined);
      socket.off("room:user-left", handleUserLeft);
      socket.off("user:moved", handleUserMoved);
      socket.off("mic-status", handleMicStatus);
      socket.off("user:chat", handleIncomingChat);
      socket.off("office:layout-updated", handleRemoteLayoutUpdate);
      leaveRoom(orgId, userId);
      resetBroadcaster();
    };
  }, [orgId, userId, userName, savedAvatar, status, isMuted, isSpeaking, position.x, position.y]);

  // Broadcast avatar position on movement (throttled & deduplicated)
  useEffect(() => {
    if (!orgId || !userId) return;

    broadcastPosition({
      organizationId: orgId,
      userId,
      x: position.x,
      y: position.y,
      name: userName,
      avatar: savedAvatar,
    });
  }, [position.x, position.y, orgId, userId, userName, savedAvatar]);

  // Teammates list with distance & proximity calculation
  const allTeammates = useMemo(() => {
    const list = [];

    Object.values(remoteUsers).forEach((remote) => {
      if (remote && remote.uid && remote.uid !== user?.uid && remote.uid !== userId) {
        const isNumX = typeof remote.x === "number";
        const isNumY = typeof remote.y === "number";
        list.push({
          uid: remote.uid,
          socketId: remote.socketId,
          name: remote.name || "Teammate",
          role: remote.role || (isNumX && isNumY ? `In ${getZoneForPosition(remote.x, remote.y).name}` : "Online"),
          avatar: remote.avatar || "🧑🏻",
          x: isNumX ? remote.x : 50,
          y: isNumY ? remote.y : 50,
          status: remote.status || "Available",
          isMuted: Boolean(remote.isMuted),
          isSpeaking: Boolean(remote.isSpeaking),
          isDemo: false,
        });
      }
    });

    return list.map((t) => {
      const distance = getDistance(position.x, position.y, t.x, t.y);
      const inRange = distance <= PROXIMITY_RADIUS;
      const volume = inRange
        ? Math.round(Math.max(0, 100 - (distance / PROXIMITY_RADIUS) * 100))
        : 0;
      const zone = getZoneForPosition(t.x, t.y);

      return {
        ...t,
        distance,
        inRange,
        volume,
        zone,
      };
    });
  }, [remoteUsers, user?.uid, userId, position.x, position.y, getZoneForPosition]);

  // Proximity Audio Cross-Fade: Updates Web Audio GainNode volume dynamically based on distance
  useEffect(() => {
    updateSpatialAudioVolumes(position, allTeammates, PROXIMITY_RADIUS);
  }, [position.x, position.y, allTeammates]);

  // Toggle microphone with real hardware mute/unmute
  function handleToggleMute() {
    setIsMuted((prev) => {
      const next = !prev;
      setLocalAudioMute(next);
      return next;
    });
  }

  // Stable keyboard shortcuts for office movement and builder controls
  useEffect(() => {
    function handleKeyDown(event) {
      const isInputActive =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "SELECT";

      const currentEditing = isEditingLayoutRef.current;
      const currentMode = builderModeRef.current;
      const currentSelectedId = selectedItemIdRef.current;
      const currentLayout = furnitureLayoutRef.current;

      if (currentEditing && currentMode === "edit") {
        if (isInputActive) return;

        if ((event.key === "Delete" || event.key === "Backspace") && currentSelectedId) {
          event.preventDefault();
          handleDeleteSelected();
          return;
        }

        if (
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey &&
          (event.key === "z" || event.key === "Z")
        ) {
          event.preventDefault();
          handleUndo();
          return;
        }

        if (
          ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === "z" || event.key === "Z")) ||
          ((event.ctrlKey || event.metaKey) && (event.key === "y" || event.key === "Y"))
        ) {
          event.preventDefault();
          handleRedo();
          return;
        }

        if ((event.ctrlKey || event.metaKey) && (event.key === "d" || event.key === "D") && currentSelectedId) {
          event.preventDefault();
          handleDuplicateItem(currentSelectedId);
          return;
        }

        return;
      }

      if (isInputActive) return;

      const step = 3;
      let dx = 0;
      let dy = 0;

      if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") {
        dy = -step;
      } else if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
        dy = step;
      } else if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        dx = -step;
      } else if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        dx = step;
      }

      if (dx !== 0 || dy !== 0) {
        event.preventDefault();
        setPosition((prev) => {
          const targetX = Math.max(2, Math.min(96, prev.x + dx));
          const targetY = Math.max(4, Math.min(95, prev.y + dy));

          if (!isPositionBlocked(targetX, targetY, currentLayout)) {
            return { x: targetX, y: targetY };
          }
          if (dx !== 0 && !isPositionBlocked(targetX, prev.y, currentLayout)) {
            return { x: targetX, y: prev.y };
          }
          if (dy !== 0 && !isPositionBlocked(prev.x, targetY, currentLayout)) {
            return { x: prev.x, y: targetY };
          }
          return prev;
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleDeleteSelected, handleUndo, handleRedo, handleDuplicateItem]);

  // Smooth Avatar Dragging Handlers
  function handleAvatarPointerDown(event) {
    if (isEditingLayout) return;
    event.stopPropagation();
    isDraggingAvatarRef.current = true;
    setIsDraggingAvatar(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  }

  function handleAvatarPointerMove(event) {
    if (!isDraggingAvatarRef.current || !floorRef.current) return;
    event.stopPropagation();
    const rect = floorRef.current.getBoundingClientRect();
    const clickX = ((event.clientX - rect.left) / rect.width) * 100;
    const clickY = ((event.clientY - rect.top) / rect.height) * 100;

    const targetX = Math.max(4, Math.min(96, Math.round(clickX)));
    const targetY = Math.max(6, Math.min(94, Math.round(clickY)));

    const safePos = getSafePosition(
      targetX,
      targetY,
      position.x,
      position.y,
      furnitureLayout
    );
    setPosition(safePos);
  }

  function handleAvatarPointerUp(event) {
    if (!isDraggingAvatarRef.current) return;
    isDraggingAvatarRef.current = false;
    setIsDraggingAvatar(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
  }

  function handleFloorClick(event) {
    if (isEditingLayout && builderMode === "edit") {
      setSelectedItemId(null);
      return;
    }
    if (!floorRef.current) return;
    const rect = floorRef.current.getBoundingClientRect();
    const clickX = ((event.clientX - rect.left) / rect.width) * 100;
    const clickY = ((event.clientY - rect.top) / rect.height) * 100;

    const targetX = Math.max(4, Math.min(96, Math.round(clickX)));
    const targetY = Math.max(6, Math.min(94, Math.round(clickY)));

    const safePos = getSafePosition(
      targetX,
      targetY,
      position.x,
      position.y,
      furnitureLayout
    );
    setPosition(safePos);
  }

  function handleFilterSelect(filterName) {
    setActiveZoneFilter(filterName);
    setZoom(1);
    if (filterName === "All Zones") {
      setPosition({ x: 50, y: 50 });
      return;
    }
    const matchingZone = dynamicZonesList.find((z) => z.name === filterName);
    if (matchingZone) {
      setPosition({ x: matchingZone.x ?? 50, y: matchingZone.y ?? 50 });
    }
  }

  function handleZoomIn() {
    setZoom((prev) => Math.min(1.3, Number((prev + 0.1).toFixed(2))));
  }

  function handleZoomOut() {
    setZoom((prev) => Math.max(0.8, Number((prev - 0.1).toFixed(2))));
  }

  function handleCenterMap() {
    setZoom(1);
    setPosition({ x: 24, y: 48 });
  }

  function copyInviteCode() {
    const code = organization?.code || organization?.invite_code || organization?.id;
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  // Real-time chat message broadcast
  async function handleSendMessage(event) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

    const currentZone = getZoneForPosition(position.x, position.y);
    const socket = connectSocket();

    socket.emit("user:chat", {
      organizationId: orgId,
      sender: { uid: user?.uid || userId, name: userName },
      msg: text,
      zone: currentZone.name,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });

    setChatInput("");
  }

  function handleSendQuickWave(targetName) {
    const currentZone = getZoneForPosition(position.x, position.y);
    const socket = connectSocket();

    socket.emit("user:chat", {
      organizationId: orgId,
      sender: { uid: user?.uid || userId, name: userName },
      msg: `waved hello to ${targetName}! 👋`,
      zone: currentZone.name,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  }

  const nearbyTeammates = useMemo(() => {
    return allTeammates.filter((t) => t.inRange);
  }, [allTeammates]);

  const filteredTeammates = useMemo(() => {
    if (!searchQuery.trim()) return allTeammates;
    const q = searchQuery.toLowerCase();
    return allTeammates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.role && t.role.toLowerCase().includes(q)) ||
        (t.zone?.name && t.zone.name.toLowerCase().includes(q))
    );
  }, [allTeammates, searchQuery]);

  const currentZone = getZoneForPosition(position.x, position.y);
  const totalOnlineCount = (user ? 1 : 0) + allTeammates.length;

  const zoneSummaryList = useMemo(() => {
    const people = [];
    if (user) {
      people.push({ x: position.x, y: position.y });
    }
    allTeammates.forEach((t) => {
      people.push({ x: t.x, y: t.y });
    });

    if (dynamicZonesList.length > 0) {
      return dynamicZonesList.map((z) => {
        const count = people.filter((p) => {
          const zone = getZoneForPosition(p.x, p.y);
          return zone.id === z.id;
        }).length;

        return {
          name: z.name,
          color: z.color || "#8b5cf6",
          centerX: z.x ?? 50,
          centerY: z.y ?? 50,
          zoneId: z.id,
          count,
        };
      });
    }

    const hallwayCount = people.filter((p) => {
      const zone = getZoneForPosition(p.x, p.y);
      return zone.id === "hallway";
    }).length;

    return [
      {
        name: "Main Hallway",
        color: "#64748b",
        centerX: 50,
        centerY: 50,
        zoneId: "hallway",
        count: hallwayCount,
      },
    ];
  }, [user, position.x, position.y, allTeammates, dynamicZonesList, getZoneForPosition]);

  return (
    <div className="virtual-office-page">
      {/* Top Header */}
      <header className="vo-topbar">
        <div className="vo-topbar-left">
          <div className="vo-topbar-nav-row">
            <button
              type="button"
              className="vo-leave-office-btn"
              onClick={onBack}
              title="Leave Virtual Office and return to My Organizations"
            >
              ← Leave Office
            </button>

            <div className="vo-breadcrumb-group">
              <button
                type="button"
                className="vo-breadcrumb-link"
                onClick={onBack}
                title="Return to My Organizations"
              >
                My Organizations
              </button>
              <span className="vo-breadcrumb-separator">/</span>
              <span className="vo-breadcrumb-org">
                {organization?.name || "Virtual Office"}
              </span>
            </div>
          </div>

          <div className="vo-title-row">
            <h1 className="vo-main-title">Virtual Office</h1>
            <span
              className={`vo-status-pill ${
                socketStatus === "connected" ? "connected" : "connecting"
              }`}
            >
              <span className="vo-dot" />{" "}
              {socketStatus === "connected"
                ? "Connected"
                : socketStatus === "connecting"
                ? "Connecting..."
                : "Reconnecting..."}
            </span>
            <span className="vo-members-pill">
              👥 {totalOnlineCount} {totalOnlineCount === 1 ? "member" : "members"} online
            </span>
            <span className="vo-members-pill">
              {currentZone.icon || "📍"} {currentZone.name}
            </span>
          </div>
        </div>

        <div className="vo-topbar-right">
          {/* Zone filter pills */}
          <div className="vo-filter-pills" role="tablist" aria-label="Office Zone Filters">
            {zoneFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                className={`vo-filter-pill ${
                  activeZoneFilter === filter ? "active" : ""
                }`}
                onClick={() => handleFilterSelect(filter)}
              >
                {filter === "All Zones" && "⊞ "}
                {filter === "Open Workspace" && "👥 "}
                {filter === "Meeting Rooms" && "📺 "}
                {filter === "Lounge" && "🛋️ "}
                {filter === "Focus Zone" && "💡 "}
                {filter}
              </button>
            ))}
          </div>
        </div>
      </header>

      {micError && <div className="vo-mic-notice">{micError}</div>}

      {/* Main Workspace Layout */}
      <div className="vo-workspace-layout">
        <div className="vo-map-container">
          {/* Floating Layout Edit Controls */}
          {isEditingLayout && (
            <BuilderToolbar
              builderMode={builderMode}
              onSetBuilderMode={setBuilderMode}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < history.length - 1}
              onUndo={handleUndo}
              onRedo={handleRedo}
              snapToGrid={snapToGrid}
              onToggleSnap={() => setSnapToGrid((prev) => !prev)}
              selectedItemName={selectedItemName}
              selectedItemId={selectedItemId}
              onRotateSelected={() => handleRotateItem(selectedItemId)}
              onDuplicateSelected={() => handleDuplicateItem(selectedItemId)}
              onDeleteSelected={handleDeleteSelected}
              isLibraryOpen={isLibraryOpen}
              onToggleLibrary={() => setIsLibraryOpen((prev) => !prev)}
              onResetLayout={handleResetLayout}
              onCancel={handleCancelEditLayout}
              onSave={handleSaveLayout}
              onDone={handleDone}
              onPublish={handleDone}
              isSaving={isSavingLayout}
            />
          )}

          {/* Collapsible Building Blocks Library */}
          {isEditingLayout && (
            <BuildingBlocksLibrary
              isOpen={isLibraryOpen}
              onToggle={() => setIsLibraryOpen((prev) => !prev)}
              onAddBlock={handleAddBlockToMap}
              onDragStartBlock={handleStartDragBlock}
            />
          )}

          {/* Toast / Layout Notice */}
          {layoutNotice && (
            <div className={`vo-layout-toast ${layoutNotice.type}`}>
              <span>{layoutNotice.text}</span>
            </div>
          )}

          <div
            ref={floorRef}
            className={`vo-floor ${isEditingLayout ? "editing-mode" : ""} ${
              isEditingLayout && builderMode === "preview" ? "preview-walking" : ""
            }`}
            onClick={handleFloorClick}
            onDragOver={handleFloorDragOver}
            onDrop={handleFloorDrop}
            role="application"
            aria-label="Interactive Virtual Office Floor Plan"
          >
            {/* Placement Ghost */}
            {isEditingLayout && floorPlacementCoord && (
              <div
                className="vo-placement-ghost"
                style={{
                  left: `${floorPlacementCoord.x}%`,
                  top: `${floorPlacementCoord.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div className="vo-placement-ghost-box" />
                <span className="vo-placement-ghost-coord">
                  {Math.round(floorPlacementCoord.x)}%, {Math.round(floorPlacementCoord.y)}%
                </span>
              </div>
            )}

            {/* Properties Panel */}
            {isEditingLayout && builderMode === "edit" && selectedItem && (
              <ObjectPropertiesPanel
                selectedItem={selectedItem}
                onUpdateItem={handleUpdateItem}
                onRotateItem={handleRotateItem}
                onDuplicateItem={handleDuplicateItem}
                onDeleteItem={handleDeleteSelected}
                onDeselect={() => setSelectedItemId(null)}
              />
            )}

            {/* Scalable Architecture */}
            <div
              className="vo-floor-scalable"
              style={{
                transform: isEditingLayout || zoom === 1 ? "none" : `scale(${zoom})`,
                transformOrigin: "center center",
              }}
            >
              {/* Outer Walls */}
              <div className="vo-outer-walls-border">
                <div className="vo-entrance-badge">
                  <span>→</span> Entrance
                </div>
              </div>

              {/* Placed Furniture Objects */}
              {Object.entries(furnitureLayout).map(([id, item]) => {
                if (!item) return null;
                return (
                  <OfficeObjectRenderer
                    key={id}
                    item={item}
                    isSelected={selectedItemId === id}
                    isEditingLayout={isEditingLayout && builderMode === "edit"}
                    onPointerDown={(e) => handleStartDragFurniture(e, id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedItemId(id);
                    }}
                    onRotate={() => handleRotateItem(id)}
                    onDuplicate={() => handleDuplicateItem(id)}
                    onDelete={() => handleDeleteSelected()}
                  />
                );
              })}

              {/* Proximity SVG */}
              <svg className="vo-connections-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                {nearbyTeammates.map((teammate) => (
                  <line
                    key={`line-${teammate.uid}`}
                    x1={position.x}
                    y1={position.y}
                    x2={teammate.x}
                    y2={teammate.y}
                    stroke="#8b5cf6"
                    strokeWidth="0.55"
                    strokeDasharray="2 2"
                  />
                ))}
              </svg>

              {/* Teammate Avatars */}
              {allTeammates.map((teammate) => (
                <div
                  key={teammate.uid}
                  className={`vo-avatar vo-avatar-teammate ${
                    teammate.inRange ? "in-range" : "out-of-range"
                  }`}
                  style={{
                    left: `${teammate.x}%`,
                    top: `${teammate.y}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPosition({
                      x: Math.max(6, Math.min(94, teammate.x + 3)),
                      y: Math.max(8, Math.min(92, teammate.y + 2)),
                    });
                  }}
                  title={`Click to walk over to ${teammate.name}`}
                >
                  {teammate.inRange && teammate.greeting && (
                    <div className="vo-speech-bubble">{teammate.greeting}</div>
                  )}

                  <div className="vo-avatar-circle">
                    {isAvatarUrl(teammate.avatar) ? (
                      <img
                        src={teammate.avatar}
                        alt={teammate.name}
                        className="vo-avatar-img"
                      />
                    ) : (
                      <span className="vo-avatar-emoji">{teammate.avatar || "🧑🏻"}</span>
                    )}
                    <span className="vo-avatar-status-dot online" />
                  </div>

                  <div className="vo-avatar-label">
                    <strong>{teammate.name}</strong>
                  </div>
                </div>
              ))}

              {/* Current User Avatar */}
              {user && (
                <div
                  className={`vo-avatar vo-avatar-self ${
                    isSpeaking && !isMuted ? "speaking" : ""
                  } ${isDraggingAvatar ? "is-dragging" : ""}`}
                  style={{
                    left: `${position.x}%`,
                    top: `${position.y}%`,
                  }}
                  onPointerDown={handleAvatarPointerDown}
                  onPointerMove={handleAvatarPointerMove}
                  onPointerUp={handleAvatarPointerUp}
                  onPointerCancel={handleAvatarPointerUp}
                  title="Click or drag smoothly to walk anywhere"
                >
                  <div className="vo-avatar-compact-halo" />
                  <div className="vo-avatar-circle self-circle">
                    {isUserAvatarUrl ? (
                      <img
                        src={userAvatar}
                        alt={userName}
                        className="vo-avatar-img"
                      />
                    ) : (
                      <span className="vo-avatar-emoji">{userAvatar}</span>
                    )}
                    <span className="vo-avatar-status-dot user-live" />
                  </div>
                  <div className="vo-avatar-label self-label">
                    <strong>{userName || "You"}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Minimap Card */}
            <div className="vo-minimap-card">
              <div className="vo-minimap-schematic">
                <div className="minimap-room r-reception" />
                <div className="minimap-room r-meeting-a" />
                <div className="minimap-room r-meeting-b" />
                <div className="minimap-room r-lounge" />
                <div className="minimap-room r-open-workspace" />
                <div className="minimap-room r-focus" />
                <div className="minimap-room r-cafe" />
                <div
                  className="minimap-user-dot"
                  style={{
                    left: `${position.x}%`,
                    top: `${position.y}%`,
                  }}
                />
              </div>
            </div>

            {/* Floating Zoom & Map Toolbar */}
            <div className="vo-floating-map-toolbar">
              <button
                type="button"
                className="vo-tool-btn"
                onClick={handleZoomOut}
                title="Zoom Out"
              >
                −
              </button>
              <span className="vo-zoom-label">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="vo-tool-btn"
                onClick={handleZoomIn}
                title="Zoom In"
              >
                +
              </button>
              <span className="vo-toolbar-divider" />
              <button
                type="button"
                className="vo-center-map-btn"
                onClick={handleCenterMap}
                title="Center Map View"
              >
                🎯 Center Map
              </button>
            </div>
          </div>

          {/* Bottom Dock */}
          <div className="vo-bottom-dock">
            {isEditingLayout ? (
              <>
                <div className="vo-dock-left">
                  <div className={`vo-dock-mode-badge ${builderMode === "edit" ? "edit" : "preview"}`}>
                    {builderMode === "edit" ? "✏️ Builder: Design Mode" : "👁️ Builder: Test Walking"}
                  </div>
                  <div className="vo-dock-mic-info">
                    <strong>
                      {builderMode === "edit" ? "Office Layout Editor Active" : "Previewing Collision Rules"}
                    </strong>
                    <small>
                      {builderMode === "edit"
                        ? "Select items to customize, or drag new blocks from the library"
                        : "Use WASD or Arrow keys to test doorways and wall paths"}
                    </small>
                  </div>
                </div>

                <div className="vo-dock-right">
                  <button
                    type="button"
                    className="vo-dock-btn"
                    onClick={() => setIsLibraryOpen((prev) => !prev)}
                    title="Toggle Building Blocks Library"
                  >
                    🧱 {isLibraryOpen ? "Hide Blocks" : "Blocks Library"}
                  </button>
                  <button
                    type="button"
                    className="vo-dock-btn publish"
                    onClick={handleDone}
                    disabled={isSavingLayout}
                    title="Save layout and finish editing"
                  >
                    {isSavingLayout ? "Saving..." : "Done"}
                  </button>
                  <button
                    type="button"
                    className="vo-dock-btn exit"
                    onClick={handleCancelEditLayout}
                    title="Exit builder mode"
                  >
                    ✕ Exit Builder
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="vo-dock-left">
                  <button
                    type="button"
                    className={`vo-round-mic-btn ${!isMuted ? "active" : "muted"}`}
                    onClick={handleToggleMute}
                    title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
                  >
                    <span className="vo-mic-icon">{isMuted ? "🔇" : "🎙️"}</span>
                    {!isMuted && <span className="vo-mic-pulse" />}
                  </button>

                  <div className="vo-dock-mic-info">
                    <strong>{isMuted ? "Mic Muted" : "Mic On"}</strong>
                    <small>{isMuted ? "Microphone is muted" : "You're in the voice chat"}</small>
                  </div>

                  <div className="vo-dock-voice-info">
                    <div className="vo-voice-active-pill">
                      <span className="vo-live-wave">
                        <span className="wave-bar b1" />
                        <span className="wave-bar b2" />
                        <span className="wave-bar b3" />
                      </span>
                      <span>Nearby voice active</span>
                    </div>
                    <small>
                      {nearbyTeammates.length > 0
                        ? `${nearbyTeammates.length} ${
                            nearbyTeammates.length === 1 ? "teammate" : "teammates"
                          } in range`
                        : "Move closer to teammates to talk"}
                    </small>
                  </div>
                </div>

                <div className="vo-dock-right">
                  <button
                    type="button"
                    className="vo-edit-layout-btn"
                    onClick={handleEnterEditLayout}
                    title="Edit office layout and furniture"
                  >
                    <span>✏️</span> Edit Layout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <aside className="vo-sidebar">
          <div className="vo-sidebar-tabs">
            <button
              type="button"
              className={`vo-side-tab ${activeSideTab === "teammates" ? "active" : ""}`}
              onClick={() => setActiveSideTab("teammates")}
            >
              👥 Office Radar
            </button>
            <button
              type="button"
              className={`vo-side-tab ${activeSideTab === "chat" ? "active" : ""}`}
              onClick={() => setActiveSideTab("chat")}
            >
              💬 Chat {messages.length > 0 && `(${messages.length})`}
            </button>
          </div>

          {activeSideTab === "teammates" ? (
            <>
              <div className="vo-sidebar-card">
                <div className="vo-sidebar-header">
                  <h3>Nearby Teammates</h3>
                </div>

                <div className="vo-search-container">
                  <span className="vo-search-icon">🔍</span>
                  <input
                    type="text"
                    className="vo-search-input"
                    placeholder="Search teammates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="vo-search-clear"
                      onClick={() => setSearchQuery("")}
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="vo-teammates-scroll">
                  {isMembersLoading ? (
                    <div className="vo-teammates-loading">
                      <span className="vo-spinner-sm" />
                      <small>Loading office radar...</small>
                    </div>
                  ) : filteredTeammates.length === 0 ? (
                    <p className="vo-empty-hint">
                      {searchQuery
                        ? `No teammates found matching "${searchQuery}".`
                        : "No teammates online"}
                    </p>
                  ) : (
                    filteredTeammates.map((person) => (
                      <div
                        key={person.uid}
                        className={`vo-teammate-row ${person.inRange ? "nearby" : ""}`}
                        onClick={() =>
                          setPosition({
                            x: Math.max(6, Math.min(94, person.x + 3)),
                            y: Math.max(8, Math.min(92, person.y + 2)),
                          })
                        }
                        title={`Click to walk to ${person.name}`}
                      >
                        <div className="vo-teammate-avatar-wrap">
                          {isAvatarUrl(person.avatar) ? (
                            <img
                              src={person.avatar}
                              alt={person.name}
                              className="vo-teammate-avatar-img"
                            />
                          ) : (
                            <span className="vo-teammate-avatar">{person.avatar || "🧑🏻"}</span>
                          )}
                          <span className="status-dot in-earshot" />
                        </div>

                        <div className="vo-teammate-info">
                          <strong>{person.name}</strong>
                          <small>{person.role}</small>
                        </div>

                        <div className="vo-teammate-audio-badge">
                          {!person.isMuted ? (
                            <span className="audio-icon live" title="Microphone unmuted">
                              🔊
                            </span>
                          ) : (
                            <span className="audio-icon muted" title="Microphone muted">
                              🔇
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="vo-sidebar-card">
                <div className="vo-sidebar-header">
                  <h3>Office Zones</h3>
                </div>

                <div className="vo-zones-list">
                  {zoneSummaryList.map((zone) => (
                    <div
                      key={zone.name}
                      className="vo-zone-summary-row"
                      onClick={() => setPosition({ x: zone.centerX, y: zone.centerY })}
                      title={`Click to walk into ${zone.name}`}
                    >
                      <div className="vo-zone-summary-left">
                        <span
                          className="vo-zone-indicator-dot"
                          style={{ backgroundColor: zone.color }}
                        />
                        <span className="vo-zone-summary-name">{zone.name}</span>
                      </div>
                      <span className="vo-zone-member-badge">{zone.count}</span>
                    </div>
                  ))}
                </div>

                {organization?.code && (
                  <div className="vo-invite-section">
                    <button
                      type="button"
                      className="vo-copy-invite-btn"
                      onClick={copyInviteCode}
                    >
                      <span>Invite Code: <strong>{organization.code}</strong></span>
                      <small>{copiedCode ? "Copied ✓" : "Copy"}</small>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="vo-sidebar-card vo-chat-card">
              <div className="vo-sidebar-header">
                <h3>Office Chat</h3>
                <small>{organization?.name || "Room"}</small>
              </div>

              <div className="vo-chat-messages">
                {messages.length === 0 ? (
                  <p className="vo-empty-hint">
                    No messages yet. Send a greeting to everyone in the office!
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`vo-chat-bubble ${
                        msg.senderUid === user?.uid ? "own" : ""
                      }`}
                    >
                      <div className="vo-chat-meta">
                        <strong>{msg.senderName}</strong>
                        <span>
                          {msg.zone ? `${msg.zone} · ` : ""}
                          {msg.createdAt}
                        </span>
                      </div>
                      <p>{msg.text}</p>
                    </div>
                  ))
                )}
              </div>

              <form className="vo-chat-form" onSubmit={handleSendMessage}>
                <input
                  type="text"
                  placeholder="Message the office..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  maxLength={200}
                />
                <button type="submit">Send</button>
              </form>

              <div className="vo-chat-quick-actions">
                <button
                  type="button"
                  className="vo-quick-wave-btn"
                  onClick={() => handleSendQuickWave("everyone")}
                >
                  👋 Wave to everyone
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}