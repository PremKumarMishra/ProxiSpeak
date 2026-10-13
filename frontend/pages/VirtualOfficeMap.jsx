import { useEffect, useState } from "react";
import "./VirtualOfficeMap.css";

const initialRooms = [
  { id: "security", name: "SECURITY CENTER", x: 0, y: 0, w: 18, h: 20, color: "security", icon: "🛡️" },
  { id: "meeting1", name: "MEETING ROOM 1", x: 18, y: 0, w: 22, h: 20, color: "meeting", icon: "🤝" },
  { id: "meeting2", name: "MEETING ROOM 2", x: 40, y: 0, w: 22, h: 20, color: "meeting", icon: "💬" },
  { id: "focus1", name: "FOCUS ROOM 1", x: 62, y: 0, w: 19, h: 20, color: "focus", icon: "🎯" },
  { id: "focus2", name: "FOCUS ROOM 2", x: 81, y: 0, w: 19, h: 20, color: "focus", icon: "🎯" },
  { id: "boss", name: "BOSS CABIN", x: 0, y: 20, w: 20, h: 22, color: "boss", icon: "👑" },
  { id: "creative", name: "CREATIVE ZONE", x: 20, y: 20, w: 25, h: 22, color: "creative", icon: "💡" },
  { id: "workspace", name: "OPEN WORKSPACE", x: 45, y: 20, w: 36, h: 22, color: "workspace", icon: "💻" },
  { id: "focus3", name: "FOCUS ROOM 3", x: 81, y: 20, w: 19, h: 22, color: "focus", icon: "🎯" },
  { id: "reception", name: "RECEPTION", x: 0, y: 42, w: 20, h: 23, color: "reception", icon: "🛎️" },
  { id: "lounge", name: "LOUNGE & SOCIAL", x: 20, y: 42, w: 25, h: 23, color: "lounge", icon: "🛋️" },
  { id: "kitchen", name: "KITCHEN", x: 45, y: 42, w: 18, h: 23, color: "kitchen", icon: "☕" },
  { id: "focus4", name: "FOCUS ROOM 4", x: 63, y: 42, w: 18, h: 23, color: "focus", icon: "🎯" },
  { id: "meeting3", name: "HUDDLE ROOM", x: 81, y: 42, w: 19, h: 23, color: "meeting", icon: "👥" },
  { id: "garden", name: "GARDEN TERRACE", x: 0, y: 65, w: 32, h: 20, color: "garden", icon: "🌿" },
  { id: "breakout", name: "BREAKOUT ZONE", x: 32, y: 65, w: 36, h: 20, color: "lounge", icon: "☕" },
  { id: "kitchen2", name: "CAFÉ CORNER", x: 68, y: 65, w: 32, h: 20, color: "kitchen", icon: "🥐" },
];

const initialFurniture = [
  { id: "f1", type: "desk", x: 50, y: 31, emoji: "🖥️", label: "Team desk" },
  { id: "f2", type: "desk", x: 57, y: 31, emoji: "🖥️", label: "Team desk" },
  { id: "f3", type: "desk", x: 64, y: 31, emoji: "🖥️", label: "Team desk" },
  { id: "f4", type: "table", x: 29, y: 10, emoji: "🪑", label: "Meeting table" },
  { id: "f5", type: "table", x: 51, y: 10, emoji: "🪑", label: "Meeting table" },
  { id: "f6", type: "sofa", x: 28, y: 53, emoji: "🛋️", label: "Sofa" },
  { id: "f7", type: "plant", x: 5, y: 5, emoji: "🪴", label: "Plant" },
  { id: "f8", type: "plant", x: 94, y: 78, emoji: "🌿", label: "Plant" },
  { id: "f9", type: "reception", x: 9, y: 54, emoji: "🛎️", label: "Reception desk" },
  { id: "f10", type: "sofa", x: 52, y: 54, emoji: "🛋️", label: "Breakout sofa" },
];

const initialDoors = [
  { id: "d1", x: 18, y: 10 },
  { id: "d2", x: 40, y: 10 },
  { id: "d3", x: 62, y: 10 },
  { id: "d4", x: 20, y: 32 },
  { id: "d5", x: 45, y: 32 },
  { id: "d6", x: 45, y: 53 },
  { id: "d7", x: 68, y: 75 },
];

