# GPS Backend Architecture — AmcetTransit
## Code Review Reference Document

> **Purpose:** Full explanation of how GPS data flows from SkyNav servers to the admin dashboard.  
> **Audience:** Code reviewers, developers, new team members.  
> **Last Updated:** 2026-08-08

---

## 1. System Overview — Data Flow Diagram

```
SkyNav GPS Servers
  (api.skynavgps.com/v2)
         │
         │  POST /devices/?imei=<IMEI>
         │  Headers: Authorization: Bearer <TOKEN>
         │  Body (form-data): username, password, projectId, companyName
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│                  RENDER NODE.JS SERVER                    │
│                                                          │
│  ┌─────────────────┐                                     │
│  │ gpsScheduler.js │  Runs every 30 seconds (setInterval)│
│  │  [ORCHESTRATOR] │  Triggers the full pipeline         │
│  └────────┬────────┘                                     │
│           │ calls                                        │
│  ┌────────▼────────┐                                     │
│  │  gps.service.js │  Calls SkyNav API (POST + form-data)│
│  │   [API CLIENT]  │  Returns raw JSON response          │
│  └────────┬────────┘                                     │
│           │ raw JSON                                     │
│  ┌────────▼────────┐                                     │
│  │  gpsParser.js   │  Maps SkyNav fields → our schema    │
│  │   [VALIDATOR]   │  Filters invalid coordinates        │
│  └────────┬────────┘                                     │
│           │ clean array of parsed records                │
│  ┌────────▼────────┐                                     │
│  │  gpsUpdater.js  │  Writes to Supabase buses table     │
│  │   [DB WRITER]   │  Broadcasts via Socket.IO           │
│  └────────┬────────┘                                     │
│           │                                             │
│  ┌────────▼────────┐                                     │
│  │  config/socket  │  Emits "busLocationUpdated" event   │
│  │  [BROADCASTER]  │  to all connected frontend clients  │
│  └─────────────────┘                                     │
└──────────────────────────────────────────────────────────┘
         │
         │  WebSocket (Socket.IO)
         │  Event: "busLocationUpdated"
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│              VERCEL — REACT ADMIN DASHBOARD               │
│                                                          │
│  useSocketBus.js → Receives events → Interpolates        │
│  positions every 200ms → Renders smooth map markers       │
└──────────────────────────────────────────────────────────┘
         │
         │  Also writes to
         ▼
┌──────────────────────────────────────────────────────────┐
│                    SUPABASE DATABASE                      │
│  buses table        → live position per vehicle          │
│  gps_telemetry      → full history log (every ping)      │
└──────────────────────────────────────────────────────────┘
```

---

## 2. File-by-File Architecture Reference

### 📁 `backend/gps/` — The GPS Pipeline

---

#### `gps.service.js` — SkyNav API Client
**Role:** Calls the SkyNav API and returns raw JSON.  
**Location:** `backend/gps/gps.service.js`

| What it does | Detail |
|---|---|
| **HTTP Method** | `POST` (NOT GET — as per official docs) |
| **Endpoint** | `https://api.skynavgps.com/v2/devices/` |
| **IMEI parameter** | URL query param: `?imei=356218602130948` |
| **Body format** | `application/x-www-form-urlencoded` (form-data) |
| **Body fields** | `username`, `password`, `projectId`, `companyName` |
| **Auth header** | `Authorization: Bearer <SKYNAV_BEARER_TOKEN>` |
| **Retry logic** | 3 attempts with 1s/2s/4s exponential backoff |
| **Timeout** | 20 seconds per attempt |

**Where credentials come from:**
```js
// All from environment variables — NEVER hardcoded
config.skynav.bearerToken   // SKYNAV_BEARER_TOKEN env var
config.skynav.username      // SKYNAV_USERNAME env var
config.skynav.password      // SKYNAV_PASSWORD env var
config.skynav.projectId     // SKYNAV_PROJECT_ID env var
config.skynav.companyName   // SKYNAV_COMPANY_NAME env var
config.skynav.imei          // SKYNAV_IMEI env var
```

**Why the original code was broken:**
- ❌ Was using `GET` — SkyNav requires `POST`
- ❌ Was sending JSON headers — SkyNav requires form-data
- ❌ Was appending IMEI as a URL path segment (`/devices/123`) — SkyNav requires it as a query param (`?imei=123`)
- ❌ Was not handling SkyNav's `{ "result": 0, "message": "Error..." }` error pattern

---

#### `gpsParser.js` — Response Field Mapper
**Role:** Converts raw SkyNav JSON into our internal data format.  
**Location:** `backend/gps/gpsParser.js`

**Critical: SkyNav uses PascalCase field names — completely different from what we assumed.**

