# 🚍 AmcetTransit — College Bus Tracking & Transit Management System

> **Enterprise-Grade Real-Time Bus Tracking & Student Transit Management Platform**  
> Serving Administrators, Drivers, Fleet Managers, and College Students.

---

## 📑 Table of Contents
- [1. System Architecture & Tech Stack](#1-system-architecture--tech-stack)
- [2. Monorepo Directory Architecture](#2-monorepo-directory-architecture)
- [3. SQL Schema & Single Source of Truth (`sql/`)](#3-sql-schema--single-source-of-truth-sql)
  - [3.1. Tables & Column Dictionary](#31-tables--column-dictionary)
  - [3.2. Deprecation & Removal of `route_code`](#32-deprecation--removal-of-route_code)
- [4. Backend Architecture & Synchronization](#4-backend-architecture--synchronization)
- [5. Frontend Architecture (`bus-admin`)](#5-frontend-architecture-bus-admin)
- [6. Step-by-Step Testing & Diagnostics](#6-step-by-step-testing--diagnostics)
  - [6.1. Database Diagnostics](#61-database-diagnostics)
  - [6.2. Live Table Verification via Node.js](#62-live-table-verification-via-nodejs)
  - [6.3. API Endpoint Testing via PowerShell / curl](#63-api-endpoint-testing-via-powershell--curl)
- [7. How to Apply Migrations in Supabase](#7-how-to-apply-migrations-in-supabase)

---

## 1. System Architecture & Tech Stack

AmcetTransit connects administrators, real-time IoT GPS feeds, and student mobile applications in a unified architecture:

```
   ┌────────────────────────────────┐       ┌────────────────────────────────┐
   │      Student Mobile App        │       │      Transport Admin Portal    │
   │      (Flutter / Dart)          │       │      (React 18 + Vite)         │
   └───────────────┬────────────────┘       └───────────────┬────────────────┘
                   │ HTTPS (REST)                           │ HTTPS + Socket.IO
                   ▼                                        ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │                       Node.js Express Backend API                       │
   │   - JWT Auth Middleware      - SkyNav Telemetry Sync   - Brevo HTTP API │
   │   - Standardized Envelope    - Real-Time Push Events   - Route Dispatch │
   └───────────────────────────────────┬─────────────────────────────────────┘
                                       │ Supabase JS Client v2 (bus_tracking schema)
                                       ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │                     Supabase PostgreSQL Database                        │
   │               Dedicated Custom Schema: "bus_tracking"                   │
   │   - buses               - bus_routes            - bus_stops             │
   │   - gps_telemetry       - students              - system_configs        │
   └─────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack:
* **Admin Frontend**: React 18, Vite, React Router 7, Leaflet, Lucide Icons.
* **Backend API**: Node.js v18+, Express v5, Socket.IO, Axios.
* **Database & BaaS**: Supabase PostgreSQL 15+ (target schema: `bus_tracking`).
* **Email Service**: Brevo HTTP REST API (with Smart Console Logger fallback).
* **GPS Telemetry**: SkyNav IoT GPS API (30-second automated pull cycle + hardware push receiver).

---

## 2. Monorepo Directory Architecture

```text
web/
├── backend/                        # Node.js Express Backend Service
│   ├── config/                     # Environment, Supabase client & Socket.IO config
│   ├── controllers/                # Request handlers (Bus, Routes, Public, Dashboard)
│   ├── docs/                       # Architecture, GPS design & migration notes
│   ├── gps/                        # SkyNav polling cycle, parser & telemetry updater
│   ├── middleware/                 # JWT authentication, centralized error & logger
│   ├── routes/                     # Express route endpoints
│   ├── services/                   # Database access layer targeting 'bus_tracking'
│   ├── sql/                        # SQL Schema Migrations & Table Data (Source of Truth)
│   │   ├── 01_amcet_schema_separation.sql      # Production DDL for bus_tracking schema
│   │   ├── 04_remove_route_code_migration.sql   # SQL migration to drop route_code
│   │   ├── bus_routes_rows.sql                 # Live bus_routes seed data
│   │   ├── buses_rows.sql                      # Live buses fleet seed data
│   │   ├── gps_telemetry_rows.sql              # Live GPS coordinates seed data
│   │   └── students_rows.sql                   # Live student directory seed data
│   ├── utils/                      # Brevo email dispatcher, realtime state & helpers
│   ├── app.js                      # Express application factory & middleware setup
│   ├── server.js                   # HTTP server & Socket.IO listener entry point
│   ├── diagnose_supabase.js        # Supabase connectivity & schema diagnostics
│   └── test-supabase.js            # Standalone live DB test script
│
├── frontend/
│   └── bus-admin/                  # React Admin Web Dashboard (Vite)
│       ├── src/
│       │   ├── components/         # Reusable UI (ViewStopsModal, MapView, BusList)
│       │   ├── lib/                # API client (Axios), Student service & Supabase
│       │   ├── pages/              # BusesPage, RoutesPage, StudentsPage, Dashboard
│       │   ├── App.jsx             # Shell navigation & routing
│       │   └── main.jsx            # Application mount point
│       └── vite.config.js          # Vite config (strict port 8000)
│
└── README.md                       # Master Architecture & Operational Guide
```

---

## 3. SQL Schema & Single Source of Truth (`sql/`)

All database operations target the custom PostgreSQL schema **`bus_tracking`**. The files inside `web/backend/sql/` represent the single source of truth for table schemas, columns, and relations.

### 3.1. Tables & Column Dictionary

#### 1. `bus_tracking.bus_routes`
Stores college bus routes and ordered stopping patterns (JSONB).
| Column Name | Data Type | Nullable | Description |
|---|---|---|---|
| `id` | `BIGSERIAL` | No (PK) | Unique Route ID |
| `route_name` | `VARCHAR(255)` | No | Route Name (e.g. `SANKARANPALAYAM`) |
| `origin` | `VARCHAR(255)` | Yes | Route starting point |
| `destination` | `VARCHAR(255)` | Yes | Default: `AMCET` |
| `created_at` | `TIMESTAMPTZ` | Yes | Creation timestamp |
| `stops` | `JSONB` | Yes | Array of ordered stops: `[{"id": 1, "stop_name": "...", "stop_order": 1}]` |

#### 2. `bus_tracking.buses`
Fleet vehicles, driver assignments, and live status.
| Column Name | Data Type | Nullable | Description |
|---|---|---|---|
| `id` | `BIGSERIAL` | No (PK) | Unique Bus ID |
| `bus_number` | `VARCHAR(50)` | No | Fleet bus identifier (e.g. `16`, `05`) |
| `registration_number` | `VARCHAR(50)` | No (UK) | Vehicle plate (e.g. `TN20CH9640`) |
| `vehicle_number` | `VARCHAR(50)` | Yes | Mirror of registration number |
| `bus_name` | `VARCHAR(100)` | Yes | Vehicle nickname / model |
| `route_id` | `BIGINT` | Yes (FK) | Reference to `bus_tracking.bus_routes(id)` |
| `route_name` | `VARCHAR(255)` | Yes | Mirror of assigned route name |
| `driver_name` | `VARCHAR(150)` | Yes | Assigned driver name |
| `driver_phone` | `VARCHAR(50)` | Yes | Driver contact phone |
| `license_number` | `VARCHAR(100)` | Yes | Driver license credential |
| `status` | `VARCHAR(50)` | Yes | `Active`, `Inactive`, or `Pending (GPS)` |
| `created_at` | `TIMESTAMPTZ` | Yes | Record creation timestamp |

#### 3. `bus_tracking.gps_telemetry`
Latest IoT hardware coordinates for each vehicle.
| Column Name | Data Type | Nullable | Description |
|---|---|---|---|
| `id` | `BIGSERIAL` | No (PK) | Telemetry row ID |
| `vehicle_number` | `VARCHAR(50)` | No (UK) | Matched vehicle registration number |
| `latitude` | `NUMERIC(10, 8)` | Yes | Current GPS latitude |
| `longitude` | `NUMERIC(11, 8)` | Yes | Current GPS longitude |
| `speed` | `NUMERIC(6, 2)` | Yes | Speed in km/h |
| `ignition` | `BOOLEAN` | Yes | Engine ignition status |
| `address` | `TEXT` | Yes | Reverse geocoded address |
| `location_address` | `TEXT` | Yes | Detailed location description |
| `received_at` | `TIMESTAMPTZ` | Yes | Server ingest timestamp |
| `gps_actual_time` | `TIMESTAMPTZ` | Yes | Hardware satellite timestamp |
| `raw_status` | `VARCHAR(50)` | Yes | Hardware status (`RUNNING`, `STOP`) |
| `raw_payload` | `JSONB` | Yes | Complete raw device JSON telemetry |

#### 4. `bus_tracking.students`
Pre-loaded student roster and self-registration accounts.
| Column Name | Data Type | Nullable | Description |
|---|---|---|---|
| `id` | `BIGSERIAL` | No (PK) | Record ID |
| `student_id` | `VARCHAR(50)` | No (UK) | Official Student Roll Number (e.g. `F25GQME620`) |
| `student_name` | `VARCHAR(150)` | No | Student Full Name |
| `student_mobile` | `VARCHAR(50)` | Yes | Student mobile phone number |
| `email` | `VARCHAR(150)` | Yes | Student email address |
| `department` | `VARCHAR(100)` | Yes | Academic department |
| `academic_year` | `VARCHAR(20)` | Yes | `1st Year`, `2nd Year`, `3rd Year`, `4th Year` |
| `pass_out_year` | `VARCHAR(10)` | Yes | Graduation batch year |
| `parent_name` | `VARCHAR(150)` | Yes | Parent / Guardian Name |
| `parent_phone` | `VARCHAR(50)` | Yes | Parent contact phone |
| `route_id` | `BIGINT` | Yes (FK) | Reference to assigned `bus_routes(id)` |
| `bus_number` | `VARCHAR(50)` | Yes | Assigned bus number |
| `activation_key` | `VARCHAR(50)` | Yes | 4-char security code (`AM-XXXX`) / password |
| `is_registered` | `BOOLEAN` | Yes | Registration state |
| `registered_at` | `TIMESTAMPTZ` | Yes | Timestamp of student registration |
| `created_at` | `TIMESTAMPTZ` | Yes | Timestamp record was added |
| `updated_at` | `TIMESTAMPTZ` | Yes | Last profile update timestamp |

---

### 3.2. Deprecation & Removal of `route_code`

The obsolete column `route_code` has been safely and completely eliminated:
* **Database Migration**: `04_remove_route_code_migration.sql` drops the column safely via `ALTER TABLE bus_tracking.bus_routes DROP COLUMN IF EXISTS route_code;`.
* **SQL Seeds**: `bus_routes_rows.sql` has been sanitized to insert strictly into `(id, route_name, origin, destination, created_at, stops)`.
* **Backend**: Models, services, routes, and controllers strictly use `id` (primary key) and `route_name`.
* **Frontend**:
  * `RoutesPage.jsx`: 'ROUTE CODE' column has been removed.
  * Search filters match `route_name`, `origin`, and `destination`.
  * Add/Edit modals use `route_name` as the primary human identifier.

---

## 4. Backend Architecture & Synchronization

All backend database queries in `web/backend/services/` strictly query the schema `bus_tracking` via the centralized client in `config/supabase.js`:

```javascript
// Backend Service Layer Query Pattern:
const { db } = require('../config/supabase');

// Automatically queries bus_tracking.bus_routes
const { data, error } = await db.from('bus_routes').select('id, route_name, origin, destination, stops');
```

---

## 5. Frontend Architecture (`bus-admin`)

The React admin dashboard is built with Vite and features:
* **Buses Page** (`BusesPage.jsx`):
  * Clean, optimized table layout: Column widths rebalanced (Route: 21%, Bus No: 11%, Status: 12%, Actions: 14%).
  * Action buttons (View stops modal, Edit bus, Delete bus) with `flex-wrap: nowrap` and zero clipping.
* **Routes Page** (`RoutesPage.jsx`):
  * Clean 5-column table: **ID**, **Route Name**, **Origin**, **Destination**, and **Actions**.
  * Stops Sequence preview moved to interactive **View Stops Modal** (Eye icon).
* **Students Page** (`StudentsPage.jsx`):
  * 1,100+ student directory pagination with year and registration status filters.
  * Single student modal & CSV bulk import.
* **Dashboard** (`Dashboard.jsx`):
  * Live KPI cards (Total Buses, Active Now, Total Students).
  * Leaflet map visualization updating dynamically.

---

## 6. Step-by-Step Testing & Diagnostics

### 6.1. Database Diagnostics
Run the comprehensive diagnostic suite to test database connectivity, credentials, and table access:

```powershell
cd web/backend
node diagnose_supabase.js
```

Expected output:
```text
• Node Version:            v22+
• Target Schema:           bus_tracking
• SUPABASE_URL:            https://gcbqhrsphpjhkdxgbumj.supabase.co
• SUPABASE_ANON_KEY:       ✅ Configured
• SUPABASE_SERVICE_ROLE:   ✅ Configured
  ✅ buses            -> Status: 200 | OK
  ✅ students         -> Status: 200 | OK
  ✅ bus_routes       -> Status: 200 | OK
  ✅ bus_stops        -> Status: 200 | OK
  ✅ gps_telemetry    -> Status: 200 | OK
==================================================================
                    DIAGNOSTICS COMPLETE
==================================================================
```

### 6.2. Live Table Verification via Node.js
Verify that all 4 tables respond with live data and exact schema columns:

```powershell
cd web/backend
node test-supabase.js
```

Verify individual table counts and columns:
```powershell
node -e "require('dotenv').config(); const { db } = require('./config/supabase'); Promise.all([db.from('buses').select('count', { count: 'exact', head: true }), db.from('bus_routes').select('count', { count: 'exact', head: true }), db.from('students').select('count', { count: 'exact', head: true }), db.from('gps_telemetry').select('count', { count: 'exact', head: true })]).then(([b, r, s, g]) => console.log({ buses: b.count, routes: r.count, students: s.count, gps: g.count }));"
```

### 6.3. API Endpoint Testing via PowerShell / curl

Test public and core backend endpoints (ensure backend dev server is running on port 5000):

#### 1. Backend Health Check:
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/" -Method Get
```

#### 2. Public Buses & Stops (Flutter App Endpoint):
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/public/buses" -Method Get | ConvertTo-Json -Depth 3
```

#### 3. Student Verification Endpoint:
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/students/verify/F25GQME620" -Method Get
```

#### 4. Routes List Endpoint (with JWT / Dev Token):
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/routes" -Method Get
```

---

## 7. How to Apply Migrations in Supabase

To apply the schema changes and drop `route_code` in your Supabase project:
1. Log in to [Supabase Dashboard](https://supabase.com/dashboard).
2. Select your project (`gcbqhrsphpjhkdxgbumj`).
3. Click on **SQL Editor** in the left sidebar.
4. Open or copy the contents of [`web/backend/sql/04_remove_route_code_migration.sql`](file:///c:/Users/lokesh/Documents/flutter/BUSSYSTEM/web/backend/sql/04_remove_route_code_migration.sql).
5. Click **Run** to execute the migration.
6. Verify output confirms `route_code` is dropped.
