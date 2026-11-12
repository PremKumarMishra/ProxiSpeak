import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import api from "../src/api";
import { getSavedTheme, toggleTheme, THEME_EVENT } from "../src/utils/theme";
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
  getSoundBarrierAttenuation,
} from "../src/services/spatialAudio";
import {
  createPlacedObject,
  normalizeBuildingBlockObject,
  DEFAULT_FURNITURE_LAYOUT,
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
import AvatarMiniProfile from "../src/components/AvatarMiniProfile";
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

const isAvatarUrl = (val) =>
  typeof val === "string" &&
  (val.startsWith("http://") ||
    val.startsWith("https://") ||
    val.startsWith("data:image/") ||
    val.startsWith("blob:"));

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
  const [currentTheme, setCurrentTheme] = useState(getSavedTheme);

  useEffect(() => {
    function handleThemeChange(e) {
      if (e?.detail?.theme) {
        setCurrentTheme(e.detail.theme);
      } else {
        setCurrentTheme(getSavedTheme());
      }
    }
    window.addEventListener(THEME_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_EVENT, handleThemeChange);
  }, []);

  const [isDraggingAvatar, setIsDraggingAvatar] = useState(false);
  const isDraggingAvatarRef = useRef(false);
  const [activeProfile, setActiveProfile] = useState(null);
  const avatarClickStartRef = useRef(null);
  const hasDraggedSelfAvatarRef = useRef(false);
  const justOpenedSelfProfileRef = useRef(false);
  const floorRectRef = useRef(null);
  const avatarRafIdRef = useRef(null);
  const pendingAvatarCoordRef = useRef(null);

  // Dynamic office layout state
  const [fetchedOrg, setFetchedOrg] = useState(null);
  const activeOrg = fetchedOrg || organization;

  const [furnitureLayout, setFurnitureLayout] = useState(() => {
    try {
      if (organization?.office_layout && typeof organization.office_layout === "object") {
        const norm = normalizeLayoutToMap(organization.office_layout);
        if (norm && Object.keys(norm).length > 0) return norm;
      }
      if (organization?.officeLayout && typeof organization.officeLayout === "object") {
        const norm = normalizeLayoutToMap(organization.officeLayout);
        if (norm && Object.keys(norm).length > 0) return norm;
      }
      const saved = null;
      if (saved && Object.keys(saved).length > 0) {
        return saved;
      }
    } catch (e) {
      console.warn("Failed to initialize office layout:", e);
    }
    return DEFAULT_FURNITURE_LAYOUT;
  });

  // Load layout from backend MongoDB API (/api/organizations/:id)
  useEffect(() => {
    if (!orgId) return;
    let isCancelled = false;

        async function fetchLayoutFromBackend() {
      try {
        const res = await api.get(`/api/organizations/${orgId}`);
                if (!isCancelled && res.data?.organization) {
          const merged = {
            ...(organization || {}),
            ...res.data.organization,
            is_owner: res.data.organization.is_owner ?? organization?.is_owner,
            role: res.data.organization.role ?? organization?.role,
            user_role: res.data.organization.user_role ?? organization?.user_role,
          };
          setFetchedOrg(merged);
          if (res.data.organization.office_layout) {
            const dbLayout = res.data.organization.office_layout;
            const normalized = normalizeLayoutToMap(dbLayout);
            if (normalized && Object.keys(normalized).length > 0) {
              setFurnitureLayout(normalized);
              saveOfficeLayout(orgId, normalized);
              return;
            }
          }
        }
      } catch (err) {
        console.warn("[VirtualOffice] Backend layout fetch fallback to localStorage:", err.message);
      }

      if (!isCancelled) {
        if (organization?.office_layout && typeof organization.office_layout === "object") {
          const norm = normalizeLayoutToMap(organization.office_layout);
          if (norm && Object.keys(norm).length > 0) {
            setFurnitureLayout(norm);
            return;
          }
        }
        if (organization?.officeLayout && typeof organization.officeLayout === "object") {
          const norm = normalizeLayoutToMap(organization.officeLayout);
          if (norm && Object.keys(norm).length > 0) {
            setFurnitureLayout(norm);
            return;
          }
        }
        const saved = null;
        if (saved && Object.keys(saved).length > 0) {
          setFurnitureLayout(saved);
        } else {
          setFurnitureLayout(DEFAULT_FURNITURE_LAYOUT);
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
  // Only allow owner of the organization to edit the layout
      const isOwner = Boolean(
    activeOrg?.is_owner ||
    activeOrg?.isOwner ||
    organization?.is_owner ||
    organization?.isOwner ||
    activeOrg?.role === "Owner" ||
    activeOrg?.role === "owner" ||
    organization?.role === "Owner" ||
    organization?.role === "owner" ||
    activeOrg?.user_role === "owner" ||
    activeOrg?.user_role === "Owner" ||
    organization?.user_role === "owner" ||
    organization?.user_role === "Owner" ||
    (activeOrg?.owner_id && (
      String(activeOrg.owner_id) === String(user?.backendUser?._id) ||
      String(activeOrg.owner_id) === String(user?.backendUser?.id) ||
      String(activeOrg.owner_id) === String(user?._id) ||
      String(activeOrg.owner_id) === String(user?.uid)
    )) ||
    (activeOrg?.ownerId && (
      String(activeOrg.ownerId) === String(user?.backendUser?._id) ||
      String(activeOrg.ownerId) === String(user?.backendUser?.id) ||
      String(activeOrg.ownerId) === String(user?._id) ||
      String(activeOrg.ownerId) === String(user?.uid)
    )) ||
    (organization?.owner_id && (
      String(organization.owner_id) === String(user?.backendUser?._id) ||
      String(organization.owner_id) === String(user?.backendUser?.id) ||
      String(organization.owner_id) === String(user?._id) ||
      String(organization.owner_id) === String(user?.uid)
    )) ||
    (organization?.ownerId && (
      String(organization.ownerId) === String(user?.backendUser?._id) ||
      String(organization.ownerId) === String(user?.backendUser?.id) ||
      String(organization.ownerId) === String(user?._id) ||
      String(organization.ownerId) === String(user?.uid)
    ))
  );

  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [builderMode, setBuilderMode] = useState("edit");
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
  const historyIndexRef = useRef(historyIndex);
  historyIndexRef.current = historyIndex;

  // Load saved layout fallback for this organization if not loaded from server
  useEffect(() => {
    if (!orgId) return;
    if (lastLoadedOrgIdRef.current === orgId) {
      return;
    }
    lastLoadedOrgIdRef.current = orgId;
    try {
      const saved = null;
      if (saved && Object.keys(saved).length > 0) {
        setFurnitureLayout(saved);
      }
    } catch (err) {
      console.warn("Failed to load local office layout fallback:", err);
    }
  }, [orgId]);

  // Automatic local persistence: auto-save layout changes to localStorage
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
    if (!isOwner) {
      setLayoutNotice({
        type: "error",
        text: "Only the owner of the organization can edit the layout.",
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
    setActiveProfile(null);
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
    setFurnitureLayout(DEFAULT_FURNITURE_LAYOUT);
    pushHistory(DEFAULT_FURNITURE_LAYOUT);
    setSelectedItemId(null);
    if (orgId) {
      saveOfficeLayout(orgId, DEFAULT_FURNITURE_LAYOUT);
    }
    setLayoutNotice({
      type: "info",
      text: "Reset layout to default office layout.",
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
      event.stopPropagation();

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

      if (!template || !template.type) {
        template =
          window.__ps_active_block ||
          window.__ps_last_dragged_block ||
          draggedBlockTemplateRef.current ||
          activeDragTemplate ||
          persistedDragBlockRef.current;
      }

      executeDropBlock(template, event.clientX, event.clientY);
    },
    [isEditingLayout, builderMode, executeDropBlock, activeDragTemplate]
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

  // Done button sends PUT api/organizations/:id/layout to backend, updates frontend state, broadcasts and exits edit mode
  async function handleDone() {
    setIsSavingLayout(true);
    setLayoutNotice({
      type: "info",
      text: "Saving office layout to database...",
    });

    try {
      const layoutPayload = {
        version: 1,
        objects: Object.values(furnitureLayout).map((item) => {
          const posX = Math.round(Number(item.position?.x !== undefined ? item.position.x : (item.x !== undefined ? item.x : 0)));
          const posY = Math.round(Number(item.position?.y !== undefined ? item.position.y : (item.y !== undefined ? item.y : 0)));
          const soundBarrierVal = Boolean(item.soundBarrier === true || item.soundBarrier === "true");
          return {
            id: String(item.id),
            type: String(item.type || item.obj_type || "furniture"),
            obj_type: String(item.obj_type || item.type || "furniture"),
            name: String(item.name || "Office Object"),
            position: { x: posX, y: posY },
            x: posX,
            y: posY,
            rotation: Math.round(Number(item.rotation || 0)),
            width: Math.round(Number(item.width || 40)),
            height: Math.round(Number(item.height || 20)),
            isSolid: Boolean(item.isSolid),
            canPass: Boolean(item.canPass),
            soundBarrier: soundBarrierVal,
            category: item.category || "Furniture",
            icon: item.icon || "📦",
            color: item.color || "#cbd5e1",
            custom: Boolean(item.custom),
          };
        }),
      };

      // 1. Instantly normalize and update local state
      const normalized = normalizeLayoutToMap(layoutPayload);
      setFurnitureLayout(normalized);
      saveOfficeLayout(orgId, normalized);

      // 2. Broadcast immediately over WebSocket so all connected peers in room update in real time
      const socket = connectSocket();
      if (socket) {
        socket.emit("office:layout-update", {
          organizationId: orgId,
          officeLayout: layoutPayload,
        });
      }

      // 3. Persist layout to backend MongoDB via PUT api/organizations/:id/layout
      let response = null;
      try {
        response = await api.put(`/api/organizations/${orgId}/layout`, {
          office_layout: layoutPayload,
        });
      } catch (putErr) {
        console.warn("[VirtualOffice] REST PUT layout save fallback (WebSocket sync active):", putErr.message);
      }

      const updatedLayout =
        response?.data?.office_layout ||
        response?.data?.organization?.office_layout ||
        layoutPayload;

      const reNorm = normalizeLayoutToMap(updatedLayout);
      if (reNorm && Object.keys(reNorm).length > 0) {
        setFurnitureLayout(reNorm);
        saveOfficeLayout(orgId, reNorm);
      }

      setPreEditLayout({ ...(reNorm || normalized) });
      setZoom(1);
      setIsEditingLayout(false);
      setBuilderMode("edit");
      setSelectedItemId(null);
      setFloorPlacementCoord(null);

      const count = Object.keys(reNorm || normalized).length;
      setLayoutNotice({
        type: "success",
        text: `✓ Office layout updated successfully! (${count} ${
          count === 1 ? "object" : "objects"
        })`,
      });
      if (onShowToast) {
        onShowToast({
          type: "success",
          title: "Office Layout Updated",
          message: `✓ Office layout updated successfully with ${count} ${
            count === 1 ? "object" : "objects"
          }.`,
        });
      }
      setTimeout(() => setLayoutNotice(null), 4000);
    } catch (err) {
      console.error("[VirtualOffice] Failed to update layout:", err);
      // Fallback: save to localStorage so edits are never lost
      if (orgId) {
        saveOfficeLayout(orgId, furnitureLayout);
      }
      setPreEditLayout({ ...furnitureLayout });
      const errMsg =
        err.response?.data?.message || err.message || "Failed to update layout. Saved locally.";
      setLayoutNotice({
        type: "error",
        text: `Error: ${errMsg}`,
      });
      if (onShowToast) {
        onShowToast({
          type: "error",
          title: "Layout Update Error",
          message: `${errMsg} (Layout saved to local storage).`,
        });
      }
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

    const startX = event.clientX ?? (event.touches && event.touches[0]?.clientX) ?? 0;
    const startY = event.clientY ?? (event.touches && event.touches[0]?.clientY) ?? 0;
    const startW = currentItem.width || 40;
    const startH = currentItem.height || 20;
    const currentRot = currentItem.rotation || 0;
    const rad = (currentRot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    let latestLayout = furnitureLayout;
    let hasResized = false;

    function onResizeMove(moveEvent) {
      if (moveEvent.cancelable) {
        moveEvent.preventDefault();
      }
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }
      const clientX = moveEvent.clientX ?? (moveEvent.touches && moveEvent.touches[0]?.clientX);
      const clientY = moveEvent.clientY ?? (moveEvent.touches && moveEvent.touches[0]?.clientY);
      if (clientX === undefined || clientY === undefined) return;

      const screenDeltaX = clientX - startX;
      const screenDeltaY = clientY - startY;

      // Project screen delta into the object's local rotated coordinate space
      const localDeltaX = screenDeltaX * cos + screenDeltaY * sin;
      const localDeltaY = -screenDeltaX * sin + screenDeltaY * cos;

      if (Math.abs(screenDeltaX) > 1 || Math.abs(screenDeltaY) > 1) {
        hasResized = true;
      }

      const isZone = String(currentItem.type).startsWith("zone-");
      const isWall = String(currentItem.type).startsWith("wall-") || currentItem.type === "room-partition" || currentItem.type === "thin-wall" || currentItem.type === "long-wall";
      const minW = isZone ? 80 : (isWall ? 8 : 14);
      const minH = isZone ? 60 : (isWall ? 8 : 10);
      const maxDim = 800;

      const newW = Math.max(minW, Math.min(maxDim, Math.round(startW + localDeltaX)));
      const newH = Math.max(minH, Math.min(maxDim, Math.round(startH + localDeltaY)));

      setFurnitureLayout((prev) => {
        const existing = prev[itemId] || {};
        if (existing.width === newW && existing.height === newH) return prev;
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
      window.removeEventListener("mousemove", onResizeMove);
      window.removeEventListener("mouseup", onResizeUp);
      window.removeEventListener("touchmove", onResizeMove);
      window.removeEventListener("touchend", onResizeUp);
    }

    window.addEventListener("pointermove", onResizeMove, { passive: false });
    window.addEventListener("pointerup", onResizeUp);
    window.addEventListener("pointercancel", onResizeUp);
    window.addEventListener("mousemove", onResizeMove, { passive: false });
    window.addEventListener("mouseup", onResizeUp);
    window.addEventListener("touchmove", onResizeMove, { passive: false });
    window.addEventListener("touchend", onResizeUp);
  }

  function handleStartDragFurniture(event, itemId) {
    if (!isEditingLayout || builderMode !== "edit") return;
    if (event.button !== undefined && event.button !== 0) return;
    event.stopPropagation();

    // Prevent duplicate creation: clear any template drag references
    try { window.__ps_active_block = null; } catch {}
    draggedBlockTemplateRef.current = null;
    setActiveDragTemplate(null);
    setFloorPlacementCoord(null);

    // Immediately select the clicked item so properties and HUD appear instantly
    setSelectedItemId(itemId);
    setBuilderSidebarTab("properties");

    const floor = floorRef.current;
    if (!floor) return;

    const rect = floor.getBoundingClientRect();
    const startX = event.clientX ?? (event.touches && event.touches[0]?.clientX) ?? 0;
    const startY = event.clientY ?? (event.touches && event.touches[0]?.clientY) ?? 0;
    const currentItem = furnitureLayout[itemId] || { x: 50, y: 50 };
    const originalX = currentItem.x !== undefined ? currentItem.x : (currentItem.position?.x ?? 50);
    const originalY = currentItem.y !== undefined ? currentItem.y : (currentItem.position?.y ?? 50);

    let isDragging = false;
    let hasMoved = false;
    let lastSnappedX = originalX;
    let lastSnappedY = originalY;
    let latestLayout = furnitureLayout;

    function onPointerMove(moveEvent) {
      const clientX = moveEvent.clientX ?? (moveEvent.touches && moveEvent.touches[0]?.clientX);
      const clientY = moveEvent.clientY ?? (moveEvent.touches && moveEvent.touches[0]?.clientY);
      if (clientX === undefined || clientY === undefined) return;

      const pxDiffX = clientX - startX;
      const pxDiffY = clientY - startY;

      // Only enter drag mode if pointer moved at least 3px
      if (!isDragging) {
        if (Math.hypot(pxDiffX, pxDiffY) < 3) {
          return;
        }
        isDragging = true;
        isDraggingFurnitureRef.current = true;
        setDraggedItemId(itemId);
      }

      if (moveEvent.cancelable) {
        moveEvent.preventDefault();
      }

      const deltaX = (pxDiffX / rect.width) * 100;
      const deltaY = (pxDiffY / rect.height) * 100;

      hasMoved = true;

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
      if (isDragging) {
        isDraggingFurnitureRef.current = false;
        setDraggedItemId(null);
        justDroppedRef.current = true;
        setTimeout(() => {
          justDroppedRef.current = false;
        }, 150);
        if (hasMoved) {
          pushHistory(latestLayout);
          if (orgId) {
            saveOfficeLayout(orgId, latestLayout);
          }
        }
      } else {
        isDraggingFurnitureRef.current = false;
        setDraggedItemId(null);
      }

      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("touchend", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("mousemove", onPointerMove, { passive: false });
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchmove", onPointerMove, { passive: false });
    window.addEventListener("touchend", onPointerUp);
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
  const positionRef = useRef(position);
  positionRef.current = position;
  const userNameRef = useRef(userName);
  userNameRef.current = userName;
  const savedAvatarRef = useRef(savedAvatar);
  savedAvatarRef.current = savedAvatar;
  const statusRef = useRef(status);
  statusRef.current = status;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  // Real-time WebSocket room presence, instant multi-user visibility, and audio lifecycle
  useEffect(() => {
    if (!orgId || !userId) return;

    const socket = connectSocket();

    // Join room with full user profile and coordinates
    joinRoom(orgId, {
      uid: userId,
      userId,
      name: userNameRef.current,
      avatar: savedAvatarRef.current,
      status: statusRef.current,
      isMuted: isMutedRef.current,
      isSpeaking: false,
      x: positionRef.current.x,
      y: positionRef.current.y,
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
      photoURL: user?.photoURL || (isUserAvatarUrl ? userAvatar : null),
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
              connectToPeer(u.socketId, peerId);
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
      photoURL: user?.photoURL || (isUserAvatarUrl ? userAvatar : null),
    });

      // The joining user initiates connectToPeer from handleCurrentUsers.
      // Grace period fallback: if connection not formed after 600ms, initiate offer
      setTimeout(() => {
        if (userData.socketId && !hasPeer(userData.socketId)) {
          connectToPeer(userData.socketId, peerId);
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
          (k) => k === peerId || prev[k]?.socketId === data.socketId || prev[k]?.uid === peerId || prev[k]?.userId === peerId
        );
        if (!targetKey) return prev;
        return {
          ...prev,
          [targetKey]: {
            ...prev[targetKey],
            isMuted: typeof data.isMuted === "boolean" ? data.isMuted : prev[targetKey].isMuted,
            isSpeaking: typeof data.isSpeaking === "boolean" ? data.isSpeaking : prev[targetKey].isSpeaking,
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
      const incomingOrgId = String(payload?.organizationId || payload?.orgId || "").trim().toLowerCase();
      const currentOrgId = String(orgId || "").trim().toLowerCase();
      const currentOrgMongoId = String(organization?._id || organization?.id || "").trim().toLowerCase();
      const currentOrgInvite = String(organization?.invite_code || organization?.code || "").trim().toLowerCase();

      const isMatch =
        !incomingOrgId ||
        incomingOrgId === currentOrgId ||
        incomingOrgId === currentOrgMongoId ||
        incomingOrgId === currentOrgInvite;

      if (isMatch) {
        const incoming = payload?.officeLayout || payload?.layout || payload;
        if (incoming && typeof incoming === "object") {
          const normalized = normalizeLayoutToMap(incoming);
          if (normalized) {
            setFurnitureLayout(normalized);
            saveOfficeLayout(orgId, normalized);
          }
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
      if (avatarRafIdRef.current) {
        cancelAnimationFrame(avatarRafIdRef.current);
        avatarRafIdRef.current = null;
      }
    };
  }, [orgId, userId]);

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
      photoURL: user?.photoURL || (isUserAvatarUrl ? userAvatar : null),
    });
  }, [position.x, position.y, orgId, userId, userName, savedAvatar, user?.photoURL, isUserAvatarUrl, userAvatar]);

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
          photoURL: remote.photoURL || remote.avatar_url || (isAvatarUrl(remote.avatar) ? remote.avatar : null),
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
      const barrierAttenuation = getSoundBarrierAttenuation(position, t, furnitureLayout);
      const rawVolume = inRange
        ? Math.max(0, 100 - (distance / PROXIMITY_RADIUS) * 100)
        : 0;
      const volume = Math.round(rawVolume * barrierAttenuation);
      const zone = getZoneForPosition(t.x, t.y);

      return {
        ...t,
        distance,
        inRange,
        volume,
        hasSoundBarrier: barrierAttenuation < 1,
        zone,
      };
    });
  }, [remoteUsers, user?.uid, userId, position.x, position.y, getZoneForPosition, furnitureLayout]);

  // Proximity Audio Cross-Fade: Updates Web Audio GainNode volume dynamically based on distance & sound barriers
  useEffect(() => {
    updateSpatialAudioVolumes(position, allTeammates, PROXIMITY_RADIUS, furnitureLayout);
  }, [position.x, position.y, allTeammates, furnitureLayout]);

  // Toggle microphone with real hardware mute/unmute
  function handleToggleMute() {
    setIsMuted((prev) => {
      const next = !prev;
      setLocalAudioMute(next);
      if (next) {
        setIsSpeaking(false);
      }
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
        setActiveProfile(null);
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

  // Resolve member's organization role with safe fallbacks
  const resolveMemberRole = useCallback(
    (member) => {
      if (!member) return "Member";
      const memberId = String(member.uid || member.userId || member.id || member._id || "");
      const ownerId = String(activeOrg?.owner_id || activeOrg?.ownerId || "");

      // 1. Check if member is the organization owner
      if (memberId && ownerId && memberId === ownerId) {
        return "Owner";
      }
      if (memberId === String(user?.uid) && isOwner) {
        return "Owner";
      }
      if (member.isOwner || member.role?.toLowerCase() === "owner" || member.orgRole?.toLowerCase() === "owner") {
        return "Owner";
      }

      // 2. Check active organization's members array
      if (Array.isArray(activeOrg?.members) && memberId) {
        const found = activeOrg.members.find(
          (m) =>
            String(m.user_id || m.userId || m.uid || m.id || "") === memberId ||
            (m.user_id && String(m.user_id._id || m.user_id.id || "") === memberId) ||
            (m.email && member.email && m.email.toLowerCase() === member.email.toLowerCase())
        );
        if (found?.role) {
          return found.role.charAt(0).toUpperCase() + found.role.slice(1).toLowerCase();
        }
      }

      // 3. Check explicit organization role fields
      const explicitRole = member.orgRole || member.organizationRole;
      if (explicitRole && typeof explicitRole === "string" && explicitRole.trim()) {
        const trimmed = explicitRole.trim();
        if (trimmed.toLowerCase() === "owner") return "Owner";
        if (trimmed.toLowerCase() === "member") return "Member";
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      }

      // 4. Current user role on activeOrg
      if (memberId === String(user?.uid)) {
        if (activeOrg?.user_role && typeof activeOrg.user_role === "string") {
          return activeOrg.user_role.charAt(0).toUpperCase() + activeOrg.user_role.slice(1).toLowerCase();
        }
        if (
          activeOrg?.role &&
          typeof activeOrg.role === "string" &&
          !activeOrg.role.startsWith("In ") &&
          activeOrg.role !== "Online"
        ) {
          return activeOrg.role.charAt(0).toUpperCase() + activeOrg.role.slice(1).toLowerCase();
        }
      }

      // 5. If member.role is a genuine organization role and NOT a zone activity or status
      if (
        typeof member.role === "string" &&
        member.role.trim() &&
        !member.role.startsWith("In ") &&
        !["online", "available", "busy", "away", "offline", "role not available"].includes(member.role.toLowerCase().trim())
      ) {
        return member.role.charAt(0).toUpperCase() + member.role.slice(1);
      }

      return "Member";
    },
    [activeOrg, user?.uid, isOwner]
  );

  const handleCloseProfile = useCallback(() => {
    setActiveProfile(null);
  }, []);

  const handleAvatarClick = useCallback(
    (event, targetMember, customX, customY) => {
      if (isEditingLayout) return;
      event?.stopPropagation();

      const scalableEl = floorRef.current?.querySelector(".vo-floor-scalable") || floorRef.current;
      if (!scalableEl) return;

      const containerWidth = scalableEl.offsetWidth || 800;
      const containerHeight = scalableEl.offsetHeight || 590;

      const avatarXPercent =
        typeof customX === "number"
          ? customX
          : typeof targetMember?.x === "number"
          ? targetMember.x
          : 50;
      const avatarYPercent =
        typeof customY === "number"
          ? customY
          : typeof targetMember?.y === "number"
          ? targetMember.y
          : 50;

      const avatarPixelX = (avatarXPercent / 100) * containerWidth;
      const avatarPixelY = (avatarYPercent / 100) * containerHeight;

      const popupWidth = 190;
      const popupHeight = 152;
      const avatarRadius = 20;

      const spaceAbove = avatarPixelY - avatarRadius;
      let placement = "above";
      let top = avatarPixelY - avatarRadius - popupHeight - 8;

      if (spaceAbove < popupHeight + 12) {
        placement = "below";
        top = avatarPixelY + avatarRadius + 8;
      }

      top = Math.max(8, Math.min(containerHeight - popupHeight - 8, top));

      const idealLeft = avatarPixelX - popupWidth / 2;
      const left = Math.max(12, Math.min(containerWidth - popupWidth - 12, idealLeft));
      const arrowOffset = Math.max(16, Math.min(popupWidth - 16, avatarPixelX - left));

      const targetUid = String(targetMember?.uid || targetMember?.userId || targetMember?.id || "");
      const orgMember = Array.isArray(activeOrg?.members)
        ? activeOrg.members.find(
            (m) => String(m.user_id || m.userId || m.uid || m.id || "") === targetUid
          )
        : null;

      const resolvedRole = resolveMemberRole(targetMember);

      const memberData = {
        uid: targetUid,
        name:
          targetMember?.name ||
          targetMember?.displayName ||
          orgMember?.name ||
          orgMember?.displayName ||
          "Teammate",
        avatar: targetMember?.avatar || orgMember?.avatar || targetMember?.photoURL || "🧑🏻",
        photoURL:
          targetMember?.photoURL ||
          orgMember?.photoURL ||
          targetMember?.avatar_url ||
          orgMember?.avatar_url ||
          (isAvatarUrl(targetMember?.avatar) ? targetMember.avatar : null) ||
          (isAvatarUrl(orgMember?.avatar) ? orgMember.avatar : null) ||
          null,
        role: (resolvedRole && resolvedRole !== "Role not available") ? resolvedRole : "Member",
      };

      setActiveProfile({
        member: memberData,
        position: {
          top: Math.round(top),
          left: Math.round(left),
          placement,
          arrowOffset: Math.round(arrowOffset),
        },
      });
    },
    [isEditingLayout, resolveMemberRole, activeOrg]
  );

  const openSelfProfile = useCallback(
    (event) => {
      if (isEditingLayout) return;
      justOpenedSelfProfileRef.current = true;
      setTimeout(() => {
        justOpenedSelfProfileRef.current = false;
      }, 300);

      const selfMember = {
        uid: user?.uid || userId,
        userId: user?.uid || userId,
        name: user?.displayName || user?.name || user?.backendUser?.name || userName || "You",
        avatar: userAvatar,
        photoURL:
          user?.photoURL ||
          (isUserAvatarUrl ? userAvatar : null) ||
          user?.backendUser?.avatar_url ||
          user?.backendUser?.photoURL ||
          null,
        x: position.x,
        y: position.y,
      };
      handleAvatarClick(event, selfMember, position.x, position.y);
    },
    [
      isEditingLayout,
      user,
      userId,
      userName,
      userAvatar,
      isUserAvatarUrl,
      position.x,
      position.y,
      handleAvatarClick,
    ]
  );

  // Smooth Avatar Dragging Handlers with 60 FPS requestAnimationFrame throttling
  function handleAvatarPointerDown(event) {
    if (isEditingLayout) return;
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const scalableEl = floorRef.current?.querySelector(".vo-floor-scalable") || floorRef.current;
    if (!scalableEl) return;

    floorRectRef.current = scalableEl.getBoundingClientRect();

    avatarClickStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
    };
    hasDraggedSelfAvatarRef.current = false;
    isDraggingAvatarRef.current = true;
    setIsDraggingAvatar(true);
  }

  // Window-level smooth avatar dragging with 60 FPS requestAnimationFrame throttling
  useEffect(() => {
    if (!isDraggingAvatar) return;

    function handleWindowPointerMove(event) {
      if (!isDraggingAvatarRef.current) return;

      if (avatarClickStartRef.current) {
        const dist = Math.hypot(
          event.clientX - avatarClickStartRef.current.x,
          event.clientY - avatarClickStartRef.current.y
        );
        if (dist > 3) {
          hasDraggedSelfAvatarRef.current = true;
          setActiveProfile(null);
        }
      }

      if (!hasDraggedSelfAvatarRef.current) return;

      const scalableEl = floorRef.current?.querySelector(".vo-floor-scalable") || floorRef.current;
      const rect = floorRectRef.current || (scalableEl && scalableEl.getBoundingClientRect());
      if (!rect || rect.width <= 0 || rect.height <= 0) return;

      const clickX = ((event.clientX - rect.left) / rect.width) * 100;
      const clickY = ((event.clientY - rect.top) / rect.height) * 100;

      const targetX = Number(Math.max(2, Math.min(96, clickX)).toFixed(2));
      const targetY = Number(Math.max(4, Math.min(94, clickY)).toFixed(2));

      pendingAvatarCoordRef.current = { targetX, targetY };

      if (!avatarRafIdRef.current) {
        avatarRafIdRef.current = requestAnimationFrame(() => {
          avatarRafIdRef.current = null;
          if (!pendingAvatarCoordRef.current) return;
          const { targetX: tx, targetY: ty } = pendingAvatarCoordRef.current;
          setPosition((prev) => {
            const safePos = getSafePosition(
              tx,
              ty,
              prev.x,
              prev.y,
              furnitureLayoutRef.current || furnitureLayout
            );
            if (safePos.x === prev.x && safePos.y === prev.y) return prev;
            return safePos;
          });
        });
      }
    }

    function handleWindowPointerUp(event) {
      if (!isDraggingAvatarRef.current) return;
      isDraggingAvatarRef.current = false;
      setIsDraggingAvatar(false);
      floorRectRef.current = null;

      if (avatarRafIdRef.current) {
        cancelAnimationFrame(avatarRafIdRef.current);
        avatarRafIdRef.current = null;
      }

      if (pendingAvatarCoordRef.current) {
        const { targetX: tx, targetY: ty } = pendingAvatarCoordRef.current;
        pendingAvatarCoordRef.current = null;
        setPosition((prev) => {
          const safePos = getSafePosition(
            tx,
            ty,
            prev.x,
            prev.y,
            furnitureLayoutRef.current || furnitureLayout
          );
          if (safePos.x === prev.x && safePos.y === prev.y) return prev;
          return safePos;
        });
      }

      const startClick = avatarClickStartRef.current;
      avatarClickStartRef.current = null;

      if (!hasDraggedSelfAvatarRef.current && startClick && !isEditingLayout) {
        const dist = Math.hypot(event.clientX - startClick.x, event.clientY - startClick.y);
        const elapsed = Date.now() - startClick.time;
        if (dist < 8 && elapsed < 800) {
          openSelfProfile(event);
        }
      }
    }

    window.addEventListener("pointermove", handleWindowPointerMove, { passive: true });
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
  }, [isDraggingAvatar, isEditingLayout, openSelfProfile, furnitureLayout]);

  function handleFloorClick(event) {
    if (event?.target?.closest(".vo-avatar")) return;
    if (justOpenedSelfProfileRef.current) return;
    setActiveProfile(null);
    if (justDroppedRef.current) return;
    if (isEditingLayout && builderMode === "edit") {
      setSelectedItemId(null);
      return;
    }
    const scalableEl = floorRef.current?.querySelector(".vo-floor-scalable") || floorRef.current;
    if (!scalableEl) return;
    const rect = scalableEl.getBoundingClientRect();
    const clickX = ((event.clientX - rect.left) / rect.width) * 100;
    const clickY = ((event.clientY - rect.top) / rect.height) * 100;

    const targetX = Number(Math.max(2, Math.min(96, clickX)).toFixed(2));
    const targetY = Number(Math.max(4, Math.min(94, clickY)).toFixed(2));

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
                {activeOrg?.name || organization?.name || "Virtual Office"}
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

          <button
            type="button"
            className="vo-theme-toggle-btn"
            onClick={toggleTheme}
            title={`Switch to ${currentTheme === "dark" ? "light" : "dark"} mode`}
            aria-label={`Switch to ${currentTheme === "dark" ? "light" : "dark"} mode`}
          >
            <span>{currentTheme === "dark" ? "☀️" : "🌙"}</span>
          </button>
        </div>
      </header>



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
              {/* Outer Walls */}
              <div className="vo-outer-walls-border">
                <div className="vo-entrance-badge">
                  <span>↓</span>
                  <span className="vo-entrance-text">Entrance</span>
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
                    isDragging={_draggedItemId === id}
                    isEditingLayout={isEditingLayout && builderMode === "edit"}
                    onPointerDown={(e) => {
                      if (!isEditingLayout || builderMode !== "edit") return;
                      handleStartDragFurniture(e, id);
                    }}
                    onStartResize={(e) => handleStartResizeObject(e, id)}
                    onDragEnter={handleFloorDragEnter}
                    onDragOver={handleFloorDragOver}
                    onDrop={handleFloorDrop}
                    onClick={(e) => {
                      if (!isEditingLayout || builderMode !== "edit") return;
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
                    strokeDasharray={teammate.hasSoundBarrier ? "4 4" : "2 2"}
                    strokeOpacity={teammate.volume > 0 ? (teammate.hasSoundBarrier ? 0.45 : 0.8) : 0}
                  />
                ))}
              </svg>

              {/* Teammate Avatars */}
              {allTeammates.map((teammate) => (
                <div
                  key={teammate.uid}
                  className={`vo-avatar vo-avatar-teammate ${
                    teammate.inRange ? "in-range" : "out-of-range"
                  } ${teammate.isSpeaking && !teammate.isMuted ? "speaking" : ""}`}
                  style={{
                    left: `${teammate.x}%`,
                    top: `${teammate.y}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAvatarClick(e, teammate);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAvatarClick(e, teammate);
                    }
                  }}
                  aria-label="Teammate avatar"
                >
                  {teammate.inRange && teammate.greeting && (
                    <div className="vo-speech-bubble">{teammate.greeting}</div>
                  )}

                  <div className="vo-avatar-circle">
                    {isAvatarUrl(teammate.avatar) ? (
                      <img
                        src={teammate.avatar}
                        alt=""
                        className="vo-avatar-img"
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                      />
                    ) : (
                      <span className="vo-avatar-emoji">{teammate.avatar || "🧑🏻"}</span>
                    )}
                    <span className="vo-avatar-status-dot online" />
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
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!justOpenedSelfProfileRef.current && !hasDraggedSelfAvatarRef.current) {
                      openSelfProfile(e);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      openSelfProfile(e);
                    }
                  }}
                  aria-label="Your avatar"
                >
                  <div className="vo-avatar-compact-halo" />
                  <div className="vo-avatar-circle self-circle">
                    {isUserAvatarUrl ? (
                      <img
                        src={userAvatar}
                        alt=""
                        className="vo-avatar-img"
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                      />
                    ) : (
                      <span className="vo-avatar-emoji">{userAvatar}</span>
                    )}
                    <span className="vo-avatar-status-dot user-live" />
                  </div>
                </div>
              )}

              {/* Avatar Mini Profile Card */}
              {activeProfile && (
                <AvatarMiniProfile
                  member={activeProfile.member}
                  position={activeProfile.position}
                  onClose={handleCloseProfile}
                />
              )}
            </div>

            {/* Minimap Card (hidden when editing office layout) */}
            {!isEditingLayout && (
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
            )}

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
                    {builderMode === "edit" ? "✏️ Builder: Design Mode" : "👁️ Builder: Preview"}
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

                {isOwner && (
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
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
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
              title="Office"
            >
              👥 Office
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
                      <small>Loading office...</small>
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
                        <div className={`vo-teammate-avatar-wrap ${person.isSpeaking && !person.isMuted ? "speaking" : ""}`}>
                          {isAvatarUrl(person.avatar) ? (
                            <img
                              src={person.avatar}
                              alt={person.name}
                              className="vo-teammate-avatar-img"
                            />
                          ) : (
                            <span className="vo-teammate-avatar">{person.avatar || "🧑🏻"}</span>
                          )}
                          <span className={`status-dot in-earshot ${person.isSpeaking && !person.isMuted ? "speaking" : ""}`} />
                        </div>

                        <div className="vo-teammate-info">
                          <strong>{person.name}</strong>
                          <small>{person.role}</small>
                        </div>

                        <div className="vo-teammate-audio-badge">
                          {!person.isMuted ? (
                            <span
                              className={`audio-icon live ${person.isSpeaking ? "speaking" : ""}`}
                              title={person.isSpeaking ? "Speaking now" : "Microphone unmuted"}
                            >
                              {person.isSpeaking ? "🎙️" : "🔊"}
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
                <small>{activeOrg?.name || organization?.name || "Room"}</small>
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