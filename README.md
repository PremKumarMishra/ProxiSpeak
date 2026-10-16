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


