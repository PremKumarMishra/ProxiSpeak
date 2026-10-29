# ProxiSpeak — Geospatial Virtual Office & Spatial Audio Collaboration Platform

> **ProxiSpeak** is a high-performance, real-time virtual office platform that recreates the natural acoustics and spontaneous interactions of a physical workplace on an interactive 2D floor plan. Participants navigate their avatars across a customizable office canvas, hear nearby colleagues via peer-to-peer **WebRTC Mesh spatial audio** with acoustic cosine cross-fading, and collaborate via low-latency Socket.io messaging, backed by a dual-layer **Redis** caching and **MongoDB 2dsphere** geospatial engine.

---

## Table of Contents
1. [Platform Overview & Key Capabilities](#platform-overview--key-capabilities)
2. [High-Level Architecture](#high-level-architecture)
3. [Deep Dive: Core Architectural Pillars](#deep-dive-core-architectural-pillars)
   - [Pillar 1: Spatial Audio & WebRTC Mesh Engine](#pillar-1-spatial-audio--webrtc-mesh-engine)
   - [Pillar 2: Real-Time Coordinates & Socket Gateway](#pillar-2-real-time-coordinates--socket-gateway)
   - [Pillar 3: Redis High-Performance Cache & MongoDB Geospatial Indexing](#pillar-3-redis-high-performance-cache--mongodb-geospatial-indexing)
   - [Pillar 4: 2D Office Builder & AABB Collision Detection](#pillar-4-2d-office-builder--aabb-collision-detection)
   - [Pillar 5: Security, Authentication & Role-Based Access Control](#pillar-5-security-authentication--role-based-access-control)
4. [API & WebSocket Event Specification](#api--websocket-event-specification)
5. [Local Development & Environment Setup](#local-development--environment-setup)
6. [Master Interview Preparation Guide](#master-interview-preparation-guide)
   - [The Elevator Pitches (30s & 2min)](#the-elevator-pitches)
   - [22 Technical Interview Questions & Model Answers](#22-technical-interview-questions--model-answers)

---

## Platform Overview & Key Capabilities

- **Interactive 2D Floor Plan with Smooth Avatar Traversal:** Real-time pointer-driven avatar navigation with boundary clamping and sub-pixel smoothing.
- **Dynamic Office Layout Builder:** Drag-and-drop workspace designer with custom rooms, solid walls, passable doors, plants, and desk pods, with undo/redo history and persistent database synchronization.
- **AABB Collision Detection Engine:** Axis-Aligned Bounding Box collision system preventing avatars from walking through solid furniture while allowing seamless passage through doors, corridors, and rugs.
- **Peer-to-Peer WebRTC Mesh Spatial Audio:** Zero-server-bandwidth audio streaming between participants with W3C Perfect Negotiation to prevent offer/answer glare collisions.
- **Acoustic Cosine Cross-Fade ($cos(\frac{d}{R} \cdot \frac{\pi}{2})$):** Natural acoustic volume roll-off with strict 100m/pixel cutoff threshold ($Gain = 0$) preventing background sound leakage outside conversational distance.
- **Voice Activity Detection (VAD) & Hardware Mic Control:** Local Web Audio Analyser node detecting speech with 200ms hysteresis to eliminate rapid UI flickering, paired with physical WebRTC track disabling.
- **Dual-Layer Real-Time Geospatial Storage:** Sub-millisecond Redis position & query caching with MongoDB 2dsphere / 2D composite geospatial index fallbacks.
- **Enterprise Workspace Governance:** Google OAuth via Firebase Admin token verification, organization creation, invite code generation, and owner-only layout editing permissions.

---

## High-Level Architecture

```
+----------------------------------------------------------------------------------------------------+
|                                         PROXISPEAK CLIENT                                          |
|                                                                                                    |
|  [ React 18 + Vite ]          [ Web Audio API Graph ]             [ HTML5 2D Canvas / DOM Floor ]   |
|   - VirtualOffice Page         - MediaStreamAudioSourceNode         - Floor Scalable Container     |
|   - BuildingBlocksLibrary      - GainNode (Spatial Cross-Fade)      - Placed Objects & Rooms       |
|   - BuilderToolbar             - DynamicsCompressorNode             - Collision Service (AABB)     |
|   - ObjectPropertiesPanel      - AudioDestinationNode (Speakers)    - Smooth Avatar Drag Engine    |
+-------------------+----------------------------+-----------------------------------+---------------+
                    |                            |                                   |
           WebSockets (Socket.IO)         WebRTC Peer Mesh                    HTTPS REST Endpoints
                    |                     (Encrypted Audio)                          |
                    v                            v                                   v
+-------------------+----------------------------------------------------------------+---------------+
|                                      BACKEND APPLICATION LAYER                                     |
|                                                                                                    |
|  [ Express.js REST API Server ]                   [ Socket.IO Signaling & Dispatch Gateway ]       |
|   - /api/profile (Upsert & Fetch)                  - room:join / room:leave (Presence Engine)      |
|   - /api/organizations (CRUD & Layout)             - user:move (Position Broadcast & Near Query)  |
|   - /api/activities (Workspace Log)                - webrtc:offer / answer / ice (Signaling)       |
|   - Auth Middleware (Firebase Token Verifier)      - mic-status (Hardware Mute Relay)              |
+-------------------+----------------------------------------------------------------+---------------+
                    |                                                                |
                    v                                                                v
+-------------------+--------------------------------+   +---------------------------+---------------+
|                 REDIS CACHE LAYER                  |   |                MONGODB DATABASE           |
|                                                    |   |                                           |
|  - office:room:${orgId} (Presence Hash)            |   |  - users (Profile & Avatar Claims)        |
|  - office:positions:${orgId} (Live User State)     |   |  - organizations (Workspace Meta & Layout)|
|  - office:geo:near:... (Geospatial Query Cache)    |   |  - userpositions (2dsphere Spatial Index) |
|  - office:layout:${orgId} (Floor Plan Cache)       |   |  - activities (Workspace Audit Log)       |
+----------------------------------------------------+   +-------------------------------------------+
```

---

## Deep Dive: Core Architectural Pillars

### Pillar 1: Spatial Audio & WebRTC Mesh Engine
*Source Code: [frontend/src/services/spatialAudio.js](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/frontend/src/services/spatialAudio.js)*

#### 1. Why Mesh Topology?
For small-to-medium team clusters (2–12 concurrent speakers per zone), Mesh topology eliminates expensive media server infrastructure (SFU/MCU). Audio streams directly from peer to peer with absolute minimal latency (<50ms).

#### 2. Web Audio API Processing Pipeline
Rather than routing incoming WebRTC audio directly to an unmanaged HTML5 `<audio>` element, each remote peer's incoming audio track is tapped using the Web Audio API:
```
[ Remote MediaStream ] 
       │
       ▼
[ MediaStreamAudioSourceNode ] 
       │
       ▼
[ GainNode ] ─────────► Dynamic Spatial Gain: G = cos((distance / radius) * (π / 2))
       │
       ▼
[ DynamicsCompressorNode ] ──► Tames clipping & sudden acoustic peaks (-25dB threshold, 3:1 ratio)
       │
       ▼
[ AudioContext.destination ] ──► System Speakers / Headphones
```

#### 3. Acoustic Cosine Cross-Fade Model
Linear volume roll-off sounds unnatural to human ears because perceived loudness is logarithmic. ProxiSpeak implements a smooth quarter-cosine roll-off:
$$\text{Target Gain} = \begin{cases} \cos\left(\frac{d}{R} \cdot \frac{\pi}{2}\right) & \text{if } d \le R \text{ and } \neg \text{isMuted} \\[6pt] 0.0 & \text{if } d > R \text{ or } \text{isMuted} \end{cases}$$
- **At distance $d = 0$** (standing adjacent): $\cos(0) = 1.0$ (100% volume).
- **At distance $d = R/2$** (mid-range): $\cos(\pi/4) \approx 0.707$ (natural acoustic presence).
- **At distance $d = R$** (perimeter): $\cos(\pi/2) = 0.0$ (complete silence).
- **De-zippering:** Audio volume adjustments use `gainNode.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.04)` with an exponential time constant ($40\text{ms}$) to avoid audible clicks or zipper artifacts.

#### 4. The Chromium WebRTC Stream Sleep Bug & Muted Fallback
In Chromium browsers, if a remote `MediaStream` is piped exclusively into Web Audio API without an active HTMLMediaElement, Chromium's audio decoder may sleep or drop incoming RTP packets. To prevent this, ProxiSpeak creates a companion `<audio>` element:
- **Crucial Rule:** `audioEl.muted = true` and `audioEl.volume = 0` are strictly enforced.
- **Why:** If the fallback element were unmuted, raw WebRTC audio would leak directly into the OS audio mixer at 100% volume, bypassing the GainNode and destroying spatial distance attenuation.

#### 5. W3C Perfect Negotiation & Glare Resolution
When two peers move near each other simultaneously and both initiate a connection, an **SDP Offer Collision (Glare)** occurs. ProxiSpeak implements the W3C Perfect Negotiation pattern:
- **Polite Peer:** Defined deterministically by comparing socket IDs (`isPolite = currentSocket.id > from`).
- If an offer collision occurs, the polite peer executes `await pc.setLocalDescription({ type: "rollback" })` and accepts the incoming remote offer. The impolite peer ignores the incoming offer and stands by its own.

#### 6. Support for Mic-Off Peers
Peers who join without a microphone or with mic disabled cannot send audio tracks. Rather than failing the peer connection, ProxiSpeak inserts a receive-only transceiver (`pc.addTransceiver("audio", { direction: "recvonly" })`), ensuring silent participants can still hear nearby teammates.

---

### Pillar 2: Real-Time Coordinates & Socket Gateway
*Source Code: [frontend/src/services/positionBroadcaster.js](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/frontend/src/services/positionBroadcaster.js), [backend/server.js](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/backend/server.js)*

1. **Throttled Broadcasting:** When an avatar is dragged across the floor, pointer events fire up to 120 times per second. `positionBroadcaster.js` throttles outbound position emits to a steady 40ms cadence (25 updates/sec), reducing network traffic by ~80% while retaining buttery-smooth movement.
2. **Multi-User Room Join:** When a user enters an office:
   - The socket joins the Socket.IO room for that `organizationId`.
   - The user's in-memory record is added to `roomUsers.get(orgRoom)`.
   - Redis hash `office:room:${orgRoom}` is updated asynchronously.
   - The server emits `room:current-users` back to the joining user with all active participants.
   - The server broadcasts `room:user-joined` to all peers in the room.

---

### Pillar 3: Redis High-Performance Cache & MongoDB Geospatial Indexing
*Source Code: [backend/src/services/redisService.js](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/backend/src/services/redisService.js), [backend/src/models/UserPosition.js](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/backend/src/models/UserPosition.js)*

#### 1. Why Dual-Layer (Redis + MongoDB)?
Avatar movements occur dozens of times per second per user. Querying MongoDB on every single mousemove would overwhelm database connections and induce latency spikes. ProxiSpeak leverages **Redis** as an in-memory acceleration layer backed by **MongoDB** for persistence.

| Feature | Redis In-Memory Layer | MongoDB Persistent Layer |
| :--- | :--- | :--- |
| **Data Structure** | Hashes (`HSET`), Keys with TTL (`SET ... EX`) | Collections with `2dsphere` & compound indexes |
| **Response Time** | $\le 0.5\text{ ms}$ | $5 - 25\text{ ms}$ |
| **User Positions** | `office:positions:${orgId}` hash | `userpositions` collection (GeoJSON Point) |
| **Nearby Users** | Short-lived TTL cache (`office:geo:near:...`) | `$near` query with `$maxDistance` |
| **Office Layout** | `office:layout:${orgId}` (1 hour TTL) | `organizations.office_layout` document |

#### 2. MongoDB Geospatial Indexes
The `UserPosition` schema defines 2D geospatial indexes:
```javascript
// 2dsphere index for GeoJSON Point queries ($near, $geoWithin)
userPositionSchema.index({ location: '2dsphere' });
// Flat 2D index fallback for Cartesian grid queries
userPositionSchema.index({ 'location.coordinates': '2d' });
// Compound index for instant tenant isolation
userPositionSchema.index({ organization_id: 1, uid: 1 });
```

#### 3. Proximity Query Flow
1. Avatar moves $\rightarrow$ Socket receives `user:move`.
2. Asynchronous write to Redis position hash (`cacheUserPosition`).
3. Check Redis geospatial query cache (`getCachedNearbyUsers`). If found, return immediately without touching MongoDB.
4. If cache miss, execute MongoDB `UserPosition.find({ location: { $near: { $geometry: { type: 'Point', coordinates: [x, y] }, $maxDistance: 100 } } })`.
5. Store result in Redis with a 3-second TTL (`setCachedNearbyUsers`) and emit `proximity:nearby-users`.

---

### Pillar 4: 2D Office Builder & AABB Collision Detection
*Source Code: [frontend/src/components/OfficeBuilder/collisionService.js](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/frontend/src/components/OfficeBuilder/collisionService.js), [frontend/src/components/OfficeBuilder/BuildingBlocksLibrary.jsx](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/frontend/src/components/OfficeBuilder/BuildingBlocksLibrary.jsx)*

#### 1. Axis-Aligned Bounding Box (AABB) Collision Model
The floor canvas operates on a normalized $0 - 100\%$ coordinate space mapped to a virtual $1000 \times 590\text{ px}$ canvas.
- When an avatar moves to $(X_{new}, Y_{new})$, `isPositionBlocked` checks:
  1. Outer wall boundary limits ($X \in [4.2\%, 96\%]$, $Y \in [5.8\%, 94.2\%]$), with an entrance cutout allowing passage on the left wall ($Y \in [12\%, 26\%]$).
  2. Solid furniture bounding boxes (desks, conference tables, walls, glass partitions).
  3. Passable exemptions (doors, entrance gates, office chairs, potted plants, rugs, and custom zones are non-blocking).
- If blocked, `getSafePosition` slides the avatar along the orthogonal free axis rather than abruptly freezing movement.

#### 2. Drag & Drop Pipeline
- Dragging items from `BuildingBlocksLibrary` leverages HTML5 Drag & Drop with synchronized global fallbacks (`window.__ps_active_block`).
- `pointerdown` state decoupling prevents premature React component re-rendering that cancels native drags in Chromium.
- Placed objects support live drag-to-move, 90-degree rotation increments, proportional resizing, duplication, and deletion.
- History stack with 25-step undo/redo buffer (`pushHistory`, `handleUndo`, `handleRedo`).

---

### Pillar 5: Security, Authentication & Role-Based Access Control
*Source Code: [backend/src/middleware/authMiddleware.js](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/backend/src/middleware/authMiddleware.js), [backend/src/controllers/organizationController.js](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/backend/src/controllers/organizationController.js)*

1. **Cryptographic Token Verification:** Client authenticates with Firebase Google OAuth, receiving an ID token. Outbound REST calls pass this token in the `Authorization: Bearer <token>` header.
2. **Server-Side Token Decoding:** `authMiddleware` validates the token against Firebase Admin SDK, extracting `uid`, `email`, `name`, and `picture`.
3. **Upsert User Provisioning:** First-time users are provisioned in MongoDB automatically without separate registration workflows.
4. **Owner-Only Layout Modification:** Editing and saving the layout via `PUT /api/organizations/:id/layout` enforces `organization.owner_id.toString() === req.user._id.toString()`. Unauthorized team members receive `403 Forbidden`.

---

## API & WebSocket Event Specification

### REST Endpoints

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/health` | Public | Healthcheck reporting server status and Redis connection state |
| **POST** | `/api/profile` | Bearer | Retrieves or auto-provisions user profile from Firebase token |
| **PUT** | `/api/profile` | Bearer | Updates user display name, avatar, or status |
| **GET** | `/api/organizations` | Bearer | Fetches all organizations owned or joined by the user |
| **POST** | `/api/organizations` | Bearer | Creates a new organization with default floor plan |
| **GET** | `/api/organizations/:id` | Bearer | Fetches organization metadata and current office layout |
| **PUT** | `/api/organizations/:id/layout` | Owner | Updates persistent office layout (owner only) |
| **GET** | `/api/organizations/:id/nearby` | Bearer | Geospatial query for active users within radius |
| **GET** | `/api/activities` | Bearer | Retrieves recent workspace activity feed |
| **POST** | `/api/activities` | Bearer | Appends an activity event to the workspace log |

### Socket.IO Real-Time Events

| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `room:join` | Client $\rightarrow$ Server | `{ organizationId, userId, user, x, y }` | Enters organization room |
| `room:current-users`| Server $\rightarrow$ Client | `[ { userId, socketId, x, y, name, avatar } ]` | Delivers active room participants to joining client |
| `room:user-joined` | Server $\rightarrow$ Client | `{ userId, socketId, x, y, name, avatar }` | Broadcasts new peer arrival to room |
| `room:leave` | Client $\rightarrow$ Server | `{ organizationId, userId }` | Graceful workspace exit |
| `room:user-left` | Server $\rightarrow$ Client | `{ socketId, userId }` | Broadcasts peer departure |
| `user:move` | Client $\rightarrow$ Server | `{ organizationId, userId, x, y, name, avatar }` | Emits avatar coordinate change |
| `user:moved` | Server $\rightarrow$ Client | `{ socketId, userId, x, y, name, avatar }` | Relays position update to peers |
| `proximity:nearby-users`| Server $\rightarrow$ Client | `{ organizationId, nearby: [ ... ] }` | Delivers nearby users within 100m proximity |
| `user:chat` | Bidirectional | `{ organizationId, sender, msg, zone, timestamp }` | Workspace room chat message |
| `mic-status` | Bidirectional | `{ organizationId, sender, isMuted, isSpeaking }` | Relays microphone toggle & speaking events |
| `webrtc:offer` | Bidirectional | `{ to, offer, fromUser }` | WebRTC SDP offer exchange |
| `webrtc:answer` | Bidirectional | `{ to, answer }` | WebRTC SDP answer exchange |
| `webrtc:ice-candidate`| Bidirectional | `{ to, candidate }` | ICE network candidate routing |

---

## Local Development & Environment Setup

### Prerequisites
- **Node.js:** v18.0.0 or higher
- **MongoDB:** Locally running instance or MongoDB Atlas URI
- **Redis:** Local Redis server (`redis-server`) or Redis Cloud URI

### 1. Backend Setup
```bash
cd backend
npm install
```

Create `backend/.env`:
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb://127.0.0.1:27017/proxispeak
REDIS_URL=redis://127.0.0.1:6379
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Start backend:
```bash
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
npm install
```

Create `frontend/.env`:
```env
VITE_BACKEND_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

Start frontend:
```bash
npm run dev
```

---

## Master Interview Preparation Guide

---

### The Elevator Pitches

#### 30-Second Elevator Pitch
> *"ProxiSpeak is a virtual office platform that brings physical workplace spontaneity to remote teams. Users navigate avatars on an interactive 2D office floor plan and naturally converse with nearby colleagues using WebRTC peer-to-peer spatial audio. As you walk toward someone, their voice smoothly fades in using an acoustic cosine roll-off, and when you walk away, it fades to absolute silence. It's built with React, Web Audio API, Node.js, Socket.io, Redis for sub-millisecond position caching, and MongoDB with 2dsphere geospatial indexing."*

#### 2-Minute Architectural Pitch
> *"The core problem with remote meetings like Zoom or Google Meet is acoustic fatigue and unnatural turn-taking: everyone is locked into a single audio channel where only one person can speak at a time. ProxiSpeak solves this by recreating natural physical spatial acoustics on a 2D canvas.*
>
> *On the frontend, avatar movements are constrained by an AABB collision detection engine that recognizes walls, solid furniture, and passable doors. Audio is delivered via a peer-to-peer WebRTC Mesh. Instead of playing raw audio, we route each peer's MediaStream through a custom Web Audio API graph—feeding a GainNode that executes dynamic acoustic cosine volume roll-off based on Euclidean distance, followed by a DynamicsCompressorNode to eliminate clipping. Beyond our proximity threshold, gain is strictly clamped to zero with exponential decay to prevent clicks.*
>
> *On the backend, handling high-frequency avatar movements directly in MongoDB would choke database connections. We architected a dual-layer strategy: incoming movements update an in-memory Map and a Redis hash for sub-millisecond retrieval, and geospatial near queries are cached in Redis with short TTLs. Only persistent data—like user credentials, organization metadata, and floor plans—resides in MongoDB, which features 2dsphere indexes for spatial queries. The layout editor allows organization owners to customize office geometry and persist it via REST endpoints protected by Firebase Admin authentication."*

---

### 22 Technical Interview Questions & Model Answers

#### Category A: WebRTC & Spatial Audio Engineering

##### Q1: Why did you choose WebRTC Mesh topology over an SFU (Selective Forwarding Unit) or MCU (Multipoint Control Unit)?
**Model Answer:**
> *"In spatial office environments, users naturally cluster into small groups of 2 to 6 people at a water cooler, meeting pod, or desk pod. In Mesh topology, each client sends audio directly to peers. For $N \le 6$, a mesh requires $N-1$ outbound audio streams, which uses very little bandwidth for compressed audio tracks (~30-50 kbps each). Mesh eliminates server media processing costs, provides end-to-end encryption, and minimizes latency to direct peer ping (<50ms). If the office scaled to 50+ avatars speaking in a single grand conference hall, we would migrate to an SFU like mediasoup or LiveKit, but for distributed virtual office clusters, Mesh is the most cost-effective, low-latency architecture."*

##### Q2: What is SDP Offer/Answer Glare, and how does your implementation handle it?
**Model Answer:**
> *"SDP Glare occurs in symmetric peer-to-peer systems when both peers concurrently create and send an SDP offer before receiving the other's offer, putting the `RTCPeerConnection` in an incompatible `have-local-offer` state. We solved this using the W3C Perfect Negotiation pattern. We assign one peer as 'polite' and the other as 'impolite' by deterministically comparing their unique socket IDs. When an offer collision occurs, the polite peer detects that `pc.signalingState !== 'stable'`, rolls back its pending offer using `await pc.setLocalDescription({ type: 'rollback' })`, and accepts the incoming remote offer. The impolite peer ignores the incoming offer and waits for the polite peer to accept its original offer. This completely eliminates negotiation deadlock."*

##### Q3: How does the spatial audio pipeline work under the hood? Why not just use the HTML5 `<audio>` element's `.volume` property?
**Model Answer:**
> *"The standard HTML5 `<audio>` element has several severe limitations: its volume changes are stepped and cause audible clicking or zippering, it doesn't provide dynamic compression, and it cannot handle multi-node audio routing. In ProxiSpeak, we create a Web Audio API graph: `createMediaStreamSource(remoteStream)` pipes into a `GainNode`, which feeds a `DynamicsCompressorNode`, which outputs to `AudioContext.destination`. When positions change, we compute distance $d$ and set `gainNode.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.04)`. The $40\text{ms}$ exponential time constant ensures smooth analog-style volume cross-fading without waveform discontinuities."*

##### Q4: Explain the mathematical model used for volume cross-fading. Why cosine roll-off instead of inverse distance or linear decay?
**Model Answer:**
> *"Linear decay ($1 - d/R$) sounds artificial because human perception of loudness is logarithmic rather than linear; linear attenuation feels like the speaker drops in volume too quickly close up, and then lingers awkwardly at the perimeter. The inverse-square law ($1/d^2$) mimics real-world physics, but in a virtual conference app, it drops volume too precipitously when taking even two steps away. We implemented a quarter-cosine roll-off: $G = \cos\left(\frac{d}{R} \cdot \frac{\pi}{2}\right)$. This yields a flat, clear acoustic curve when standing near a colleague ($0$ to $30\%$ radius), a smooth natural roll-off through the middle distance, and a soft, gradual asymptotic taper to zero exactly at perimeter $R$. Beyond $R$, gain is strictly clamped to $0$."*

##### Q5: What was the critical audio leakage bug you discovered with Chromium and fallback `<audio>` elements, and how did you resolve it?
**Model Answer:**
> *"In Chromium-based browsers, if an incoming WebRTC MediaStream is only connected to an AudioContext and not attached to an HTMLMediaElement, Chromium's audio decoder may sleep or drop incoming RTP packets. To keep the stream alive, an `<audio>` element was created with `audioEl.srcObject = remoteStream`. However, the element was originally unmuted with `volume = 1.0`. Because HTML audio elements play directly to the OS audio mixer, the remote stream was blasting at 100% volume regardless of distance, completely bypassing our Web Audio GainNode. We resolved this by strictly setting `audioEl.muted = true` and `audioEl.volume = 0`. The element keeps the decoder active in Chromium, while the Web Audio GainNode exclusively controls the audible sound output."*

##### Q6: How do you handle participants who have no microphone or keep their mic muted?
**Model Answer:**
> *"If a user joins without a microphone or blocks permission, calling `pc.addTrack()` fails because `localStream.getAudioTracks()` is empty. If no audio track is added, WebRTC will not negotiate audio in the SDP. We solved this by calling `pc.addTransceiver('audio', { direction: 'recvonly' })`. This informs the remote peer that even though we aren't transmitting audio, our connection wants to receive their audio. This enables listeners with mic off or no hardware to participate and hear nearby speakers seamlessly."*

##### Q7: How do you handle browser Autoplay policies with Web Audio API?
**Model Answer:**
> *"Modern browsers start an `AudioContext` in the `'suspended'` state until the user interacts with the DOM. If audio arrives before interaction, it remains silent. We implemented global gesture listeners on `['click', 'keydown', 'pointerdown', 'touchstart']` that invoke `audioCtx.resume()`. In addition, whenever an avatar is clicked or dragged on the floor canvas, `getAudioContext()` checks `if (audioCtx.state === 'suspended') audioCtx.resume()`, guaranteeing that sound unmutes on the first user action."*

---

#### Category B: Real-Time WebSockets & Backend Concurrency

##### Q8: Walk me through the lifecycle of a `user:move` event from client dispatch to peer rendering.
**Model Answer:**
> *"1. When the user drags their avatar, `handleAvatarPointerMove` calculates new normalized coordinates $(X, Y)$ and verifies them against `collisionService.getSafePosition`.
> 2. `positionBroadcaster.js` throttles the updates to a maximum of 25 frames/sec and emits `user:move` over Socket.io.
> 3. The backend receives `user:move`, updates the user's $(x, y)$ in the in-memory `roomUsers` Map, and updates the Redis hash `office:positions:${orgId}` asynchronously.
> 4. The server broadcasts `user:moved` to `socket.to(orgRoom)`, delivering coordinates to all peers in the room.
> 5. The server checks the Redis short-TTL cache for nearby users within 100m. If absent, it queries MongoDB using `$near` and populates the cache.
> 6. On receiving `user:moved`, peers update their local `remoteUsers` state and `updateSpatialAudioVolumes` recalibrates the GainNodes within the next animation frame."*

##### Q9: Why maintain both an in-memory `roomUsers` Map and a Redis store on the backend?
**Model Answer:**
> *"Dual-layer memory tracking provides zero-latency in-process lookups while enabling horizontal scaling. The in-memory JavaScript `Map` gives the immediate Socket.io process instant access to socket-to-user mappings without any network or IPC overhead. Simultaneously, writing to Redis enables state persistence across server restarts and allows multiple Node.js instances to share room state using Redis Pub/Sub adapter. If Redis is temporarily offline, the server logs a notice and seamlessly continues using the in-memory Map with zero downtime."*

##### Q10: How do you clean up stale room state and avoid memory leaks when a user abruptly closes their browser tab?
**Model Answer:**
> *"When a browser tab closes without emitting a clean `room:leave`, the TCP connection drops and Socket.io triggers the `disconnect` event. The server iterates over `roomUsers`, identifies the rooms containing `socket.id`, deletes the socket from the room Map, and removes the user from the Redis hash (`removeRoomUserState` and `removeCachedUserPosition`). If a room becomes empty, the room key is deleted from the Map to prevent memory leaks. Finally, the server broadcasts `room:user-left` to remaining participants so remote peers tear down their respective WebRTC peer connections."*

---

#### Category C: Database & Geospatial Engineering

##### Q11: Explain the difference between MongoDB's `2dsphere` and `2d` indexes. Which does ProxiSpeak use?
**Model Answer:**
> *"A `2d` index is designed for flat, Euclidean planar geometry (Cartesian coordinate systems $X, Y$). A `2dsphere` index supports spherical geometry on Earth-like coordinates (WGS84 datum with longitude and latitude) and supports GeoJSON objects like `Point`, `Polygon`, and `LineString`. ProxiSpeak defines a primary `2dsphere` index on the `location` GeoJSON Point field: `{ location: '2dsphere' }`, backed by a flat `{ 'location.coordinates': '2d' }` index fallback. This enables MongoDB to execute `$near` with `$geometry: { type: 'Point', coordinates: [x, y] }, $maxDistance: 100` directly against indexed B-trees in sub-10ms time."*

##### Q12: Why cache geospatial `$near` query results in Redis if MongoDB already has indexes?
**Model Answer:**
> *"Even with a B-tree index, a MongoDB query requires database driver serialization, connection pool acquisition, wire transmission, and document parsing. When 10 users walk around simultaneously, each generating 25 coordinate changes per second, the server would be executing 250 spatial database queries every second. By caching the formatted query result in Redis under `office:geo:near:${orgId}:${round(X)}:${round(Y)}:${radius}` with a 3-second TTL, consecutive movement events within the same localized bucket return in under $0.5\text{ms}$ from memory. This cuts MongoDB CPU utilization by over 90% during peak activity."*

##### Q13: What data structure is used to persist office layouts in MongoDB, and how is concurrency controlled?
**Model Answer:**
> *"The office layout is stored as an embedded subdocument within the `Organization` collection: `office_layout: { version: Number, objects: [objectSchema] }`. Each object has normalized properties: `id`, `obj_type`, `name`, `position: { x, y }`, `rotation`, `width`, `height`, `isSolid`, and `canPass`. To prevent unauthorized edits, `updateOrganizationLayout` verifies that `organization.owner_id.toString() === req.user._id.toString()`. When updated, the layout is saved, cached in Redis (`cacheOfficeLayout`), and broadcast via Socket.IO so connected clients render the new layout in real time."*

---

#### Category D: Frontend Architecture & Performance

##### Q14: How does the AABB (Axis-Aligned Bounding Box) collision detection work?
**Model Answer:**
> *"The office floor uses a percentage coordinate grid ($0-100\%$). `collisionService.js` assigns the avatar a collision radius of $1.6\%$. When the user attempts to move to $(X, Y)$, we first verify that the position falls within the outer perimeter walls, taking into account the left door opening. Next, we iterate over all objects in `furnitureLayout`. If an object has `isSolid: true` and is not passable (e.g. desks, conference tables, solid walls), we compute its bounding box $[x_{min}, x_{max}, y_{min}, y_{max}]$. If the avatar's circular footprint overlaps the box, movement along that axis is blocked. `getSafePosition` attempts to preserve the component along the unblocked axis, allowing the user to slide smoothly along walls."*

##### Q15: What caused the avatar image dragging bug where moving the avatar dragged a ghost image across the layout, and how did you fix it?
**Model Answer:**
> *"Modern browsers implement native HTML5 image dragging by default for `<img>` elements. When a user clicked on their avatar profile picture and moved the mouse, the browser initiated an OS-level ghost drag of the image file, intercepting and canceling the pointer capture stream before our custom `onPointerMove` could update avatar coordinates. We resolved this across two layers:
> 1. In JSX, we added `draggable={false}` and `onDragStart={(e) => e.preventDefault()}` to all avatar `<img>` tags.
> 2. In CSS, we applied `pointer-events: none !important; -webkit-user-drag: none !important; user-drag: none !important; user-select: none !important;` to `.vo-avatar-img`.
> 3. In the pointer down handler, we added `event.preventDefault()` and `event.currentTarget.setPointerCapture(event.pointerId)`. This guarantees the pointer stream remains locked to our avatar movement engine."*

##### Q16: Why did dragging building blocks from the library onto the canvas fail in Chromium, and how did you fix it?
**Model Answer:**
> *"The block item had an `onPointerDown` handler that immediately invoked `onDragStartBlock`, which triggered a React `setActiveDragTemplate` state update. In React 18, state updates cause immediate re-rendering of the component tree. When Chromium detects a DOM modification during the initial pointer-down phase, it aborts the pending native HTML5 drag gesture before `dragstart` can fire. Additionally, child elements on the floor canvas (like outer walls and placement ghost previews) were intercepting drag events without calling `event.preventDefault()` on `dragover`, causing the browser to consider the drop target invalid. We resolved this by:
> 1. Removing the state-updating call from `onPointerDown` and moving it exclusively to `onDragStart`.
> 2. Populating `event.dataTransfer` with JSON and text payloads while maintaining a global `window.__ps_active_block` fallback.
> 3. Adding `pointer-events: none !important` to the drag ghost preview and floor decorations so the underlying floor canvas receives the drop cleanly."*

##### Q17: How does Voice Activity Detection (VAD) work without sending continuous audio streams to a server?
**Model Answer:**
> *"We process VAD entirely on the client using the Web Audio API. We connect the local microphone's `MediaStream` to an `AnalyserNode` with an FFT size of 256. In an animation frame loop, we inspect `analyser.getByteFrequencyData(buffer)` and compute the average decibel energy. If average energy exceeds our threshold ($16$) and the mic is not muted, we set `isSpeaking = true` and emit `mic-status` over the socket. To avoid rapid flickering between spoken words, we implement a $200\text{ms}$ hysteresis hold timer. The speaking state is only cleared if energy remains below threshold continuously for 200ms."*

---

#### Category E: System Design, Scalability & Production Readiness

##### Q18: If ProxiSpeak needed to scale to 10,000 concurrent users across 500 offices, how would you evolve the architecture?
**Model Answer:**
> *"1. **Horizontal Socket.io Scaling:** Deploy multiple Node.js Socket.io instances behind an AWS Application Load Balancer with sticky sessions, connected via the `@socket.io/redis-adapter` so broadcasts seamlessly span multiple instances.
> 2. **Media Architecture (SFU):** For massive auditoriums or all-hands events, replace Mesh with distributed SFU nodes (e.g. mediasoup or LiveKit) deployed in regional edge locations. Clients publish 1 upstream audio track to the SFU, and the SFU selectively forwards audio only from the top 3 loudest nearby speakers within range.
> 3. **Spatial Partitioning:** Divide large offices into a spatial grid (quadtree or spatial hash grid). Sockets only subscribe to sub-channels corresponding to their current grid cell and adjacent cells, dropping network broadcast fanout from $O(N)$ to $O(k)$ where $k$ is local cluster size.
> 4. **Database Sharding:** Shard MongoDB on `organization_id`, ensuring all data for an office is colocated on a single shard."*

##### Q19: How do you handle network latency or packet loss over WebRTC audio?
**Model Answer:**
> *"WebRTC's native audio engine employs the **Opus codec**, which dynamically adjusts bitrate between 6 kbps and 510 kbps, incorporates forward error correction (in-band FEC), and implements packet loss concealment (PLC). Even with 15-20% packet loss, Opus reconstructs missing voice packets without audible dropouts. On the network side, WebRTC transmits over UDP using SRTP (Secure Real-time Transport Protocol), avoiding TCP head-of-line blocking."*

##### Q20: How are environment secrets and Firebase Service Account keys secured in production?
**Model Answer:**
> *"Firebase credentials are never committed to version control. The client only possesses the public Firebase Web SDK configuration. The backend service account private key is injected via environment variables (`FIREBASE_PRIVATE_KEY`) or cloud secret managers (AWS Secrets Manager / GCP Secret Manager). The backend verifies signatures of incoming JSON Web Tokens cryptographically against Google's public x509 certificates without making outbound network requests on every verification, using cached JWKS."*

##### Q21: What testing and verification procedures ensure your audio and spatial calculations remain bug-free?
**Model Answer:**
> *"1. **Unit Tests:** Jest tests for `collisionService` (verifying edge cases: outer walls, doorway cutouts, solid pods, passable items) and spatial audio math (verifying gain calculation at $d=0, d=R/2, d=R, d>R$).
> 2. **Multi-Client Verification:** Testing with multiple independent browser instances across separate machines with physical microphones, verifying that muting on client A visually updates client B, and audio fades to 0 across the radius perimeter.
> 3. **Build Pipeline:** Automated CI pipeline executing `vite build` and `node -c` syntax checks across all backend and frontend services."*

##### Q22: What is the single most technically challenging problem you personally solved on this project?
**Model Answer:**
> *"The most challenging problem was synchronizing Web Audio API spatial attenuation with Chromium's WebRTC audio decoding pipeline. We faced a dual-edged bug: if we routed incoming WebRTC audio only through our Web Audio API GainNode, Chromium would periodically put the audio decoder to sleep, causing remote participants to randomly go silent. But when an HTML `<audio>` element was added to keep the decoder alive, it played unmuted directly to the system audio output at 100% volume, completely bypassing our GainNode and causing teammates to be audible across the entire office layout.
> 
> Solving it required deep inspection of the WebRTC MediaStream track lifecycle. I re-architected the pipeline so the HTML `<audio>` element is strictly kept muted—which satisfies Chromium's requirement to keep the RTP decoder awake—while the `MediaStreamAudioSourceNode` independently feeds our GainNode graph. Combined with starting the GainNode at 0, linking peer lookups across both Socket ID and User ID, and applying a cosine roll-off with strict radius cutoff, we achieved buttery-smooth spatial cross-fading with zero background leakage."*

---

## License
MIT License. Created for collaborative, distributed teams worldwide.
