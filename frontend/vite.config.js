import http from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const memoryUsers = new Map();
const memoryOrganizations = new Map();

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

async function handleApiRequest(req, res, next) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (!pathname.startsWith("/api/")) {
    if (next) return next();
    return sendJson(res, 404, { message: "Not found" });
  }

  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  // POST /api/profile
  if (req.method === "POST" && pathname === "/api/profile") {
    const body = await parseBody(req);
    const { uid, email, username, displayName, photoURL, jobTitle } = body;
    const key = uid || email || "default_user";
    const existing = memoryUsers.get(key) || {};
    const userRecord = {
      ...existing,
      uid: uid || existing.uid || `user_${Date.now()}`,
      email: email || existing.email || "",
      username: displayName || username || existing.username || "User",
      displayName: displayName || username || existing.displayName || "User",
      photoURL: photoURL ?? existing.photoURL ?? "",
      jobTitle: jobTitle ?? existing.jobTitle ?? "",
      updatedAt: new Date().toISOString(),
    };
    memoryUsers.set(key, userRecord);
    return sendJson(res, 200, { success: true, user: userRecord });
  }

  // PUT /api/profile
  if (req.method === "PUT" && pathname === "/api/profile") {
    const body = await parseBody(req);
    const { uid, email, username, displayName, jobTitle } = body;
    const newName = (displayName || username || "").trim();
    const key = uid || email || "default_user";
    const existing = memoryUsers.get(key) || {};
    const updatedUser = {
      ...existing,
      uid,
      email,
      username: newName || existing.username || "User",
      displayName: newName || existing.displayName || "User",
      jobTitle: jobTitle ?? existing.jobTitle ?? "",
      updatedAt: new Date().toISOString(),
    };
    memoryUsers.set(key, updatedUser);
    return sendJson(res, 200, { success: true, user: updatedUser });
  }

  // GET /api/organization
  if (
    req.method === "GET" &&
    (pathname === "/api/organization" || pathname === "/api/organizations")
  ) {
    return sendJson(res, 200, {
      success: true,
      organizations: Array.from(memoryOrganizations.values()),
    });
  }

  // POST /api/organization
  if (
    req.method === "POST" &&
    (pathname === "/api/organization" || pathname === "/api/organizations")
  ) {
    const body = await parseBody(req);
    const { name, type, code, ownerId, role, members } = body;
    if (!name || !String(name).trim()) {
      return sendJson(res, 400, { message: "Organization name is required" });
    }
    const inviteCode =
      code || Math.random().toString(36).substring(2, 8).toUpperCase();
    const newOrg = {
      id: Date.now(),
      name: String(name).trim(),
      type: type || "Company / Business",
      code: inviteCode,
      ownerId: ownerId || "owner",
      role: role || "Admin",
      members: Array.isArray(members) ? members : [],
      createdAt: new Date().toISOString(),
    };
    memoryOrganizations.set(String(newOrg.id), newOrg);
    return sendJson(res, 201, { success: true, organization: newOrg });
  }

  // POST /api/organization/join
  if (
    req.method === "POST" &&
    (pathname === "/api/organization/join" ||
      pathname === "/api/organizations/join")
  ) {
    const body = await parseBody(req);
    const { code } = body;
    if (!code) {
      return sendJson(res, 400, { message: "Invite code is required" });
    }
    const normalizedCode = String(code).trim().toUpperCase();
    const foundOrg = Array.from(memoryOrganizations.values()).find(
      (org) => org.code === normalizedCode
    );
    if (!foundOrg) {
      return sendJson(res, 404, {
        message: "Organization not found with this invite code",
      });
    }
    return sendJson(res, 200, { success: true, organization: foundOrg });
  }

  // DELETE /api/organization/:id
  if (
    req.method === "DELETE" &&
    (pathname.startsWith("/api/organization/") ||
      pathname.startsWith("/api/organizations/"))
  ) {
    const id = pathname.split("/").pop();
    memoryOrganizations.delete(String(id));
    return sendJson(res, 200, {
      success: true,
      message: "Organization removed",
    });
  }

  // POST /api/auth/logout
  if (req.method === "POST" && pathname === "/api/auth/logout") {
    return sendJson(res, 200, { success: true });
  }

  if (next) return next();
  return sendJson(res, 404, { message: "API route not found" });
}

function proxispeakApiPlugin() {
  let port5000Server = null;

  return {
    name: "proxispeak-api-plugin",
    configureServer(server) {
      // Handle /api/* on Vite dev server itself
      server.middlewares.use((req, res, next) => {
        handleApiRequest(req, res, next);
      });

      // Also listen on port 5000 in the host process if port 5000 is not already running
      if (!port5000Server) {
        const apiServer = http.createServer((req, res) => {
          handleApiRequest(req, res);
        });
        apiServer.on("error", () => {
          // Port 5000 is already in use by external backend server
        });
        apiServer.listen(5000, () => {
          port5000Server = apiServer;
        });
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), proxispeakApiPlugin()],
});
