/**
 * Office Collision & Navigation Service
 * Calculates collision detection between avatar position and solid office elements
 * (desks, conference tables, walls, room partitions, facilities).
 * Allows passage through doors, entrance gates, rugs, and open walking paths.
 */

// Approximate floor dimensions in pixels for coordinate conversion
const BASE_FLOOR_WIDTH = 1000;
const BASE_FLOOR_HEIGHT = 590;

// Avatar collision radius in floor percentage
const AVATAR_COLLISION_RADIUS = 1.6;

/**
 * Checks if a given coordinate (x, y) collides with any solid obstacle or boundary.
 *
 * @param {number} x - Target X coordinate (0-100 percentage)
 * @param {number} y - Target Y coordinate (0-100 percentage)
 * @param {Object} furnitureLayout - Layout object containing placed objects & default furniture
 * @returns {boolean} - true if blocked, false if walkable
 */
export function isPositionBlocked(x, y, furnitureLayout = {}) {
  // 1. Boundary checking (Outer walls with entrance cutout)
  // Left entrance doorway cutout is around Y: 12% - 26%
  const isNearEntranceDoorway = y >= 12 && y <= 26;

  if (isNearEntranceDoorway) {
    if (x < 2 || x > 96 || y < 4 || y > 94) return true;
  } else {
    if (x < 4.2 || x > 96 || y < 5.8 || y > 94.2) return true;
  }

  // 2. Check placed items in layout
  for (const [id, item] of Object.entries(furnitureLayout)) {
    if (!item) continue;

    // Items explicitly marked passable or not solid allow avatars to walk through
    if (item.canPass || item.isSolid === false) {
      continue;
    }

    // Passable decorative items (small plants, rugs, chairs, doors)
    if (
      item.type === "door" ||
      item.type === "entrance-gate" ||
      item.type === "office-chair" ||
      item.type === "potted-plant" ||
      item.type === "floor-palm" ||
      item.type === "standing-lamp" ||
      item.type === "accent-rug" ||
      id.startsWith("aisle-p")
    ) {
      continue;
    }

    // Default Pod Desk Clusters
    if (id.startsWith("pod-")) {
      const podX = item.x ?? 50;
      const podY = item.y ?? 50;
      const halfW = 2.6; // approx 52px / 1000 * 50
      const halfH = 3.6; // approx 44px / 590 * 50

      if (
        x >= podX - halfW - AVATAR_COLLISION_RADIUS &&
        x <= podX + halfW + AVATAR_COLLISION_RADIUS &&
        y >= podY - halfH - AVATAR_COLLISION_RADIUS &&
        y <= podY + halfH + AVATAR_COLLISION_RADIUS
      ) {
        return true;
      }
      continue;
    }

    // Custom placed solid furniture / walls
    if (item.isSolid) {
      const itemX = item.x;
      const itemY = item.y;
      const widthPx = item.width || 40;
      const heightPx = item.height || 20;

      let halfW = ((widthPx / BASE_FLOOR_WIDTH) * 100) / 2;
      let halfH = ((heightPx / BASE_FLOOR_HEIGHT) * 100) / 2;

      // Swap width/height if rotated 90 or 270 degrees
      const rot = (item.rotation || 0) % 360;
      if (rot === 90 || rot === 270) {
        const tmp = halfW;
        halfW = halfH;
        halfH = tmp;
      }

      if (
        x >= itemX - halfW - AVATAR_COLLISION_RADIUS &&
        x <= itemX + halfW + AVATAR_COLLISION_RADIUS &&
        y >= itemY - halfH - AVATAR_COLLISION_RADIUS &&
        y <= itemY + halfH + AVATAR_COLLISION_RADIUS
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Finds the nearest walkable position if target is blocked, or returns target if clear.
 */
export function getSafePosition(targetX, targetY, currentX, currentY, furnitureLayout) {
  if (!isPositionBlocked(targetX, targetY, furnitureLayout)) {
    return { x: targetX, y: targetY };
  }

  // If directly blocked, check step increments back toward current position
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const factor = 1 - i / steps;
    const testX = Math.round(currentX + (targetX - currentX) * factor);
    const testY = Math.round(currentY + (targetY - currentY) * factor);
    if (!isPositionBlocked(testX, testY, furnitureLayout)) {
      return { x: testX, y: testY };
    }
  }

  // Fallback to current position if completely blocked
  return { x: currentX, y: currentY };
}
