# 🚌 AmcetTransit — System Architecture & Technical Refactoring Walkthrough (v2.0.0)

> **Target Audience:** Development Team, System Administrators, & Engineering Stakeholders  
> **Project Scope:** Upgrade College Bus Tracking System from a 20-bus prototype to a 100+ bus / 1000+ student scalable enterprise architecture.

---

## 📌 Executive Summary & High-Level Architecture

We have completely refactored the legacy Express + React codebase into a **decoupled, event-driven, production-ready architecture**. 

### Key Architectural Upgrades:
1. **Backend-Driven GPS Pipeline**: The backend autonomously polls the **SkyNav GPS** provider via a 30-second background scheduler, processes incoming telemetry, updates the database, and broadcasts updates via **Socket.IO**. The frontend never makes direct third-party GPS calls.
2. **Smooth Real-Time Client Interpolation**: Replaced 30-second position "teleportation" with **client-side linear interpolation**, animating markers smoothly at 200ms intervals between GPS packet pings.
3. **Decoupled Direct Authentication**: Frontend authenticates directly against **Supabase Auth** via JWT tokens. The Express backend validates JWT signatures statelessly using Supabase public keys.
4. **Complete Data Telemetry Storage**: Extended the pipeline to extract and store hidden device identifiers (`imei`, `sim_number`) and telemetry (`speed`, `gps_actual_time`, `last_location`) directly in Supabase without exposing hardware secrets to the web interface.
5. **Zero-Downtime Secret Safety**: Hardened `.gitignore` and config layers. Production credentials stay strictly inside Render & Vercel environment variables.

---

## ⚙️ Backend Core Components Breakdown

### 1. `config/` — Centralized Infrastructure
* **`env.js`**: Validates mandatory environment variables on startup. Hard-fails with descriptive error messages if critical keys (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) are missing. Includes `isConfigured` guards for SkyNav credentials.
* **`supabase.js`**: Initializes two Supabase clients:
  * `supabase`: Standard client using `ANON_KEY` for JWT validation & reads.
  * `adminSupabase`: Privileged client using `SERVICE_ROLE_KEY` that bypasses Row Level Security (RLS) to perform GPS updates.
* **`socket.js`**: Maintains a global Socket.IO singleton instance to allow modular broadcasting across different service files.

### 2. `gps/` — The Automated GPS Pipeline
* **`gpsScheduler.js`**: Runs a background `setInterval` loop every 30 seconds. Executes a 3-second initial boot delay to ensure Socket.IO is initialized before first execution. Operates within `try/catch` boundaries so external API downtime never crashes the Node server.
* **`gpsParser.js`**: Defensive validation layer. Filters out `NaN`, `Infinity`, and out-of-range coordinates. Normalizes status strings to `'active'` or `'inactive'`. Extracts telemetry and device identifiers (`imei`, `sim_number`, `speed`, `gps_actual_time`, `location`).
* **`gpsUpdater.js`**: Matches device records to pre-seeded database buses by registration number, bus number, or IMEI. Performs coordinate rounding (6 decimal places = ~11cm precision) to compare with current DB values. **If coordinates haven't changed, DB writes are skipped** (saving thousands of unnecessary database queries daily).
* **`gpsLogger.js`**: Structured logging utility providing prefixed `[GPS]` console metrics for Render logs.

### 3. Middleware & Standardized API Helpers
* **`middleware/auth.middleware.js`**: Validates `Authorization: Bearer <token>` HTTP headers against Supabase `auth.getUser()`. Rejects unauthenticated requests with HTTP 401.
* **`middleware/error.middleware.js`**: Express v5 global error boundary catching asynchronous exceptions and preventing process crashes.
* **`utils/responseHelper.js`**: Standardizes API responses across all endpoints into `{ success: boolean, message: string, data: any }`.

---

## 📊 Database Schema & Telemetry Storage (Supabase)

The `buses` table stores both frontend-visible vehicle metadata and backend-only telemetry.

```sql
-- Migration SQL executed in Supabase SQL Editor
ALTER TABLE buses
  ADD COLUMN IF NOT EXISTS imei            TEXT,          -- SkyNav Hardware IMEI
  ADD COLUMN IF NOT EXISTS sim_number      TEXT,          -- Tracker SIM Number
  ADD COLUMN IF NOT EXISTS speed           NUMERIC(6,2),  -- Vehicle Speed (km/h)
  ADD COLUMN IF NOT EXISTS gps_actual_time TIMESTAMPTZ,   -- Hardware GPS timestamp
  ADD COLUMN IF NOT EXISTS last_location   TEXT;          -- Reverse-geocoded location text

CREATE INDEX IF NOT EXISTS idx_buses_imei ON buses (imei);
```

---

## 🎨 Frontend Real-Time & Interpolation Architecture

### 1. `useSocketBus.js` — Client-Side Linear Interpolation
SkyNav sends location updates every 30 seconds. Without interpolation, map markers jump abruptly every 30s.

Our custom hook runs a **200ms interpolation ticker**:
$$t = \min\left(\frac{\text{elapsed time}}{30000\text{ ms}}, 1.0\right)$$
$$\text{Latitude}_{\text{interp}} = \text{Lat}_{\text{prev}} + (\text{Lat}_{\text{new}} - \text{Lat}_{\text{prev}}) \times t$$
$$\text{Longitude}_{\text{interp}} = \text{Lng}_{\text{prev}} + (\text{Lng}_{\text{new}} - \text{Lng}_{\text{prev}}) \times t$$

This calculates intermediate coordinates every 200ms, creating a smooth gliding animation across the map.

### 2. Frontend Key Normalization (`mapFromDb`)
Database columns (`registration_number`, `bus_number`, `driver_name`, `driver_phone`) are automatically mapped to clean frontend state properties (`busNo`, `busId`, `driver`, `contact`) in `App.jsx` on initial fetch, guaranteeing that components render data immediately upon login.

---

## 🔒 Security & Deployment Architecture

### 1. Secrets Management
* `.env` files are strictly ignored via `.gitignore` (`.env`, `*.env`, `.env.*`).
* Only clean template files (`backend/.env.example`, `frontend/bus-admin/.env.example`) are committed to version control.
* Third-party SkyNav credentials remain exclusively on the backend server.

### 2. Production Deployment Settings

#### **Render (Backend Node Server)**
* **Build Command**: `npm install`
* **Start Command**: `node server.js`
* **Environment Variables**:
  * `NODE_ENV`: `production`
  * `FRONTEND_URL`: `https://<your-app>.vercel.app`
  * `SUPABASE_URL`: `https://<your-project>.supabase.co`
  * `SUPABASE_ANON_KEY`: `<anon-key>`
  * `SUPABASE_SERVICE_ROLE_KEY`: `<service-role-key>`
  * `SKYNAV_API_URL`, `SKYNAV_BEARER_TOKEN`, `SKYNAV_PROJECT_ID`, `SKYNAV_COMPANY_NAME` *(Provided post-whitelisting)*

#### **Vercel (Frontend React Dashboard)**
* **Framework Preset**: Vite
* **Root Directory**: `frontend/bus-admin`
* **Build Command**: `npm run build`
* **Environment Variables**:
  * `VITE_API_URL`: `https://<your-backend>.onrender.com`
  * `VITE_SUPABASE_URL`: `https://<your-project>.supabase.co`
  * `VITE_SUPABASE_ANON_KEY`: `<anon-key>`

---
*Document Version: 2.0.0 | System Architecture Handover Complete*
