import React from "react";

/**
 * ObjectPropertiesPanel
 * Allows fine-tuning coordinates, dimensions, rotation, collision rules,
 * duplication, and deletion of the currently selected office object.
 */
export default function ObjectPropertiesPanel({
  selectedItem,
  zonesList = [],
  onUpdateItem,
  onRotateItem,
  onDuplicateItem,
  onDeleteItem,
  onDeselect,
}) {
  if (!selectedItem) return null;

  const {
    id,
    name = "",
    category = "Furniture",
    icon = "📦",
    x = 50,
    y = 50,
    width = 40,
    height = 20,
    rotation = 0,
    isSolid = true,
  } = selectedItem;

  function handleXChange(newX) {
    if (newX === "" || isNaN(Number(newX))) return;
    const clamped = Math.max(2, Math.min(96, Math.round(Number(newX))));
    onUpdateItem(id, { x: clamped });
  }

  function handleYChange(newY) {
    if (newY === "" || isNaN(Number(newY))) return;
    const clamped = Math.max(4, Math.min(95, Math.round(Number(newY))));
    onUpdateItem(id, { y: clamped });
  }

  function handleWidthChange(newW) {
    if (newW === "" || isNaN(Number(newW))) return;
    const clamped = Math.max(10, Math.min(600, Math.round(Number(newW))));
    onUpdateItem(id, { width: clamped });
  }

  function handleHeightChange(newH) {
    if (newH === "" || isNaN(Number(newH))) return;
    const clamped = Math.max(6, Math.min(600, Math.round(Number(newH))));
    onUpdateItem(id, { height: clamped });
  }

  function handleToggleCollision() {
    onUpdateItem(id, { isSolid: !isSolid, canPass: isSolid });
  }

  return (
    <div className="vo-props-panel" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="vo-props-header">
        <div className="vo-props-title">
          <span className="vo-props-icon">{icon}</span>
          <div>
            <strong>{name}</strong>
            <small>{category}</small>
          </div>
        </div>
        <button
          type="button"
          className="vo-props-close"
          onClick={onDeselect}
          title="Deselect"
        >
          ✕
        </button>
      </div>

      <div className="vo-props-body">
        {/* Name / Label Control */}
        <div className="vo-props-section">
          <span className="vo-props-section-label">NAME / LABEL</span>
          <input
            type="text"
            className="vo-prop-name-input"
            value={name ?? ""} onChange={(e) => onUpdateItem(id, { name: e.target.value })}
            placeholder="e.g. Meeting Room 1"
          />
        </div>
        {/* Position Controls */}
        <div className="vo-props-section">
          <span className="vo-props-section-label">POSITION (PERCENT)</span>
          <div className="vo-props-grid">
            <div className="vo-prop-field">
              <label>X (%)</label>
              <div className="vo-prop-stepper">
                <button
                  type="button"
                  onClick={() => handleXChange(x - 2)}
                  title="Move Left"
                >
                  ◀
                </button>
                <input
                  type="number"
                  value={x}
                  onChange={(e) => handleXChange(e.target.value)}
                  min={2}
                  max={96}
                />
                <button
                  type="button"
                  onClick={() => handleXChange(x + 2)}
                  title="Move Right"
                >
                  ▶
                </button>
              </div>
            </div>

            <div className="vo-prop-field">
              <label>Y (%)</label>
              <div className="vo-prop-stepper">
                <button
                  type="button"
                  onClick={() => handleYChange(y - 2)}
                  title="Move Up"
                >
                  ▲
                </button>
                <input
                  type="number"
                  value={y}
                  onChange={(e) => handleYChange(e.target.value)}
                  min={4}
                  max={95}
                />
                <button
                  type="button"
                  onClick={() => handleYChange(y + 2)}
                  title="Move Down"
                >
                  ▼
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Dimension Controls */}
        <div className="vo-props-section">
          <span className="vo-props-section-label">SIZE (PIXELS)</span>
          <div className="vo-props-grid">
            <div className="vo-prop-field">
              <label>Width</label>
              <div className="vo-prop-stepper">
                <button
                  type="button"
                  onClick={() => handleWidthChange(width - 4)}
                >
                  −
                </button>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => handleWidthChange(e.target.value)}
                  min={10}
                  max={600}
                />
                <button
                  type="button"
                  onClick={() => handleWidthChange(width + 4)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="vo-prop-field">
              <label>Height</label>
              <div className="vo-prop-stepper">
                <button
                  type="button"
                  onClick={() => handleHeightChange(height - 4)}
                >
                  −
                </button>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => handleHeightChange(e.target.value)}
                  min={6}
                  max={600}
                />
                <button
                  type="button"
                  onClick={() => handleHeightChange(height + 4)}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Rotation Controls */}
        <div className="vo-props-section">
          <span className="vo-props-section-label">ROTATION</span>
          <div className="vo-props-rotations">
            {[0, 90, 180, 270].map((deg) => (
              <button
                key={deg}
                type="button"
                className={`vo-rot-btn ${(rotation % 360) === deg ? "active" : ""}`}
                onClick={() => onUpdateItem(id, { rotation: deg })}
              >
                {deg}°
              </button>
            ))}
            <button
              type="button"
              className="vo-rot-step-btn"
              onClick={() => onRotateItem(id)}
              title="Rotate +90°"
            >
              🔄 +90°
            </button>
          </div>
        </div>

        {/* Move Inside Room / Zone Section */}
        {!String(selectedItem.type).startsWith("zone-") && zonesList && zonesList.length > 0 && (
          <div className="vo-props-section">
            <span className="vo-props-section-label">MOVE INSIDE ROOM / ZONE</span>
            <div className="vo-props-zones-grid">
              {zonesList.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  className="vo-prop-zone-btn"
                  onClick={() => {
                    const zx = zone.x !== undefined ? zone.x : (zone.position?.x ?? 50);
                    const zy = zone.y !== undefined ? zone.y : (zone.position?.y ?? 50);
                    onUpdateItem(id, {
                      x: Math.round(zx),
                      y: Math.round(zy),
                      position: { x: Math.round(zx), y: Math.round(zy) },
                    });
                  }}
                  title={`Move "${name}" inside ${zone.name}`}
                >
                  <span className="vo-prop-zone-icon">{zone.icon || "📍"}</span>
                  <span className="vo-prop-zone-name">{zone.name}</span>
                  <span className="vo-prop-zone-arrow">➜ Place</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Collision & Physical Rule Controls */}
        <div className="vo-props-section">
          <span className="vo-props-section-label">COLLISION RULE</span>
          <button
            type="button"
            className={`vo-collision-toggle ${isSolid ? "solid" : "passable"}`}
            onClick={handleToggleCollision}
            title={
              isSolid
                ? "Avatars cannot walk through this object"
                : "Avatars can walk freely through this object (doorway)"
            }
          >
            <span className="vo-col-icon">{isSolid ? "🛡️" : "🚶"}</span>
            <div className="vo-col-text">
              <strong>{isSolid ? "Solid Obstacle" : "Walkable / Doorway"}</strong>
              <small>
                {isSolid
                  ? "Blocks avatar movement like walls & desks"
                  : "Passable by walking avatars"}
              </small>
            </div>
          </button>
        </div>

        {/* Actions (Duplicate / Delete) */}
        <div className="vo-props-actions">
          <button
            type="button"
            className="vo-props-action-btn duplicate"
            onClick={() => onDuplicateItem(id)}
            title="Duplicate this object"
          >
            📋 Duplicate
          </button>
          <button
            type="button"
            className="vo-props-action-btn delete"
            onClick={() => onDeleteItem(id)}
            title="Remove from office layout"
          >
            🗑️ Delete
          </button>
        </div>
      </div>
    </div>
  );
}
