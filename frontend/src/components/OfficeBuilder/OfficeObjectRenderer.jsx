import React from "react";

const BASE_OBJECT_DIMENSIONS = {
  "working-desk": { w: 54, h: 44 },
  "single-desk": { w: 38, h: 32 },
  "office-chair": { w: 22, h: 22 },
  "meeting-table": { w: 104, h: 54 },
  "sofa": { w: 68, h: 28 },
  "reception-desk": { w: 70, h: 36 },
  "coffee-table": { w: 32, h: 32 },
  "water-dispenser": { w: 22, h: 22 },
  "whiteboard": { w: 48, h: 16 },
  "storage-cabinet": { w: 40, h: 24 },
  "potted-plant": { w: 22, h: 22 },
  "floor-palm": { w: 26, h: 26 },
  "standing-lamp": { w: 20, h: 20 },
  "accent-rug": { w: 80, h: 50 },
  "thin-wall": { w: 60, h: 8 },
  "long-wall": { w: 120, h: 10 },
  "door": { w: 36, h: 14 },
  "entrance-gate": { w: 48, h: 24 },
  "room-partition": { w: 48, h: 8 },
  "lift": { w: 36, h: 36 },
};

/**
 * OfficeObjectRenderer
 * High-fidelity top-down 2D rendering for placed furniture, walls, doors,
 * facilities, and decorations matching ProxiSpeak's visual aesthetic.
 */
export default function OfficeObjectRenderer({
  item,
  isSelected,
  isDragging = false,
  isEditingLayout,
  onPointerDown,
  onClick,
  onRotate,
  onDuplicate,
  onDelete,
  onStartResize,
  onDragOver,
  onDragEnter,
  onDrop,
}) {
  if (!item) return null;

  const {
    id,
    type,
    name,
    rotation = 0,
    isSolid = true,
    color,
  } = item;

  const posX = item.x !== undefined ? item.x : (item.position?.x !== undefined ? item.position.x : 50);
  const posY = item.y !== undefined ? item.y : (item.position?.y !== undefined ? item.position.y : 50);

  const isZone = String(type).startsWith("zone-");

  const baseDim = BASE_OBJECT_DIMENSIONS[type] || {
    w: item.defaultWidth || 40,
    h: item.defaultHeight || 20,
  };
  const baseW = baseDim.w || item.defaultWidth || 40;
  const baseH = baseDim.h || item.defaultHeight || 20;
  const currentW = Math.max(10, item.width !== undefined ? item.width : baseW);
  const currentH = Math.max(6, item.height !== undefined ? item.height : baseH);
  const scaleX = currentW / baseW;
  const scaleY = currentH / baseH;

  const isRug = type === "accent-rug";
  let zIndex = 10;
  if (isDragging) {
    zIndex = 100;
  } else if (isSelected) {
    zIndex = isZone ? 4 : (isRug ? 25 : 50);
  } else if (isZone) {
    zIndex = 1;
  } else if (isRug) {
    zIndex = 5;
  } else {
    zIndex = 10;
  }

  const transformStyle = {
    left: `${posX}%`,
    top: `${posY}%`,
    width: `${currentW}px`,
    height: `${currentH}px`,
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    transformOrigin: "center center",
    zIndex,
    pointerEvents: isZone ? "none" : undefined,
  };

  function renderObjectVisual() {
    if (isZone) {
      const zoneColor = color || "#8b5cf6";
      const tagScale = Math.min(Math.max(currentW / 180, 0.85), 2.2);
      return (
        <div
          className="vo-obj-zone"
          style={{
            borderColor: zoneColor,
            backgroundColor: `${zoneColor}14`,
            pointerEvents: "none",
          }}
        >
          <div
            className="vo-zone-tag"
            onPointerDown={(e) => {
              if (e && typeof e.stopPropagation === "function") e.stopPropagation();
              if (onPointerDown) onPointerDown(e, id);
            }}
            onClick={(e) => {
              if (e && typeof e.stopPropagation === "function") e.stopPropagation();
              if (onClick) onClick(e, id);
            }}
            style={{
              backgroundColor: zoneColor,
              transform: `scale(${tagScale})`,
              transformOrigin: "top left",
              pointerEvents: "auto",
              cursor: isEditingLayout ? "grab" : "default",
            }}
            title={isEditingLayout ? `Room: ${name} (Click to select, drag to reposition room)` : name}
          >
            <span className="vo-zone-tag-icon">{item.icon || "📍"}</span>
            <span className="vo-zone-tag-name">{name}</span>
          </div>
        </div>
      );
    }

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
      className={`vo-placed-object ${type} ${isZone ? "is-zone" : ""} ${isEditingLayout ? "editable" : ""} ${
        isSelected ? "selected" : ""
      } ${isDragging ? "is-dragging" : ""} ${isSolid ? "solid-block" : "passable-block"}`}
      style={transformStyle}
      onPointerDown={(e) => onPointerDown && onPointerDown(e, id)}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDrop={onDrop}
      onClick={(e) => {
        if (!isEditingLayout) return;
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        if (onClick) onClick(e, id);
      }}
      title={
        isEditingLayout
          ? `${name} (${isSolid ? "Solid" : "Passable"}) - Click to select, drag to reposition`
          : undefined
      }
    >
      {isZone ? (
        renderObjectVisual()
      ) : (
        <div
          className="vo-obj-scalable-wrapper"
          style={{
            width: `${baseW}px`,
            height: `${baseH}px`,
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, -50%) scale(${scaleX}, ${scaleY})`,
            transformOrigin: "center center",
            pointerEvents: "none",
          }}
        >
          {renderObjectVisual()}
        </div>
      )}
      {/* Visual drag indicator on unselected movable objects during edit mode */}
      {isEditingLayout && !isSelected && !isZone && (
        <div className="vo-obj-drag-pill" title="Click to select, drag to move">
          <span className="vo-drag-handle-icon">✛</span>
        </div>
      )}
      {/* Interactive canvas resize handle for selected object */}
      {isEditingLayout && isSelected && (
        <div
          className="vo-obj-resize-handle"
          style={{ pointerEvents: "auto" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (onStartResize) onStartResize(e, id);
          }}
          onClick={(e) => e.stopPropagation()}
          title="Drag to resize"
        >
          <span className="vo-resize-icon">↘</span>
        </div>
      )}

      {/* Editing selection controls */}
      {isEditingLayout && isSelected && (
        <div
          className="vo-obj-selection-hud"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            transform: `translateX(-50%) rotate(-${rotation}deg)`,
            pointerEvents: "auto",
          }}
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
              onPointerDown={(e) => e.stopPropagation()}
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
              onPointerDown={(e) => e.stopPropagation()}
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
              onPointerDown={(e) => e.stopPropagation()}
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
