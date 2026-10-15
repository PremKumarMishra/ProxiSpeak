import { useEffect, useRef, useState, useMemo } from "react";
import { doc, onSnapshot, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../src/firebase";
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
    memberCount: 1,
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
    memberCount: 5,
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
    memberCount: 3,
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
    memberCount: 10,
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
    memberCount: 28,
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
    memberCount: 6,
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
    memberCount: 2,
  },
];

const ZONE_FILTERS = [
  "All Zones",
  "Open Workspace",
  "Meeting Rooms",
  "Lounge",
  "Focus Zone",
];

const ZONE_SUMMARY_LIST = [
  { name: "Open Workspace", color: "#6366f1", count: 28, centerX: 44, centerY: 52 },
  { name: "Meeting Rooms", color: "#3b82f6", count: 8, centerX: 34, centerY: 18 },
  { name: "Collaboration Lounge", color: "#a855f7", count: 10, centerX: 82, centerY: 18 },
  { name: "Focus Zone", color: "#10b981", count: 6, centerX: 87, centerY: 52 },
  { name: "Reception", color: "#f59e0b", count: 1, centerX: 12, centerY: 18 },
];

const INITIAL_DEMO_TEAMMATES = [
  {
    uid: "demo-aarav",
    name: "Aarav",
    role: "In Open Workspace",
    avatar: "👨🏻‍💼",
    x: 29,
    y: 25,
    zoneName: "Open Workspace",
    status: "Available",
    isMuted: false,
    isSpeaking: true,
    isDemo: true,
    greeting: "Hey! Let's review the virtual office sprint plan.",
  },
  {
    uid: "demo-priya",
    name: "Priya",
    role: "In Meeting Room A",
    avatar: "👩🏻‍💼",
    x: 37,
    y: 17,
    zoneName: "Meeting Room A",
    status: "In Meeting Room A",
    isMuted: true,
    isSpeaking: false,
    isDemo: true,
    greeting: "Presenting the UI roadmap in Meeting Room A.",
  },
  {
    uid: "demo-neha",
    name: "Neha",
    role: "In Open Workspace",
    avatar: "👩🏽‍💻",
    x: 64,
    y: 46,
    zoneName: "Open Workspace",
    status: "Available",
    isMuted: false,
    isSpeaking: true,
    isDemo: true,
    greeting: "Just finished testing the Web Audio analyser!",
  },
  {
    uid: "demo-rahul",
    name: "Rahul",
    role: "In Collaboration Lounge",
    avatar: "👨🏽‍💻",
    x: 28,
    y: 46,
    zoneName: "Collaboration Lounge",
    status: "Available",
    isMuted: true,
    isSpeaking: false,
    isDemo: true,
    greeting: "Hey! We are right next to each other in earshot.",
  },
];

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

