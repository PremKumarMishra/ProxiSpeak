import { getSocket } from "./socket";

// Throttling configuration
const MIN_SEND_INTERVAL_MS = 50; // Max 20 updates/second to avoid excessive network traffic
const POSITION_DIFF_THRESHOLD = 0.1; // Ignore movements smaller than this threshold

let lastSentPosition = { x: null, y: null };
let lastSentTime = 0;
let pendingPositionPayload = null;
let trailingTimer = null;
let rafId = null;

const positionListeners = new Set();
const userLeftListeners = new Set();
const userJoinedListeners = new Set();

let socketSubscribed = false;

function arePositionsEqual(p1, p2) {
  if (!p1 || !p2 || p1.x == null || p2.x == null) return false;
  return (
    Math.abs(p1.x - p2.x) < POSITION_DIFF_THRESHOLD &&
    Math.abs(p1.y - p2.y) < POSITION_DIFF_THRESHOLD
  );
}

function flushPosition() {
  if (!pendingPositionPayload) return;

  const { x, y } = pendingPositionPayload;
  if (arePositionsEqual({ x, y }, lastSentPosition)) {
    pendingPositionPayload = null;
    return;
  }

  const socket = getSocket();
  if (socket && socket.connected) {
    socket.emit("user:move", pendingPositionPayload);
    lastSentPosition = { x, y };
    lastSentTime = performance.now();
  }

  pendingPositionPayload = null;
}

function scheduleFlush() {
  if (rafId) return;

  rafId = requestAnimationFrame(() => {
    rafId = null;
    const now = performance.now();
    const elapsed = now - lastSentTime;

    if (elapsed >= MIN_SEND_INTERVAL_MS) {
      flushPosition();
    } else {
      // Schedule trailing timeout for the remainder of the throttle window
      clearTimeout(trailingTimer);
      trailingTimer = setTimeout(() => {
        flushPosition();
      }, MIN_SEND_INTERVAL_MS - elapsed);
    }
  });
}

/**
 * Broadcast current user's avatar position to the backend with throttling and deduplication.
 * @param {Object} params
 * @param {string} params.organizationId - Room / Organization ID
 * @param {string} params.userId - Current user's unique ID
 * @param {number} params.x - Avatar X coordinate (percentage 0-100)
 * @param {number} params.y - Avatar Y coordinate (percentage 0-100)
 * @param {string} [params.name] - Display name
 * @param {string} [params.avatar] - Avatar emoji or image url
 */
export function broadcastPosition({ organizationId, userId, x, y, name, avatar }) {
  if (!organizationId || !userId || x == null || y == null) {
    return;
  }

  // Deduplication: if the requested position is identical to what's already queued/sent, skip
  if (
    arePositionsEqual({ x, y }, lastSentPosition) &&
    (!pendingPositionPayload || arePositionsEqual({ x, y }, pendingPositionPayload))
  ) {
    return;
  }

  pendingPositionPayload = {
    organizationId: String(organizationId),
    userId: String(userId),
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    name,
    avatar,
  };

  scheduleFlush();
}

/**
 * Initializes socket listeners for peer movements and user status.
 */
function ensureSocketListeners() {
  if (socketSubscribed) return;
  const socket = getSocket();

  socket.on("user:moved", (data) => {
    // Notify all position listeners
    positionListeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error("[PositionBroadcaster] Error in position listener:", err);
      }
    });
  });

  socket.on("user:left", (data) => {
    userLeftListeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error("[PositionBroadcaster] Error in user left listener:", err);
      }
    });
  });

  socket.on("player:disconnected", (data) => {
    userLeftListeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error("[PositionBroadcaster] Error in disconnect listener:", err);
      }
    });
  });

  socket.on("room:user-left", (data) => {
    userLeftListeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error("[PositionBroadcaster] Error in room user left listener:", err);
      }
    });
  });

  socket.on("room:user-joined", (data) => {
    userJoinedListeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error("[PositionBroadcaster] Error in user joined listener:", err);
      }
    });
  });

  socketSubscribed = true;
}

/**
 * Subscribes to real-time position updates and peer leaving events.
 * @param {Function} onPositionUpdate - Callback receiving `{ socketId, userId, organizationId, x, y, name, avatar }`
 * @param {Function} onUserLeft - Callback receiving `{ socketId, userId, organizationId }`
 * @param {Function} [onUserJoined] - Callback receiving `{ socketId, userId, user }`
 * @returns {Function} Unsubscribe function
 */
export function subscribeToRemotePositions(onPositionUpdate, onUserLeft, onUserJoined) {
  ensureSocketListeners();

  if (onPositionUpdate) positionListeners.add(onPositionUpdate);
  if (onUserLeft) userLeftListeners.add(onUserLeft);
  if (onUserJoined) userJoinedListeners.add(onUserJoined);

  return () => {
    if (onPositionUpdate) positionListeners.delete(onPositionUpdate);
    if (onUserLeft) userLeftListeners.delete(onUserLeft);
    if (onUserJoined) userJoinedListeners.delete(onUserJoined);
  };
}

/**
 * Resets broadcaster state (e.g. when changing rooms or exiting virtual office).
 */
export function resetBroadcaster() {
  clearTimeout(trailingTimer);
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  pendingPositionPayload = null;
  lastSentPosition = { x: null, y: null };
  lastSentTime = 0;
}