| SkyNav Field (actual) | Our Field Name | Notes |
|---|---|---|
| `root.VehicleData[]` | (array wrapper) | Navigate into this first |
| `Imeino` | `imei` | NOT "imei" — it's "Imeino" |
| `Vehicle_No` | `vehicleNumber` | Registration plate |
| `Vehicle_Name` | `vehicleName` | Display name |
| `Latitude` | `latitude` | Returned as a **string** — needs `parseFloat` |
| `Longitude` | `longitude` | Returned as a **string** — needs `parseFloat` |
| `Speed` | `speed` | Returned as a **string** — needs `parseFloat` |
| `Status` | `rawStatus` → `status` | "Moving"→`active`, others→`inactive` |
| `GPSActualTime` | `gpsActualTime` | Hardware GPS timestamp |
| `Datetime` | `serverTime` | SkyNav server timestamp |
| `Location` | `location` | Reverse-geocoded address |
| `IGN` | `ignition` | "1" = engine ON, "0" = engine OFF |
| `Odometer` | `odometer` | KM reading as string |

**Why the original code was broken:**
- ❌ Was looking for `record.imei` — actual field is `record.Imeino`
- ❌ Was looking for `record.latitude` — actual field is `record.Latitude` (capital L)
- ❌ Was looking for `response.data[]` — actual path is `response.root.VehicleData[]`

---

#### `gpsScheduler.js` — Background Timer
**Role:** Runs the GPS pipeline on a 30-second interval automatically.  
**Location:** `backend/gps/gpsScheduler.js`

```
Server boots → 3s delay (wait for Socket.IO to init)
            → calls fetchGpsData() every 30 seconds
            → on success: calls parseGpsResponse() → updateGpsCoordinates()
            → on failure: logs error, waits for next tick (never crashes server)
```

**Key design decisions:**
- `try/catch` wraps the entire pipeline — SkyNav going offline never crashes the Node server
- 3-second initial delay prevents race condition with Socket.IO initialization
- `setInterval` (not `setTimeout` chain) for predictable cadence

---

#### `gpsUpdater.js` — Database Writer
**Role:** Writes parsed GPS data to Supabase `buses` table.  
**Location:** `backend/gps/gpsUpdater.js`

**Matching logic (how GPS device maps to a bus row):**
1. First tries to match by `registration_number` (Vehicle_No)
2. Falls back to `bus_number`
3. Falls back to `imei` column (if populated in buses table)
4. If no match found → logs warning, skips update

**Deduplication optimization:**
- Compares new lat/lng to stored lat/lng (rounded to 6 decimal places)
- If coordinates haven't changed → skips the DB write entirely
- Saves thousands of unnecessary Supabase writes per day

**Fields written to `buses` table on each sync:**
```js
{
  latitude,         // from Latitude
  longitude,        // from Longitude
  status,           // "active" | "inactive"
  imei,             // from Imeino
  sim_number,       // if available
  speed,            // from Speed
  gps_actual_time,  // from GPSActualTime
  last_location,    // from Location
  updated_at,       // current server timestamp
}
```

**Uses `adminSupabase` (service role key) to bypass Supabase RLS.**

---

#### `gpsLogger.js` — Structured Logging
**Role:** Provides consistent `[GPS]` prefixed log messages for Render logs.  
**Location:** `backend/gps/gpsLogger.js`

---

### 📁 `backend/config/` — Infrastructure Layer

---

#### `env.js` — Environment Variable Registry
**Location:** `backend/config/env.js`

All SkyNav API placeholders are defined here. This is the **single source of truth** for credentials.

```js
// All of these map directly to Render Dashboard environment variables:
config.skynav = {
  apiUrl:      process.env.SKYNAV_API_URL,       // https://api.skynavgps.com/v2
  bearerToken: process.env.SKYNAV_BEARER_TOKEN,  // ← Set in Render Dashboard
  username:    process.env.SKYNAV_USERNAME,       // ← Set in Render Dashboard
  password:    process.env.SKYNAV_PASSWORD,       // ← Set in Render Dashboard
  projectId:   process.env.SKYNAV_PROJECT_ID,    // ← Set in Render Dashboard
  companyName: process.env.SKYNAV_COMPANY_NAME,  // ← Set in Render Dashboard
  imei:        process.env.SKYNAV_IMEI,          // ← Comma-separated IMEIs
  isConfigured: GPS_VARS.every(k => !!process.env[k]),  // Auto-computed boolean
}
```

> **Security:** No credentials exist in source code. The `.env` file is gitignored.  
> In production, all values come from **Render → Your Service → Environment**.

---

#### `supabase.js` — Database Clients
**Location:** `backend/config/supabase.js`

Two clients are initialized:

| Client | Key used | Purpose |
|---|---|---|
| `supabase` | `SUPABASE_ANON_KEY` | JWT validation, general reads |
| `adminSupabase` | `SUPABASE_SERVICE_ROLE_KEY` | GPS writes, bypasses RLS |

The GPS pipeline uses `adminSupabase` (via `writeClient()` in gpsUpdater) because Row Level Security (RLS) would otherwise block background workers that don't have user JWTs.

---

#### `socket.js` — Socket.IO Singleton
**Location:** `backend/config/socket.js`

