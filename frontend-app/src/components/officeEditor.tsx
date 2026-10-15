import { useRef, useState } from "react";
import "./OfficeEditor.css";

type Wall = {
  id: number;
  x: number;
  y: number;
  direction: "horizontal" | "vertical";
};

const GRID_COLS = 24;
const GRID_ROWS = 16;

export default function OfficeEditor() {
  const [walls, setWalls] = useState<Wall[]>([
    { id: 1, x: 5, y: 3, direction: "horizontal" },
    { id: 2, x: 5, y: 3, direction: "vertical" },
    { id: 3, x: 5, y: 8, direction: "horizontal" },
    { id: 4, x: 12, y: 3, direction: "vertical" },
  ]);
  const [avatar, setAvatar] = useState({ x: 8, y: 10 });
  const [draggingAvatar, setDraggingAvatar] = useState(false);
  const [selectedWall, setSelectedWall] = useState<number | null>(null);
  const [nextId, setNextId] = useState(5);
  const boardRef = useRef<HTMLDivElement>(null);

  function getCellFromPointer(clientX: number, clientY: number) {
    const board = boardRef.current;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / (rect.width / GRID_COLS));
    const y = Math.floor((clientY - rect.top) / (rect.height / GRID_ROWS));
    return {
      x: Math.max(0, Math.min(GRID_COLS - 1, x)),
      y: Math.max(0, Math.min(GRID_ROWS - 1, y)),
    };
  }

  function placeWall(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const cell = getCellFromPointer(event.clientX, event.clientY);
    if (!cell) return;
    const direction = event.dataTransfer.getData("wall-direction") === "vertical"
      ? "vertical"
      : "horizontal";
    setWalls((current) => [...current, { id: nextId, ...cell, direction }]);
    setNextId((id) => id + 1);
  }

  function moveAvatar(event: React.PointerEvent<HTMLElement>) {
    if (!draggingAvatar) return;
    const cell = getCellFromPointer(event.clientX, event.clientY);
    if (cell) setAvatar(cell);
  }

  function addWall(direction: Wall["direction"]) {
    const wall: Wall = {
      id: nextId,
      x: Math.floor(GRID_COLS / 2),
      y: Math.floor(GRID_ROWS / 2),
      direction,
    };
    setWalls((current) => [...current, wall]);
    setSelectedWall(wall.id);
    setNextId((id) => id + 1);
  }

  function clearWalls() {
    setWalls([]);
    setSelectedWall(null);
  }

  return (
    <main className="office-editor">
      <aside className="oe-sidebar" aria-label="Office editor navigation">
        <a className="oe-brand" href="#oe-header" aria-label="Infotact Office Builder">
          <span className="oe-brand-icon">✦</span>
          <span>
            <strong>Infotact</strong>
            <small>VIRTUAL OFFICE</small>
          </span>
        </a>
        <div className="oe-nav-label">WORKSPACE</div>
        <nav className="oe-navigation" aria-label="Workspace">
          <a className="oe-nav-item active" href="#oe-header" aria-current="page">
            <span aria-hidden="true">▦</span> Office Builder
          </a>
          <a className="oe-nav-item" href="#oe-toolbox">
            <span aria-hidden="true">🧰</span> Toolbox
          </a>
          <a className="oe-nav-item" href="#oe-blueprint">
            <span aria-hidden="true">🗺️</span> Blueprint
          </a>
        </nav>
        <div className="oe-sidebar-status">
          <i />
          <span><strong>Editor ready</strong><small>Local workspace</small></span>
        </div>
      </aside>
      <div className="oe-content">
        <div className="oe-topbar">
          <div className="oe-topbar-title">Workspace <span>/</span> Office Builder</div>
          <div className="oe-topbar-right">
            <span>👥 Better People</span>
            <span>Better Teams</span>
            <span>A Brighter Future</span>
          </div>
        </div>
        <header className="oe-header" id="oe-header">
        <div>
          <p className="oe-eyebrow">INFOTACT VIRTUAL OFFICE</p>
          <h1>Office Builder</h1>
          <p className="oe-subtitle">Build rooms, place walls, and move your avatar.</p>
        </div>
        <div className="oe-actions">
          <button onClick={() => addWall("horizontal")}>+ Horizontal wall</button>
          <button onClick={() => addWall("vertical")}>+ Vertical wall</button>
          <button className="oe-danger" onClick={clearWalls}>Clear walls</button>
        </div>
        </header>

        <div className="oe-layout">
          <aside className="oe-toolbox" id="oe-toolbox">
          <h2>Toolbox</h2>
          <p>Drag a wall piece onto the blueprint.</p>
          <div
            className="oe-wall-tool"
            draggable
            onDragStart={(event) => event.dataTransfer.setData("wall-direction", "horizontal")}
          >
            <span className="oe-wall-preview oe-horizontal" />
            <span>Horizontal wall</span>
          </div>
          <div
            className="oe-wall-tool"
            draggable
            onDragStart={(event) => event.dataTransfer.setData("wall-direction", "vertical")}
          >
            <span className="oe-wall-preview oe-vertical" />
            <span>Vertical wall</span>
          </div>
          <div className="oe-help">
            <strong>How to use</strong>
            <ol>
              <li>Drag a wall tool onto the grid.</li>
              <li>Click a wall to select it.</li>
              <li>Press Delete to remove the selected wall.</li>
              <li>Drag the avatar to move it.</li>
            </ol>
          </div>
          <div className="oe-selection">
            <strong>Selected wall</strong>
            <p>{selectedWall === null ? "None" : `Wall #${selectedWall}`}</p>
            {selectedWall !== null && (
              <button
                className="oe-danger"
                onClick={() => {
                  setWalls((current) => current.filter((wall) => wall.id !== selectedWall));
                  setSelectedWall(null);
                }}
              >
                Delete selected wall
              </button>
            )}
          </div>
          </aside>

          <section className="oe-map-panel">
          <div className="oe-map-heading">
            <div>
              <h2>Office blueprint</h2>
              <span>{GRID_COLS} × {GRID_ROWS} grid</span>
            </div>
            <span className="oe-live"><i /> Editor ready</span>
          </div>

          <div
            className="oe-blueprint"
            id="oe-blueprint"
            ref={boardRef}
            onDragOver={(event) => event.preventDefault()}
            onDrop={placeWall}
            onPointerMove={moveAvatar}
            onPointerUp={() => setDraggingAvatar(false)}
            onPointerLeave={() => setDraggingAvatar(false)}
            onKeyDown={(event) => {
              if (event.key === "Delete" && selectedWall !== null) {
                setWalls((current) => current.filter((wall) => wall.id !== selectedWall));
                setSelectedWall(null);
              }
            }}
            tabIndex={0}
            role="application"
            aria-label="Office blueprint grid. Drag walls here and move the avatar."
          >
            <div className="oe-room oe-room-meeting">
              <span>MEETING ROOM</span>
            </div>
            <div className="oe-room oe-room-open">
              <span>OPEN WORKSPACE</span>
            </div>
            <div className="oe-room oe-room-focus">
              <span>FOCUS ROOM</span>
            </div>
            {walls.map((wall) => (
              <button
                key={wall.id}
                type="button"
                className={`oe-wall ${wall.direction} ${selectedWall === wall.id ? "selected" : ""}`}
                style={{
                  left: `${((wall.x + 0.5) / GRID_COLS) * 100}%`,
                  top: `${((wall.y + 0.5) / GRID_ROWS) * 100}%`,
                }}
                onClick={() => setSelectedWall(wall.id)}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setSelectedWall(wall.id);
                }}
                aria-label={`Select ${wall.direction} wall ${wall.id}`}
                title={`Wall ${wall.id} — click to select`}
              />
            ))}
            <button
              type="button"
              className="oe-avatar"
              style={{
                left: `${((avatar.x + 0.5) / GRID_COLS) * 100}%`,
                top: `${((avatar.y + 0.5) / GRID_ROWS) * 100}%`,
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDraggingAvatar(true);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={moveAvatar}
              onPointerUp={() => setDraggingAvatar(false)}
              title="Drag to move your avatar"
              aria-label="Your draggable employee avatar"
            >
              🙂
              <span>Piyush</span>
            </button>
          </div>
          <footer className="oe-map-footer">
            <span><b className="oe-legend-wall" /> Wall</span>
            <span><b className="oe-legend-avatar">🙂</b> Your avatar</span>
            <span>Tip: click the grid before using Delete to remove a selected wall.</span>
          </footer>
          </section>
        </div>
      </div>
    </main>
  );
}
