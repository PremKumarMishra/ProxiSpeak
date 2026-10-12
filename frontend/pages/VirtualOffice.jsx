import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../src/firebase";
import "./VirtualOffice.css";

const PROXIMITY_RADIUS = 26;

const OFFICE_ZONES = [
  {
    id: "team-desk",
    name: "Team Desk",
    icon: "💼",
    xMin: 5,
    xMax: 45,
    yMin: 7,
    yMax: 46,
    centerX: 25,
    centerY: 27,
    subtitle: "Collaborative open desks",
  },
  {
    id: "meeting-room",
    name: "Meeting Room",
    icon: "📊",
    xMin: 55,
    xMax: 95,
    yMin: 7,
    yMax: 46,
    centerX: 75,
    centerY: 27,
    subtitle: "Standups & presentations",
  },
  {
    id: "coffee-lounge",
    name: "Coffee Lounge",
    icon: "☕",
    xMin: 5,
    xMax: 45,
    yMin: 54,
    yMax: 93,
    centerX: 25,
    centerY: 74,
    subtitle: "Casual watercooler chats",
  },
  {
    id: "focus-pods",
    name: "Focus Pods",
    icon: "🎧",
    xMin: 55,
    xMax: 95,
    yMin: 54,
    yMax: 93,
    centerX: 75,
    centerY: 74,
    centerYOffset: 0,
    subtitle: "Quiet deep work zone",
  },
];

const DEMO_TEAMMATES = [
  {
    uid: "demo-sarah",
    name: "Sarah Chen",
    avatar: "👩🏻",
    x: 22,
    y: 26,
    status: "Available",
    isMuted: false,
    isSpeaking: true,
    isDemo: true,
    greeting: "Hey! Working on the sprint board right now.",
  },
  {
    uid: "demo-alex",
    name: "Alex Rivera",
    avatar: "👨🏽",
    x: 74,
    y: 25,
    status: "In a meeting",
    isMuted: false,
    isSpeaking: false,
    isDemo: true,
    greeting: "Reviewing the Q4 roadmap in the meeting room!",
  },
  {
    uid: "demo-priya",
    name: "Priya Sharma",
    avatar: "👩🏽",
    x: 26,
    y: 74,
    status: "Grabbing coffee",
    isMuted: false,
    isSpeaking: true,
    isDemo: true,
    greeting: "Coffee break! Walk over if you want to chat.",
  },
];

