/**
 * officeLayoutStorage.js
 * Frontend localStorage persistence service for ProxiSpeak Virtual Office layout JSON.
 *
 * Requirements:
 * - Scoped per-organization with a versioned stable key: `proxispeak_office_layout_v1_<organizationId>`
 * - Persists full layout JSON (object IDs, types, coordinates, dimensions, rotation, collision properties)
 * - Safe error handling: falls back to default layout on corrupt or missing JSON without crashing
 * - Separate storage per organization: editing one office never overwrites another
 * - Pure frontend implementation without backend API calls
 */

import {
  generateBuildingBlockLayoutJson,
  normalizeBuildingBlockObject,
  DEFAULT_FURNITURE_LAYOUT,
} from "../components/OfficeBuilder/officeCatalog.js";

export const OFFICE_LAYOUT_STORAGE_VERSION = "v1";
export const OFFICE_LAYOUT_STORAGE_PREFIX = `proxispeak_office_layout_${OFFICE_LAYOUT_STORAGE_VERSION}_`;

/**
 * Returns the versioned localStorage key for a specific organization.
 * Example: `proxispeak_office_layout_v1_org_abc123`
 */
export function getOfficeLayoutStorageKey(organizationId) {
  const cleanOrgId = String(organizationId || "default").trim();
  return `${OFFICE_LAYOUT_STORAGE_PREFIX}${cleanOrgId}`;
}

/**
 * Normalizes any layout representation (payload JSON, objects array, or dictionary map)
 * into a dictionary map `{ [id]: object }` required by the canvas editor.
 */
export function normalizeLayoutToMap(input) {
  if (!input) return {};

  let objectsList = [];
  if (Array.isArray(input)) {
    objectsList = input;
  } else if (input.officeLayout && Array.isArray(input.officeLayout.objects)) {
    objectsList = input.officeLayout.objects;
  } else if (Array.isArray(input.objects)) {
    objectsList = input.objects;
  } else if (typeof input === "object") {
    // If it's already an id-mapped dictionary
    objectsList = Object.entries(input)
      .filter(([k, v]) => v && typeof v === "object" && k !== "version" && k !== "objects" && k !== "officeLayout")
      .map(([k, v]) => ({ id: k, ...v }));
  }

  if (objectsList.length === 0) {
    return {};
  }

  const map = {};
  for (const rawObj of objectsList) {
    if (!rawObj || typeof rawObj !== "object") continue;
    const normalized = normalizeBuildingBlockObject(rawObj, rawObj.id);
    if (normalized) {
      map[normalized.id] = {
        ...rawObj,
        ...normalized,
        x: normalized.position.x,
        y: normalized.position.y,
        color: rawObj.color || normalized.color,
        icon: rawObj.icon || normalized.icon,
        category: rawObj.category || normalized.category,
      };
    }
  }
  return map;
}

/**
 * Loads the layout JSON for a given organization from localStorage.
 * Handles missing or invalid JSON safely and returns a normalized layout map.
 *
 * @param {string} organizationId - Unique organization identifier
 * @param {Object} fallbackLayout - Optional fallback layout (defaults to DEFAULT_FURNITURE_LAYOUT)
 * @returns {Object} Normalized layout map `{ [id]: object }`
 */
export function loadOfficeLayout(organizationId, fallbackLayout = DEFAULT_FURNITURE_LAYOUT) {
  if (!organizationId) {
    return fallbackLayout || {};
  }

  const key = getOfficeLayoutStorageKey(organizationId);

  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      // Check legacy keys for backward-compatibility fallback
      const legacyRaw =
        localStorage.getItem(`proxispeak-office-layout-json-${organizationId}`) ||
        localStorage.getItem(`proxispeak-office-layout-${organizationId}`);
      if (legacyRaw) {
        try {
          const legacyParsed = JSON.parse(legacyRaw);
          return normalizeLayoutToMap(legacyParsed);
        } catch {
          return fallbackLayout || {};
        }
      }
      return fallbackLayout || {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      console.warn(`[OfficeLayout] Stored data for key "${key}" is not a valid object, falling back to default.`);
      return fallbackLayout || {};
    }

    const normalized = normalizeLayoutToMap(parsed);
    return normalized || fallbackLayout || {};
  } catch (err) {
    console.warn(`[OfficeLayout] Failed to parse layout JSON for key "${key}", falling back safely:`, err.message);
    return fallbackLayout || {};
  }
}

/**
 * Saves the current layout data for an organization into browser localStorage.
 * Formats the layout into canonical versioned JSON compatible with future backend persistence.
 *
 * @param {string} organizationId - Unique organization identifier
 * @param {Object} layout - Layout object or dictionary map
 * @returns {Object|null} The saved layout payload, or null if save failed
 */
export function saveOfficeLayout(organizationId, layout) {
  if (!organizationId) {
    console.warn("[OfficeLayout] Missing organizationId for saveOfficeLayout.");
    return null;
  }

  const key = getOfficeLayoutStorageKey(organizationId);

  try {
    // Generate canonical building-block layout payload adhering strictly to schema
    const payload = generateBuildingBlockLayoutJson(layout, organizationId);
    const jsonString = JSON.stringify(payload);

    localStorage.setItem(key, jsonString);

    // Keep legacy localStorage keys updated for backward-compatibility with other modules
    try {
      localStorage.setItem(`proxispeak-office-layout-${organizationId}`, JSON.stringify(layout));
      localStorage.setItem(`proxispeak-office-layout-json-${organizationId}`, jsonString);
    } catch {
      // Ignore quota warnings on secondary legacy copies
    }

    return payload;
  } catch (err) {
    console.error(`[OfficeLayout] Failed to save layout JSON to localStorage for key "${key}":`, err);
    return null;
  }
}

/**
 * Retrieves the raw layout JSON string from localStorage for an organization.
 * Useful for debugging, export, and automated unit testing.
 *
 * @param {string} organizationId - Unique organization identifier
 * @returns {string|null} Raw JSON string or null
 */
export function getOfficeLayoutRawJson(organizationId) {
  if (!organizationId) return null;
  const key = getOfficeLayoutStorageKey(organizationId);
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Removes the saved layout for an organization from localStorage.
 *
 * @param {string} organizationId - Unique organization identifier
 */
export function clearOfficeLayout(organizationId) {
  if (!organizationId) return;
  const key = getOfficeLayoutStorageKey(organizationId);
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(`proxispeak-office-layout-${organizationId}`);
    localStorage.removeItem(`proxispeak-office-layout-json-${organizationId}`);
  } catch {}
}
