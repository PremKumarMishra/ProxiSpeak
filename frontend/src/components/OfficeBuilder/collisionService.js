/**
 * Office Collision & Navigation Service
 * Calculates floor boundary detection for avatars.
 *
 * NOTE: Per ProxiSpeak specifications:
 * - Building blocks and furniture do NOT block avatar movement.
 * - Avatars can freely move through desks, sofas, meeting tables, walls, and all placed objects.
 * - Furniture and building-block collision restrictions are disabled.
 * - Sound barrier properties control proximity audio only, not movement or collision.
 */

// Floor perimeter bounds in percentage (0-100)
const MIN_X = 2;
const MAX_X = 96;
const MIN_Y = 4;
const MAX_Y = 94;

/**
 * Checks if a given coordinate (x, y) collides with floor boundaries.
 * Placed building blocks and furniture do NOT block avatar movement.
 *
 * @param {number} x - Target X coordinate (0-100 percentage)
 * @param {number} y - Target Y coordinate (0-100 percentage)
 * @param {Object} furnitureLayout - Layout object containing placed objects & default furniture
 * @returns {boolean} - true if blocked by floor boundary, false if walkable
 */
export function isPositionBlocked(x, y, furnitureLayout = {}) {
  // Boundary checking (keeps avatar within the office floor area)
  if (x < MIN_X || x > MAX_X || y < MIN_Y || y > MAX_Y) {
    return true;
  }

  // Building blocks and furniture must NOT be collidable.
  // Avatars can freely move through desks, sofas, meeting tables, walls, and all placed objects.
  return false;
}

/**
 * Finds the nearest walkable position if target is outside boundary, or returns target if clear.
 */
export function getSafePosition(targetX, targetY, currentX, currentY, furnitureLayout) {
  if (!isPositionBlocked(targetX, targetY, furnitureLayout)) {
    return { x: targetX, y: targetY };
  }

  // Clamp to valid walkable floor boundaries
  const clampedX = Math.max(MIN_X, Math.min(MAX_X, targetX));
  const clampedY = Math.max(MIN_Y, Math.min(MAX_Y, targetY));

  if (!isPositionBlocked(clampedX, clampedY, furnitureLayout)) {
    return { x: clampedX, y: clampedY };
  }

  return { x: currentX, y: currentY };
}
