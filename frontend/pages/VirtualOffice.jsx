import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { doc, onSnapshot, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../src/firebase";
import api from "../src/api";
import {
  connectSocket,
  joinRoom,
  leaveRoom,
  onSocketStatusChange,
} from "../src/services/socket";
import {
  broadcastPosition,
  subscribeToRemotePositions,
  resetBroadcaster,
} from "../src/services/positionBroadcaster";
import {
  createPlacedObject,
  generateBuildingBlockLayoutJson,
  normalizeBuildingBlockObject,
} from "../src/components/OfficeBuilder/officeCatalog";
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

const OFFICE_ZONES = [
  {
    id: "reception",
    name: "Reception",
    category: "Reception",
    filterGroup: "All Zones",
    icon: "🛎️",
    color: "#f59e0b",
    xMin: 2.5,
    xMax: 22,
    yMin: 2,
    yMax: 31,
    centerX: 12,
    centerY: 18,
    subtitle: "Front desk & greeting lounge",
  },
  {
    id: "meeting-room-a",
    name: "Meeting Room A",
    category: "Meeting Rooms",
    filterGroup: "Meeting Rooms",
    icon: "📊",
    color: "#8b5cf6",
    xMin: 22.5,
    xMax: 45.5,
    yMin: 2,
    yMax: 31,
    centerX: 34,
    centerY: 18,
    subtitle: "Video conference & standups",
  },
  {
    id: "meeting-room-b",
    name: "Meeting Room B",
    category: "Meeting Rooms",
    filterGroup: "Meeting Rooms",
    icon: "📽️",
    color: "#3b82f6",
    xMin: 46,
    xMax: 65,
    yMin: 2,
    yMax: 31,
    centerX: 55,
    centerY: 18,
    subtitle: "Strategy & client presentations",
  },
  {
    id: "lounge",
    name: "Collaboration Lounge",
    category: "Lounge",
    filterGroup: "Lounge",
    icon: "☕",
    color: "#a855f7",
    xMin: 65.5,
    xMax: 98,
    yMin: 2,
    yMax: 31,
    centerX: 82,
    centerY: 18,
    subtitle: "Sectional sofa & informal talks",
  },
  {
    id: "open-workspace",
    name: "Open Workspace",
    category: "Open Workspace",
    filterGroup: "Open Workspace",
    icon: "💻",
    color: "#6366f1",
    xMin: 12,
    xMax: 75,
    yMin: 32,
    yMax: 71,
    centerX: 44,
    centerY: 52,
    subtitle: "8 desk pods & hot desks",
  },
  {
    id: "focus-zone",
    name: "Focus Zone",
    category: "Focus Zone",
    filterGroup: "Focus Zone",
    icon: "🎧",
    color: "#10b981",
    xMin: 76,
    xMax: 98,
    yMin: 32,
    yMax: 71,
    centerX: 87,
    centerY: 52,
    subtitle: "3 quiet acoustic focus pods",
  },
  {
    id: "breakouts",
    name: "Cafeteria & Booths",
    category: "Meeting Rooms",
    filterGroup: "Meeting Rooms",
    icon: "💬",
    color: "#06b6d4",
    xMin: 2.5,
    xMax: 75,
    yMin: 72,
    yMax: 98,
    centerX: 38,
    centerY: 84,
    subtitle: "Cafeteria dining & phone booths",
  },
];

const ZONE_FILTERS = [
  "All Zones",
  "Open Workspace",
  "Meeting Rooms",
  "Lounge",
  "Focus Zone",
];

function normalizeLayoutToMap(input) {
  if (!input) return {};

  let objectsList = [];
  if (Array.isArray(input)) {
    objectsList = input;
  } else if (input.officeLayout && Array.isArray(input.officeLayout.objects)) {
    objectsList = input.officeLayout.objects;
  } else if (Array.isArray(input.objects)) {
    objectsList = input.objects;
  } else if (typeof input === "object") {
    objectsList = Object.entries(input)
      .filter(([k, v]) => v && typeof v === "object" && k !== "version" && k !== "objects")
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
        ...normalized,
        x: normalized.position.x,
        y: normalized.position.y,
      };
    }
  }
  return map;
}

function getZoneForPosition(x, y) {
  for (const zone of OFFICE_ZONES) {
    if (x >= zone.xMin && x <= zone.xMax && y >= zone.yMin && y <= zone.yMax) {
      return zone;
    }
  }
  return { id: "hallway", name: "Main Hallway", icon: "🚶", color: "#64748b" };
}

