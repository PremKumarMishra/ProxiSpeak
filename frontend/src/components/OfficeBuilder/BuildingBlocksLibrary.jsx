import React, { useState, useMemo } from "react";
import {
  BUILDING_BLOCKS_CATALOG,
  BUILDING_BLOCK_CATEGORIES,
} from "./officeCatalog";

/**
 * BuildingBlocksLibrary
 * Collapsible sidebar drawer with categorized, reusable office objects.
 * Supports dragging onto canvas and "+ Add" clicking.
 */
export default function BuildingBlocksLibrary({
  isOpen,
  onToggle,
  onAddBlock,
  onDragStartBlock,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredBlocks = useMemo(() => {
    return BUILDING_BLOCKS_CATALOG.filter((block) => {
      const matchesCategory =
        selectedCategory === "All" || block.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === "" ||
        block.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        block.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        block.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <div className={`vo-library-drawer ${isOpen ? "open" : "collapsed"}`}>
      {/* Collapsible Toggle Handle */}
      <button
        type="button"
        className="vo-library-toggle-btn"
        onClick={onToggle}
        title={isOpen ? "Collapse Blocks Library" : "Open Blocks Library"}
      >
        <span className="vo-toggle-icon">{isOpen ? "◀" : "🧱"}</span>
        <span className="vo-toggle-text">
          {isOpen ? "Collapse Library" : "Building Blocks Library"}
        </span>
      </button>

      {isOpen && (
        <div className="vo-library-content">
          <div className="vo-library-header">
            <div className="vo-lib-title-row">
              <h3>🧱 Building Blocks</h3>
              <span className="vo-lib-count">{filteredBlocks.length} items</span>
            </div>
            <p className="vo-lib-subtitle">
              Drag elements onto floor map or click &apos;+ Add&apos;.
            </p>
          </div>

          {/* Search Box */}
          <div className="vo-library-search">
            <span className="vo-lib-search-icon">🔍</span>
            <input
              type="text"
              className="vo-lib-search-input"
              placeholder="Search desks, walls, doors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="vo-lib-clear-btn"
                onClick={() => setSearchQuery("")}
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="vo-library-categories">
            {BUILDING_BLOCK_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`vo-cat-pill ${selectedCategory === cat ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* List of draggable block cards */}
          <div className="vo-library-list">
            {filteredBlocks.length === 0 ? (
              <div className="vo-library-empty">
                <p>No office blocks match &quot;{searchQuery}&quot;.</p>
                <button
                  type="button"
                  className="vo-lib-reset-filter-btn"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("All");
                  }}
                >
                  Reset filters
                </button>
              </div>
            ) : (
              filteredBlocks.map((block) => (
                <div
                  key={block.type}
                  className="vo-block-item"
                  draggable
                  onDragStart={(e) => onDragStartBlock && onDragStartBlock(e, block)}
                  title={`Drag onto map or click + Add to place ${block.name}`}
                >
                  <div className="vo-block-left">
                    <span className="vo-block-icon">{block.icon}</span>
                    <div className="vo-block-meta">
                      <div className="vo-block-name-row">
                        <strong className="vo-block-name">{block.name}</strong>
                        <span
                          className={`vo-block-solid-badge ${
                            block.isSolid ? "solid" : "passable"
                          }`}
                        >
                          {block.isSolid ? "Solid" : "Passable"}
                        </span>
                      </div>
                      <span className="vo-block-desc">{block.description}</span>
                      <small className="vo-block-dim">
                        Size: {block.defaultWidth}×{block.defaultHeight}px
                      </small>
                    </div>
                  </div>

                  <div className="vo-block-actions">
                    <span className="vo-block-drag-hint">⠿ Drag</span>
                    <button
                      type="button"
                      className="vo-block-add-btn"
                      onClick={() => onAddBlock && onAddBlock(block)}
                      title={`Add ${block.name} to center of map`}
                    >
                      + Add
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
