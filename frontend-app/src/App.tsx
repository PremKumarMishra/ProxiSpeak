import { useState } from "react";
import "./App.css";

type Room = {
  name: string;
  icon: string;
  className: string;
  items: string[];
};

const initialRooms: Room[] = [
  {
    name: "Reception",
    icon: "🛎️",
    className: "reception",
    items: ["🛋️", "🪴"],
  },
  {
    name: "Open Workspace",
    icon: "💻",
    className: "workspace",
    items: ["🖥️", "🪑", "🪴", "🖥️", "🪑", "🖥️"],
  },
  {
    name: "Meeting Room 1",
    icon: "🤝",
    className: "meeting-one",
    items: ["🪑", "🪑", "🪑", "🪑"],
  },
  {
    name: "Meeting Room 2",
    icon: "📊",
    className: "meeting-two",
    items: ["🪑", "🪑", "🪑"],
  },
  {
    name: "Focus Rooms",
    icon: "🎯",
    className: "focus",
    items: ["🖥️", "🪑", "🖥️", "🪑"],
  },
  {
    name: "Security Center",
    icon: "🛡️",
    className: "security",
    items: ["📺", "🖥️"],
  },
  {
    name: "Boss Cabin",
    icon: "👑",
    className: "boss",
    items: ["🪑", "🪴"],
  },
  {
    name: "Lounge",
    icon: "☕",
    className: "lounge",
    items: ["🛋️", "🪴", "☕"],
  },
  {
    name: "Creative Zone",
    icon: "🎨",
    className: "creative",
    items: ["🪑", "🪴", "💡"],
  },
  {
    name: "Kitchen",
    icon: "🍕",
    className: "kitchen",
    items: ["☕", "🪴"],
  },
];

const furniture = ["🪑", "🖥️", "🛋️", "🪴", "☕", "📺", "💡"];

