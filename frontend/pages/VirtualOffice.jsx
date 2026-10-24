import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { doc, onSnapshot, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../src/firebase";
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
  normalizeBuildingBlockObject,
} from "../src/components/OfficeBuilder/officeCatalog";
import {
  loadOfficeLayout,
  saveOfficeLayout,
  normalizeLayoutToMap,
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

function resolveZoneAt(x, y, layout = {}) {
  for (const item of Object.values(layout)) {
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

  // Dynamic zone resolution based on user's customizable office layout
  const [furnitureLayout, setFurnitureLayout] = useState(() => {
    try {
      const saved = loadOfficeLayout(orgId);
      if (saved && Object.keys(saved).length > 0) {
        return saved;
      }
      if (organization?.officeLayout && typeof organization.officeLayout === "object") {
        return normalizeLayoutToMap(organization.officeLayout);
      }
    } catch (e) {
      console.warn("Failed to initialize office layout:", e);
    }
    return {};
  });

  const getZoneForPosition = useCallback(
    (posX, posY) => resolveZoneAt(posX, posY, furnitureLayout),
    [furnitureLayout]
  );

  const dynamicZonesList = useMemo(() => {
    return Object.values(furnitureLayout).filter(
      (item) => item && String(item.type).startsWith("zone-")
    );
  }, [furnitureLayout]);

  const zoneFilters = useMemo(() => {
    const names = Array.from(new Set(dynamicZonesList.map((z) => z.name || "Zone")));
    return ["All Zones", ...names];
  }, [dynamicZonesList]);

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
  const [_draggedItemId, setDraggedItemId] = useState(null);
  const [builderSidebarTab, setBuilderSidebarTab] = useState("library");
  const draggedBlockTemplateRef = useRef(null); // "library" | "properties"
  const persistedDragBlockRef = useRef(null);
  const lastDropCoordRef = useRef({ x: 50, y: 50 });
  const justDroppedRef = useRef(false);
  const lastLoadedOrgIdRef = useRef(null);
  const dropLockRef = useRef(false);
  const isDraggingFurnitureRef = useRef(false);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [layoutNotice, setLayoutNotice] = useState(null);
  const [floorPlacementCoord, setFloorPlacementCoord] = useState(null);
  const [activeDragTemplate, setActiveDragTemplate] = useState(null);


  const [preEditLayout, setPreEditLayout] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Load saved layout JSON locally from browser localStorage for this organization
  useEffect(() => {
    if (!orgId) return;
    if (lastLoadedOrgIdRef.current === orgId && isEditingLayout) {
      return;
    }
    lastLoadedOrgIdRef.current = orgId;
    try {
      const saved = loadOfficeLayout(orgId);
      if (saved && Object.keys(saved).length > 0) {
        setFurnitureLayout(saved);
      } else if (organization?.officeLayout && typeof organization.officeLayout === "object") {
        setFurnitureLayout(normalizeLayoutToMap(organization.officeLayout));
      } else {
        setFurnitureLayout({});
      }
    } catch (err) {
      console.warn("Failed to load local office layout:", err);
      setFurnitureLayout({});
    }
  }, [orgId, organization?.officeLayout, isEditingLayout]);

  // Automatic local persistence: auto-save layout changes to localStorage
  useEffect(() => {
    if (!orgId || !isEditingLayout) return;
    const timer = setTimeout(() => {
      saveOfficeLayout(orgId, furnitureLayout);
    }, 300);
    return () => clearTimeout(timer);
  }, [furnitureLayout, orgId, isEditingLayout]);

  // Snapping helper (2% grid)
  const snapCoord = useCallback(
    (val, step = 2) => {
      return snapToGrid ? Math.round(val / step) * step : Math.round(val);
    },
    [snapToGrid]
  );

  // Push layout snapshot to undo/redo history and persist immediately to localStorage
  const pushHistory = useCallback(
    (newLayout) => {
      setHistory((prev) => {
        const nextSlice = prev.slice(0, historyIndex + 1);
        return [...nextSlice, newLayout].slice(-30);
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 29));
      if (orgId) {
        saveOfficeLayout(orgId, newLayout);
      }
    },
    [historyIndex, orgId]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const targetIndex = historyIndex - 1;
      const targetLayout = history[targetIndex];
      setFurnitureLayout(targetLayout);
      setHistoryIndex(targetIndex);
      if (orgId) {
        saveOfficeLayout(orgId, targetLayout);
      }
    }
  }, [history, historyIndex, orgId]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const targetIndex = historyIndex + 1;
      const targetLayout = history[targetIndex];
      setFurnitureLayout(targetLayout);
      setHistoryIndex(targetIndex);
      if (orgId) {
        saveOfficeLayout(orgId, targetLayout);
      }
    }
  }, [history, historyIndex, orgId]);

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
    const resolvedX = item.x !== undefined ? item.x : (item.position?.x ?? 50);
    const resolvedY = item.y !== undefined ? item.y : (item.position?.y ?? 50);
    const resolvedW = item.width !== undefined ? item.width : 40;
    const resolvedH = item.height !== undefined ? item.height : 20;
    return {
      ...item,
      id: selectedItemId,
      name: item.name !== undefined ? item.name : (selectedItemName || "Office Object"),
      type: item.type || "furniture",
      category: item.category || "Furniture",
      icon: item.icon || "📦",
      x: resolvedX,
      y: resolvedY,
      position: { x: resolvedX, y: resolvedY },
      width: resolvedW,
      height: resolvedH,
      rotation: item.rotation ?? 0,
      isSolid: item.isSolid !== false,
      canPass: item.canPass === true,
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
    setBuilderSidebarTab("library");
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
      if (!blockTemplate) return;

      // Smart placement: if a room is selected or active, add inside that room!
      let targetX = 46;
      let targetY = 52;
      let targetZone = null;

      if (selectedItemId && furnitureLayout[selectedItemId]) {
        const selected = furnitureLayout[selectedItemId];
        if (selected && String(selected.type).startsWith("zone-")) {
          targetZone = selected;
        }
      }

      if (!targetZone && activeZoneFilter && activeZoneFilter !== "All Zones") {
        targetZone = dynamicZonesList.find((z) => z.name === activeZoneFilter);
      }

      if (!targetZone && position) {
        const currentZoneInfo = getZoneForPosition(position.x, position.y);
        if (currentZoneInfo && currentZoneInfo.id && currentZoneInfo.id !== "hallway") {
          targetZone = furnitureLayout[currentZoneInfo.id];
        }
      }

      if (targetZone) {
        const zoneX = targetZone.x !== undefined ? targetZone.x : (targetZone.position?.x ?? 50);
        const zoneY = targetZone.y !== undefined ? targetZone.y : (targetZone.position?.y ?? 50);
        targetX = Math.max(4, Math.min(94, snapCoord(zoneX)));
        targetY = Math.max(6, Math.min(92, snapCoord(zoneY)));
      }

      const newObj = createPlacedObject(blockTemplate, targetX, targetY);
      setFurnitureLayout((prev) => {
        const next = { ...prev, [newObj.id]: newObj };
        pushHistory(next);
        if (orgId) {
          saveOfficeLayout(orgId, next);
        }
        return next;
      });
      setSelectedItemId(newObj.id);
      setBuilderSidebarTab("properties");

      const roomName = targetZone?.name ? ` inside ${targetZone.name}` : "";
      setLayoutNotice({
        type: "info",
        text: `✓ Added "${blockTemplate.name}"${roomName}!`,
      });
      setTimeout(() => setLayoutNotice(null), 2500);
    },
    [pushHistory, selectedItemId, furnitureLayout, activeZoneFilter, dynamicZonesList, position, getZoneForPosition, snapCoord, orgId]
  );

  const handleStartDragBlock = useCallback((event, blockTemplate) => {
    if (!blockTemplate) return;
    persistedDragBlockRef.current = blockTemplate;
    draggedBlockTemplateRef.current = blockTemplate;
    setActiveDragTemplate(blockTemplate);
    try {
      window.__ps_active_block = blockTemplate;
      window.__ps_last_dragged_block = blockTemplate;
      window.__ps_drag_start_time = Date.now();
    } catch {}

    if (event?.dataTransfer) {
      const payload = JSON.stringify(blockTemplate);
      try { event.dataTransfer.setData("application/json", payload); } catch {}
      try { event.dataTransfer.setData("text/plain", payload); } catch {}
      try { event.dataTransfer.setData("text", payload); } catch {}
      try { event.dataTransfer.effectAllowed = "copyMove"; } catch {}
    }
  }, []);

  const handleEndDragBlock = useCallback(() => {
    setActiveDragTemplate(null);
    setFloorPlacementCoord(null);
    draggedBlockTemplateRef.current = null;
    try {
      window.__ps_active_block = null;
      window.__ps_drag_start_coord = null;
    } catch {}
    // Retain persistedDragBlockRef briefly so in-flight drop processing succeeds
    setTimeout(() => {
      persistedDragBlockRef.current = null;
      try {
        window.__ps_last_dragged_block = null;
      } catch {}
    }, 400);
  }, []);

  const executeDropBlock = useCallback(
    (templateInput, clientX, clientY) => {
      if (dropLockRef.current) return;
      if (!isEditingLayout || builderMode !== "edit") return;

      let template = templateInput;
      if (!template || !template.type) {
        template =
          draggedBlockTemplateRef.current ||
          activeDragTemplate ||
          persistedDragBlockRef.current;
      }
      if (!template || !template.type) {
        try {
          template = window.__ps_active_block || window.__ps_last_dragged_block;
        } catch {}
      }

      if (!template || !template.type) {
        return;
      }

      dropLockRef.current = true;
      justDroppedRef.current = true;
      setTimeout(() => {
        justDroppedRef.current = false;
        dropLockRef.current = false;
      }, 250);

      // Immediately clear all dragging state synchronously so preview disappears
      setFloorPlacementCoord(null);
      setActiveDragTemplate(null);
      draggedBlockTemplateRef.current = null;
      persistedDragBlockRef.current = null;
      try {
        window.__ps_active_block = null;
        window.__ps_last_dragged_block = null;
        window.__ps_drag_start_coord = null;
      } catch {}

      let dropX = 50;
      let dropY = 50;

      if (floorRef.current && typeof clientX === "number" && clientX > 0) {
        const rect = floorRef.current.getBoundingClientRect();
        const rawX = ((clientX - rect.left) / rect.width) * 100;
        const rawY = ((clientY - rect.top) / rect.height) * 100;
        dropX = Math.max(3, Math.min(95, snapCoord(rawX)));
        dropY = Math.max(5, Math.min(94, snapCoord(rawY)));
      } else if (lastDropCoordRef.current) {
        dropX = lastDropCoordRef.current.x;
        dropY = lastDropCoordRef.current.y;
      }

      const newObj = createPlacedObject(template, dropX, dropY);
      setFurnitureLayout((prev) => {
        const next = { ...prev, [newObj.id]: newObj };
        pushHistory(next);
        if (orgId) {
          saveOfficeLayout(orgId, next);
        }
        return next;
      });

      setSelectedItemId(newObj.id);
      setBuilderSidebarTab("properties");

      setLayoutNotice({
        type: "success",
        text: `✓ Added "${template.name}" to office layout!`,
      });
      setTimeout(() => setLayoutNotice(null), 3000);

      setTimeout(() => {
        dropLockRef.current = false;
      }, 250);
    },
    [isEditingLayout, builderMode, snapCoord, pushHistory, activeDragTemplate, orgId]
  );

  const handleFloorDragEnter = useCallback(
    (event) => {
      if (!isEditingLayout || builderMode !== "edit") return;
      event.preventDefault();
      try {
        event.dataTransfer.dropEffect = "copy";
      } catch {}
    },
    [isEditingLayout, builderMode]
  );

  const handleFloorDragOver = useCallback(
    (event) => {
      if (!isEditingLayout || builderMode !== "edit") return;
      event.preventDefault();
      try {
        event.dataTransfer.dropEffect = "copy";
      } catch {}
      const activeBlock =
        draggedBlockTemplateRef.current ||
        activeDragTemplate ||
        persistedDragBlockRef.current ||
        window.__ps_active_block ||
        window.__ps_last_dragged_block;
      if (!activeBlock) return;
      if (!floorRef.current) return;
      const rect = floorRef.current.getBoundingClientRect();
      const rawX = ((event.clientX - rect.left) / rect.width) * 100;
      const rawY = ((event.clientY - rect.top) / rect.height) * 100;
      const snappedX = Math.max(3, Math.min(95, snapCoord(rawX)));
      const snappedY = Math.max(5, Math.min(94, snapCoord(rawY)));
      lastDropCoordRef.current = { x: snappedX, y: snappedY };
      setFloorPlacementCoord((prev) => {
        if (prev && prev.x === snappedX && prev.y === snappedY) return prev;
        return { x: snappedX, y: snappedY };
      });
    },
    [isEditingLayout, builderMode, snapCoord, activeDragTemplate]
  );

  const handleFloorDragLeave = useCallback((event) => {
    if (floorRef.current && typeof event.clientX === "number" && typeof event.clientY === "number") {
      const rect = floorRef.current.getBoundingClientRect();
      if (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      ) {
        return;
      }
    }
    setFloorPlacementCoord(null);
  }, []);

  const handleFloorDrop = useCallback(
    (event) => {
      if (!isEditingLayout || builderMode !== "edit") return;
      if (isDraggingFurnitureRef.current) return;
      event.preventDefault();

      let template = null;
      try {
        const rawData =
          event.dataTransfer?.getData("application/json") ||
          event.dataTransfer?.getData("text/plain") ||
          event.dataTransfer?.getData("text");
        if (rawData) {
          template = JSON.parse(rawData);
        }
      } catch {}

      executeDropBlock(template, event.clientX, event.clientY);
    },
    [isEditingLayout, builderMode, executeDropBlock]
  );

  // Global pointer & mouse listeners to handle dragging smoothly without sticking
  useEffect(() => {
    if (!isEditingLayout || builderMode !== "edit") return;

    function handleGlobalPointerMove(e) {
      const activeBlock =
        draggedBlockTemplateRef.current ||
        activeDragTemplate ||
        persistedDragBlockRef.current ||
        window.__ps_active_block ||
        window.__ps_last_dragged_block;
      if (!activeBlock || !floorRef.current) return;

      const rect = floorRef.current.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        const rawX = ((e.clientX - rect.left) / rect.width) * 100;
        const rawY = ((e.clientY - rect.top) / rect.height) * 100;
        const snappedX = Math.max(3, Math.min(95, snapCoord(rawX)));
        const snappedY = Math.max(5, Math.min(94, snapCoord(rawY)));
        lastDropCoordRef.current = { x: snappedX, y: snappedY };
        setFloorPlacementCoord((prev) => {
          if (prev && prev.x === snappedX && prev.y === snappedY) return prev;
          return { x: snappedX, y: snappedY };
        });
      } else {
        setFloorPlacementCoord(null);
      }
    }

    function handleGlobalPointerUp(e) {
      if (isDraggingFurnitureRef.current) return;
      const activeBlock =
        draggedBlockTemplateRef.current ||
        activeDragTemplate ||
        persistedDragBlockRef.current ||
        window.__ps_active_block ||
        window.__ps_last_dragged_block;

      if (!activeBlock || !floorRef.current) {
        setFloorPlacementCoord(null);
        setActiveDragTemplate(null);
        draggedBlockTemplateRef.current = null;
        return;
      }

      const rect = floorRef.current.getBoundingClientRect();
      const hasValidCoord =
        typeof e.clientX === "number" &&
        e.clientX > 0 &&
        typeof e.clientY === "number" &&
        e.clientY > 0;

      const isOverFloor =
        hasValidCoord &&
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (isOverFloor) {
        executeDropBlock(activeBlock, e.clientX, e.clientY);
      } else {
        setFloorPlacementCoord(null);
        setActiveDragTemplate(null);
        draggedBlockTemplateRef.current = null;
        try {
          window.__ps_active_block = null;
          window.__ps_last_dragged_block = null;
          window.__ps_drag_start_coord = null;
        } catch {}
      }
    }

    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("mouseup", handleGlobalPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("mouseup", handleGlobalPointerUp);
    };
  }, [isEditingLayout, builderMode, snapCoord, activeDragTemplate, executeDropBlock]);

  const handleUpdateItem = useCallback(
    (itemId, updates) => {
      setFurnitureLayout((prev) => {
        const existing = prev[itemId] || {};
        const nextX = updates.x !== undefined ? updates.x : (existing.x !== undefined ? existing.x : existing.position?.x);
        const nextY = updates.y !== undefined ? updates.y : (existing.y !== undefined ? existing.y : existing.position?.y);
        const nextW = updates.width !== undefined ? updates.width : existing.width;
        const nextH = updates.height !== undefined ? updates.height : existing.height;
        const next = {
          ...prev,
          [itemId]: {
            ...existing,
            ...updates,
            ...(nextX !== undefined && nextY !== undefined ? { x: nextX, y: nextY, position: { x: nextX, y: nextY } } : {}),
            ...(nextW !== undefined ? { width: nextW } : {}),
            ...(nextH !== undefined ? { height: nextH } : {}),
          },
        };
        pushHistory(next);
        if (orgId) {
          saveOfficeLayout(orgId, next);
        }
        return next;
      });
    },
    [pushHistory, orgId]
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
        if (orgId) {
          saveOfficeLayout(orgId, next);
        }
        return next;
      });
    },
    [pushHistory, orgId]
  );

  const handleDuplicateItem = useCallback(
    (itemId) => {
      if (!itemId) return;
      const existing = furnitureLayout[itemId];
      if (!existing) return;
      const newId = `block-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const curX = existing.x !== undefined ? existing.x : (existing.position?.x || 50);
      const curY = existing.y !== undefined ? existing.y : (existing.position?.y || 50);
      const newX = Math.min(94, curX + 3);
      const newY = Math.min(93, curY + 3);

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
            position: { x: cloned.position.x, y: cloned.position.y },
            category: existing.category || "Furniture",
            icon: existing.icon || "📦",
            color: existing.color || "#cbd5e1",
          },
        };
        pushHistory(next);
        if (orgId) {
          saveOfficeLayout(orgId, next);
        }
        return next;
      });
      setSelectedItemId(newId);
      setLayoutNotice({
        type: "info",
        text: `Duplicated "${existing.name || "Object"}".`,
      });
      setTimeout(() => setLayoutNotice(null), 2000);
    },
    [furnitureLayout, pushHistory, orgId]
  );

  const handleDeleteSelected = useCallback((targetId) => {
    const idToDelete = (typeof targetId === "string" ? targetId : selectedItemId);
    if (!idToDelete) return;
    const itemToDelete = furnitureLayout[idToDelete];
    const itemName = itemToDelete?.name || itemToDelete?.label || "element";

    setFurnitureLayout((prev) => {
      const next = { ...prev };
      delete next[idToDelete];
      pushHistory(next);
      if (orgId) {
        saveOfficeLayout(orgId, next);
      }
      return next;
    });

    if (selectedItemId === idToDelete) {
      setSelectedItemId(null);
    }
    setLayoutNotice({
      type: "info",
      text: `Removed "${itemName}" from office layout.`,
    });
    setTimeout(() => setLayoutNotice(null), 2500);
  }, [selectedItemId, furnitureLayout, pushHistory, orgId]);

  async function handleSaveLayout() {
    setIsSavingLayout(true);
    try {
      const savedPayload = saveOfficeLayout(orgId, furnitureLayout);
      const count =
        savedPayload?.officeLayout?.objects?.length ??
        Object.keys(furnitureLayout).length;

      setPreEditLayout({ ...furnitureLayout });
      setLayoutNotice({
        type: "success",
        text: `✓ Office layout saved locally! (${count} ${
          count === 1 ? "object" : "objects"
        })`,
      });
      if (onShowToast) {
        onShowToast({
          type: "success",
          title: "Layout Saved",
          message: `Office layout saved locally with ${count} ${
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

  async function handleDone() {
    setIsSavingLayout(true);
    try {
      const savedPayload = saveOfficeLayout(orgId, furnitureLayout);
      const count =
        savedPayload?.officeLayout?.objects?.length ??
        Object.keys(furnitureLayout).length;

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

    function handleStartResizeObject(event, itemId) {
    if (!isEditingLayout || builderMode !== "edit") return;
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (window.getSelection) {
      window.getSelection().removeAllRanges();
    }

    const currentItem = furnitureLayout[itemId];
    if (!currentItem) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startW = currentItem.width || 40;
    const startH = currentItem.height || 20;
    let latestLayout = furnitureLayout;
    let hasResized = false;

    function onResizeMove(moveEvent) {
      moveEvent.preventDefault();
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
        hasResized = true;
      }

      const isZone = String(currentItem.type).startsWith("zone-");
      const minW = isZone ? 80 : 16;
      const minH = isZone ? 60 : 12;
      const maxDim = 600;

      const newW = Math.max(minW, Math.min(maxDim, Math.round(startW + deltaX)));
      const newH = Math.max(minH, Math.min(maxDim, Math.round(startH + deltaY)));

      setFurnitureLayout((prev) => {
        const existing = prev[itemId] || {};
        const updated = {
          ...prev,
          [itemId]: {
            ...existing,
            width: newW,
            height: newH,
          },
        };
        latestLayout = updated;
        return updated;
      });
    }

    function onResizeUp() {
      if (hasResized) {
        pushHistory(latestLayout);
        if (orgId) {
          saveOfficeLayout(orgId, latestLayout);
        }
      }
      window.removeEventListener("pointermove", onResizeMove);
      window.removeEventListener("pointerup", onResizeUp);
      window.removeEventListener("pointercancel", onResizeUp);
    }

    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onResizeUp);
    window.addEventListener("pointercancel", onResizeUp);
  }

  function handleStartDragFurniture(event, itemId) {
    if (!isEditingLayout || builderMode !== "edit") return;
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    // Prevent duplicate creation: clear any template drag references
    try { window.__ps_active_block = null; } catch {}
    draggedBlockTemplateRef.current = null;
    setActiveDragTemplate(null);
    setFloorPlacementCoord(null);
    isDraggingFurnitureRef.current = true;

    setSelectedItemId(itemId);
    setDraggedItemId(itemId);
    setBuilderSidebarTab("properties");

    const floor = floorRef.current;
    if (!floor) return;

    const rect = floor.getBoundingClientRect();
    const startX = event.clientX ?? (event.touches && event.touches[0]?.clientX) ?? 0;
    const startY = event.clientY ?? (event.touches && event.touches[0]?.clientY) ?? 0;
    const currentItem = furnitureLayout[itemId] || { x: 50, y: 50 };
    const originalX = currentItem.x !== undefined ? currentItem.x : (currentItem.position?.x ?? 50);
    const originalY = currentItem.y !== undefined ? currentItem.y : (currentItem.position?.y ?? 50);
    let latestLayout = furnitureLayout;
    let hasMoved = false;

    function onPointerMove(moveEvent) {
      if (moveEvent.cancelable) {
        moveEvent.preventDefault();
      }

      const clientX = moveEvent.clientX ?? (moveEvent.touches && moveEvent.touches[0]?.clientX);
      const clientY = moveEvent.clientY ?? (moveEvent.touches && moveEvent.touches[0]?.clientY);
      if (clientX === undefined || clientY === undefined) return;

      const deltaX = ((clientX - startX) / rect.width) * 100;
      const deltaY = ((clientY - startY) / rect.height) * 100;

      if (Math.abs(deltaX) > 0.2 || Math.abs(deltaY) > 0.2) {
        hasMoved = true;
      }

      const rawNewX = Math.max(2, Math.min(96, originalX + deltaX));
      const rawNewY = Math.max(4, Math.min(95, originalY + deltaY));
      const snappedX = snapCoord(rawNewX);
      const snappedY = snapCoord(rawNewY);

      setFurnitureLayout((prev) => {
        const existing = prev[itemId] || {};
        if (existing.x === snappedX && existing.y === snappedY) {
          return prev;
        }
        const updated = {
          ...prev,
          [itemId]: {
            ...existing,
            x: snappedX,
            y: snappedY,
            position: { x: snappedX, y: snappedY },
          },
        };
        latestLayout = updated;
        return updated;
      });
    }

    function onPointerUp() {
      isDraggingFurnitureRef.current = false;
      setDraggedItemId(null);
      justDroppedRef.current = true;
      setTimeout(() => {
        justDroppedRef.current = false;
      }, 250);
      if (hasMoved) {
        pushHistory(latestLayout);
        if (orgId) {
          saveOfficeLayout(orgId, latestLayout);
        }
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("touchend", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("mousemove", onPointerMove, { passive: false });
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchmove", onPointerMove, { passive: false });
    window.addEventListener("touchend", onPointerUp);
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
    if (justDroppedRef.current) return;
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
              onDragEndBlock={handleEndDragBlock}
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
            onMouseDown={(e) => {
              if (isEditingLayout && window.getSelection) {
                window.getSelection().removeAllRanges();
              }
            }}
            onDragEnter={handleFloorDragEnter}
            onDragOver={handleFloorDragOver}
            onDrop={handleFloorDrop}
            onDragLeave={handleFloorDragLeave}
            role="application"
            aria-label="Interactive Virtual Office Floor Plan"
          >
            {/* Real-time placement preview when dragging an item over canvas */}
            {isEditingLayout &&
              floorPlacementCoord &&
              (activeDragTemplate ||
                draggedBlockTemplateRef.current ||
                persistedDragBlockRef.current ||
                window.__ps_active_block ||
                window.__ps_last_dragged_block) && (
                <div
                  className="vo-placement-ghost"
                  style={{
                    left: `${floorPlacementCoord.x}%`,
                    top: `${floorPlacementCoord.y}%`,
                    transform: "translate(-50%, -50%)",
                    pointerEvents: "none",
                  }}
                >
                  {(() => {
                    const t =
                      activeDragTemplate ||
                      draggedBlockTemplateRef.current ||
                      persistedDragBlockRef.current ||
                      window.__ps_active_block ||
                      window.__ps_last_dragged_block;
                    const isZ = String(t.type).startsWith("zone-");
                    return (
                      <div
                        className="vo-drag-preview-wrapper"
                        style={{
                          width: `${t.defaultWidth || 54}px`,
                          height: `${t.defaultHeight || 44}px`,
                          position: "relative",
                          opacity: 0.88,
                          outline: "2.5px dashed #6366f1",
                          outlineOffset: "2px",
                          borderRadius: isZ ? "12px" : "6px",
                          boxShadow: "0 8px 24px rgba(99, 102, 241, 0.35)",
                          pointerEvents: "none",
                        }}
                      >
                        <OfficeObjectRenderer
                          item={{
                            id: "drag-ghost-preview",
                            type: t.type,
                            name: t.name,
                            x: 50,
                            y: 50,
                            width: t.defaultWidth || 54,
                            height: t.defaultHeight || 44,
                            rotation: 0,
                            isSolid: t.isSolid ?? true,
                            icon: t.icon,
                            color: t.color,
                          }}
                          isSelected={false}
                          isDragging={false}
                          isEditingLayout={false}
                        />
                      </div>
                    );
                  })()}
                  <span className="vo-placement-ghost-coord">
                    {Math.round(floorPlacementCoord.x)}%,{" "}
                    {Math.round(floorPlacementCoord.y)}%
                  </span>
                </div>
              )}
            {/* Inner Scalable Room Architecture */}
            <div
              className="vo-floor-scalable"
              onDragEnter={handleFloorDragEnter}
              onDragOver={handleFloorDragOver}
              onDrop={handleFloorDrop}
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
                  PLACED BUILDING BLOCKS & FURNITURE OBJECTS
                  ========================================================= */}
              {Object.entries(furnitureLayout).map(([id, item]) => {
                if (!item) return null;
                return (
                  <OfficeObjectRenderer
                    key={id}
                    item={item}
                    isSelected={selectedItemId === id}
                    isDragging={_draggedItemId === id}
                    isEditingLayout={isEditingLayout && builderMode === "edit"}
                    onPointerDown={(e) => handleStartDragFurniture(e, id)}
                    onStartResize={(e) => handleStartResizeObject(e, id)}
                    onDragEnter={handleFloorDragEnter}
                    onDragOver={handleFloorDragOver}
                    onDrop={handleFloorDrop}
                    onClick={(e) => {
                      if (justDroppedRef.current) return;
                      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
                      setSelectedItemId(id);
                      setBuilderSidebarTab("properties");
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
          {isEditingLayout ? (
            <div className="vo-builder-sidebar-panel">
              {/* Dual Sidebar Tabs: Blocks Library vs Object Properties */}
              <div className="vo-builder-sidebar-tabs">
                <button
                  type="button"
                  className={`vo-builder-tab-btn ${builderSidebarTab === "library" ? "active" : ""}`}
                  onClick={() => setBuilderSidebarTab("library")}
                >
                  🧱 Blocks Library
                </button>
                <button
                  type="button"
                  className={`vo-builder-tab-btn ${builderSidebarTab === "properties" ? "active" : ""}`}
                  onClick={() => setBuilderSidebarTab("properties")}
                >
                  ⚙️ Properties {selectedItem ? `(${selectedItem.name || "Object"})` : ""}
                </button>
              </div>

              {builderSidebarTab === "properties" ? (
                selectedItem ? (
                  <ObjectPropertiesPanel
                    selectedItem={selectedItem}
                    zonesList={dynamicZonesList}
                    onUpdateItem={handleUpdateItem}
                    onRotateItem={handleRotateItem}
                    onDuplicateItem={handleDuplicateItem}
                    onDeleteItem={handleDeleteSelected}
                    onDeselect={() => {
                      setSelectedItemId(null);
                      setBuilderSidebarTab("library");
                    }}
                  />
                ) : (
                  <div className="vo-sidebar-card vo-builder-inspector-empty">
                    <div className="vo-sidebar-header">
                      <h3>🛠️ Object Properties</h3>
                    </div>
                    <div className="vo-inspector-placeholder">
                      <span className="vo-inspector-placeholder-icon">🖱️</span>
                      <strong>No Object Selected</strong>
                      <p>
                        Click any desk, wall, door, or zone on the canvas to customize its properties, or switch to the Blocks Library tab to drag new blocks onto your office floor.
                      </p>
                      <button
                        type="button"
                        className="vo-lib-reset-filter-btn"
                        style={{ marginTop: 12, padding: "6px 14px" }}
                        onClick={() => setBuilderSidebarTab("library")}
                      >
                        🧱 Open Blocks Library
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="vo-sidebar-card" style={{ padding: "8px 12px" }}>
                  <BuildingBlocksLibrary
                    isOpen={true}
                    onToggle={() => {}}
                    onAddBlock={handleAddBlockToMap}
                    onDragStartBlock={handleStartDragBlock}
                    onDragEndBlock={handleEndDragBlock}
                    hideToggle={true}
                  />
                </div>
              )}
            </div>
          ) : (
            <>
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
            </>
          )}
        </aside>
      </div>

    </div>
  );
}