export default function VirtualOffice({ organization, user, onBack }) {
  const userName =
    user?.displayName || user?.email?.split("@")[0] || "Teammate";
  const savedAvatar =
    localStorage.getItem(`proxispeak-avatar-${user?.uid}`) || "🧑🏻";

  // Initial user position matching the reference image (near Pod 1 & Rahul)
  const [position, setPosition] = useState({ x: 24, y: 48 });
  const [zoom, setZoom] = useState(1);
  const [activeZoneFilter, setActiveZoneFilter] = useState("All Zones");
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState("Available");
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showDemoTeammates, setShowDemoTeammates] = useState(true);
  const [remoteUsers, setRemoteUsers] = useState({});
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [micError, setMicError] = useState("");
  const [showEditLayoutModal, setShowEditLayoutModal] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState("teammates");

  const floorRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const animFrameRef = useRef(null);

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

  // Keyboard navigation (Arrow keys + WASD)
  useEffect(() => {
    function handleKeyDown(event) {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "SELECT"
      ) {
        return;
      }

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
        setPosition((prev) => ({
          x: Math.max(4, Math.min(96, prev.x + dx)),
          y: Math.max(6, Math.min(94, prev.y + dy)),
        }));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
    if (!floorRef.current) return;
    const rect = floorRef.current.getBoundingClientRect();
    const clickX = ((event.clientX - rect.left) / rect.width) * 100;
    const clickY = ((event.clientY - rect.top) / rect.height) * 100;

    setPosition({
      x: Math.max(4, Math.min(96, Math.round(clickX))),
      y: Math.max(6, Math.min(94, Math.round(clickY))),
    });
  }

  function handleFilterSelect(filterName) {
    setActiveZoneFilter(filterName);
    if (filterName === "All Zones") {
      setZoom(1);
      setPosition({ x: 24, y: 48 });
    } else if (filterName === "Open Workspace") {
      setZoom(1.05);
      setPosition({ x: 44, y: 52 });
    } else if (filterName === "Meeting Rooms") {
      setZoom(1.05);
      setPosition({ x: 34, y: 18 });
    } else if (filterName === "Lounge") {
      setZoom(1.05);
      setPosition({ x: 82, y: 18 });
    } else if (filterName === "Focus Zone") {
      setZoom(1.05);
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

  // Combine demo teammates and remote users
  const allTeammates = useMemo(() => {
    const list = [];

    if (showDemoTeammates) {
      list.push(...INITIAL_DEMO_TEAMMATES);
    }

    Object.values(remoteUsers).forEach((remote) => {
      if (remote && remote.uid !== user?.uid) {
        list.push({
          uid: remote.uid,
          name: remote.name || "Teammate",
          role: "In Open Workspace",
          avatar: remote.avatar || "🧑🏻",
          x: remote.x ?? 50,
          y: remote.y ?? 50,
          status: remote.status || "Available",
          isMuted: remote.isMuted ?? true,
          isSpeaking: remote.isSpeaking ?? false,
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
  }, [showDemoTeammates, remoteUsers, user?.uid, position.x, position.y]);

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
        (t.zoneName && t.zoneName.toLowerCase().includes(q)) ||
        (t.zone?.name && t.zone.name.toLowerCase().includes(q))
    );
  }, [allTeammates, searchQuery]);

  const currentZone = getZoneForPosition(position.x, position.y);
  const totalOnlineCount = 52;

  return (
    <div className="virtual-office-page">
      {/* Top Header */}
      <header className="vo-topbar">
        <div className="vo-topbar-left">
          <div className="vo-breadcrumb-group">
            <button
              type="button"
              className="vo-breadcrumb-link"
              onClick={onBack}
              title="Return to My Organizations"
            >
              Workspace
            </button>
            <span className="vo-breadcrumb-separator">/</span>
            <span className="vo-breadcrumb-org">Virtual Office</span>
          </div>

          <div className="vo-title-row">
            <h1 className="vo-main-title">Virtual Office</h1>
            <span className="vo-status-pill connected">
              <span className="vo-dot" /> Connected
            </span>
            <span className="vo-members-pill">
              👥 {totalOnlineCount} members online
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
          <div
            ref={floorRef}
            className="vo-floor"
            onClick={handleFloorClick}
            role="application"
            aria-label="Interactive Virtual Office Floor Plan"
          >
            {/* Inner Scalable Room Architecture */}
            <div
              className="vo-floor-scalable"
              style={{
                transform: `scale(${zoom})`,
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

              {/* Row 1 Desk Pods (Top) */}
              <div className="vo-desk-cluster pod-1">
                <div className="pod-desk-top">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair top c-l" />
                <div className="pod-chair top c-r" />
                <div className="pod-desk-bottom">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair bottom c-l" />
                <div className="pod-chair bottom c-r" />
              </div>

              <div className="vo-desk-cluster pod-2">
                <div className="pod-desk-top">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair top c-l" />
                <div className="pod-chair top c-r" />
                <div className="pod-desk-bottom">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair bottom c-l" />
                <div className="pod-chair bottom c-r" />
              </div>

              <div className="vo-desk-cluster pod-3">
                <div className="pod-desk-top">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair top c-l" />
                <div className="pod-chair top c-r" />
                <div className="pod-desk-bottom">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair bottom c-l" />
                <div className="pod-chair bottom c-r" />
              </div>

              <div className="vo-desk-cluster pod-4">
                <div className="pod-desk-top">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair top c-l" />
                <div className="pod-chair top c-r" />
                <div className="pod-desk-bottom">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair bottom c-l" />
                <div className="pod-chair bottom c-r" />
              </div>

              {/* Row 2 Desk Pods (Bottom) */}
              <div className="vo-desk-cluster pod-5">
                <div className="pod-desk-top">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair top c-l" />
                <div className="pod-chair top c-r" />
                <div className="pod-desk-bottom">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair bottom c-l" />
                <div className="pod-chair bottom c-r" />
              </div>

              <div className="vo-desk-cluster pod-6">
                <div className="pod-desk-top">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair top c-l" />
                <div className="pod-chair top c-r" />
                <div className="pod-desk-bottom">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair bottom c-l" />
                <div className="pod-chair bottom c-r" />
              </div>

              <div className="vo-desk-cluster pod-7">
                <div className="pod-desk-top">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair top c-l" />
                <div className="pod-chair top c-r" />
                <div className="pod-desk-bottom">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair bottom c-l" />
                <div className="pod-chair bottom c-r" />
              </div>

              <div className="vo-desk-cluster pod-8">
                <div className="pod-desk-top">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair top c-l" />
                <div className="pod-chair top c-r" />
                <div className="pod-desk-bottom">
                  <span className="dual-monitors" />
                </div>
                <div className="pod-chair bottom c-l" />
                <div className="pod-chair bottom c-r" />
              </div>

              {/* Aisle Plants */}
              <div className="vo-plant-plant aisle-p1">🪴</div>
              <div className="vo-plant-plant aisle-p2">🌿</div>
              <div className="vo-plant-plant aisle-p3">🪴</div>

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
                    <span>{teammate.avatar || "🧑🏻"}</span>
                    <span className="vo-avatar-status-dot online" />
                  </div>

                  <div className="vo-avatar-label">
                    <strong>{teammate.name}</strong>
                  </div>
                </div>
              ))}

              {/* User Proximity Hearing Circle */}
              <div
                className="vo-proximity-ring"
                style={{
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                  width: `${PROXIMITY_RADIUS * 2}%`,
                  height: `${PROXIMITY_RADIUS * 2.3}%`,
                }}
              />

              {/* Current User Avatar ("You") */}
              <div
                className={`vo-avatar vo-avatar-self ${
                  isSpeaking && !isMuted ? "speaking" : ""
                }`}
                style={{
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                }}
              >
                <div className="vo-avatar-circle self-circle">
                  <span>{savedAvatar}</span>
                  <span className="vo-avatar-status-dot user-live" />
                </div>
                <div className="vo-avatar-label self-label">
                  <strong>You</strong>
                </div>
              </div>
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
                onClick={() => setShowEditLayoutModal(true)}
                title="Edit office layout and furniture"
              >
                <span>✏️</span> Edit layout
              </button>
            </div>
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
                  {filteredTeammates.length === 0 ? (
                    <p className="vo-empty-hint">
                      No teammates found matching &quot;{searchQuery}&quot;.
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
                          <span className="vo-teammate-avatar">{person.avatar}</span>
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
                  {ZONE_SUMMARY_LIST.map((zone) => (
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

      {/* Edit Layout Modal */}
      {showEditLayoutModal && (
        <div className="vo-modal-overlay" onClick={() => setShowEditLayoutModal(false)}>
          <div className="vo-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="vo-modal-header">
              <h3>Office Layout Editor</h3>
              <button
                type="button"
                className="vo-modal-close"
                onClick={() => setShowEditLayoutModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="vo-modal-body">
              <p>
                Architectural layout configuration for{" "}
                <strong>{organization?.name || "Virtual Office"}</strong>.
              </p>
              <div className="vo-layout-specs">
                <div className="spec-item">
                  <strong>Reception:</strong> Curved reception counter with monitor &amp; waiting plant
                </div>
                <div className="spec-item">
                  <strong>Meeting Room A:</strong> Oval purple conference table, 8 chairs &amp; wall display
                </div>
                <div className="spec-item">
                  <strong>Meeting Room B:</strong> Rectangular conference table, 8 chairs &amp; wall display
                </div>
                <div className="spec-item">
                  <strong>Collaboration Lounge:</strong> Plush lavender sectional sofa &amp; round coffee table
                </div>
                <div className="spec-item">
                  <strong>Open Workspace:</strong> 8 desk clusters (dual monitors &amp; ergonomic chairs)
                </div>
                <div className="spec-item">
                  <strong>Focus Zone:</strong> 3 quiet acoustic focus pods with purple chairs
                </div>
                <div className="spec-item">
                  <strong>Cafeteria &amp; Breakouts:</strong> Kitchenette, 2 cafe tables &amp; 3 phone booths
                </div>
              </div>
              <p className="vo-admin-note">
                ℹ️ Layout furniture and wall boundaries are locked in compliance with the office floor plan.
              </p>
            </div>
            <div className="vo-modal-footer">
              <button
                type="button"
                className="vo-modal-save-btn"
                onClick={() => setShowEditLayoutModal(false)}
              >
                Close Editor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
