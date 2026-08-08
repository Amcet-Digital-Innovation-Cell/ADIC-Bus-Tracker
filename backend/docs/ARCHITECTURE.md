# AmcetTransit Bus Tracking System — Developer Documentation

> **Version:** 2.0.0 · **Last Updated:** 2026-07-28

---

## 1. Project Overview

**AmcetTransit** is a real-time college bus tracking system built for AMCET (or similar institution). It enables administrators to monitor an entire bus fleet from a web dashboard with live GPS positions updating automatically every 30 seconds.

### Current Version (v2.0.0)
| Capability | Detail |
|---|---|
| Buses | 20 buses |
| Admins | 3 administrators |
| Frontend | React.js admin dashboard (Vite) |
| GPS Provider | SkyNav GPS (polled every 30 seconds) |
| Real-time | Socket.IO (backend → dashboard) |

### Future Roadmap
| Feature | Status |
|---|---|
| Flutter Student App | Planned — architecture is ready |
| Push Notifications | Planned |
| Student Attendance | Planned |
| ETA Prediction (ML) | Planned |
| Analytics Dashboard | Planned |
| Redis Caching | Planned (scale to 100+ buses) |
| Load Balancer / Oracle Cloud | Planned (multi-college) |
| Traccar Integration | Alternative GPS provider option |

> The current architecture is deliberately designed to support these features **without changing any API endpoints or database schema**.

---

## 2. Technology Stack

| Layer | Technology | Hosting |
|---|---|---|
| Admin Frontend | React.js (Vite) | Vercel |
| Backend API | Express.js (Node.js) | Render |
| Database | Supabase PostgreSQL | Supabase |
| Authentication | Supabase Auth | Supabase |
| Real-time | Socket.IO | Render (same server) |
| Maps | Leaflet (OpenStreetMap) | CDN |
| GPS Provider | SkyNav | External API |

### Why these choices?

**Supabase** — Managed PostgreSQL with built-in auth, row-level security, and real-time capabilities. Eliminates the need to manage a database server.

**Render** — Simple deployment with environment variable management. Free tier is sufficient for the current scale; paid tier enables automatic scaling.

**Vercel** — Zero-configuration deployment for React/Vite apps. Automatic HTTPS and CDN distribution.

**Socket.IO** — Handles both WebSocket and HTTP long-polling fallback, ensuring the live map works on restrictive college networks.

---

## 3. Architecture

```
┌─────────────────┐     HTTPS + JWT      ┌──────────────────────────┐
│  React Admin    │ ──────────────────→  │                          │
│  Dashboard      │                      │   Express.js Backend     │
│  (Vercel)       │ ←────────────────── │   (Render)               │
└─────────────────┘   Socket.IO Events   │                          │
                                         │  ┌─────────────────────┐ │
┌─────────────────┐    Supabase Auth     │  │  GPS Scheduler      │ │
│  Supabase       │ ←────────────────── │  │  (every 30s)        │ │
│  Auth           │                      │  └──────────┬──────────┘ │
└─────────────────┘                      │             │            │
                                         └─────────────┼────────────┘
┌─────────────────┐    REST API          │             │ SkyNav API
│  Supabase       │ ←────────────────── │             ↓
│  PostgreSQL     │    UPDATE buses      └─────────────────────────
│  (buses table)  │ ──────────────────→
└─────────────────┘
```

### Why the backend is the communication layer

The frontend **never** communicates with SkyNav directly because:
1. SkyNav credentials (Bearer Token, passwords) would be exposed in browser DevTools
2. The backend can transform, validate, and deduplicate GPS data before it reaches the database
3. This pattern scales to the Flutter app — the same backend serves both clients
4. Rate limiting, retry logic, and error handling can be centralized

---

## 4. Authentication Flow

### Design Decision: Supabase Auth on the Frontend

```
User enters email/password
         ↓
React calls supabase.auth.signInWithPassword()
         ↓
Supabase validates credentials → returns JWT (access_token)
         ↓
React stores JWT in sessionStorage
         ↓
Every API request includes: Authorization: Bearer <jwt>
         ↓
Express backend calls supabase.auth.getUser(token)
         ↓
Supabase verifies the token → returns user object
         ↓
Request proceeds to the controller
```

### Why custom auth was removed

The original backend had `POST /api/auth/login` which:
- Received email + password from the frontend
- Called `supabase.auth.signInWithPassword()` internally
- Returned the Supabase JWT to the frontend

