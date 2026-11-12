import { io } from "socket.io-client";

let socket = null;
let currentRoomId = null;
let currentPayload = null;
let joinedRoomOnSocket = null;
const statusListeners = new Set();

function resolveSocketUrl() {
  const envUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_SERVER_URL;
  if (envUrl) {
    // If someone configured https://localhost, normalize to http://localhost
    // unless running on a non-local https domain
    if (envUrl.startsWith("https://localhost") || envUrl.startsWith("https://127.0.0.1")) {
      return envUrl.replace(/^https:/, "http:");
    }
    return envUrl;
  }
  return "http://localhost:5000";
}

export function notifyStatus(status, details = null) {
  statusListeners.forEach((listener) => {
    try {
      listener(status, details);
    } catch (err) {
      console.error("[Socket] Error in status listener:", err);
    }
  });
}

/**
 * Subscribe to socket connection status changes ('connected' | 'connecting' | 'disconnected' | 'reconnecting' | 'error')
 */
export function onSocketStatusChange(callback) {
  statusListeners.add(callback);
  if (socket?.connected) {
    callback("connected");
  } else if (socket) {
    callback("connecting");
  } else {
    callback("disconnected");
  }
  return () => {
    statusListeners.delete(callback);
  };
}

/**
 * Returns the current active Socket.IO instance or initializes a new one.
 */
export function getSocket() {
  if (socket) return socket;
  return connectSocket();
}


/**
 * Initializes and connects the Socket.IO client.
 */
export function connectSocket() {
  if (socket && (socket.connected || socket.connecting)) {
    return socket;
  }

  const socketUrl = resolveSocketUrl();
  console.log(`[Socket] Connecting to ${socketUrl}...`);
  notifyStatus("connecting");

  socket = io(socketUrl, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 15,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    withCredentials: true,
  });

  socket.on("connect", () => {
    console.log(`[Socket] Connected with ID: ${socket.id}`);
    notifyStatus("connected", { socketId: socket.id });
    joinedRoomOnSocket = null;

    // Join room exactly once upon connection/reconnection
    if (currentRoomId && currentPayload) {
      socket.emit("room:join", currentPayload);
      joinedRoomOnSocket = currentRoomId;
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[Socket] Disconnected: ${reason}`);
    joinedRoomOnSocket = null;
    notifyStatus("disconnected", { reason });
  });

  socket.on("connect_error", (error) => {
    console.warn(`[Socket] Connection error:`, error.message);
    notifyStatus("error", { error });
  });

  socket.io.on("reconnect_attempt", (attempt) => {
    notifyStatus("reconnecting", { attempt });
  });

  // Note: "connect" fires automatically after "reconnect", so we do not re-emit here.
  socket.io.on("reconnect", () => {
    console.log(`[Socket] Successfully reconnected.`);
  });

  return socket;
}

/**
 * Join an organization / virtual office room cleanly without duplicate emits.
 */
export function joinRoom(organizationId, userData = {}) {
  if (!organizationId) return;
  const s = getSocket();
  currentRoomId = String(organizationId);

  const payload = {
    organizationId: currentRoomId,
    userId: userData.uid || userData.id,
    user: userData,
  };
  currentPayload = payload;

  if (s.connected && joinedRoomOnSocket !== currentRoomId) {
    s.emit("room:join", payload);
    joinedRoomOnSocket = currentRoomId;
  }
}

/**
 * Leave an organization / virtual office room.
 */
export function leaveRoom(organizationId, userId = null) {
  const room = organizationId || currentRoomId;
  if (!room) return;

  if (socket && socket.connected) {
    socket.emit("room:leave", {
      organizationId: String(room),
      userId,
    });
  }

  if (currentRoomId === String(room)) {
    currentRoomId = null;
    currentPayload = null;
  }
  joinedRoomOnSocket = null;
}

/**
 * Disconnect socket completely (e.g. on logout or app teardown).
 */
export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    currentRoomId = null;
    notifyStatus("disconnected");
  }
}