function getZoneForPosition(x, y) {
  for (const zone of OFFICE_ZONES) {
    if (x >= zone.xMin && x <= zone.xMax && y >= zone.yMin && y <= zone.yMax) {
      return zone;
    }
  }
  return { id: "hallway", name: "Main Hallway", icon: "🚶" };
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

  const [position, setPosition] = useState({ x: 48, y: 50 });
  const [status, setStatus] = useState("Available");
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showDemoTeammates, setShowDemoTeammates] = useState(true);
  const [remoteUsers, setRemoteUsers] = useState({});
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [micError, setMicError] = useState("");

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
        // Ignore snapshot errors in fallback mode
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
        // Ignore if offline or local-only org
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

      const step = 3.5;
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
          x: Math.max(5, Math.min(95, prev.x + dx)),
          y: Math.max(7, Math.min(93, prev.y + dy)),
        }));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Microphone level detection using Web Audio API when unmuted
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
          "Microphone permission not granted — using simulated voice indicator."
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
      x: Math.max(5, Math.min(95, clickX)),
      y: Math.max(7, Math.min(93, clickY)),
    });
  }

  function moveByStep(dx, dy) {
    setPosition((prev) => ({
      x: Math.max(5, Math.min(95, prev.x + dx)),
      y: Math.max(7, Math.min(93, prev.y + dy)),
    }));
  }

  function copyInviteCode() {
    if (!organization?.code) return;
    navigator.clipboard.writeText(organization.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  async function handleSendMessage(event) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

    const newMsg = createOfficeMessage(
      user?.uid,
      userName,
      text,
      getZoneForPosition(position.x, position.y).name
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
        // Keep local message if Firestore update fails
      }
    }
  }

  async function handleSendQuickWave(targetName) {
    const waveMsg = createOfficeMessage(
      user?.uid,
      userName,
      `👋 Waved at ${targetName}!`,
      getZoneForPosition(position.x, position.y).name
    );

    setMessages((prev) => [...prev, waveMsg]);

    if (organization?.firestoreId) {
      try {
        const orgRef = doc(db, "organizations", organization.firestoreId);
        await updateDoc(orgRef, {
          officeMessages: arrayUnion(waveMsg),
        });
      } catch {
        // Ignore
      }
    }
  }

  // Combine live remote users + optional demo teammates
  const activeRemoteList = Object.values(remoteUsers).filter(
    (u) => u && u.uid && u.uid !== user?.uid
  );

  const allTeammates = [
    ...activeRemoteList,
    ...(showDemoTeammates ? DEMO_TEAMMATES : []),
  ].map((teammate) => {
    const dist = getDistance(position.x, position.y, teammate.x, teammate.y);
    const inRange = dist <= PROXIMITY_RADIUS;
    const volume =
      inRange && !isDeafened
        ? Math.max(10, Math.round((1 - dist / PROXIMITY_RADIUS) * 100))
        : 0;
    const zone = getZoneForPosition(teammate.x, teammate.y);
    return {
      ...teammate,
      distance: dist,
      inRange,
      volume,
      zone,
    };
  });

  const nearbyTeammates = allTeammates.filter((t) => t.inRange);
  const currentZone = getZoneForPosition(position.x, position.y);

  return (
    <div className="virtual-office-page">
      <header className="vo-topbar">
        <div className="vo-topbar-left">
          <button type="button" className="vo-leave-btn" onClick={onBack}>
            ← Leave Office
          </button>

          <div className="vo-org-title">
            <div className="vo-org-title-row">
              <h2>{organization?.name || "Virtual Office"}</h2>
              <span className="vo-org-badge">
                {organization?.type || "Workspace"}
              </span>
            </div>
            <p>
              <span>{currentZone.icon}</span> Currently in{" "}
              <strong>{currentZone.name}</strong> · Move with Arrow keys, WASD,
              or click anywhere on the floor
            </p>
          </div>
        </div>

        <div className="vo-topbar-right">
          {organization?.code && (
            <button
              type="button"
              className="vo-code-pill"
              onClick={copyInviteCode}
              title="Click to copy invite code"
            >
              <span>Invite Code:</span>
              <strong>{organization.code}</strong>
              <small>{copiedCode ? "Copied ✓" : "Copy"}</small>
            </button>
          )}

          <button
            type="button"
            className={`vo-demo-toggle ${showDemoTeammates ? "active" : ""}`}
            onClick={() => setShowDemoTeammates((prev) => !prev)}
          >
            🤖 Demo Teammates: {showDemoTeammates ? "ON" : "OFF"}
          </button>

          <div className="vo-online-pill">
            <span className="vo-live-dot" />
            {allTeammates.length + 1} in office
          </div>
        </div>
      </header>

      <div className="vo-quick-zones">
        <span>Quick Jump:</span>
        {OFFICE_ZONES.map((zone) => (
          <button
            key={zone.id}
            type="button"
            className={currentZone.id === zone.id ? "active" : ""}
            onClick={() =>
              setPosition({ x: zone.centerX, y: zone.centerY })
            }
          >
            {zone.icon} {zone.name}
          </button>
        ))}
      </div>

      {micError && <div className="vo-mic-notice">{micError}</div>}

      <div className="vo-workspace-layout">
        <div className="vo-map-container">
          <div
            ref={floorRef}
            className="vo-floor"
            onClick={handleFloorClick}
            role="application"
            aria-label="Interactive Virtual Office Map"
          >
            {/* Office Zones */}
            {OFFICE_ZONES.map((zone) => (
              <div
                key={zone.id}
                className={`vo-zone vo-zone-${zone.id} ${
                  currentZone.id === zone.id ? "vo-zone-current" : ""
                }`}
                style={{
                  left: `${zone.xMin}%`,
                  top: `${zone.yMin}%`,
                  width: `${zone.xMax - zone.xMin}%`,
                  height: `${zone.yMax - zone.yMin}%`,
                }}
              >
                <div className="vo-zone-header">
                  <span>
                    {zone.icon} {zone.name}
                  </span>
                  <small>{zone.subtitle}</small>
                </div>
                <div className="vo-zone-furniture" />
              </div>
            ))}

            {/* Center Hallway Plant Decor */}
            <div className="vo-decor vo-decor-top">🌿</div>
            <div className="vo-decor vo-decor-bottom">🪴</div>

            {/* SVG Proximity Connection Lines */}
            <svg className="vo-connections-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              {nearbyTeammates.map((teammate) => (
                <line
                  key={`line-${teammate.uid}`}
                  x1={position.x}
                  y1={position.y}
                  x2={teammate.x}
                  y2={teammate.y}
                  stroke="#6b57dc"
                  strokeWidth="0.45"
                  strokeDasharray="1.5 1.5"
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
                  opacity: teammate.inRange ? 1 : 0.65,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setPosition({
                    x: Math.max(8, Math.min(92, teammate.x + 6)),
                    y: Math.max(10, Math.min(90, teammate.y + 4)),
                  });
                }}
                title={`Click to walk over to ${teammate.name}`}
              >
                {teammate.inRange && teammate.greeting && (
                  <div className="vo-speech-bubble">{teammate.greeting}</div>
                )}

                <div className="vo-avatar-circle">
                  <span>{teammate.avatar || "🧑🏻"}</span>
                  {teammate.inRange && !teammate.isMuted && (
                    <i className="vo-wave-badge" title="Proximity audio active">
                      )))
                    </i>
                  )}
                </div>

                <div className="vo-avatar-label">
                  <strong>{teammate.name}</strong>
                  <small>
                    {teammate.inRange
                      ? `🔊 ${teammate.volume}%`
                      : teammate.status || "Available"}
                  </small>
                </div>
              </div>
            ))}

            {/* Current User Avatar & Proximity Ring */}
            <div
              className="vo-proximity-ring"
              style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
                width: `${PROXIMITY_RADIUS * 2}%`,
                height: `${PROXIMITY_RADIUS * 2.4}%`,
              }}
            />

            <div
              className={`vo-avatar vo-avatar-self ${
                isSpeaking && !isMuted ? "speaking" : ""
              }`}
              style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
              }}
            >
              <div className="vo-avatar-circle">
                <span>{savedAvatar}</span>
                {!isMuted && !isDeafened && (
                  <i className="vo-wave-badge self-wave">)))</i>
                )}
              </div>
              <div className="vo-avatar-label self-label">
                <strong>{userName} (You)</strong>
                <small>{isMuted ? "🔇 Muted" : "🎙️ Live"}</small>
              </div>
            </div>
          </div>

          {/* Bottom Controls Dock */}
          <div className="vo-controls-dock">
            <div className="vo-audio-controls">
              <button
                type="button"
                className={`vo-control-btn ${!isMuted ? "mic-active" : "mic-muted"}`}
                onClick={() => setIsMuted((prev) => !prev)}
              >
                <span>{isMuted ? "🔇" : "🎙️"}</span>
                {isMuted ? "Unmute Mic" : "Mic On"}
              </button>

              <button
                type="button"
                className={`vo-control-btn ${isDeafened ? "deafened" : ""}`}
                onClick={() => setIsDeafened((prev) => !prev)}
              >
                <span>{isDeafened ? "🔕" : "🔊"}</span>
                {isDeafened ? "Audio Off" : "Speaker On"}
              </button>

              <select
                className="vo-status-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Your status"
              >
                <option value="Available">🟢 Available</option>
                <option value="In a meeting">💬 In a meeting</option>
                <option value="Focusing">🎧 Focusing</option>
                <option value="Grabbing coffee">☕ Grabbing coffee</option>
              </select>
            </div>

            <div className="vo-dpad">
              <button
                type="button"
                onClick={() => moveByStep(-5, 0)}
                title="Move Left"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => moveByStep(0, -5)}
                title="Move Up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveByStep(0, 5)}
                title="Move Down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => moveByStep(5, 0)}
                title="Move Right"
              >
                →
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Proximity Radar & Team Chat */}
        <aside className="vo-sidebar">
          <div className="vo-sidebar-card">
            <div className="vo-sidebar-header">
              <h3>Proximity Audio</h3>
              <span className="vo-count-badge">
                {nearbyTeammates.length} nearby
              </span>
            </div>

            {nearbyTeammates.length === 0 ? (
              <p className="vo-empty-hint">
                No one is within earshot right now. Click near a teammate on the
                map to start talking!
              </p>
            ) : (
              <div className="vo-teammate-list">
                {nearbyTeammates.map((person) => (
                  <div className="vo-teammate-row nearby" key={person.uid}>
                    <div className="vo-teammate-avatar">{person.avatar}</div>
                    <div className="vo-teammate-info">
                      <strong>{person.name}</strong>
                      <small>
                        {person.zone.icon} {person.zone.name}
                      </small>
                      <div className="vo-volume-bar">
                        <div
                          className="vo-volume-fill"
                          style={{ width: `${person.volume}%` }}
                        />
                      </div>
                    </div>
                    <div className="vo-teammate-actions">
                      <span className="vo-vol-pct">{person.volume}%</span>
                      <button
                        type="button"
                        className="vo-wave-btn"
                        onClick={() => handleSendQuickWave(person.name)}
                        title={`Wave to ${person.name}`}
                      >
                        👋
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="vo-all-members-sub">
              <h4>Everyone in Office ({allTeammates.length + 1})</h4>
              <div className="vo-mini-list">
                <div className="vo-mini-row">
                  <span>
                    {savedAvatar} <strong>{userName} (You)</strong>
                  </span>
                  <small>{currentZone.name}</small>
                </div>
                {allTeammates.map((person) => (
                  <div
                    className="vo-mini-row clickable"
                    key={person.uid}
                    onClick={() =>
                      setPosition({
                        x: Math.max(8, Math.min(92, person.x + 6)),
                        y: Math.max(10, Math.min(90, person.y + 4)),
                      })
                    }
                    title="Click to walk over"
                  >
                    <span>
                      {person.avatar} <strong>{person.name}</strong>
                    </span>
                    <small>{person.zone.name} →</small>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="vo-sidebar-card vo-chat-card">
            <div className="vo-sidebar-header">
              <h3>Office Chat</h3>
              <small>Live feed</small>
            </div>

            <div className="vo-chat-messages">
              {messages.length === 0 ? (
                <p className="vo-empty-hint">
                  Say hello or wave to your team in {organization?.name}!
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
                placeholder="Message everyone in office..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={200}
              />
              <button type="submit">Send</button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