This is **redundant** — the frontend can call Supabase directly and skip the backend hop. The result is:
- One fewer network request per login
- No custom auth logic to maintain
- Auth behavior is governed entirely by Supabase's production-grade system

### Why the backend still validates JWTs

The backend **does** validate tokens on every protected request because:
- It confirms the user is still active in Supabase (not deleted or suspended)
- It prevents unauthorized access to GPS and bus data
- It provides `req.user` (id, email, role) for future role-based access control

---

## 5. SkyNav GPS Integration

### Credential Security

All SkyNav credentials are stored as backend environment variables:
```
SKYNAV_API_URL
SKYNAV_BEARER_TOKEN
SKYNAV_USERNAME
SKYNAV_PASSWORD
SKYNAV_PROJECT_ID
SKYNAV_COMPANY_NAME
SKYNAV_IMEI         (optional — specific device)
```

The frontend has **zero access** to these variables. They never appear in any HTTP response, never in any frontend file, and are not committed to git.

### Polling Every 30 Seconds

`gpsScheduler.js` uses `setInterval` to run a sync cycle every 30 seconds:

```
gpsScheduler (setInterval, 30s)
      ↓
gps.service.js → HTTP GET to SkyNav API (Bearer auth, 15s timeout, 3 retries)
      ↓
gpsParser.js → Validate response, extract coordinates
      ↓
gpsUpdater.js → UPDATE buses SET latitude=?, longitude=?, status=?, updated_at=NOW()
      ↓
location.socket.js → io.emit('busLocationUpdated', payload)
      ↓
React Dashboard + Flutter App update automatically
```

### JSON Parsing

`gpsParser.js` handles:
- Null/missing fields (all have safe fallbacks)
- Invalid coordinates (NaN, out of range: lat < -90 or > 90, lng < -180 or > 180)
- Different SkyNav response formats (array directly or wrapped in `data` field)
- Status mapping: "Moving" → "active", everything else → "inactive"

---

## 6. Database Flow

### The buses table (frozen schema)
```sql
CREATE TABLE buses (
  id                  uuid PRIMARY KEY,
  bus_number          text,
  registration_number text,
  driver_name         text,
  driver_phone        text,
  route_name          text,
  status              text,
  latitude            numeric,
  longitude           numeric,
  updated_at          timestamptz,
  license_number      text,
  capacity            integer
);
```

### Why only UPDATE (never INSERT or DELETE)

The buses table is **pre-seeded** by the admin. All 20 buses already exist as rows. The GPS pipeline only needs to update 3 columns per bus per cycle:

```sql
UPDATE buses
SET latitude = ?, longitude = ?, status = ?, updated_at = NOW()
WHERE registration_number = ?;
```

This design means:
- The GPS pipeline cannot accidentally create duplicate buses
- The GPS pipeline cannot accidentally delete a bus
- Bus metadata (driver name, route, etc.) is managed separately via the admin UI

### Matching Strategy

