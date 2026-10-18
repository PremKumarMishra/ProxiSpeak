import React from "react";

/**
 * BuilderToolbar
 * Comprehensive control toolbar for the Virtual Office Builder.
 * Features: Mode switcher (Design vs Preview), Undo/Redo, Grid Snapping,
 * Object quick actions, Library toggle, Reset, Save, and Publish.
 */
export default function BuilderToolbar({
  builderMode,
  onSetBuilderMode,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  snapToGrid,
  onToggleSnap,
  selectedItemName,
  selectedItemId,
  onRotateSelected,
  onDuplicateSelected,
  onDeleteSelected,
  isLibraryOpen,
  onToggleLibrary,
  onResetLayout,
  onCancel,
  onSave,
  onDone,
  onPublish,
  isSaving,
}) {
  return (
    <div className="vo-builder-toolbar" role="toolbar" aria-label="Office Builder Controls">
      {/* Left section: Mode switch & History */}
      <div className="vo-bbar-group left">
        <div className="vo-bbar-mode-switch">
          <button
            type="button"
            className={`vo-mode-tab ${builderMode === "edit" ? "active" : ""}`}
            onClick={() => onSetBuilderMode("edit")}
            title="Design & edit office furniture, walls and layout"
          >
            ✏️ Design
          </button>
          <button
            type="button"
            className={`vo-mode-tab ${builderMode === "preview" ? "active" : ""}`}
            onClick={() => onSetBuilderMode("preview")}
            title="Preview mode: walk your avatar and test doorway & wall collisions"
          >
            👁️ Test Walking
          </button>
        </div>

        {/* Undo / Redo */}
        <div className="vo-bbar-history">
          <button
            type="button"
            className="vo-bbar-btn history"
            onClick={onUndo}
            disabled={!canUndo || builderMode === "preview"}
            title="Undo (Ctrl+Z)"
          >
            ↺ Undo
          </button>
          <button
            type="button"
            className="vo-bbar-btn history"
            onClick={onRedo}
            disabled={!canRedo || builderMode === "preview"}
            title="Redo (Ctrl+Y)"
          >
            ↻ Redo
          </button>
        </div>

        {/* Grid Snapping Toggle */}
        <button
          type="button"
          className={`vo-bbar-btn snap ${snapToGrid ? "active" : ""}`}
          onClick={onToggleSnap}
          title={snapToGrid ? "Grid Snapping: ON (2%)" : "Grid Snapping: OFF (Free Drag)"}
        >
          🧲 {snapToGrid ? "Snap 2%" : "Free Drag"}
        </button>

        {/* Library Drawer Toggle */}
        <button
          type="button"
          className={`vo-bbar-btn library ${isLibraryOpen ? "active" : ""}`}
          onClick={onToggleLibrary}
          title="Toggle Building Blocks Library sidebar"
        >
          🧱 {isLibraryOpen ? "Hide Library" : "Blocks Library"}
        </button>
      </div>

      {/* Center: Selected object quick actions */}
      {selectedItemId && builderMode === "edit" ? (
        <div className="vo-bbar-group center">
          <span className="vo-selected-badge">
            Selected: <strong>{selectedItemName}</strong>
          </span>
          <button
            type="button"
            className="vo-bbar-btn quick-action"
            onClick={onRotateSelected}
            title="Rotate selected object 90°"
          >
            🔄 Rotate
          </button>
          <button
            type="button"
            className="vo-bbar-btn quick-action"
            onClick={onDuplicateSelected}
            title="Duplicate selected object"
          >
            📋 Duplicate
          </button>
          <button
            type="button"
            className="vo-bbar-btn quick-action delete"
            onClick={onDeleteSelected}
            title="Delete selected object (Del key)"
          >
            🗑️ Delete
          </button>
        </div>
      ) : (
        <div className="vo-bbar-group center">
          <span className="vo-bbar-tip">
            {builderMode === "preview"
              ? "🚶 Walk around with Arrow Keys or click to test wall collisions & doorways"
              : "💡 Drag blocks from library onto canvas, or click any desk/wall to select"}
          </span>
        </div>
      )}

      {/* Right: Reset, Cancel, Save, Publish */}
      <div className="vo-bbar-group right">
        <button
          type="button"
          className="vo-bbar-btn reset"
          onClick={onResetLayout}
          disabled={isSaving}
          title="Reset to default office layout"
        >
          ↺ Reset
        </button>

        <button
          type="button"
          className="vo-bbar-btn cancel"
          onClick={onCancel}
          disabled={isSaving}
          title="Discard unsaved modifications"
        >
          ✕ Cancel
        </button>

        <button
          type="button"
          className="vo-bbar-btn save"
          onClick={onSave}
          disabled={isSaving}
          title="Save layout draft"
        >
          {isSaving ? "Saving..." : "💾 Save"}
        </button>

        <button
          type="button"
          className="vo-bbar-btn publish"
          onClick={onDone || onPublish}
          disabled={isSaving}
          title="Save layout and finish editing"
        >
          {isSaving ? "Saving..." : "Done"}
        </button>
      </div>
    </div>
  );
}
