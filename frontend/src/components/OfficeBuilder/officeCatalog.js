/**
 * Office Building Blocks Catalog
 * Defines reusable objects for Virtual Office Builder with categories, dimensions,
 * collision properties, and visual representations.
 */

export const BUILDING_BLOCK_CATEGORIES = [
  "All",
  "Furniture",
  "Architecture",
  "Facilities",
  "Decoration",
];

export const BUILDING_BLOCKS_CATALOG = [
  // --- Furniture ---
  {
    type: "working-desk",
    name: "Working Desk",
    category: "Furniture",
    icon: "🖥️",
    description: "Workstation pod with dual monitors & ergonomic chairs",
    defaultWidth: 54,
    defaultHeight: 44,
    isSolid: true,
    canPass: false,
    color: "#fef3c7",
  },
  {
    type: "single-desk",
    name: "Single Desk",
    category: "Furniture",
    icon: "💻",
    description: "Compact desk for individual focused work",
    defaultWidth: 38,
    defaultHeight: 32,
    isSolid: true,
    canPass: false,
    color: "#f1f5f9",
  },
  {
    type: "office-chair",
    name: "Office Chair",
    category: "Furniture",
    icon: "🪑",
    description: "Ergonomic mesh swivel chair",
    defaultWidth: 18,
    defaultHeight: 18,
    isSolid: false,
    canPass: true,
    color: "#334155",
  },
  {
    type: "meeting-table",
    name: "Meeting Table",
    category: "Furniture",
    icon: "📊",
    description: "Conference table with chairs & whiteboard screen",
    defaultWidth: 104,
    defaultHeight: 48,
    isSolid: true,
    canPass: false,
    color: "#e2e8f0",
  },
  {
    type: "sofa",
    name: "Sofa / Lounge Couch",
    category: "Furniture",
    icon: "🛋️",
    description: "Plush sectional sofa for collaboration & informal talks",
    defaultWidth: 68,
    defaultHeight: 34,
    isSolid: true,
    canPass: false,
    color: "#f3e8ff",
  },
  {
    type: "reception-desk",
    name: "Reception Desk",
    category: "Furniture",
    icon: "🛎️",
    description: "Lobby reception greeting counter with monitor",
    defaultWidth: 56,
    defaultHeight: 34,
    isSolid: true,
    canPass: false,
    color: "#fed7aa",
  },
  {
    type: "coffee-table",
    name: "Coffee Table",
    category: "Furniture",
    icon: "☕",
    description: "Round table for cafeteria, tea & breakout zones",
    defaultWidth: 32,
    defaultHeight: 32,
    isSolid: true,
    canPass: false,
    color: "#ffffff",
  },

  // --- Architecture ---
  {
    type: "thin-wall",
    name: "Thin Wall",
    category: "Architecture",
    icon: "🧱",
    description: "Lightweight wall segment to build rooms & boundary partitions",
    defaultWidth: 64,
    defaultHeight: 10,
    isSolid: true,
    canPass: false,
    color: "#94a3b8",
  },
  {
    type: "long-wall",
    name: "Long Wall",
    category: "Architecture",
    icon: "🧱",
    description: "Extended room boundary partition wall",
    defaultWidth: 120,
    defaultHeight: 10,
    isSolid: true,
    canPass: false,
    color: "#64748b",
  },
  {
    type: "door",
    name: "Door / Doorway",
    category: "Architecture",
    icon: "🚪",
    description: "Passable architectural doorway for avatars to enter rooms",
    defaultWidth: 40,
    defaultHeight: 12,
    isSolid: false,
    canPass: true,
    color: "#38bdf8",
  },
  {
    type: "entrance-gate",
    name: "Entrance Gate",
    category: "Architecture",
    icon: "🏢",
    description: "Security turnstile entrance gate with check-in reader",
    defaultWidth: 54,
    defaultHeight: 22,
    isSolid: false,
    canPass: true,
    color: "#f59e0b",
  },
  {
    type: "room-partition",
    name: "Room Partition",
    category: "Architecture",
    icon: "🪟",
    description: "Acoustic transparent glass partition panel",
    defaultWidth: 56,
    defaultHeight: 8,
    isSolid: true,
    canPass: false,
    color: "#67e8f9",
  },

  // --- Facilities ---
  {
    type: "lift",
    name: "Lift / Elevator",
    category: "Facilities",
    icon: "🛗",
    description: "Office elevator cabin with floor display & call buttons",
    defaultWidth: 46,
    defaultHeight: 46,
    isSolid: true,
    canPass: false,
    color: "#475569",
  },
  {
    type: "water-dispenser",
    name: "Water Dispenser",
    category: "Facilities",
    icon: "💧",
    description: "Office water cooler with chilled bottle dispenser",
    defaultWidth: 22,
    defaultHeight: 26,
    isSolid: true,
    canPass: false,
    color: "#0284c7",
  },
  {
    type: "whiteboard",
    name: "Whiteboard",
    category: "Facilities",
    icon: "📋",
    description: "Rolling brainstorm magnetic whiteboard",
    defaultWidth: 48,
    defaultHeight: 16,
    isSolid: true,
    canPass: false,
    color: "#ffffff",
  },
  {
    type: "storage-cabinet",
    name: "Storage Cabinet",
    category: "Facilities",
    icon: "🗄️",
    description: "Lockable office cabinet and employee lockers",
    defaultWidth: 36,
    defaultHeight: 24,
    isSolid: true,
    canPass: false,
    color: "#64748b",
  },

  // --- Decoration ---
  {
    type: "potted-plant",
    name: "Potted Plant",
    category: "Decoration",
    icon: "🪴",
    description: "Ceramic potted monstera indoor plant",
    defaultWidth: 22,
    defaultHeight: 22,
    isSolid: false,
    canPass: true,
    color: "#10b981",
  },
  {
    type: "floor-palm",
    name: "Floor Palm",
    category: "Decoration",
    icon: "🌿",
    description: "Tall decorative office floor palm tree",
    defaultWidth: 26,
    defaultHeight: 26,
    isSolid: false,
    canPass: true,
    color: "#059669",
  },
  {
    type: "standing-lamp",
    name: "Standing Lamp",
    category: "Decoration",
    icon: "💡",
    description: "Minimalist warm office floor lamp",
    defaultWidth: 20,
    defaultHeight: 20,
    isSolid: false,
    canPass: true,
    color: "#fbbf24",
  },
  {
    type: "accent-rug",
    name: "Office Area Rug",
    category: "Decoration",
    icon: "🧶",
    description: "Modern geometric floor rug for lounge zones",
    defaultWidth: 72,
    defaultHeight: 48,
    isSolid: false,
    canPass: true,
    color: "#e0e7ff",
  },
];