const initialAvatars = [
  { id: "you", name: "You", x: 52, y: 37, emoji: "🧑🏻‍💻", color: "purple" },
  { id: "sarah", name: "Sarah", x: 59, y: 37, emoji: "👩🏻‍💻", color: "pink" },
  { id: "alex", name: "Alex", x: 66, y: 37, emoji: "👨🏽‍💻", color: "blue" },
];

function loadLayout() {
  try {
    const saved = localStorage.getItem("proxispeak-office-layout-v1");
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export default function VirtualOfficeMap({ user }) {
  const [layout, setLayout] = useState(() => {
    const saved = loadLayout();
    return {
      rooms: saved?.rooms || initialRooms,
      furniture: saved?.furniture || initialFurniture,
      doors: saved?.doors || initialDoors,
      avatars: saved?.avatars || initialAvatars,
    };
  });
  const [buildMode, setBuildMode] = useState(false);
  const [tool, setTool] = useState("select");
  const [selected, setSelected] = useState(null);
  const [activeRoom, setActiveRoom] = useState("workspace");
  const [notice, setNotice] = useState("Welcome to your virtual office!");
  const [roomName, setRoomName] = useState("");
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    try {
      localStorage.setItem("proxispeak-office-layout-v1", JSON.stringify(layout));
    } catch {
      setNotice("Unable to save layout in this browser.");
    }
  }, [layout]);

  const currentRoom = layout.rooms.find((room) => room.id === activeRoom);
  const currentName = user?.displayName || user?.email?.split("@")[0] || "Team Member";

  function moveObject(id, kind, x, y) {
    const key = kind === "avatar" ? "avatars" : kind === "door" ? "doors" : "furniture";
    setLayout((old) => ({
      ...old,
      [key]: old[key].map((item) =>
        item.id === id
          ? { ...item, x: Math.max(2, Math.min(98, x)), y: Math.max(3, Math.min(82, y)) }
          : item
      ),
    }));
  }

  function handleMapClick(event) {
    if (!buildMode || tool === "select") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(2, Math.min(98, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(3, Math.min(82, ((event.clientY - rect.top) / rect.height) * 100));

    if (tool === "door") {
      setLayout((old) => ({
        ...old,
        doors: [...old.doors, { id: `d${Date.now()}`, x, y }],
      }));
      setNotice("Door added. Select it and drag to reposition.");
    } else if (["desk", "table", "sofa", "plant"].includes(tool)) {
      const icons = { desk: "🖥️", table: "🪑", sofa: "🛋️", plant: "🪴" };
      setLayout((old) => ({
        ...old,
        furniture: [
          ...old.furniture,
          { id: `f${Date.now()}`, type: tool, x, y, emoji: icons[tool], label: tool },
        ],
      }));
      setNotice(`${tool} added to the map.`);
    } else if (tool === "avatar") {
      setLayout((old) => ({
        ...old,
        avatars: [...old.avatars, { id: `a${Date.now()}`, name: "Team member", x, y, emoji: "🧑‍💻", color: "blue" }],
      }));
      setNotice("Avatar added.");
    } else if (tool === "wall") {
      setNotice("Walls are represented by room boundaries in this version.");
    }
    setTool("select");
  }

  function handleDrag(event, item, kind) {
    if (buildMode && kind !== "avatar" && tool !== "select") return;
    if (!buildMode && kind !== "avatar") return;
    event.preventDefault();
    event.stopPropagation();

    const map = event.currentTarget.parentElement.closest(".vom-floor");
    if (!map) return;
    const rect = map.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originalX = item.x;
    const originalY = item.y;

    function onMove(moveEvent) {
      moveObject(
        item.id,
        kind,
        originalX + ((moveEvent.clientX - startX) / rect.width) * 100,
        originalY + ((moveEvent.clientY - startY) / rect.height) * 100
      );
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function deleteSelected() {
    if (!selected) return;
    const { id, kind } = selected;
    const key = kind === "door" ? "doors" : kind === "avatar" ? "avatars" : "furniture";
    setLayout((old) => ({ ...old, [key]: old[key].filter((item) => item.id !== id) }));
    setSelected(null);
    setNotice("Selected item deleted.");
  }

  function addRoom(event) {
    event.preventDefault();
    const name = roomName.trim();
    if (!name) return;
    const id = `room-${Date.now()}`;
    setLayout((old) => ({
      ...old,
      rooms: [...old.rooms, { id, name: name.toUpperCase(), x: 34, y: 34, w: 20, h: 15, color: "custom", icon: "🏢" }],
    }));
    setRoomName("");
    setNotice("Room added. The starter layout is saved automatically.");
  }

  function resetLayout() {
    if (!window.confirm("Reset the office layout to its original design?")) return;
    setLayout({ rooms: initialRooms, furniture: initialFurniture, doors: initialDoors, avatars: initialAvatars });
    setSelected(null);
    setNotice("Office layout reset.");
  }

  return (
    <div className="vom">
      <aside className="vom-sidebar">
        <div className="vom-brand"><span>◈</span><div><strong>ProxiSpeak</strong><small>VIRTUAL OFFICE</small></div></div>
        <div className="vom-side-label">WORKSPACE</div>
        <button className="vom-side-active">▦ <span>Office Map</span></button>
        <button onClick={() => setBuildMode(!buildMode)}>✎ <span>{buildMode ? "Exit Build Mode" : "Build Mode"}</span></button>
        <button onClick={() => setNotice("Team chat panel is a UI preview; connect your chat service to enable messaging.")}>☏ <span>Team Chat</span></button>
        <button onClick={() => setNotice("Meeting rooms are ready to select on the map.")}>▣ <span>Meetings</span></button>
        <div className="vom-side-bottom">
          <div className="vom-user-avatar">{currentName.charAt(0).toUpperCase()}</div>
          <div className="vom-user-info"><strong>{currentName}</strong><small>Online</small></div>
        </div>
      </aside>

      <main className="vom-main">
        <header className="vom-header">
          <div><div className="vom-eyebrow">YOUR TEAM, ONE SPACE</div><h1>Virtual Office <span>✦</span></h1><p>Work together, wherever you are.</p></div>
          <div className="vom-header-actions"><span className="vom-live"><i /> OFFICE LIVE</span><button onClick={() => setBuildMode(!buildMode)} className={buildMode ? "vom-primary active" : "vom-primary"}>{buildMode ? "✓ Finish editing" : "✎ Edit office"}</button></div>
        </header>

        <section className="vom-welcome">
          <div><span>✦ TEAM WORKSPACE</span><h2>Good to see you, {currentName}!</h2><p>Your people. Your space. Your way of working.</p></div>
          <div className="vom-welcome-art">🏢<span>🌿</span></div>
        </section>

        <div className="vom-toolbar">
          <div><strong>Office floor plan</strong><small>{layout.rooms.length} rooms · {layout.avatars.length} avatars</small></div>
          <div className="vom-toolbar-actions">
            <button onClick={() => setZoom((z) => Math.max(80, z - 10))}>−</button><span>{zoom}%</span><button onClick={() => setZoom((z) => Math.min(120, z + 10))}>+</button>
            <button onClick={() => { setNotice("Layout saved in this browser."); localStorage.setItem("proxispeak-office-layout-v1", JSON.stringify(layout)); }}>Save layout</button>
            <button onClick={resetLayout}>Reset</button>
          </div>
        </div>

        {buildMode && (
          <section className="vom-builder">
            <div><strong>Build tools</strong><small>Select a tool, then click the map to place it. Drag placed objects to move them.</small></div>
            <div className="vom-tool-list">
              {[["select","↖ Select"],["wall","▤ Wall"],["door","🚪 Door"],["desk","🖥️ Desk"],["table","🪑 Table"],["sofa","🛋️ Sofa"],["plant","🪴 Plant"],["avatar","🙂 Avatar"]].map(([id, label]) => (
                <button key={id} className={tool === id ? "selected" : ""} onClick={() => setTool(id)}>{label}</button>
              ))}
              <button className="vom-danger" onClick={deleteSelected} disabled={!selected}>Delete selected</button>
            </div>
            <form className="vom-add-room" onSubmit={addRoom}><input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="New room name" aria-label="New room name" /><button type="submit">+ Add room</button></form>
          </section>
        )}

        <div className="vom-content">
          <section className="vom-map-card">
            <div className="vom-map-heading"><div><strong>INFOTACT OFFICE</strong><small>MAIN FLOOR · INTERACTIVE MAP</small></div><span>⌖ {buildMode ? `BUILD MODE: ${tool.toUpperCase()}` : "SELECT A ROOM"}</span></div>
            <div className="vom-map-viewport">
              <div className="vom-floor" onClick={handleMapClick} style={{ transform: `scale(${zoom / 100})` }}>
                {layout.rooms.map((room) => (
                  <button key={room.id} className={`vom-room vom-room-${room.color} ${activeRoom === room.id ? "vom-room-active" : ""}`} style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.w}%`, height: `${room.h}%` }} onClick={(e) => { e.stopPropagation(); setActiveRoom(room.id); if (!buildMode) setNotice(`${room.name} selected.`); }}>
                    <span className="vom-room-icon">{room.icon}</span><span className="vom-room-name">{room.name}</span>
                  </button>
                ))}
                {layout.furniture.map((item) => (
                  <button key={item.id} title={`${item.label} — drag to move`} className={`vom-object vom-object-${item.type} ${selected?.id === item.id ? "vom-object-selected" : ""}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} onPointerDown={(e) => handleDrag(e, item, "furniture")} onClick={(e) => { e.stopPropagation(); if (buildMode) setSelected({ id: item.id, kind: "furniture" }); }}>
                    {item.emoji}
                  </button>
                ))}
                {layout.doors.map((door) => (
                  <button key={door.id} title="Door — drag to move" className={`vom-object vom-door ${selected?.id === door.id ? "vom-object-selected" : ""}`} style={{ left: `${door.x}%`, top: `${door.y}%` }} onPointerDown={(e) => handleDrag(e, door, "door")} onClick={(e) => { e.stopPropagation(); if (buildMode) setSelected({ id: door.id, kind: "door" }); }}>🚪</button>
                ))}
                {layout.avatars.map((avatar) => (
                  <button key={avatar.id} title={`${avatar.name} — drag to move`} className={`vom-avatar vom-avatar-${avatar.color} ${selected?.id === avatar.id ? "vom-object-selected" : ""}`} style={{ left: `${avatar.x}%`, top: `${avatar.y}%` }} onPointerDown={(e) => handleDrag(e, avatar, "avatar")} onClick={(e) => { e.stopPropagation(); setSelected({ id: avatar.id, kind: "avatar" }); }}>
                    <span>{avatar.emoji}</span><small>{avatar.id === "you" ? currentName : avatar.name}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="vom-map-legend"><span><i className="legend-green" /> Open workspace</span><span><i className="legend-blue" /> Meeting rooms</span><span><i className="legend-purple" /> Focus rooms</span><span><i className="legend-door" /> Doors</span></div>
          </section>

          <aside className="vom-info-column">
            <section className="vom-info-card"><div className="vom-card-heading"><span>📍</span><strong>Room details</strong></div><div className="vom-room-preview">{currentRoom?.icon || "🏢"}</div><h3>{currentRoom?.name || "Office room"}</h3><p>Choose a room on the map to view its details.</p><div className="vom-room-meta"><span>Room status</span><strong className="vom-available">● Available</strong></div><button className="vom-room-button" onClick={() => setNotice(`You selected ${currentRoom?.name || "this room"}.`)}>Enter room →</button></section>
            <section className="vom-info-card"><div className="vom-card-heading"><span>👥</span><strong>Team members</strong><span className="vom-count">{layout.avatars.length}</span></div>{layout.avatars.slice(0, 5).map((avatar) => <div className="vom-team-member" key={avatar.id}><span>{avatar.emoji}</span><div><strong>{avatar.id === "you" ? currentName : avatar.name}</strong><small>{avatar.id === "you" ? "That's you" : "In the office"}</small></div><i /></div>)}</section>
            <section className="vom-tip"><span>💡</span><div><strong>Quick tip</strong><p>{buildMode ? "Choose a tool above, then click the floor plan to place an object." : "Drag your avatar around the floor plan to explore your office."}</p></div></section>
          </aside>
        </div>
        <div className="vom-notice" role="status">{notice}</div>
      </main>
    </div>
  );
}
