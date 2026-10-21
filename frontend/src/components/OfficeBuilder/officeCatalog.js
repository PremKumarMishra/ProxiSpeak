/**
 * Office Building Blocks Catalog
 * Defines reusable objects for Virtual Office Builder with categories, dimensions,
 * collision properties, and visual representations.
 */

export const BUILDING_BLOCK_CATEGORIES = [
  "All",
  "Zones",
  "Furniture",
  "Architecture",
  "Facilities",
  "Decoration",
];

export const BUILDING_BLOCKS_CATALOG = [
  // --- Zones ---
  {
    type: "zone-meeting",
    name: "Meeting Room",
    category: "Zones",
    icon: "📊",
    description: "Configurable meeting space for standups, presentations & video calls",
    defaultWidth: 220,
    defaultHeight: 140,
    isSolid: false,
    canPass: true,
    color: "#8b5cf6",
  },
  {
    type: "zone-focus",
    name: "Focus Zone",
    category: "Zones",
    icon: "🎯",
    description: "Quiet area for heads-down, distraction-free deep work",
    defaultWidth: 170,
    defaultHeight: 140,
    isSolid: false,
    canPass: true,
    color: "#10b981",
  },
  {
    type: "zone-workspace",
    name: "Open Workspace",
    category: "Zones",
    icon: "💻",
    description: "Collaborative desk cluster zone for everyday teamwork",
    defaultWidth: 320,
    defaultHeight: 180,
    isSolid: false,
    canPass: true,
    color: "#6366f1",
  },
  {
    type: "zone-lounge",
    name: "Collaboration Lounge",
    category: "Zones",
    icon: "☕",
    description: "Relaxed social zone for casual conversations and catchups",
    defaultWidth: 200,
    defaultHeight: 140,
    isSolid: false,
    canPass: true,
    color: "#a855f7",
  },
  {
    type: "zone-reception",
    name: "Reception",
    category: "Zones",
    icon: "🛎️",
    description: "Lobby entrance greeting area for visitors and team welcome",
    defaultWidth: 180,
    defaultHeight: 120,
    isSolid: false,
    canPass: true,
    color: "#f59e0b",
  },
  {
    type: "zone-breakout",
    name: "Cafeteria & Breakout",
    category: "Zones",
    icon: "💬",
    description: "Casual dining, coffee pantry & phone booth zone",
    defaultWidth: 220,
    defaultHeight: 130,
    isSolid: false,
    canPass: true,
    color: "#06b6d4",
  },
  {
    type: "zone-custom",
    name: "Custom Room",
    category: "Zones",
    icon: "🏷️",
    description: "Customizable room zone that you can name and resize freely",
    defaultWidth: 180,
    defaultHeight: 130,
    isSolid: false,
    canPass: true,
    color: "#3b82f6",
  },

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

// Legacy templates retained purely for backward-compatible fallback lookup of old saved IDs
const LEGACY_DEFAULT_TEMPLATES = {
  "pod-1": { type: "working-desk", name: "Working Desk Pod 1", width: 54, height: 44, isSolid: true, canPass: false, x: 16, y: 38 },
  "pod-2": { type: "working-desk", name: "Working Desk Pod 2", width: 54, height: 44, isSolid: true, canPass: false, x: 31, y: 38 },
  "pod-3": { type: "working-desk", name: "Working Desk Pod 3", width: 54, height: 44, isSolid: true, canPass: false, x: 47, y: 38 },
  "pod-4": { type: "working-desk", name: "Working Desk Pod 4", width: 54, height: 44, isSolid: true, canPass: false, x: 63, y: 38 },
  "pod-5": { type: "working-desk", name: "Working Desk Pod 5", width: 54, height: 44, isSolid: true, canPass: false, x: 16, y: 56 },
  "pod-6": { type: "working-desk", name: "Working Desk Pod 6", width: 54, height: 44, isSolid: true, canPass: false, x: 31, y: 56 },
  "pod-7": { type: "working-desk", name: "Working Desk Pod 7", width: 54, height: 44, isSolid: true, canPass: false, x: 47, y: 56 },
  "pod-8": { type: "working-desk", name: "Working Desk Pod 8", width: 54, height: 44, isSolid: true, canPass: false, x: 63, y: 56 },
  "aisle-p1": { type: "potted-plant", name: "Aisle Plant 1", width: 22, height: 22, isSolid: false, canPass: true, x: 24, y: 48 },
  "aisle-p2": { type: "potted-plant", name: "Aisle Plant 2", width: 22, height: 22, isSolid: false, canPass: true, x: 40, y: 48 },
  "aisle-p3": { type: "potted-plant", name: "Aisle Plant 3", width: 22, height: 22, isSolid: false, canPass: true, x: 56, y: 48 },
  "water-cooler": { type: "water-dispenser", name: "Water Cooler", width: 22, height: 26, isSolid: true, canPass: false, x: 89, y: 64 },
  "cafe-t1": { type: "coffee-table", name: "Cafe Table 1", width: 32, height: 32, isSolid: true, canPass: false, x: 34, y: 88 },
  "cafe-t2": { type: "coffee-table", name: "Cafe Table 2", width: 32, height: 32, isSolid: true, canPass: false, x: 48, y: 88 },
  "casual-nook": { type: "sofa", name: "Casual Nook Sofa", width: 68, height: 34, isSolid: true, canPass: false, x: 86, y: 86 },
};

// Canvas starts completely empty when an organization has no saved layout
export const DEFAULT_FURNITURE_LAYOUT = {
  "zone-meeting-1": {
    id: "zone-meeting-1",
    type: "zone-meeting",
    name: "Meeting Room 1",
    category: "Zones",
    icon: "📊",
    color: "#8b5cf6",
    x: 28,
    y: 20,
    width: 220,
    height: 140,
    rotation: 0,
    isSolid: false,
    canPass: true,
  },
  "zone-meeting-2": {
    id: "zone-meeting-2",
    type: "zone-meeting",
    name: "Meeting Room 2",
    category: "Zones",
    icon: "📽️",
    color: "#3b82f6",
    x: 55,
    y: 20,
    width: 200,
    height: 140,
    rotation: 0,
    isSolid: false,
    canPass: true,
  },
  "zone-lounge": {
    id: "zone-lounge",
    type: "zone-lounge",
    name: "Collaboration Lounge",
    category: "Zones",
    icon: "☕",
    color: "#a855f7",
    x: 82,
    y: 20,
    width: 220,
    height: 140,
    rotation: 0,
    isSolid: false,
    canPass: true,
  },
  "zone-workspace": {
    id: "zone-workspace",
    type: "zone-workspace",
    name: "Open Workspace",
    category: "Zones",
    icon: "💻",
    color: "#6366f1",
    x: 44,
    y: 56,
    width: 440,
    height: 190,
    rotation: 0,
    isSolid: false,
    canPass: true,
  },
  "zone-focus": {
    id: "zone-focus",
    type: "zone-focus",
    name: "Focus Zone",
    category: "Zones",
    icon: "🎯",
    color: "#10b981",
    x: 87,
    y: 56,
    width: 170,
    height: 190,
    rotation: 0,
    isSolid: false,
    canPass: true,
  },
  "table-conf-1": {
    id: "table-conf-1",
    type: "meeting-table",
    name: "Conference Table 1",
    category: "Furniture",
    icon: "📊",
    color: "#e2e8f0",
    x: 28,
    y: 20,
    width: 104,
    height: 48,
    rotation: 0,
    isSolid: true,
    canPass: false,
  },
  "table-conf-2": {
    id: "table-conf-2",
    type: "meeting-table",
    name: "Conference Table 2",
    category: "Furniture",
    icon: "📊",
    color: "#e2e8f0",
    x: 55,
    y: 20,
    width: 104,
    height: 48,
    rotation: 0,
    isSolid: true,
    canPass: false,
  },
  "lounge-sofa-1": {
    id: "lounge-sofa-1",
    type: "sofa",
    name: "Lounge Sofa",
    category: "Furniture",
    icon: "🛋️",
    color: "#f3e8ff",
    x: 82,
    y: 19,
    width: 68,
    height: 34,
    rotation: 0,
    isSolid: true,
    canPass: false,
  },
  "desk-pod-1": {
    id: "desk-pod-1",
    type: "working-desk",
    name: "Desk Pod 1",
    category: "Furniture",
    icon: "🖥️",
    color: "#fef3c7",
    x: 32,
    y: 50,
    width: 54,
    height: 44,
    rotation: 0,
    isSolid: true,
    canPass: false,
  },
  "desk-pod-2": {
    id: "desk-pod-2",
    type: "working-desk",
    name: "Desk Pod 2",
    category: "Furniture",
    icon: "🖥️",
    color: "#fef3c7",
    x: 54,
    y: 50,
    width: 54,
    height: 44,
    rotation: 0,
    isSolid: true,
    canPass: false,
  },
  "desk-pod-3": {
    id: "desk-pod-3",
    type: "working-desk",
    name: "Desk Pod 3",
    category: "Furniture",
    icon: "🖥️",
    color: "#fef3c7",
    x: 32,
    y: 63,
    width: 54,
    height: 44,
    rotation: 0,
    isSolid: true,
    canPass: false,
  },
  "desk-pod-4": {
    id: "desk-pod-4",
    type: "working-desk",
    name: "Desk Pod 4",
    category: "Furniture",
    icon: "🖥️",
    color: "#fef3c7",
    x: 54,
    y: 63,
    width: 54,
    height: 44,
    rotation: 0,
    isSolid: true,
    canPass: false,
  },
  "focus-desk-1": {
    id: "focus-desk-1",
    type: "single-desk",
    name: "Focus Desk 1",
    category: "Furniture",
    icon: "💻",
    color: "#f1f5f9",
    x: 87,
    y: 50,
    width: 38,
    height: 32,
    rotation: 0,
    isSolid: true,
    canPass: false,
  },
  "focus-desk-2": {
    id: "focus-desk-2",
    type: "single-desk",
    name: "Focus Desk 2",
    category: "Furniture",
    icon: "💻",
    color: "#f1f5f9",
    x: 87,
    y: 63,
    width: 38,
    height: 32,
    rotation: 0,
    isSolid: true,
    canPass: false,
  },
};

/**
 * Normalizes any office block object into the uniform schema:
 * - id: string
 * - type: string
 * - position: { x: number, y: number }
 * - rotation: number
 * - width: number
 * - height: number
 * - isSolid: boolean
 * - canPass: boolean
 * - name: string
 */
export function normalizeBuildingBlockObject(item, fallbackId) {
  if (!item || typeof item !== "object") return null;

  const id = String(
    item.id ||
      fallbackId ||
      `block-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  ).trim();

  // Backward-compatibility lookup for legacy default IDs
  const legacyDef = LEGACY_DEFAULT_TEMPLATES[id];

  // Resolve type
  let type = item.type;
  if (!type || typeof type !== "string") {
    if (legacyDef?.type) type = legacyDef.type;
    else if (id.startsWith("pod-")) type = "working-desk";
    else if (id.startsWith("aisle-p")) type = "potted-plant";
    else if (id.startsWith("cafe-t")) type = "coffee-table";
    else if (id === "water-cooler") type = "water-dispenser";
    else if (id === "casual-nook") type = "sofa";
    else type = "working-desk";
  }

  // Find template from catalog for standard defaults
  const catalogTemplate = BUILDING_BLOCKS_CATALOG.find((b) => b.type === type);

  // Resolve name
  let name = item.name;
  if (!name || typeof name !== "string") {
    if (legacyDef?.name) {
      name = legacyDef.name;
    } else if (id.startsWith("pod-")) {
      const num = id.replace("pod-", "");
      name = `Working Desk Pod ${num}`;
    } else if (id.startsWith("aisle-p")) {
      const num = id.replace("aisle-p", "");
      name = `Aisle Plant ${num}`;
    } else if (id === "water-cooler") {
      name = "Water Cooler";
    } else if (id.startsWith("cafe-t")) {
      const num = id.replace("cafe-t", "");
      name = `Cafe Table ${num}`;
    } else if (id === "casual-nook") {
      name = "Casual Nook Sofa";
    } else {
      name = catalogTemplate?.name || "Office Object";
    }
  }

  // Resolve position coordinates
  let x = legacyDef?.x ?? 50;
  let y = legacyDef?.y ?? 50;
  if (item.position && typeof item.position === "object") {
    const px = typeof item.position.x === "number" ? item.position.x : Number(item.position.x);
    const py = typeof item.position.y === "number" ? item.position.y : Number(item.position.y);
    if (!isNaN(px)) x = px;
    if (!isNaN(py)) y = py;
  } else {
    const px = typeof item.x === "number" ? item.x : Number(item.x);
    const py = typeof item.y === "number" ? item.y : Number(item.y);
    if (!isNaN(px)) x = px;
    if (!isNaN(py)) y = py;
  }

  // Resolve rotation
  let rotation = 0;
  if (item.rotation !== undefined && item.rotation !== null) {
    const rot = typeof item.rotation === "number" ? item.rotation : Number(item.rotation);
    if (!isNaN(rot)) rotation = rot;
  }
  rotation = ((Math.round(rotation) % 360) + 360) % 360;

  // Resolve dimensions
  const defaultW = legacyDef?.width ?? catalogTemplate?.defaultWidth ?? 54;
  const defaultH = legacyDef?.height ?? catalogTemplate?.defaultHeight ?? 44;
  let width = defaultW;
  if (item.width !== undefined && item.width !== null) {
    const w = typeof item.width === "number" ? item.width : Number(item.width);
    if (!isNaN(w) && w > 0) width = w;
  }
  let height = defaultH;
  if (item.height !== undefined && item.height !== null) {
    const h = typeof item.height === "number" ? item.height : Number(item.height);
    if (!isNaN(h) && h > 0) height = h;
  }

  // Resolve isSolid & canPass
  let isSolid;
  if (typeof item.isSolid === "boolean") {
    isSolid = item.isSolid;
  } else if (typeof item.canPass === "boolean") {
    isSolid = !item.canPass;
  } else if (legacyDef && typeof legacyDef.isSolid === "boolean") {
    isSolid = legacyDef.isSolid;
  } else if (catalogTemplate && typeof catalogTemplate.isSolid === "boolean") {
    isSolid = catalogTemplate.isSolid;
  } else {
    isSolid = !(type.startsWith("zone-") || type === "door" || type === "entrance-gate" || type === "office-chair" || type === "potted-plant" || type === "floor-palm" || type === "standing-lamp" || type === "accent-rug");
  }

  let canPass;
  if (typeof item.canPass === "boolean") {
    canPass = item.canPass;
  } else if (legacyDef && typeof legacyDef.canPass === "boolean") {
    canPass = legacyDef.canPass;
  } else {
    canPass = !isSolid;
  }

  return {
    id: String(id),
    type: String(type),
    position: {
      x: Math.round(Number(x)),
      y: Math.round(Number(y)),
    },
    rotation: Math.round(Number(rotation)),
    width: Math.round(Number(width)),
    height: Math.round(Number(height)),
    isSolid: Boolean(isSolid),
    canPass: Boolean(canPass),
    name: String(name),
  };
}

/**
 * Creates a new structured office object from a catalog template
 */
export function createPlacedObject(template, x = 50, y = 50) {
  const uniqueId = `block-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const normalized = normalizeBuildingBlockObject(
    {
      id: uniqueId,
      type: template.type,
      name: template.name,
      x: Math.round(x),
      y: Math.round(y),
      position: { x: Math.round(x), y: Math.round(y) },
      width: template.defaultWidth,
      height: template.defaultHeight,
      rotation: 0,
      isSolid: template.isSolid ?? true,
      canPass: template.canPass ?? false,
    },
    uniqueId
  );

  return {
    ...normalized,
    category: template.category,
    icon: template.icon,
    color: template.color || "#cbd5e1",
    x: normalized.position.x,
    y: normalized.position.y,
  };
}

/**
 * generateBuildingBlockLayoutJson
 * Collects the latest state of all objects placed on the canvas and formats
 * into the required JSON structure where EVERY object adheres strictly to the uniform schema:
 * - id: string
 * - type: string
 * - position: { x: number, y: number }
 * - rotation: number
 * - width: number
 * - height: number
 * - isSolid: boolean
 * - canPass: boolean
 * - name: string
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

      const rawId = String(item.id || key || "").trim();
      // Skip empty or duplicate IDs
      if (!rawId || seenIds.has(rawId)) continue;
      // Skip temporary drag previews, ghost coordinates, or selection handles
      if (
        rawId.startsWith("temp-") ||
        rawId.startsWith("ghost-") ||
        rawId.startsWith("preview-") ||
        item.isGhost ||
        item.isHandle
      ) {
        continue;
      }

      const normalized = normalizeBuildingBlockObject(item, rawId);
      if (normalized) {
        seenIds.add(normalized.id);
        objects.push({
          id: normalized.id,
          type: normalized.type,
          name: normalized.name,
          position: {
            x: normalized.position.x,
            y: normalized.position.y,
          },
          rotation: normalized.rotation,
          width: normalized.width,
          height: normalized.height,
          isSolid: normalized.isSolid,
          canPass: normalized.canPass,
          ...(item.category || normalized.category ? { category: item.category || normalized.category } : {}),
          ...(item.icon || normalized.icon ? { icon: item.icon || normalized.icon } : {}),
          ...(item.color || normalized.color ? { color: item.color || normalized.color } : {}),
        });
      }
    }
  }

  return {
    organizationId: String(organizationId || ""),
    version: 1,
    updatedAt: new Date().toISOString(),
    officeLayout: {
      version: 1,
      objects,
    },
  };
}
