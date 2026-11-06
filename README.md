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
   - [Pillar 6: Client-Side Routing, Deep-Linking & Refresh Persistence (React Router DOM)](#pillar-6-client-side-routing-deep-linking--refresh-persistence-react-router-dom)
   - [Pillar 7: Multi-Surface Theme Engine (Dark & Light Modes)](#pillar-7-multi-surface-theme-engine-dark--light-modes)
4. [API & WebSocket Event Specification](#api--websocket-event-specification)
5. [Local Development & Environment Setup](#local-development--environment-setup)
6. [Master Interview Preparation Guide](#master-interview-preparation-guide)
   - [The Elevator Pitches (30s & 2min)](#the-elevator-pitches)
   - [25 Technical Interview Questions & Model Answers](#25-technical-interview-questions--model-answers)

---

## Platform Overview & Key Capabilities

- **Interactive 2D Floor Plan with Smooth Avatar Traversal:** Real-time pointer-driven avatar navigation with boundary clamping and sub-pixel smoothing.
- **Dynamic Office Layout Builder:** Drag-and-drop workspace designer with custom rooms, solid walls, passable doors, plants, and desk pods, with undo/redo history and persistent database synchronization.
- **AABB Collision Detection Engine:** Axis-Aligned Bounding Box collision system preventing avatars from walking through solid furniture while allowing seamless passage through doors, corridors, and rugs.
- **Peer-to-Peer WebRTC Mesh Spatial Audio:** Zero-server-bandwidth audio streaming between participants with W3C Perfect Negotiation to prevent offer/answer glare collisions.
- **Acoustic Cosine Cross-Fade ($cos(\frac{d}{R} \cdot \frac{\pi}{2})$):** Natural acoustic volume roll-off with strict 100m/pixel cutoff threshold ($Gain = 0$) preventing background sound leakage outside conversational distance.
- **Voice Activity Detection (VAD) & Real-Time Speaking Ring:** High-sensitivity Web Audio Analyser with Time-Domain PCM (RMS & Peak) and Vocal-Band frequency analysis ($85\text{ Hz} - 3.4\text{ kHz}$), instant sub-16ms attack, and Discord-style 280ms voice hangover window to eliminate syllable flickering, broadcast in real time across the room via Socket.io.
- **Dual-Layer Real-Time Geospatial Storage:** Sub-millisecond Redis position & query caching with MongoDB 2dsphere / 2D composite geospatial index fallbacks.
- **Enterprise Workspace Governance:** Google OAuth via Firebase Admin token verification, organization creation, invite code generation, and owner-only layout editing permissions.
- **3D Spatial Stereo Panning:** Real-time horizontal audio positioning ($P \in [-1.0, 1.0]$) mapping colleague lateral displacement ($\Delta X$) directly into listener headphones with sub-millisecond parameter smoothing.
- **Steady 60 FPS Hardware-Accelerated Canvas Engine:** RequestAnimationFrame pointer coalescing and isolated GPU compositing layers preventing forced synchronous layout reflows during rapid avatar navigation.
- **Multi-Surface Dark & Light Theme System:** Comprehensive visual personalization with live preview selectors in Settings, quick-toggle buttons in Dashboard header and sidebar, in-office topbar toggle, and persistent `localStorage` synchronization.

---

## High-Level Architecture

```
+----------------------------------------------------------------------------------------------------+
|                                         PROXISPEAK CLIENT                                          |
|                                                                                                    |
|  [ React 19 + React Router v7 ] [ Web Audio API Graph ]           [ HTML5 2D Canvas / DOM Floor ]   |
|   - Route: /office/:orgId      - MediaStreamAudioSourceNode         - Floor Scalable Container     |
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
[ StereoPannerNode ] ──► 3D Horizontal Stereo Separation: P = clamp((ΔX / R) * 1.15, -1.0, 1.0)
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

#### 7. Real-Time Voice Activity Detection (VAD) & Discord-Style Speaking Ring Engine
To provide responsive visual feedback similar to Discord, ProxiSpeak features a dual-domain voice activity detector with instant attack, jitter-free hangover, and real-time room synchronization:
- **Dual-Domain Acoustic Analysis:**
  - **Time-Domain PCM Waveform Analysis:** Uses `localAnalyser.getByteTimeDomainData(timeData)` to measure instantaneous root-mean-square (RMS) energy ($\sqrt{\frac{1}{N}\sum (x_i - 128)^2}$) and peak amplitude deviation from the 128 midpoint. This catches soft speech and whisper onsets instantly.
  - **Vocal-Band Frequency Analysis:** Uses `localAnalyser.getByteFrequencyData(freqData)` focusing on frequency bins 1 to 36 ($85\text{ Hz} - 3,400\text{ Hz}$), matching human vocal formants while filtering out high-frequency fan hiss and room noise.
  - **Instant Attack (`smoothingTimeConstant = 0.15`, `fftSize = 512`):** Eliminates Web Audio API's default 100–200ms latency, triggering speech detection within the very first animation frame ($<16\text{ ms}$).
- **Discord-Style 280ms Voice Hangover Window:**
  - Speech is not continuous; human conversation contains natural 150–250ms pauses between syllables and words.
  - Instead of a fragile timeout that flickers off mid-sentence, the engine records `lastVoiceDetectedTime = performance.now()`.
  - While `now - lastVoiceDetectedTime < 280ms`, the speaking ring remains solidly illuminated without blinking. When speaking ends, it shuts off cleanly after 280ms.
- **Hardware Mute Cutoff:**
  - Toggling microphone mute immediately sets `isSpeaking: false` with 0ms delay, resetting the hangover timer and disabling audio tracks.
- **Room-Wide Real-Time Synchronization & Presentation:**
  - `mic-status` socket events broadcast `isSpeaking` to all peers in the room.
  - Speaking teammates on the canvas and in the sidebar radar render glowing `#22c55e` green rings with ambient pulse animation (`@keyframes vo-speaking-glow`).
  - The main room lifecycle `useEffect` is decoupled from speaking/movement state using React `useRef`, preventing audio engine teardowns mid-conversation.

#### 8. 3D Spatial Audio Panning & Stereo Separation
In addition to acoustic distance cross-fading, natural acoustic perception requires horizontal stereo separation so listeners can instantly localize speaking colleagues:
- **Audio Graph Node:** Inserts a `StereoPannerNode` (`ctx.createStereoPanner()`) between the `GainNode` and `DynamicsCompressorNode`.
- **Horizontal Displacement Calculation:**
  $$\Delta X = X_{\text{peer}} - X_{\text{listener}}$$
- **Normalized Panning Factor:**
  $$\text{Target Pan} = \text{clamp}\left(\frac{\Delta X}{\text{proximityRadius}} \times 1.15, \,-1.0, \,+1.0\right)$$
  - **Colleague to the Left ($\Delta X < 0$):** Sound shifts smoothly to the left ear (down to $-1.0$).
  - **Colleague to the Right ($\Delta X > 0$):** Sound shifts smoothly to the right ear (up to $+1.0$).
  - **Colleague Directly Aligned ($\Delta X = 0$):** Sound is evenly balanced center ($0.0$).
- **De-zippering:** Panning adjustments use `pannerNode.pan.setTargetAtTime(targetPan, ctx.currentTime, 0.04)` to prevent audio pops or zipper noise during avatar movement.
- **Boundary Cutoff:** Outside the proximity radius or when the peer is muted, target pan and gain both reset to $0.0$.
- **Stereo Spatialization Model:**
  - **Binaural Perception:** Scaling horizontal displacement by an amplification multiplier ($1.15\times$) prior to clamping ensures distinct directional cues even for subtle lateral movements.
  - **Orientation Frame:** In the 2D plane, audio pan maps colleague $X$-offset directly into stereo channels without heavy HRTF convolution overhead.

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

#### 3. Steady 60 FPS Rendering & GPU Compositing
To guarantee buttery-smooth 60 FPS avatar movement across high-polling gaming mice and trackpads (120Hz–1000Hz):
- **`requestAnimationFrame` Pointer Coalescing:** High-frequency `pointermove` events stage raw coordinates in `pendingAvatarCoordRef` while execution is locked strictly to display VSync via `avatarRafIdRef = requestAnimationFrame(...)`. This prevents mouse polling from overflowing the React render queue.
- **Layout Thrashing Elimination:** The floor boundary rectangle (`floorRectRef`) is cached upon pointer down, eliminating forced synchronous reflows (`getBoundingClientRect()`) on every pointer event.
- **Hardware-Accelerated GPU Compositing:**
  - `.vo-floor` utilizes `contain: layout paint style; transform: translateZ(0);` to isolate layout boundaries.
  - `.vo-avatar` and `.vo-proximity-ring` employ `transform: translate3d(-50%, -50%, 0);` and `will-change: left, top, transform; backface-visibility: hidden;`, promoting them to dedicated GPU compositor layers for zero-CPU reflows.
- **Lifecycle & Memory Safeguards:**
  - Unmounting the office or releasing the pointer invokes `cancelAnimationFrame(avatarRafIdRef.current)` to eliminate orphan frame loops.
  - Pointer capture (`e.target.setPointerCapture`) guarantees uninterrupted motion tracking even when sweeping rapidly past canvas edges.

---

### Pillar 5: Security, Authentication & Role-Based Access Control
*Source Code: [backend/src/middleware/authMiddleware.js](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/backend/src/middleware/authMiddleware.js), [backend/src/controllers/organizationController.js](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/backend/src/controllers/organizationController.js)*

1. **Cryptographic Token Verification:** Client authenticates with Firebase Google OAuth, receiving an ID token. Outbound REST calls pass this token in the `Authorization: Bearer <token>` header.
2. **Server-Side Token Decoding:** `authMiddleware` validates the token against Firebase Admin SDK, extracting `uid`, `email`, `name`, and `picture`.
3. **Upsert User Provisioning:** First-time users are provisioned in MongoDB automatically without separate registration workflows.
4. **Owner-Only Layout Modification:** Editing and saving the layout via `PUT /api/organizations/:id/layout` enforces `organization.owner_id.toString() === req.user._id.toString()`. Unauthorized team members receive `403 Forbidden`.

---

### Pillar 6: Client-Side Routing, Deep-Linking & Refresh Persistence (React Router DOM)
*Source Code: [frontend/src/main.jsx](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/frontend/src/main.jsx), [frontend/src/App.jsx](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/frontend/src/App.jsx), [frontend/pages/Dashboard.jsx](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/frontend/pages/Dashboard.jsx), [frontend/pages/VirtualOffice.jsx](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/frontend/pages/VirtualOffice.jsx)*

#### 1. Why Client-Side Routing?
In traditional single-page apps (SPAs) where navigation is tracked only through local React state (`activeTab = "Overview"` / `selectedOrg = null`), refreshing the browser (`F5` or browser reload) destroys in-memory component state. A user actively collaborating in a virtual office would immediately be dumped back onto the dashboard overview or login screen.

ProxiSpeak integrates **React Router DOM v7** to provide full URL synchronization, deep linking, and browser reload persistence without breaking any existing WebRTC, Socket.IO, or audio pipelines.

#### 2. Route Specification
| Route | Component | Guard / Initializer | Description |
| :--- | :--- | :--- | :--- |
| `/` | `Dashboard` | Authenticated | Default landing view / Workspace Overview metrics |
| `/overview` | `Dashboard` | Authenticated | Explicit Overview dashboard |
| `/organizations` | `Dashboard` | Authenticated | Workspace list, join code entry & create organization |
| `/my-organizations` | `Dashboard` | Authenticated | Alias to `/organizations` for seamless backward compatibility |
| `/settings` | `Dashboard` | Authenticated | Profile settings, display name & avatar configuration |
| `/office/:orgId` | `Dashboard` $\rightarrow$ `VirtualOffice` | Dynamic Parameter | Enters targeted virtual office workspace |
| `*` | `<Navigate to="/" />` | Wildcard Fallback | Re-routes unknown paths to root |

#### 3. Solving the "Refresh Bounce" & Auth Initialization Race
When a user hits reload on `/office/:orgId`:
1. **The Auth Race Condition:** Firebase's `onAuthStateChanged` is asynchronous and requires 100–300ms to verify session tokens from IndexedDB/localStorage. If React evaluates route guards synchronously, `user === null`, which would prematurely bounce the user to the login screen.
2. **The `authInitializing` Guard:** ProxiSpeak introduces an explicit `authInitializing` state in `App.jsx`. While Firebase verifies credentials, a non-blocking workspace splash spinner is rendered. The router never redirects or drops the target URL during verification.
3. **Route State Hydration:** When `Dashboard` mounts on `/office/:orgId`:
   - `const { orgId } = useParams()` extracts the workspace identifier directly from the URL.
   - Initial state evaluators run:
     - `activeTab` initializes to `"My Organizations"`.
     - `selectedOrg` checks local storage for cached organization metadata; if not found, it initializes with a fallback `{ id: orgId, _id: orgId, name: "Virtual Office" }`.
   - `<VirtualOffice organization={selectedOrg} ... />` mounts immediately without kicking the user out.
   - Simultaneously, `VirtualOffice` executes `api.get('/api/organizations/' + orgId)`, fetching the authentic MongoDB organization record, owner privileges, and custom `office_layout` in the background and populating `fetchedOrg`.

#### 4. Seamless Navigation Lifecycle
- **Entering an Office:** Clicking "Enter Office" executes `handleEnterOffice(org)`, which updates `selectedOrg` and calls `navigate('/office/' + orgId)`. The URL changes cleanly without triggering a full page reload.
- **Leaving an Office:** Clicking "Leave Office" or breadcrumb links executes `handleLeaveOffice()`, which resets `selectedOrg` to `null` and calls `navigate('/organizations')`.
- **Sidebar Tabs:** Clicking sidebar navigation triggers `handleTabChange(tab)`, synchronizing the browser URL with `/overview`, `/organizations`, or `/settings`.

---

### Pillar 7: Multi-Surface Theme Engine (Dark & Light Modes)
*Source Code: [frontend/src/utils/theme.js](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/frontend/src/utils/theme.js), [frontend/pages/Dashboard.jsx](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/frontend/pages/Dashboard.jsx), [frontend/pages/Settings.jsx](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/frontend/pages/Settings.jsx), [frontend/pages/VirtualOffice.jsx](file:///D:/d%20data/Projects/Web-Internship/ProxiSpeak/frontend/pages/VirtualOffice.jsx)*

#### 1. Architecture & Persistence
- **State Engine:** The theme manager uses a centralized utility (`theme.js`) storing preferences in `localStorage` under `proxispeak-theme`.
- **Dynamic DOM Injection:** Switching themes sets `document.documentElement.setAttribute('data-theme', theme)` and toggles `document.body.classList.toggle('dark-theme')`, activating comprehensive CSS variable overrides across the entire application.
- **Cross-Component Event Bus:** Dispatches custom DOM events (`new CustomEvent('proxispeak-theme-change', { detail: { theme } })`) allowing disparate components to re-render in unison without prop drilling.
- **Design Token Hierarchy:** Centralizes semantic design tokens (`--bg-primary`, `--text-primary`, `--border-color`, `--accent-glow`), allowing instantaneous zero-lag re-skinning across all components without layout recalculations.
- **Default Theme Resolution:** Inspects stored preferences upon initial load and falls back seamlessly to dark mode (`dark`), preserving a coherent cyber-office aesthetic out of the box.
- **Cross-Tab Synchronization:** Listening to window `storage` events propagates theme selections across multiple active browser tabs in real time.

#### 2. Multi-Surface UI Integration
- **Dashboard Header & Sidebar:** Header actions feature a quick theme toggle button (`☀️ Light` / `🌙 Dark`) beside user status, complemented by a persistent sidebar action button.
- **Settings Appearance Card:** Interactive visual theme selector featuring miniature simulated UI previews of Light and Dark layouts with active check indicators and toast notifications.
- **Virtual Office Topbar:** In-office quick-toggle (`.vo-theme-toggle-btn`) alongside zone filter pills, enabling seamless theme switching while actively collaborating in the virtual workspace.

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


## License
MIT License. Created for collaborative, distributed teams worldwide.