function App() {
  const [rooms, setRooms] = useState(initialRooms);
  const [buildMode, setBuildMode] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState("Open Workspace");
  const [avatar, setAvatar] = useState("🧑‍💻");
  const [message, setMessage] = useState(
    "Welcome to your virtual office!"
  );

  const activeRoom =
    rooms.find((room) => room.name === selectedRoom) ?? rooms[1];

  function moveFurniture(emoji: string, targetName: string) {
    if (!buildMode) return;

    setRooms((previous) =>
      previous.map((room) => {
        if (room.name === targetName) {
          return { ...room, items: [...room.items, emoji] };
        }
        return room;
      })
    );

    setMessage(`${emoji} added to ${targetName}`);
  }

  function handleDragStart(
    event: React.DragEvent<HTMLButtonElement>,
    emoji: string
  ) {
    event.dataTransfer.setData("furniture", emoji);
  }

  function saveLayout() {
    localStorage.setItem("infotact-office-layout", JSON.stringify(rooms));
    setMessage("Office layout saved in this browser!");
  }

  function resetLayout() {
    setRooms(initialRooms);
    localStorage.removeItem("infotact-office-layout");
    setMessage("Default office layout restored.");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">I</div>
          <div>
            <strong>infotact</strong>
            <span>VIRTUAL OFFICE</span>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <button className="nav-item active">
          <span>▦</span> Office Map
        </button>
        <button
          className="nav-item"
          onClick={() => setMessage("Team chat is coming in the next phase.")}
        >
          <span>💬</span> Team Chat
        </button>
        <button
          className="nav-item"
          onClick={() =>
            setMessage("Meeting tools will be added in the next phase.")
          }
        >
          <span>🎥</span> Meetings
        </button>
        <button
          className="nav-item"
          onClick={() =>
            setMessage("Focus sessions will be added in the next phase.")
          }
        >
          <span>⏱️</span> Focus Sessions
        </button>

        <div className="workspace-label">ADMINISTRATION</div>
        <button
          className="nav-item"
          onClick={() => setMessage("Security dashboard coming soon.")}
        >
          <span>🛡️</span> Security Center
        </button>
        <button
          className="nav-item"
          onClick={() => setBuildMode(!buildMode)}
        >
          <span>🧰</span> Office Editor
        </button>

        <div className="sidebar-bottom">
          <div className="online-dot" />
          <div>
            <strong>Office online</strong>
            <span>Local preview</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Workspace / Office Map</div>
            <h1>Virtual Office <span>✦</span></h1>
            <p>Your team's space to connect and create.</p>
          </div>

          <div className="top-actions">
            <span className="online-badge">
              <span className="online-dot" /> Office ready
            </span>
            <div className="profile-avatar">PJ</div>
          </div>
        </header>

        <section className="stats-row">
          <div className="stat-card">
            <span className="stat-icon purple">👥</span>
            <div><span>Team members</span><strong>12</strong></div>
          </div>
          <div className="stat-card">
            <span className="stat-icon green">🏢</span>
            <div><span>Office rooms</span><strong>{rooms.length}</strong></div>
          </div>
          <div className="stat-card">
            <span className="stat-icon orange">🎯</span>
            <div><span>Focus rooms</span><strong>2</strong></div>
          </div>
          <div className="stat-card">
            <span className="stat-icon blue">📡</span>
            <div><span>Connection</span><strong>Local</strong></div>
          </div>
        </section>

        <section className="office-toolbar">
          <div>
            <h2>Explore your office</h2>
            <p>Select any room to explore it.</p>
          </div>
          <div className="toolbar-actions">
            <button
              className={`secondary-button ${buildMode ? "selected" : ""}`}
              onClick={() => setBuildMode(!buildMode)}
            >
              🧰 {buildMode ? "Exit Build Mode" : "Build Mode"}
            </button>
            {buildMode && (
              <>
                <button className="secondary-button" onClick={resetLayout}>
                  Reset
                </button>
                <button className="primary-button" onClick={saveLayout}>
                  Save Layout
                </button>
              </>
            )}
          </div>
        </section>

        {buildMode && (
          <section className="editor-panel">
            <div>
              <strong>Furniture toolbox</strong>
              <p>Drag an item into any room to add it.</p>
            </div>
            <div className="furniture-list">
              {furniture.map((item, index) => (
                <button
                  key={`${item}-${index}`}
                  draggable
                  onDragStart={(event) => handleDragStart(event, item)}
                  onClick={() => moveFurniture(item, selectedRoom)}
                  title={`Add ${item} to ${selectedRoom}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="map-layout">
          <section className="office-map">
            <div className="map-header">
              <span>🏢 INFOTACT HQ</span>
              <span className="map-live"><span className="online-dot" /> LIVE PREVIEW</span>
            </div>

            <div className="map-grid">
              {rooms.map((room) => (
                <button
                  key={room.name}
                  className={`room ${room.className} ${
                    selectedRoom === room.name ? "room-selected" : ""
                  }`}
                  onClick={() => {
                    setSelectedRoom(room.name);
                    setMessage(`You selected ${room.name}`);
                  }}
                  onDragOver={(event) => {
                    if (buildMode) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const item = event.dataTransfer.getData("furniture");
                    if (item) moveFurniture(item, room.name);
                  }}
                  title={`Explore ${room.name}`}
                >
                  <div className="room-heading">
                    <span className="room-icon">{room.icon}</span>
                    <span className="room-name">{room.name}</span>
                  </div>
                  <div className="room-furniture">
                    {room.items.map((item, index) => (
                      <span key={`${room.name}-${index}`}>{item}</span>
                    ))}
                  </div>
                  {room.name === "Open Workspace" && (
                    <div className="mini-avatars">
                      <span>👩🏻‍💻</span><span>🧑🏽‍💻</span><span>👨🏻‍💻</span>
                    </div>
                  )}
                  {room.name === "Focus Rooms" && (
                    <span className="room-status">2 ROOMS</span>
                  )}
                  {room.name === "Meeting Room 1" && (
                    <span className="room-status">AVAILABLE</span>
                  )}
                </button>
              ))}
              <div className="map-path">MAIN CORRIDOR</div>
              <div className="map-entrance">🚪 MAIN ENTRANCE</div>
            </div>

            <div className="map-legend">
              <span><i className="legend-dot green-dot" /> Available</span>
              <span><i className="legend-dot purple-dot" /> Selected room</span>
              <span>🪴 Furniture preview</span>
            </div>
          </section>

          <aside className="room-panel">
            <div className="panel-top">
              <span className="panel-icon">{activeRoom.icon}</span>
              <span className="room-status available">ROOM SELECTED</span>
            </div>
            <h2>{activeRoom.name}</h2>
            <p className="room-description">
              {activeRoom.name === "Focus Rooms"
                ? "A quiet space for uninterrupted work sessions."
                : activeRoom.name === "Open Workspace"
                ? "Collaborate with your teammates in the shared workspace."
                : `Explore the ${activeRoom.name.toLowerCase()} in your virtual office.`}
            </p>

            <div className="panel-divider" />
            <h3>Room contents</h3>
            <div className="contents-list">
              {activeRoom.items.length === 0 ? (
                <p>No furniture yet.</p>
              ) : (
                activeRoom.items.map((item, index) => (
                  <div className="content-item" key={`${item}-${index}`}>
                    <span>{item}</span>
                    <span>{item === "🪴" ? "Plant" : "Office furniture"}</span>
                  </div>
                ))
              )}
            </div>

            <div className="panel-divider" />
            <h3>Your avatar</h3>
            <div className="avatar-picker">
              {["🧑‍💻", "👩‍💻", "👨‍💻", "🧑🏻‍💼"].map((item) => (
                <button
                  key={item}
                  className={avatar === item ? "avatar-selected" : ""}
                  onClick={() => setAvatar(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="current-avatar">
              <span>{avatar}</span>
              <div><strong>Piyush</strong><small>Office member · Preview</small></div>
              <span className="online-dot" />
            </div>
          </aside>
        </div>

        <footer className="status-message">
          <span>✦</span> {message}
          <span className="prototype-label">PROTOTYPE</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