/**
 * Creates a new structured office object from a template
 */
export function createPlacedObject(template, x = 50, y = 50) {
  const uniqueId = `block-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  return {
    id: uniqueId,
    type: template.type,
    name: template.name,
    category: template.category,
    icon: template.icon,
    x: Math.round(x),
    y: Math.round(y),
    width: template.defaultWidth,
    height: template.defaultHeight,
    rotation: 0,
    isSolid: template.isSolid ?? true,
    canPass: template.canPass ?? false,
    color: template.color || "#cbd5e1",
    custom: true,
  };
}

/**
 * generateBuildingBlockLayoutJson
 * Collects the latest state of all objects placed on the canvas and formats
 * into the required JSON structure:
 * {
 *   "organizationId": string,
 *   "officeLayout": {
 *     "version": 1,
 *     "objects": [
 *       {
 *         "id": string,
 *         "type": string,
 *         "position": { "x": number, "y": number },
 *         "rotation": number,
 *         "width": number,
 *         "height": number
 *       }
 *     ]
 *   }
 * }
 */
export function generateBuildingBlockLayoutJson(layout, organizationId) {
  const objects = [];
  const seenIds = new Set();

  if (layout && typeof layout === "object") {
    const entries = Array.isArray(layout.objects)
      ? layout.objects.map((obj) => [obj.id, obj])
      : Object.entries(layout);

    for (const [key, item] of entries) {
      if (!item || typeof item !== "object") continue;

      const id = String(item.id || key || "").trim();
      // Skip empty or duplicate IDs
      if (!id || seenIds.has(id)) continue;
      // Skip temporary drag previews, ghost coordinates, or selection handles
      if (
        id.startsWith("temp-") ||
        id.startsWith("ghost-") ||
        id.startsWith("preview-") ||
        item.isGhost ||
        item.isHandle
      ) {
        continue;
      }

      seenIds.add(id);

      // Resolve block type
      let type = item.type;
      if (!type || typeof type !== "string") {
        if (id.startsWith("pod-")) type = "working-desk";
        else if (id.startsWith("aisle-p")) type = "plant";
        else if (id.startsWith("cafe-t")) type = "cafe-table";
        else if (id === "water-cooler") type = "water-dispenser";
        else if (id === "casual-nook") type = "sofa-lounge";
        else type = "building-block";
      }

      // Extract numeric positions strictly
      let x = 0;
      let y = 0;
      if (item.position && typeof item.position === "object") {
        x = typeof item.position.x === "number" ? item.position.x : Number(item.position.x) || 0;
        y = typeof item.position.y === "number" ? item.position.y : Number(item.position.y) || 0;
      } else {
        x = typeof item.x === "number" ? item.x : Number(item.x) || 0;
        y = typeof item.y === "number" ? item.y : Number(item.y) || 0;
      }

      const rotation = typeof item.rotation === "number" ? item.rotation : Number(item.rotation) || 0;
      const width = typeof item.width === "number" ? item.width : Number(item.width) || (item.custom ? 40 : 60);
      const height = typeof item.height === "number" ? item.height : Number(item.height) || (item.custom ? 20 : 30);

      objects.push({
        id,
        type: String(type),
        position: {
          x: Math.round(Number(x)),
          y: Math.round(Number(y)),
        },
        rotation: Math.round(Number(rotation)),
        width: Math.round(Number(width)),
        height: Math.round(Number(height)),
        ...(item.isSolid !== undefined ? { isSolid: Boolean(item.isSolid) } : {}),
        ...(item.canPass !== undefined ? { canPass: Boolean(item.canPass) } : {}),
        ...(item.name ? { name: String(item.name) } : {}),
        ...(item.custom ? { custom: true } : {}),
      });
    }
  }

  return {
    organizationId: String(organizationId || ""),
    officeLayout: {
      version: 1,
      objects,
    },
  };
}