function getDistance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function createOfficeMessage(senderUid, senderName, text, zoneName) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    senderUid: senderUid || "local",
    senderName,
    text,
    zone: zoneName,
    createdAt: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
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

  // Initialize user position from sessionStorage so returning to this office retains location
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

  // Retain office position in sessionStorage
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
  const [status, _setStatus] = useState("Available");
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, _setIsDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMembersLoading, setIsMembersLoading] = useState(true);
  const [remoteUsers, setRemoteUsers] = useState({});
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [micError, setMicError] = useState("");
  const [activeSideTab, setActiveSideTab] = useState("teammates");
  const [socketStatus, setSocketStatus] = useState("connecting");

  // Layout editing states
  const isOwnerOrAdmin =
    !organization?.ownerId ||
    organization?.ownerId === user?.uid ||
    organization?.role === "Owner" ||
    organization?.role === "Admin" ||
    organization?.role === "owner" ||
    organization?.role === "admin";

  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [builderMode, setBuilderMode] = useState("edit"); // "edit" | "preview"
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [isLibraryOpen, setIsLibraryOpen] = useState(true);
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [layoutNotice, setLayoutNotice] = useState(null);
  const [floorPlacementCoord, setFloorPlacementCoord] = useState(null);

  const [furnitureLayout, setFurnitureLayout] = useState(() => {
    try {
      if (organization?.officeLayout && typeof organization.officeLayout === "object") {
        return normalizeLayoutToMap(organization.officeLayout);
      }
      const saved = localStorage.getItem(`proxispeak-office-layout-${orgId}`);
      if (saved) {
        return normalizeLayoutToMap(JSON.parse(saved));
      }
    } catch {}
    return {};
  });

  const [preEditLayout, setPreEditLayout] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Sync saved layout from backend API if available
  useEffect(() => {
    let isMounted = true;
    async function loadLayout() {
      try {
        const res = await api.get(`/api/organizations/${orgId}/layout`);
        const serverLayout = res.data?.officeLayout || res.data?.layout;
        if (isMounted) {
          if (serverLayout && typeof serverLayout === "object") {
            const normalized = normalizeLayoutToMap(serverLayout);
            setFurnitureLayout(normalized);
          } else {
            const saved = localStorage.getItem(`proxispeak-office-layout-${orgId}`);
            if (saved) {
              setFurnitureLayout(normalizeLayoutToMap(JSON.parse(saved)));
            } else {
              setFurnitureLayout({});
            }
          }
        }
      } catch {
        // Fallback gracefully to localStorage or empty canvas
        const saved = localStorage.getItem(`proxispeak-office-layout-${orgId}`);
        if (saved && isMounted) {
          setFurnitureLayout(normalizeLayoutToMap(JSON.parse(saved)));
        }
      }
    }
    if (orgId) {
      loadLayout();
    }
    return () => {
      isMounted = false;
    };
  }, [orgId]);

  // Snapping helper (2% grid)
  const snapCoord = useCallback(
    (val, step = 2) => {
      return snapToGrid ? Math.round(val / step) * step : Math.round(val);
    },
    [snapToGrid]
  );

  // Push layout snapshot to undo/redo history
  const pushHistory = useCallback(
    (newLayout) => {
      setHistory((prev) => {
        const nextSlice = prev.slice(0, historyIndex + 1);
        return [...nextSlice, newLayout].slice(-30);
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 29));
    },
    [historyIndex]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const targetIndex = historyIndex - 1;
      setFurnitureLayout(history[targetIndex]);
      setHistoryIndex(targetIndex);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const targetIndex = historyIndex + 1;
      setFurnitureLayout(history[targetIndex]);
      setHistoryIndex(targetIndex);
    }
  }, [history, historyIndex]);

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

  async function handleSaveLayout() {
    setIsSavingLayout(true);
    try {
      const layoutPayload = generateBuildingBlockLayoutJson(furnitureLayout, orgId);

      // Persist to local storage caches
      try {
        localStorage.setItem(
          `proxispeak-office-layout-${orgId}`,
          JSON.stringify(furnitureLayout)
        );
        localStorage.setItem(
          `proxispeak-office-layout-json-${orgId}`,
          JSON.stringify(layoutPayload)
        );

        // Update organization in local registry
        const all = JSON.parse(
          localStorage.getItem("proxispeak-all-organizations") || "[]"
        );
        const idx = all.findIndex((o) => (o._id || o.id || o.code) === orgId);
        if (idx >= 0) {
          all[idx] = {
            ...all[idx],
            officeLayout: furnitureLayout,
            officeLayoutData: layoutPayload,
          };
          localStorage.setItem(
            "proxispeak-all-organizations",
            JSON.stringify(all)
          );
        }
        if (user?.uid) {
          const userOrgs = JSON.parse(
            localStorage.getItem(`proxispeak-orgs-${user.uid}`) || "[]"
          );
          const uIdx = userOrgs.findIndex((o) => (o._id || o.id || o.code) === orgId);
          if (uIdx >= 0) {
            userOrgs[uIdx] = {
              ...userOrgs[uIdx],
              officeLayout: furnitureLayout,
              officeLayoutData: layoutPayload,
            };
            localStorage.setItem(
              `proxispeak-orgs-${user.uid}`,
              JSON.stringify(userOrgs)
            );
          }
        }
      } catch (storageErr) {
        console.warn("Local storage draft caching:", storageErr);
      }

      // Persist to Firestore if available
      const firestoreDocId =
        organization?.firestoreId ||
        (organization?.id && String(organization.id).length > 15
          ? organization.id
          : null);
      if (firestoreDocId) {
        try {
          const orgRef = doc(db, "organizations", firestoreDocId);
          await updateDoc(orgRef, {
            officeLayout: furnitureLayout,
            officeLayoutData: layoutPayload,
          });
        } catch (fsErr) {
          console.warn("Firestore draft sync skipped:", fsErr.message);
        }
      }

      // Sync to backend API if available
      try {
        await api.put(`/api/organizations/${orgId}/layout`, {
          organizationId: orgId,
          officeLayout: layoutPayload.officeLayout,
          layout: furnitureLayout,
        });
      } catch (apiErr) {
        console.warn("Backend API draft sync skipped or offline:", apiErr.message);
      }

      setPreEditLayout({ ...furnitureLayout });
      setLayoutNotice({
        type: "success",
        text: "Office layout draft saved successfully!",
      });
      if (onShowToast) {
        onShowToast({
          type: "success",
          title: "Layout Draft Saved",
          message: "Office layout draft saved successfully.",
        });
      }
      setTimeout(() => setLayoutNotice(null), 3000);
    } catch (err) {
      setLayoutNotice({
        type: "error",
        text: `Failed to save layout draft: ${err.message || "Please try again."}`,
      });
      setTimeout(() => setLayoutNotice(null), 4000);
    } finally {
      setIsSavingLayout(false);
    }
  }

  async function handleDone() {
    setIsSavingLayout(true);
    try {
      // 1. Generate building-block JSON strictly matching required schema
      const layoutPayload = generateBuildingBlockLayoutJson(furnitureLayout, orgId);

      // 2. Persist to localStorage backup and local registries
      try {
        localStorage.setItem(
          `proxispeak-office-layout-${orgId}`,
          JSON.stringify(furnitureLayout)
        );
        localStorage.setItem(
          `proxispeak-office-layout-json-${orgId}`,
          JSON.stringify(layoutPayload)
        );

        const all = JSON.parse(
          localStorage.getItem("proxispeak-all-organizations") || "[]"
        );
        const idx = all.findIndex((o) => (o._id || o.id || o.code) === orgId);
        if (idx >= 0) {
          all[idx] = {
            ...all[idx],
            officeLayout: furnitureLayout,
            officeLayoutData: layoutPayload,
          };
          localStorage.setItem(
            "proxispeak-all-organizations",
            JSON.stringify(all)
          );
        }
        if (user?.uid) {
          const userOrgs = JSON.parse(
            localStorage.getItem(`proxispeak-orgs-${user.uid}`) || "[]"
          );
          const uIdx = userOrgs.findIndex((o) => (o._id || o.id || o.code) === orgId);
          if (uIdx >= 0) {
            userOrgs[uIdx] = {
              ...userOrgs[uIdx],
              officeLayout: furnitureLayout,
              officeLayoutData: layoutPayload,
            };
            localStorage.setItem(
              `proxispeak-orgs-${user.uid}`,
              JSON.stringify(userOrgs)
            );
          }
        }
      } catch (storageErr) {
        console.warn("Local storage layout saving warning:", storageErr);
      }

      // 3. Update Firestore if firestore document is available
      const firestoreDocId =
        organization?.firestoreId ||
        (organization?.id && String(organization.id).length > 15
          ? organization.id
          : null);
      if (firestoreDocId) {
        try {
          const orgRef = doc(db, "organizations", firestoreDocId);
          await updateDoc(orgRef, {
            officeLayout: furnitureLayout,
            officeLayoutData: layoutPayload,
          });
        } catch (fsErr) {
          console.warn("Firestore layout save skipped:", fsErr.message);
        }
      }

      // 4. Save to backend API endpoint (with graceful offline fallback)
      try {
        await api.put(`/api/organizations/${orgId}/layout`, {
          organizationId: orgId,
          officeLayout: layoutPayload.officeLayout,
          layout: furnitureLayout,
        });
      } catch (apiErr) {
        console.warn("Backend API layout persistence skipped or offline:", apiErr.message);
      }

      // 5. Update layout states and exit edit mode only after save succeeds
      setPreEditLayout({ ...furnitureLayout });
      setZoom(1);
      setIsEditingLayout(false);
      setBuilderMode("edit");
      setSelectedItemId(null);
      setFloorPlacementCoord(null);

      // 6. Show success feedback only after saving succeeds
      const count = layoutPayload.officeLayout?.objects?.length ?? 0;
      setLayoutNotice({
        type: "success",
        text: `✓ Office layout saved successfully! (${count} ${count === 1 ? "object" : "objects"})`,
      });
      if (onShowToast) {
        onShowToast({
          type: "success",
          title: "Office Layout Saved",
          message: `✓ Office layout saved successfully with ${count} objects.`,
        });
      }
      setTimeout(() => setLayoutNotice(null), 4000);
    } catch (err) {
      // Handle failures with clear error feedback
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
    const currentItem =
      furnitureLayout[itemId] || { x: 50, y: 50 };
    const originalX = currentItem.x;
    const originalY = currentItem.y;
    let latestLayout = furnitureLayout;

    function onPointerMove(moveEvent) {
      const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
      const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100;

      const rawNewX = Math.max(2, Math.min(96, originalX + deltaX));
      const rawNewY = Math.max(4, Math.min(95, originalY + deltaY));
      const snappedX = snapCoord(rawNewX);
      const snappedY = snapCoord(rawNewY);

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
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const animFrameRef = useRef(null);

  // Connect to real-time WebSocket and join organization room
  useEffect(() => {
    if (!orgId || !userId) return;

    connectSocket();
    joinRoom(orgId, {
      uid: userId,
      name: userName,
      avatar: savedAvatar,
      status,
      isMuted,
      isSpeaking,
    });

    // Broadcast initial position
    broadcastPosition({
      organizationId: orgId,
      userId,
      x: position.x,
      y: position.y,
      name: userName,
      avatar: savedAvatar,
    });

    const unsubscribePositions = subscribeToRemotePositions(
      (peerData) => {
        const peerId = peerData.userId || peerData.socketId;
        if (!peerId || peerId === userId) return;

        setRemoteUsers((prev) => ({
          ...prev,
          [peerId]: {
            ...(prev[peerId] || {}),
            uid: peerId,
            name: peerData.name || prev[peerId]?.name || "Teammate",
            avatar: peerData.avatar || prev[peerId]?.avatar || "🧑🏻",
            x: peerData.x,
            y: peerData.y,
            status: prev[peerId]?.status || "Available",
            isMuted: prev[peerId]?.isMuted ?? true,
            isSpeaking: prev[peerId]?.isSpeaking ?? false,
            isDemo: false,
            lastUpdate: Date.now(),
          },
        }));
      },
      (leftPeer) => {
        const peerId = leftPeer.userId || leftPeer.socketId;
        if (!peerId) return;
        setRemoteUsers((prev) => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      },
      (joinedPeer) => {
        const peerId = joinedPeer.userId || joinedPeer.socketId;
        if (!peerId || peerId === userId) return;
        // Reply with our current position so newly joined peer sees us immediately
        broadcastPosition({
          organizationId: orgId,
          userId,
          x: position.x,
          y: position.y,
          name: userName,
          avatar: savedAvatar,
        });
      }
    );

    const unsubscribeStatus = onSocketStatusChange((s) => {
      setSocketStatus(s);
      if (s === "connected") {
        setIsMembersLoading(false);
      }
    });

    const loadingTimeout = setTimeout(() => {
      setIsMembersLoading(false);
    }, 1200);

    // Real-time layout synchronization from organization administrator
    const socket = connectSocket();
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
    socket.on("office:layout-updated", handleRemoteLayoutUpdate);

    return () => {
      clearTimeout(loadingTimeout);
      unsubscribePositions();
      unsubscribeStatus();
      socket.off("office:layout-updated", handleRemoteLayoutUpdate);
      leaveRoom(orgId, userId);
      resetBroadcaster();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, userId]);

  // Real-time broadcast whenever avatar position changes (throttled & deduplicated)
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

  // Subscribe to Firestore organization doc for live positions & chat
  useEffect(() => {
    if (!organization?.firestoreId) return;

    const orgRef = doc(db, "organizations", organization.firestoreId);
    const unsubscribe = onSnapshot(
      orgRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        if (data.activeUsers) {
          setRemoteUsers(data.activeUsers);
        }
        if (Array.isArray(data.officeMessages)) {
          setMessages(data.officeMessages.slice(-40));
        }
      },
      () => {
        // Fallback silently if offline
      }
    );

    return () => unsubscribe();
  }, [organization?.firestoreId]);

  // Sync current user's position & status to Firestore
  useEffect(() => {
    if (!organization?.firestoreId || !user?.uid) return;

    const timer = setTimeout(async () => {
      try {
        const orgRef = doc(db, "organizations", organization.firestoreId);
        await updateDoc(orgRef, {
          [`activeUsers.${user.uid}`]: {
            uid: user.uid,
            name: userName,
            avatar: savedAvatar,
            x: Math.round(position.x),
            y: Math.round(position.y),
            status,
            isMuted,
            isSpeaking,
            updatedAt: Date.now(),
          },
        });
      } catch {
        // Ignore if offline
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [
    organization?.firestoreId,
    user?.uid,
    userName,
    savedAvatar,
    position.x,
    position.y,
    status,
    isMuted,
    isSpeaking,
  ]);

  // Remove user from activeUsers when leaving office
  useEffect(() => {
    return () => {
      if (organization?.firestoreId && user?.uid) {
        const orgRef = doc(db, "organizations", organization.firestoreId);
        updateDoc(orgRef, {
          [`activeUsers.${user.uid}`]: null,
        }).catch(() => {});
      }
    };
  }, [organization?.firestoreId, user?.uid]);

  // Keyboard navigation & builder shortcuts
  useEffect(() => {
    function handleKeyDown(event) {
      const isInputActive =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "SELECT";

      // Builder Design Mode Shortcuts
      if (isEditingLayout && builderMode === "edit") {
        if (isInputActive) return;

        // Delete / Backspace
        if (
          (event.key === "Delete" || event.key === "Backspace") &&
          selectedItemId
        ) {
          event.preventDefault();
          handleDeleteSelected();
          return;
        }

        // Undo: Ctrl+Z / Cmd+Z
        if (
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey &&
          (event.key === "z" || event.key === "Z")
        ) {
          event.preventDefault();
          handleUndo();
          return;
        }

        // Redo: Ctrl+Shift+Z or Ctrl+Y
        if (
          ((event.ctrlKey || event.metaKey) &&
            event.shiftKey &&
            (event.key === "z" || event.key === "Z")) ||
          ((event.ctrlKey || event.metaKey) &&
            (event.key === "y" || event.key === "Y"))
        ) {
          event.preventDefault();
          handleRedo();
          return;
        }

        // Duplicate: Ctrl+D
        if (
          (event.ctrlKey || event.metaKey) &&
          (event.key === "d" || event.key === "D") &&
          selectedItemId
        ) {
          event.preventDefault();
          handleDuplicateItem(selectedItemId);
          return;
        }

        // In design mode, don't move avatar
        return;
      }

      if (isInputActive) {
        return;
      }

      // Live Office OR Builder Preview Mode (Testing Walking)
      const step = 3;
      let dx = 0;
      let dy = 0;

      if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") {
        dy = -step;
      } else if (
        event.key === "ArrowDown" ||
        event.key === "s" ||
        event.key === "S"
      ) {
        dy = step;
      } else if (
        event.key === "ArrowLeft" ||
        event.key === "a" ||
        event.key === "A"
      ) {
        dx = -step;
      } else if (
        event.key === "ArrowRight" ||
        event.key === "d" ||
        event.key === "D"
      ) {
        dx = step;
      }

      if (dx !== 0 || dy !== 0) {
        event.preventDefault();
        setPosition((prev) => {
          const targetX = Math.max(2, Math.min(96, prev.x + dx));
          const targetY = Math.max(4, Math.min(95, prev.y + dy));

          // 1. Direct path collision check
          if (!isPositionBlocked(targetX, targetY, furnitureLayout)) {
            return { x: targetX, y: targetY };
          }

          // 2. Wall Sliding Physics: slide horizontally if clear
          if (dx !== 0 && !isPositionBlocked(targetX, prev.y, furnitureLayout)) {
            return { x: targetX, y: prev.y };
          }

          // 3. Wall Sliding Physics: slide vertically if clear
          if (dy !== 0 && !isPositionBlocked(prev.x, targetY, furnitureLayout)) {
            return { x: prev.x, y: targetY };
          }

          // Movement blocked by solid wall or furniture
          return prev;
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isEditingLayout,
    builderMode,
    selectedItemId,
    handleDeleteSelected,
    handleUndo,
    handleRedo,
    handleDuplicateItem,
    furnitureLayout,
  ]);

  // Web Audio API mic monitor
  useEffect(() => {
    async function startMicMonitor() {
      setMicError("");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        mediaStreamRef.current = stream;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function checkVolume() {
          analyser.getByteFrequencyData(dataArray);
          const avg =
            dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
          setIsSpeaking(avg > 16);
          animFrameRef.current = requestAnimationFrame(checkVolume);
        }

        checkVolume();
      } catch {
        setMicError(
          "Microphone permission not granted — voice audio indicator simulated."
        );
        setIsSpeaking(true);
      }
    }

    function stopMicMonitor() {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      setIsSpeaking(false);
    }

    if (!isMuted && !isDeafened) {
      startMicMonitor();
    } else {
      stopMicMonitor();
    }

    return () => stopMicMonitor();
  }, [isMuted, isDeafened]);

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

    // Collision safety: check destination or find nearest unblocked walkable spot
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
      setPosition({ x: 24, y: 48 });
    } else if (filterName === "Open Workspace") {
      setPosition({ x: 44, y: 52 });
    } else if (filterName === "Meeting Rooms") {
      setPosition({ x: 34, y: 18 });
    } else if (filterName === "Lounge") {
      setPosition({ x: 82, y: 18 });
    } else if (filterName === "Focus Zone") {
      setPosition({ x: 87, y: 52 });
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

  async function handleSendMessage(event) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

    const currentZone = getZoneForPosition(position.x, position.y);
    const newMsg = createOfficeMessage(
      user?.uid,
      userName,
      text,
      currentZone.name
    );

    setMessages((prev) => [...prev, newMsg]);
    setChatInput("");

    if (organization?.firestoreId) {
      try {
        const orgRef = doc(db, "organizations", organization.firestoreId);
        await updateDoc(orgRef, {
          officeMessages: arrayUnion(newMsg),
        });
      } catch {
        // Keep local message
      }
    }
  }

  function handleSendQuickWave(targetName) {
    const currentZone = getZoneForPosition(position.x, position.y);
    const newMsg = createOfficeMessage(
      user?.uid,
      userName,
      `waved hello to ${targetName}! 👋`,
      currentZone.name
    );
    setMessages((prev) => [...prev, newMsg]);

    if (organization?.firestoreId) {
      const orgRef = doc(db, "organizations", organization.firestoreId);
      updateDoc(orgRef, {
        officeMessages: arrayUnion(newMsg),
      }).catch(() => {});
    }
  }

  // Real remote users connected via Socket.IO
  const allTeammates = useMemo(() => {
    const list = [];

    Object.values(remoteUsers).forEach((remote) => {
      if (remote && remote.uid && remote.uid !== user?.uid) {
        list.push({
          uid: remote.uid,
          name: remote.name || "Teammate",
          role: remote.role || (typeof remote.x === "number" && typeof remote.y === "number" ? `In ${getZoneForPosition(remote.x, remote.y).name}` : "Online"),
          avatar: remote.avatar || "🧑🏻",
          x: typeof remote.x === "number" ? remote.x : 50,
          y: typeof remote.y === "number" ? remote.y : 50,
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
  }, [remoteUsers, user?.uid, position.x, position.y]);

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

    const definitions = [
      { name: "Open Workspace", color: "#6366f1", centerX: 44, centerY: 52, zoneId: "open-workspace" },
      { name: "Meeting Rooms", color: "#3b82f6", centerX: 34, centerY: 18, zoneIds: ["meeting-room-a", "meeting-room-b"] },
      { name: "Collaboration Lounge", color: "#a855f7", centerX: 82, centerY: 18, zoneId: "lounge" },
      { name: "Focus Zone", color: "#10b981", centerX: 87, centerY: 52, zoneId: "focus-zone" },
      { name: "Reception", color: "#f59e0b", centerX: 12, centerY: 18, zoneId: "reception" },
    ];

    return definitions.map((def) => {
      const count = people.filter((p) => {
        const zone = getZoneForPosition(p.x, p.y);
        if (def.zoneId) return zone.id === def.zoneId;
        if (def.zoneIds) return def.zoneIds.includes(zone.id);
        return false;
      }).length;

      return {
        ...def,
        count,
      };
    });
  }, [user, position.x, position.y, allTeammates]);

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
            {ZONE_FILTERS.map((filter) => (
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

      {/* Main Workspace Layout: Map Floor (Left) + Sidebar (Right) */}
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

          {/* Collapsible Building Blocks Library Sidebar Drawer */}
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
            {/* Real-time placement ghost when dragging an item over canvas */}
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

            {/* Properties Panel for Selected Object (custom or furniture) */}
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
            {/* Inner Scalable Room Architecture */}
            <div
              className="vo-floor-scalable"
              style={{
                transform: isEditingLayout || zoom === 1 ? "none" : `scale(${zoom})`,
                transformOrigin: "center center",
              }}
            >
              {/* Outer Architectural Thick Walls */}
              <div className="vo-outer-walls-border">
                {/* Left entrance cutout with arrow badge */}
                <div className="vo-entrance-badge">
                  <span>→</span> Entrance
                </div>
              </div>

              {/* =========================================================
                  TOP ROW: Reception, Meeting Room A, Meeting Room B, Lounge
                  ========================================================= */}

              {/* 1. Reception (top-left) */}
              <div className="vo-room-zone vo-zone-reception">
                <div className="vo-reception-desk-wrap">
                  <div className="vo-reception-counter">
                    <span className="vo-counter-screen" />
                  </div>
                </div>
                <div className="vo-plant-plant p-topleft">🪴</div>
                <div className="vo-plant-plant p-midleft">🌿</div>
                <div className="vo-floor-text">Reception</div>
              </div>

              {/* 2. Meeting Room A (top center-left) */}
              <div className="vo-room-zone vo-zone-meeting-a">
                <div className="vo-wall-display-screen purple" />
                <div className="vo-oval-conf-table">
                  <div className="vo-conf-chair c-top c1" />
                  <div className="vo-conf-chair c-top c2" />
                  <div className="vo-conf-chair c-top c3" />
                  <div className="vo-conf-chair c-bottom c4" />
                  <div className="vo-conf-chair c-bottom c5" />
                  <div className="vo-conf-chair c-bottom c6" />
                  <div className="vo-conf-chair c-left" />
                  <div className="vo-conf-chair c-right" />
                  <div className="vo-table-inner-glow" />
                </div>
                <div className="vo-doorway-opening right-door" />
                <div className="vo-floor-text">Meeting Room A</div>
              </div>

              {/* 3. Meeting Room B (top center) */}
              <div className="vo-room-zone vo-zone-meeting-b">
                <div className="vo-wall-display-screen blue" />
                <div className="vo-rect-conf-table">
                  <div className="vo-rect-chair top r1" />
                  <div className="vo-rect-chair top r2" />
                  <div className="vo-rect-chair top r3" />
                  <div className="vo-rect-chair top r4" />
                  <div className="vo-rect-chair bottom r5" />
                  <div className="vo-rect-chair bottom r6" />
                  <div className="vo-rect-chair bottom r7" />
                  <div className="vo-rect-chair bottom r8" />
                </div>
                <div className="vo-doorway-opening left-door" />
                <div className="vo-plant-plant p-corner">🪴</div>
                <div className="vo-floor-text">Meeting Room B</div>
              </div>

              {/* 4. Collaboration Lounge (top-right) */}
              <div className="vo-room-zone vo-zone-lounge">
                <div className="vo-sectional-couch">
                  <div className="couch-back-top" />
                  <div className="couch-back-right" />
                  <div className="couch-center-table">
                    <span className="table-mug">☕</span>
                  </div>
                </div>
                <div className="vo-plant-plant lounge-tree-right">🪴</div>
                <div className="vo-plant-plant lounge-tree-left">🌿</div>
                <div className="vo-floor-text">Collaboration Lounge</div>
              </div>

              {/* =========================================================
                  MIDDLE AREA: Open Workspace (8 Desk Pods) & Focus Zone
                  ========================================================= */}

              {/* Center Open Workspace Floor Label */}
              <div className="vo-open-workspace-banner">
                OPEN WORKSPACE
              </div>



              {/* 5. Focus Zone (Right, Enclosed Glass Room) */}
              <div className="vo-room-zone vo-zone-focus">
                <div className="vo-focus-title">FOCUS ZONE</div>
                <div className="vo-focus-cubicles">
                  <div className="vo-focus-cube">
                    <div className="cube-desk">
                      <span className="cube-screen" />
                    </div>
                    <div className="cube-chair purple" />
                  </div>
                  <div className="vo-focus-cube">
                    <div className="cube-desk">
                      <span className="cube-screen" />
                    </div>
                    <div className="cube-chair purple" />
                  </div>
                  <div className="vo-focus-cube">
                    <div className="cube-desk">
                      <span className="cube-screen" />
                    </div>
                    <div className="cube-chair purple" />
                  </div>
                </div>
                <div className="vo-water-cooler">
                  <div className="water-jug" />
                </div>
                <div className="vo-doorway-opening focus-door" />
              </div>

              {/* =========================================================
                  BOTTOM ROW: Cafeteria, Phone Booths, Casual Nook
                  ========================================================= */}

              {/* Cafeteria / Kitchenette & Dining */}
              <div className="vo-bottom-cafeteria">
                <div className="kitchen-counter">
                  <span className="sink-basin" />
                </div>
                <div className="cafe-dining-table t1">
                  <div className="cafe-chair c1" />
                  <div className="cafe-chair c2" />
                  <div className="cafe-chair c3" />
                </div>
                <div className="cafe-dining-table t2">
                  <div className="cafe-chair c1" />
                  <div className="cafe-chair c2" />
                  <div className="cafe-chair c3" />
                </div>
              </div>

              {/* 3 Phone Booths */}
              <div className="vo-bottom-phone-booths">
                <div className="phone-booth b1">
                  <div className="booth-seat" />
                </div>
                <div className="phone-booth b2">
                  <div className="booth-seat" />
                </div>
                <div className="phone-booth b3">
                  <div className="booth-seat" />
                </div>
              </div>

              {/* Casual Armchair Nook */}
              <div className="vo-bottom-casual-nook">
                <div className="casual-armchair a1" />
                <div className="casual-round-table" />
                <div className="casual-armchair a2" />
                <div className="vo-plant-plant nook-plant">🪴</div>
              </div>

              {/* =========================================================
                  PLACED BUILDING BLOCKS & FURNITURE OBJECTS
                  ========================================================= */}
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

              {/* =========================================================
                  AVATARS & PROXIMITY CONNECTIONS
                  ========================================================= */}

              {/* SVG Proximity Connections */}
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

              {/* Current User Avatar ("You") - Render only when actual user data is available */}
              {user && (
                <div
                  className={`vo-avatar vo-avatar-self ${
                    isSpeaking && !isMuted ? "speaking" : ""
                  }`}
                  style={{
                    left: `${position.x}%`,
                    top: `${position.y}%`,
                  }}
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

            {/* Floating Architectural Minimap (Bottom-Left) */}
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

            {/* Floating Zoom & Center Map Bar (Bottom-Right of floor) */}
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
                  {/* Round Purple Mic Button */}
                  <button
                    type="button"
                    className={`vo-round-mic-btn ${!isMuted ? "active" : "muted"}`}
                    onClick={() => setIsMuted((prev) => !prev)}
                    title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
                  >
                    <span className="vo-mic-icon">{isMuted ? "🔇" : "🎙️"}</span>
                    {!isMuted && <span className="vo-mic-pulse" />}
                  </button>

                  {/* Mic Status */}
                  <div className="vo-dock-mic-info">
                    <strong>{isMuted ? "Mic Muted" : "Mic On"}</strong>
                    <small>{isMuted ? "Microphone is muted" : "You're in the voice chat"}</small>
                  </div>

                  {/* Nearby Voice Active */}
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
                  {/* Edit Layout Button */}
                  <button
                    type="button"
                    className="vo-edit-layout-btn"
                    onClick={handleEnterEditLayout}
                    title="Edit office layout and furniture"
                  >
                    <span>✏️</span> Edit layout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Sidebar: Nearby Teammates & Office Zones */}
        <aside className="vo-sidebar">
          {/* Side Tabs */}
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
              {/* Nearby Teammates Card */}
              <div className="vo-sidebar-card">
                <div className="vo-sidebar-header">
                  <h3>Nearby teammates</h3>
                </div>

                {/* Search teammates input */}
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
                    <div className="vo-teammates-loading" style={{ textAlign: "center", padding: "18px 10px", color: "#64748b" }}>
                      <span className="vo-spinner-sm" style={{ display: "inline-block", marginRight: "6px" }} />
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

              {/* Office Zones Card matching reference image */}
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
            /* Live Office Chat Card */
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