GPS records are matched to buses using `registration_number` (the vehicle's actual plate number, e.g. "TN33BA1234"). SkyNav's `vehicleNumber` field is compared against this column with whitespace removed and uppercase normalization.

### Deduplication

If the new coordinates match the stored coordinates (within 6 decimal places ≈ 11cm precision), the update is skipped. This prevents unnecessary database writes and Socket.IO noise when a bus is parked.

---

## 7. Real-Time Flow

```
SkyNav GPS Device
      ↓  (position updates every 30s internally)
gpsScheduler (polls every 30s)
      ↓  HTTP GET, Bearer auth
SkyNav API
      ↓  JSON response
gpsParser (validates + normalizes)
      ↓  clean GPS records
gpsUpdater (matches buses, deduplicates)
      ↓  UPDATE buses table
Supabase PostgreSQL
      ↓  (update confirmed)
location.socket (broadcastBusLocation)
      ↓  Socket.IO: 'busLocationUpdated' event
      ├──→ React Dashboard (useSocketBus hook)
      │         ↓
      │    Linear interpolation (200ms ticker)
      │         ↓
      │    Smooth marker movement on map
      │
      └──→ Flutter App (future — same event, same payload)
```

### Client-Side Interpolation (Smooth Movement)

SkyNav sends GPS every 30 seconds. Without interpolation, bus markers would teleport on the map every 30s.

**Solution:** Between two GPS packets, the `useSocketBus` hook computes intermediate positions every 200ms:

```
t = elapsed_ms / 30000  (ranges from 0.0 → 1.0)
interpLat = prevLat + (newLat - prevLat) × t
interpLng = prevLng + (newLng - prevLng) × t
```

This creates fluid, continuous movement across 30 seconds of travel.

---

## 8. API Documentation

### Base URL
```
Production: https://bus-tracking-zbon.onrender.com
Local:      http://localhost:3000
```

### Authentication
All protected endpoints require:
```
Authorization: Bearer <supabase_access_token>
```

---

### GET /
Health check (public — no auth required)

**Response:**
```json
{
  "success": true,
  "message": "AmcetTransit Bus Tracking API 🚌",
  "version": "2.0.0",
  "environment": "production",
  "timestamp": "2026-07-28T00:00:00.000Z"
}
```

---

### GET /api/dashboard
Fleet statistics for the admin dashboard KPI cards.

**Response:**
```json
{
  "success": true,
  "message": "Dashboard statistics retrieved",
  "data": {
    "totalBuses": 20,
    "activeBuses": 14,
    "offlineBuses": 4,
    "pendingGps": 2,
    "lastSyncAt": "2026-07-28T00:00:00.000Z"
  }
}
```

---

### GET /api/buses
Returns all buses with full details.

**Response:**
```json
{
  "success": true,
  "message": "Buses retrieved successfully",
  "data": [
    {
      "id": "uuid",
      "bus_number": "01",
      "registration_number": "TN33BA1234",
      "driver_name": "Rajesh Kumar",
      "driver_phone": "+919876543210",
      "route_name": "Katpadi",
      "status": "active",
      "latitude": 12.9165,
      "longitude": 79.1325,
      "updated_at": "2026-07-28T00:00:00.000Z",
      "license_number": "AD32545",
      "capacity": 52
    }
  ]
}
```

---

### GET /api/buses/:id
Returns a single bus by ID.

**Response:** Same shape as above but `data` is a single object.

**Error (404):**
```json
{ "success": false, "error": "Bus not found" }
```

---

### PUT /api/buses/:id
Updates bus metadata (driver, route, license, etc.).
GPS fields (latitude, longitude, status) are blocked — they are managed by the GPS pipeline.

**Request body:**
```json
{
  "driver": "New Driver Name",
  "route": "New Route",
  "contact": "+919876543210"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bus updated successfully",
  "data": { ...updated bus }
}
```

---

### GET /api/gps/sync
Manually triggers one GPS sync cycle. Useful for testing.

**Response:**
```json
{
  "success": true,
  "message": "GPS sync completed",
  "data": {
    "updated": 14,
    "skipped": 4,
    "unknown": 2,
    "durationMs": 1243,
    "buses": [ ...updated bus summaries ]
  }
}
```

**When SkyNav not configured:**
```json
{
  "success": true,
  "message": "GPS not configured",
  "data": { "skynavConfigured": false }
}
```

---

### GET /api/gps/status
Returns GPS scheduler health.

**Response:**
```json
{
  "success": true,
  "message": "GPS scheduler status",
  "data": {
    "running": true,
    "syncCount": 142,
    "errorCount": 0,
    "lastSyncAt": "2026-07-28T00:00:00.000Z",
    "lastSyncStatus": "success",
    "pollIntervalMs": 30000,
    "skynavConfigured": true
  }
}
```

---

### Socket.IO Event: busLocationUpdated

Emitted after every successful GPS coordinate update.

**Event name:** `busLocationUpdated`

**Payload:**
```json
{
  "busNumber": "01",
  "registrationNumber": "TN33BA1234",
  "latitude": 12.9165,
  "longitude": 79.1325,
  "speed": 45.2,
  "status": "active",
  "updatedAt": "2026-07-28T00:00:00.000Z"
}
```

**Subscribe in React:**
```js
socket.on('busLocationUpdated', (payload) => {
  // Update bus state with new coordinates
});
```

**Subscribe in Flutter (future):**
```dart
socket.on('busLocationUpdated', (data) {
  // Update marker on Google Maps
});
```

---

## 9. Hosting

### Frontend — Vercel
- **Why:** Zero-configuration deployment, automatic HTTPS, global CDN
- **Deploy:** Connect GitHub repo → select `frontend/bus-admin` → set VITE_* env vars
- **Env vars required:**
  - `VITE_API_URL` — Render backend URL
  - `VITE_SUPABASE_URL` — Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` — Supabase anon key

### Backend — Render
- **Why:** Persistent server (Socket.IO requires persistent connections), easy env var management, automatic deploys from GitHub
- **Deploy:** Connect GitHub repo → select `backend` folder → set env vars
- **Env vars required:** All variables from `backend/.env.example`
- **Important:** Set `FRONTEND_URL` to your Vercel URL to lock down CORS in production

### Database — Supabase
- **Why:** Managed PostgreSQL, built-in auth, Row Level Security, no server management
- **Free tier:** Sufficient for current scale (20 buses, 3 admins)
- **Schema:** Frozen — the `buses` table is pre-seeded and never modified structurally

---

## 10. Future Improvements

### Short Term (next semester)
- **SkyNav credentials:** Add SKYNAV_* env vars to Render once whitelisted → GPS sync activates automatically
- **CORS:** Set `FRONTEND_URL=https://your-app.vercel.app` in Render to restrict browser access
- **Flutter App:** Connect using the same backend URL and Socket.IO `busLocationUpdated` event

### Medium Term
- **Redis:** Cache bus list (`GET /api/buses`) to reduce Supabase load as fleet grows to 100+ buses
- **Attendance:** Add a `students` table and `attendance` table; scan QR codes at bus boarding
- **Push Notifications:** Firebase Cloud Messaging — notify students when their bus is near

### Long Term
- **Oracle Cloud:** Migrate backend to Oracle Cloud Always Free for production-grade hosting
- **Traccar:** Optional alternative GPS provider (open-source) if SkyNav subscription ends
- **Load Balancer:** Horizontal scaling with sticky sessions for Socket.IO (use Redis adapter)
- **Multi-College:** Add `college_id` to the buses table → one backend serves multiple institutions
- **ETA Prediction:** ML model using historical GPS tracks to predict arrival time
- **Analytics:** Bus utilization reports, driver performance, route optimization suggestions

---

## File Structure

```
bus-tracking-main/
├── backend/
│   ├── config/
│   │   ├── env.js            # Env validator + typed config object
│   │   ├── socket.js         # Socket.IO singleton (init + getIO)
│   │   └── supabase.js       # Supabase clients (anon + admin)
│   ├── controllers/
│   │   ├── bus.controller.js
│   │   └── dashboard.controller.js
│   ├── gps/
│   │   ├── gps.controller.js # Manual sync + status endpoints
│   │   ├── gps.routes.js
│   │   ├── gps.service.js    # SkyNav API HTTP client
│   │   ├── gpsLogger.js      # GPS-specific logger
│   │   ├── gpsParser.js      # Validates + normalizes SkyNav response
│   │   ├── gpsScheduler.js   # 30s background poll loop
│   │   └── gpsUpdater.js     # Supabase UPDATE-only writer
│   ├── middleware/
│   │   ├── auth.middleware.js     # Supabase JWT validator
│   │   ├── error.middleware.js    # Central error handler
│   │   ├── logger.middleware.js   # HTTP request logger
│   │   └── validator.middleware.js
│   ├── routes/
│   │   ├── bus.routes.js
│   │   └── dashboard.routes.js
│   ├── services/
│   │   ├── bus.service.js         # READ-ONLY bus queries
│   │   └── dashboard.service.js   # Fleet statistics queries
│   ├── sockets/
│   │   └── location.socket.js     # broadcastBusLocation()
│   ├── utils/
│   │   ├── httpClient.js      # Fetch with timeout + retry
│   │   └── responseHelper.js  # Standardized JSON responses
│   ├── app.js                 # Express app factory
│   ├── server.js              # HTTP server + Socket.IO + scheduler boot
│   ├── .env.example
│   └── package.json
│
└── frontend/bus-admin/
    ├── src/
    │   ├── components/
    │   │   ├── MapView.jsx         # Real GPS coords + interpolation
    │   │   └── TrackLocationView.jsx
    │   ├── hooks/
    │   │   └── useSocketBus.js     # Socket.IO + linear interpolation
    │   ├── lib/
    │   │   └── supabaseClient.js   # Frontend auth-only client
    │   ├── pages/
    │   │   ├── BusesPage.jsx
    │   │   ├── Dashboard.jsx
    │   │   └── login.jsx           # Direct Supabase auth
    │   └── App.jsx                 # Root: fetch buses + useSocketBus
    ├── .env.example
    └── package.json
```
