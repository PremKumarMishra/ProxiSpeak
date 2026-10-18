import React from "react";

/**
 * OfficeObjectRenderer
 * High-fidelity top-down 2D rendering for placed furniture, walls, doors,
 * facilities, and decorations matching ProxiSpeak's visual aesthetic.
 */
export default function OfficeObjectRenderer({
  item,
  isSelected,
  isEditingLayout,
  onPointerDown,
  onClick,
  onRotate,
  onDuplicate,
  onDelete,
}) {
  if (!item) return null;

  const {
    id,
    type,
    name,
    x = 50,
    y = 50,
    width = 40,
    height = 20,
    rotation = 0,
    isSolid = true,
    color,
  } = item;

  const transformStyle = {
    left: `${x}%`,
    top: `${y}%`,
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    transformOrigin: "center center",
  };

  function renderObjectVisual() {
    switch (type) {
      case "working-desk":
        return (
          <div className="vo-obj-working-desk">
            <div className="desk-pod-top">
              <span className="desk-screen-glow" />
            </div>
            <div className="desk-chair-icon top c-left" />
            <div className="desk-chair-icon top c-right" />
            <div className="desk-pod-bottom">
              <span className="desk-screen-glow" />
            </div>
            <div className="desk-chair-icon bottom c-left" />
            <div className="desk-chair-icon bottom c-right" />
          </div>
        );

      case "single-desk":
        return (
          <div className="vo-obj-single-desk">
            <div className="single-desk-surface">
              <span className="desk-screen-glow" />
            </div>
            <div className="desk-chair-icon bottom single-chair" />
          </div>
        );

      case "office-chair":
        return (
          <div className="vo-obj-chair">
            <div className="chair-seat" />
            <div className="chair-back" />
            <div className="chair-arm arm-left" />
            <div className="chair-arm arm-right" />
          </div>
        );

      case "meeting-table":
        return (
          <div className="vo-obj-meeting-table">
            <div className="meeting-table-top">
              <div className="table-center-pad">
                <span className="table-mic-pill" />
              </div>
            </div>
            <div className="conf-chair c-top c1" />
            <div className="conf-chair c-top c2" />
            <div className="conf-chair c-top c3" />
            <div className="conf-chair c-bottom c4" />
            <div className="conf-chair c-bottom c5" />
            <div className="conf-chair c-bottom c6" />
          </div>
        );

      case "sofa":
        return (
          <div className="vo-obj-sofa">
            <div className="sofa-back" />
            <div className="sofa-seat">
              <span className="sofa-cushion" />
              <span className="sofa-cushion" />
            </div>
            <div className="sofa-arm left" />
            <div className="sofa-arm right" />
          </div>
        );

      case "reception-desk":
        return (
          <div className="vo-obj-reception">
            <div className="reception-counter">
              <span className="reception-screen" />
              <span className="reception-bell">🛎️</span>
            </div>
            <div className="reception-chair" />
          </div>
        );

      case "coffee-table":
        return (
          <div className="vo-obj-coffee-table">
            <div className="coffee-circle">
              <span className="coffee-cup">☕</span>
            </div>
          </div>
        );

      case "thin-wall":
      case "long-wall":
        return (
          <div className="vo-obj-wall" style={{ borderColor: color || "#64748b" }}>
            <div className="wall-brick-pattern" />
          </div>
        );

      case "door":
        return (
          <div className="vo-obj-doorway">
            <div className="doorway-frame" />
            <div className="door-panel-swing" />
            <span className="door-walk-tag">🚶 DOOR</span>
          </div>
        );

      case "entrance-gate":
        return (
          <div className="vo-obj-gate">
            <div className="gate-pillar left" />
            <div className="gate-turnstile">
              <span className="gate-scanner">🟢</span>
            </div>
            <div className="gate-pillar right" />
          </div>
        );

      case "room-partition":
        return (
          <div className="vo-obj-partition">
            <div className="partition-glass" />
          </div>
        );

      case "lift":
        return (
          <div className="vo-obj-lift">
            <div className="lift-interior">
              <div className="lift-indicator">
                <span>▲ 12</span>
              </div>
              <div className="lift-doors-line" />
            </div>
          </div>
        );

      case "water-dispenser":
        return (
          <div className="vo-obj-water-cooler">
            <div className="water-cooler-jug" />
            <div className="water-cooler-base">
              <span className="tap red" />
              <span className="tap blue" />
            </div>
          </div>
        );

      case "whiteboard":
        return (
          <div className="vo-obj-whiteboard">
            <div className="whiteboard-board">
              <div className="board-line l1" />
              <div className="board-line l2" />
            </div>
            <div className="whiteboard-tray" />
          </div>
        );

      case "storage-cabinet":
        return (
          <div className="vo-obj-cabinet">
            <div className="cabinet-drawer" />
            <div className="cabinet-drawer" />
          </div>
        );

      case "potted-plant":
        return (
          <div className="vo-obj-plant">
            <span className="plant-emoji">🪴</span>
          </div>
        );

      case "floor-palm":
        return (
          <div className="vo-obj-palm">
            <span className="palm-emoji">🌿</span>
          </div>
        );

      case "standing-lamp":
        return (
          <div className="vo-obj-lamp">
            <span className="lamp-shade" />
            <span className="lamp-glow" />
          </div>
        );

      case "accent-rug":
        return (
          <div className="vo-obj-rug">
            <div className="rug-inner-pattern" />
          </div>
        );

      default:
        return (
          <div className="vo-obj-generic" style={{ backgroundColor: color || "#e2e8f0" }}>
            <span>{item.icon || "📦"}</span>
          </div>
        );
    }
  }

  return (
    <div
      className={`vo-placed-object ${type} ${isEditingLayout ? "editable" : ""} ${
        isSelected ? "selected" : ""
      } ${isSolid ? "solid-block" : "passable-block"}`}
      style={transformStyle}
      onPointerDown={(e) => onPointerDown && onPointerDown(e, id)}
      onClick={(e) => {
        if (!isEditingLayout) return;
        e.stopPropagation();
        if (onClick) onClick(id);
      }}
      title={
        isEditingLayout
          ? `${name} (${isSolid ? "Solid" : "Passable"}) - Click to select, drag to reposition`
          : undefined
      }
    >
      {renderObjectVisual()}

      {/* Editing selection controls */}
      {isEditingLayout && isSelected && (
        <div
          className="vo-obj-selection-hud"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Quick HUD badge */}
          <div className="vo-hud-badge">
            <span className="vo-hud-name">{name}</span>
            <span className={`vo-hud-solid-tag ${isSolid ? "solid" : "pass"}`}>
              {isSolid ? "🛡️ Solid" : "🚶 Passable"}
            </span>
            <span className="vo-hud-rot">{rotation}°</span>
          </div>

          {/* Quick inline action buttons */}
          <div className="vo-hud-actions">
            <button
              type="button"
              className="vo-hud-btn rotate"
              onClick={(e) => {
                e.stopPropagation();
                if (onRotate) onRotate(id);
              }}
              title="Rotate 90 degrees"
            >
              🔄
            </button>
            <button
              type="button"
              className="vo-hud-btn duplicate"
              onClick={(e) => {
                e.stopPropagation();
                if (onDuplicate) onDuplicate(id);
              }}
              title="Duplicate object"
            >
              📋
            </button>
            <button
              type="button"
              className="vo-hud-btn delete"
              onClick={(e) => {
                e.stopPropagation();
                if (onDelete) onDelete(id);
              }}
              title="Delete object"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
