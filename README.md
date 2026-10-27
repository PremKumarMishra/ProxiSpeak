# ProxiSpeak
ProxiSpeak is a real-time geospatial audio meeting room system that enables proximity-based voice conversations on a 2D interactive canvas. Users can move their avatars across a virtual venue layout, and dynamically hear other participants using WebRTC peer-to-peer audio connections combined with spatial attenuation (volume cross-fading and stereo panning).
---
## Backend

### 1. Firebase Authentication Integration
- **Google Sign-In & Token Verification:** Integrated Firebase Authentication (using the Firebase Admin SDK on the backend) to verify Firebase ID tokens passed from the frontend[cite: 1].
- **Auto-Provisioning (Upsert Pattern):** Streamlined user onboarding. A single protected profile endpoint automatically creates or syncs the user's MongoDB document upon first login using claims from their Firebase token[cite: 3].
- **Profile Picture Support:** Captures and stores the user's profile picture URL (`avatar_url`) directly in MongoDB for instant rendering on the 2D canvas avatars[cite: 1, 3].

### 2. Backend Architecture & Core APIs
    Protected routes require a valid authorization token handled by the `protect` middleware.

#### User Profile (`/api/profile`)
- **`POST /api/profile`**
  - **Middleware:** `protect`, `getUserProfile`
  - **Description:** Retrieves or initializes the authenticated user's profile details.
- **`PUT /api/profile`**
  - **Middleware:** `protect`, `updateUserProfile`
  - **Description:** Updates the authenticated user's profile information (e.g., display name, avatar, status).

#### Organizations (`/api/organizations`)
- **`POST /api/organizations`**
  - **Middleware:** `protect`, `createOrganization`
  - **Description:** Creates a new organization workspace managed by the authenticated user.
- **`GET /api/organizations`**
  - **Middleware:** `protect`, `getMyOrganizations`
  - **Description:** Fetches all organizations associated with the authenticated user.

#### Activities ('/api/activities')
- **`POST api/activities`**
    - **Middleware:** `protect`, `addUserActivity`
    - **Description:** Adds a new workspace activity from the authenticated user workspace in the database.
- **`GET api/activities`**
    - **Middleware:** `protect`, `addUserActivity`
    - **Description:** Fetches all workspace activities associated with the authenticated user.

### 3. Real-Time Signaling & WebSocket Events (Socket.io)
The server integrates a Socket.io signaling engine wrapped around the Node.js HTTP server to handle real-time room presence, geospatial user positioning, WebRTC peer audio handshakes, and layout synchronization.

#### Room Management & Presence
- **`room:join`**
  - **Payload:** `{ organizationId, userId, user, x, y }`
  - **Description:** Adds the socket to an organization room, updates in-memory tracking and MongoDB geospatial records, returns existing peers (`room:current-users`), and broadcasts `room:user-joined` along with initial proximity results (`proximity:nearby-users`).
- **`room:leave`**
  - **Payload:** `{ organizationId, userId }`
  - **Description:** Removes the user from the room state and broadcasts `room:user-left` to other room participants.

#### Spatial Coordinates & Proximity
- **`user:move`**
  - **Payload:** `{ organizationId, userId, x, y, name, avatar }`
  - **Description:** Updates avatar coordinates, broadcasts `user:moved` to peers, updates the MongoDB `UserPosition` collection, and queries nearby users using geospatial `$near` queries ($maxDistance: 100$).
- **`query:nearby`**
  - **Payload:** `{ organizationId, x, y, maxDistance }`
  - **Description:** Executes a geospatial query to locate peer avatars within earshot distance and returns `query:nearby-result`.

#### Communication & Media
- **`user:chat`**
  - **Payload:** `{ organizationId, sender, msg, zone, timestamp }`
  - **Description:** Broadcasts workspace chat messages to all peers within the organization room.
- **`mic-status`**
  - **Payload:** `{ organizationId, sender, isMuted, isSpeaking }`
  - **Description:** Updates and relays microphone mute and speaking status changes to room participants.

#### Layout & WebRTC Signaling
- **`office:layout-update`**
  - **Payload:** `{ organizationId, officeLayout }`
  - **Description:** Relays real-time office floor plan and furniture adjustments across room participants (`office:layout-updated`).
- **`webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate`**
  - **Payload:** `{ to, offer / answer / candidate, ... }`
  - **Description:** Relays WebRTC signaling packets between peers to establish direct peer-to-peer audio connections.