```js
initSocket(httpServer)  // Called once in server.js
getIO()                 // Called in gpsUpdater.js to broadcast
```

CORS origin for Socket.IO is set from `FRONTEND_URL` env var — must match your Vercel domain.

---

### 📁 `backend/utils/`

#### `httpClient.js` — HTTP Wrapper with Retry
**Location:** `backend/utils/httpClient.js`

> **Note:** `gps.service.js` now uses native `node-fetch` directly (not this wrapper) to properly support `URLSearchParams` form body. The `fetchWithRetry` in `httpClient.js` remains available for other services.

---

## 3. Environment Variables Reference

### Render Dashboard (Backend)

| Variable | Required | Description | Example |
|---|---|---|---|
| `NODE_ENV` | ✅ | Environment mode | `production` |
| `FRONTEND_URL` | ✅ | Your Vercel URL (CORS) | `https://bus-transit-indol.vercel.app` |
| `SUPABASE_URL` | ✅ | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | ✅ | Supabase public key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase admin key (GPS writes) | `eyJ...` |
| `SKYNAV_API_URL` | ⚠️ GPS | SkyNav base URL | `https://api.skynavgps.com/v2` |
| `SKYNAV_BEARER_TOKEN` | ⚠️ GPS | Bearer token from SkyNav | `abc123...` |
| `SKYNAV_USERNAME` | ⚠️ GPS | SkyNav login username | `user@example.com` |
| `SKYNAV_PASSWORD` | ⚠️ GPS | SkyNav login password | `P@ssw0rd` |
| `SKYNAV_PROJECT_ID` | ⚠️ GPS | Project ID from SkyNav | `49` |
| `SKYNAV_COMPANY_NAME` | ⚠️ GPS | Company name on SkyNav | `SkyNav PRO DEMO` |
| `SKYNAV_IMEI` | ⚠️ GPS | IMEI(s) to track | `356218602130948` |
| `GPS_POLL_INTERVAL_MS` | optional | GPS sync interval (ms) | `30000` (30s) |

### Vercel Dashboard (Frontend)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | ✅ | Your Render backend URL |
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase public key |

> ⚠️ **Vite bakes env vars at build time.** After changing Vercel env vars, you must trigger a new deployment (Vercel → Deployments → Redeploy).

---

## 4. SkyNav API Quick Reference

### Endpoint: Get Device Data (Live Location)

```
POST https://api.skynavgps.com/v2/devices/?imei=<IMEI1>,<IMEI2>

Headers:
  Authorization: Bearer <BEARER_TOKEN>

Body (form-data / x-www-form-urlencoded):
  username    = <USERNAME>
  password    = <PASSWORD>
  projectId   = <PROJECT_ID>      ← capital I
  companyName = <COMPANY_NAME>
```

**Successful Response:**
```json
{
  "root": {
    "VehicleData": [
      {
        "Vehicle_Name":  "Bus 01",
        "Company":       "SkyNav PRO DEMO",
        "Vehicle_No":    "TN33BA1234",
        "Imeino":        "356218602130948",
        "Latitude":      "12.9165",
        "Longitude":     "79.1325",
        "Speed":         "45.2",
        "Status":        "Moving",
        "GPSActualTime": "08-08-2026 10:30:00",
        "Datetime":      "08-08-2026 10:30:05",
        "Location":      "Vellore Main Road",
        "IGN":           "1",
        "AC":            "0",
        "Odometer":      "12345.67"
      }
    ]
  }
}
```

**Error Response (result: 0):**
```json
{
  "result": 0,
  "message": "Error in Service : Data Not Found !"
}
```
> This means IMEI not found in your project, or credentials are wrong.

### Endpoint: Get Device History

```
POST https://api.skynavgps.com/v2/history/?imei=<IMEI>&start_datetime=DD-MM-YYYY%20HH:mm:ss&end_datetime=DD-MM-YYYY%20HH:mm:ss

Body (form-data): same as above
```

---

## 5. Common Issues & Debug Checklist

| Symptom | Likely Cause | Fix |
|---|---|---|
| `result: 0, Data Not Found` | Wrong IMEI or credentials | Verify IMEI exists in your SkyNav project |
| `result: 0` with correct IMEI | IMEI belongs to demo project, not your project | Use your actual project credentials |
| `GPS scheduler will start but skip sync` | SKYNAV env vars not set in Render | Add all SKYNAV_* variables in Render dashboard |
| `No VehicleData array found` | SkyNav returned error shape | Check Render logs for gps.service.js error messages |
| `Invalid coordinates — skipped` | SkyNav returned empty lat/lng | Device offline or no GPS fix |
| Bus marker not moving on map | Bus matched but coordinates unchanged | Normal — dedup skips redundant DB writes |
| White screen on Vercel | Missing VITE_SUPABASE_* env vars | Add to Vercel dashboard AND redeploy |

---

*Document generated for code review — AmcetTransit v2.0.0*
