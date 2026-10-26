# 🚍 AMCET Transit — College Bus Tracking & Transit Management System

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B%20%7C%20v20%2B%20%7C%20v22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-v5.2.1-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-v18.3.1-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-v6.0.5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v15%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20Database-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Jest](https://img.shields.io/badge/Jest-Tested%20100%25-C21325?logo=jest&logoColor=white)](https://jestjs.io/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-v4.8.1-010101?logo=socket.io&logoColor=white)](https://socket.io/)

> **Enterprise-Grade College Bus Tracking & Transit Administration Platform** for **Annai Mira College of Engineering and Technology (AMCET)**. Seamlessly integrates transport administrators, fleet drivers, IoT hardware GPS trackers, and student mobile applications into a secure, event-driven real-time transit ecosystem.

---

## 📑 Table of Contents

- [1. Application Features](#1-application-features)
  - [Administrative Web Portal](#administrative-web-portal)
  - [Mobile App Integration (Flutter / Student App)](#mobile-app-integration-flutter--student-app)
  - [Backend & IoT GPS Engine](#backend--iot-gps-engine)
- [2. System Architecture](#2-system-architecture)
  - [High-Level Architectural Diagram](#high-level-architectural-diagram)
  - [Event-Driven Real-Time Sync Flow](#event-driven-real-time-sync-flow)
- [3. Current Database Schema Structure](#3-current-database-schema-structure)
  - [Database Overview: Dedicated `bus_tracking` Schema](#database-overview-dedicated-bus_tracking-schema)
  - [Table: `bus_tracking.buses`](#table-bus_trackingbuses)
  - [Table: `bus_tracking.bus_routes`](#table-bus_trackingbus_routes)
  - [Table: `bus_tracking.students`](#table-bus_trackingstudents)
  - [Table: `bus_tracking.gps_telemetry`](#table-bus_trackinggps_telemetry)
  - [Table: `bus_tracking.activation_keys`](#table-bus_trackingactivation_keys)
  - [Table: `bus_tracking.system_configs`](#table-bus_trackingsystem_configs)
  - [View: `bus_tracking.students_with_stops_view`](#view-bus_trackingstudents_with_stops_view)
  - [JSONB Stops Schema & Lateral Projection](#jsonb-stops-schema--lateral-projection)
- [4. Complete API Reference & Use Cases](#4-complete-api-reference--use-cases)
  - [Overview & Base URLs](#overview--base-urls)
  - [Student Self-Service & Authentication APIs (Mobile)](#student-self-service--authentication-apis-mobile)
  - [Transit Routes & Dynamic Stops APIs](#transit-routes--dynamic-stops-apis)
  - [Student Administration & Roster APIs](#student-administration--roster-apis)
  - [Bus Fleet Management APIs](#bus-fleet-management-apis)
  - [Live GPS Telemetry & Hardware Push APIs](#live-gps-telemetry--hardware-push-apis)
  - [Dashboard Analytics APIs](#dashboard-analytics-apis)
  - [System Configuration APIs](#system-configuration-apis)
- [5. Repository Directory & File Structure](#5-repository-directory--file-structure)
  - [Root Workspace Files](#root-workspace-files)
  - [Backend Folder Structure & File Descriptions](#backend-folder-structure--file-descriptions)
  - [Frontend Folder Structure & File Descriptions](#frontend-folder-structure--file-descriptions)
- [6. Installation & Local Development](#6-installation--local-development)
  - [Prerequisites](#prerequisites)
  - [Environment Variables Setup](#environment-variables-setup)
  - [Running Backend & Frontend](#running-backend--frontend)
  - [Running Test Suite](#running-test-suite)
- [7. Maintainers & License](#7-maintainers--license)

---

## 1. Application Features

### Administrative Web Portal
1. **Interactive Real-Time Fleet Dashboard**:
   - Aggregate fleet metrics: Total Buses, Active Vehicles, Offline/Maintenance Units, and Registered Student Counts.
   - Interactive full-screen Leaflet map displaying real-time vehicle markers with smooth coordinate interpolation.
   - Live GPS tracking panel with telemetry cards: vehicle speed, ignition status, driver contacts, and assigned route progress.
2. **Student Transport Roster Management**:
   - Dynamic roster table rendering pre-loaded student profiles, assigned bus routes, pickup stops, bus numbers, and mobile registration status.
   - Instant search across Student ID, Full Name, Department, Email, and Route Name.
   - Multi-tier filtering by Academic Year (1st, 2nd, 3rd, 4th Year) and Registration Status (Registered vs. Pending).
   - Detailed Student Profile modal displaying comprehensive transit allocations and parent emergency contacts.
3. **Event-Driven Auto-Refresh (Zero Unnecessary Polling)**:
   - Built with **Supabase Realtime** (`postgres_changes` on `bus_tracking.students`).
   - The table automatically revalidates when a student self-registers or when an admin updates records, without periodic timer overhead or button spinning.
   - **Structural Equality Diffing (`areStudentListsEqual`)**: Incoming server records are compared against active state; unchanged data bypasses re-rendering completely to eliminate layout flickering.
   - Skeleton loader is strictly reserved for the first cold start; background updates update seamlessly in place.
4. **Resilient Route & Stop Selection**:
   - Route dropdown auto-loads routes and dynamic stops via cached API queries with `onFocus` fallback triggers.
   - Automatic route-name matching (`route_name` $\rightarrow$ `route_id`) ensures students with existing textual assignments are correctly bound in edit modals.
5. **High-Performance Bulk Student Importer**:
   - Ingests CSV or plain text student files formatted as `StudentID, Full Name, Academic Year`.
   - In-CSV duplicate detection and real-time database conflict checks.
   - Automatic header row detection, CSV validation statistics, and downloadable sample templates.
6. **Single Student Onboarding & Edit Modals**:
   - Full CRUD form handling: Student ID, Full Name, Academic Year, Department, Student Mobile, Email, Parent Guardian Name, Parent Phone, Assigned Route, and Assigned Bus Stop.
   - Synchronous dependent stop extraction: picking a route instantly surfaces its sequence of stops.
7. **Accessibility & Design Aesthetics**:
   - WCAG-compliant keyboard focus trapping (`useModalFocusTrap`) and <kbd>Escape</kbd> dismissal across all modals.
   - Centralized animated Toast notification system for CRUD confirmations.
   - Dark theme sidebar with active tab highlighting and responsive drawer layout.

---

### Mobile App Integration (Flutter / Student App)
1. **Student Self-Verification**:
   - Students input their college Student ID (`student_id` or Register Number); the system validates pre-loaded eligibility and returns their masked profile.
2. **Self-Registration & Transactional Email Activation**:
   - Mobile users confirm their profile, set their contact details, and self-register.
   - The backend automatically provisions a cryptographically secure `AM-XXXX` activation key and delivers it via the **Brevo HTTP REST API** to the student's email.
3. **Flexible Login**:
   - Students authenticate via either their registered credentials or their unique `AM-XXXX` activation key.
   - Audited key verification fallback against `bus_tracking.activation_keys`.
4. **Transit & Stop Allocation Resolution**:
   - Backend automatically maps student stops and routes to corresponding vehicle numbers and driver contacts for live tracking inside the mobile app.

---

### Backend & IoT GPS Engine
1. **Express 5 Modular Architecture**:
   - Strict separation of concerns (Routes $\rightarrow$ Controllers $\rightarrow$ Services $\rightarrow$ Supabase Database).
   - Standardized JSON response envelopes (`{ success, message, data, student }`).
2. **Autonomous SkyNav GPS Polling Pipeline**:
   - Resilient background worker (`gpsScheduler.js`) querying the SkyNav API, parsing raw telemetry, handling token expiration, and batch-upserting coordinates to Postgres.
3. **Direct Hardware Push Gateway**:
   - High-throughput push endpoint (`/api/realtime/gps/update`) accepting live hardware tracker coordinates and immediately broadcasting them over **Socket.IO**.
4. **Permissive Development Authentication**:
   - Public read access for transit routes (`/api/routes`) and permissive development access to student rosters, while strictly enforcing JWT authentication in production.
5. **Chunked Pagination**:
   - Bypasses Supabase 1,000-row query limits via programmatic `.range(from, to)` chunking to seamlessly deliver complete rosters (>10,000 students).

---

## 2. System Architecture

### High-Level Architectural Diagram

```text
 ┌─────────────────────────────────────────┐       ┌─────────────────────────────────────────┐
 │       Student Mobile Application        │       │       Transport Admin Web Portal        │
 │            (Flutter / Dart)             │       │            (React 18 + Vite)            │
 └────────────────────┬────────────────────┘       └────────────────────┬────────────────────┘
                      │ HTTPS (REST)                                    │ HTTPS + WebSockets
                      ▼                                                 ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────┐
 │                                Node.js Express Backend API                                │
 │   ├── JWT Auth & Permissive Middleware     ├── SkyNav IoT GPS Pull Scheduler              │
 │   ├── JSON Stop Resolution & Views         ├── Hardware Push Telemetry Receiver           │
 │   ├── Brevo Email Dispatcher (AM-XXXX)     └── Socket.IO Real-Time Telemetry Emitter      │
 └───────────────────────────────────────────┬───────────────────────────────────────────────┘
                                             │ Supabase Client v2 (Service Role & Schema Pool)
                                             ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────┐
 │                              Supabase PostgreSQL Database                                 │
 │                        Dedicated Schema: "bus_tracking"                                   │
 │   ├── buses (fleet metadata & driver info) ├── students (profiles, route_name, stop_name)│
 │   ├── bus_routes (JSONB stops array)       ├── gps_telemetry (live coordinates & speed)   │
 │   ├── activation_keys (audit trail)        └── students_with_stops_view (LATERAL join)    │
 └───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Event-Driven Real-Time Sync Flow

```text
1. Student registers on Mobile App OR Admin edits record in Portal
   │
   ▼
2. Backend persists record to Supabase (bus_tracking.students)
   │
   ▼
3. Supabase emits postgres_changes event via WebSocket
   │
   ▼
4. Frontend StudentsPage.jsx receives event on channel 'students-auto-sync'
   │
   ▼
5. Debounced triggerSilentSync() fetches fresh roster in background
   │
   ▼
6. areStudentListsEqual() performs shallow structural comparison:
   ├── Data Identical? ──► Reuses existing array reference (0 re-renders, 0 layout shifts)
   └── Data Changed?   ──► Smoothly updates only modified rows in place
```

---

## 3. Current Database Schema Structure

### Database Overview: Dedicated `bus_tracking` Schema
All transit tables are isolated inside the `bus_tracking` PostgreSQL schema to prevent naming collisions and enforce strict multi-tenant boundary security.

---

### Table: `bus_tracking.buses`
Stores college bus fleet vehicle metadata, assigned drivers, and current route mappings.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `BIGINT` | `PRIMARY KEY GENERATED ALWAYS AS IDENTITY` | Unique internal bus identifier |
| `bus_number` | `VARCHAR(50)` | `NOT NULL UNIQUE` | College fleet number (e.g., `"15"`, `"18"`, `"6"`) |
| `registration_number` | `VARCHAR(50)` | `NOT NULL UNIQUE` | Official RTO vehicle license plate (e.g., `"TN23AB1234"`) |
| `vehicle_number` | `VARCHAR(50)` | `NULLABLE` | Tracking identifier alias matching GPS tracker IMEI |
| `driver_name` | `VARCHAR(100)`| `NULLABLE` | Assigned driver full name |
| `driver_phone` | `VARCHAR(20)` | `NULLABLE` | Driver contact number |
| `license_number`| `VARCHAR(50)` | `NULLABLE` | Driver commercial driving license number |
| `route_id` | `BIGINT` | `REFERENCES bus_tracking.bus_routes(id)` | Current assigned route reference |
| `route_name` | `VARCHAR(100)`| `NULLABLE` | Denormalized human-readable route name |
| `status` | `VARCHAR(30)` | `DEFAULT 'Pending (GPS)'` | Status: `'Active'`, `'Inactive'`, `'Maintenance'`, `'Pending (GPS)'` |
| `latitude` | `DOUBLE PRECISION` | `NULLABLE` | Last reported GPS latitude coordinate |
| `longitude`| `DOUBLE PRECISION` | `NULLABLE` | Last reported GPS longitude coordinate |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Last update timestamp |

---

### Table: `bus_tracking.bus_routes`
Stores transit routes and their complete sequenced path of boarding stops as a structured JSONB document.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `BIGINT` | `PRIMARY KEY GENERATED ALWAYS AS IDENTITY` | Unique route ID |
| `route_name` | `VARCHAR(100)`| `NOT NULL UNIQUE` | Route name (e.g., `"AMBUR"`, `"KANNAMANGALAM"`, `"GUDIYATHAM"`) |
| `origin` | `VARCHAR(100)`| `NOT NULL` | Route starting point (e.g., `"AMBUR"`) |
| `destination`| `VARCHAR(100)`| `DEFAULT 'AMCET'` | Destination campus |
| `stops` | `JSONB` | `DEFAULT '[]'::jsonb` | Ordered array of stop objects with Unix ms IDs |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Route creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Route update timestamp |

---

### Table: `bus_tracking.students`
Stores both pre-loaded roster records and registered student mobile application credentials.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `BIGINT` | `PRIMARY KEY GENERATED ALWAYS AS IDENTITY` | Unique internal student ID |
| `student_id` | `VARCHAR(50)` | `NOT NULL UNIQUE` | College ID / Roll Number (e.g., `"F26GQAD406"`, `"5412"`) |
| `student_name` | `VARCHAR(100)`| `NOT NULL` | Student full legal name |
| `email` | `VARCHAR(150)`| `NULLABLE` | Registered email address (used for Brevo keys & auth) |
| `student_email`| `VARCHAR(150)`| `NULLABLE` | Alias for student email address |
| `department` | `VARCHAR(100)`| `NULLABLE` | Branch of study (e.g., `"Computer Science & Engineering"`) |
| `department_code` | `VARCHAR(20)` | `NULLABLE` | Department code abbreviation (e.g., `"CSE"`, `"IT"`) |
| `academic_year`| `VARCHAR(20)` | `DEFAULT '1st Year'` | Academic year (`'1st Year'`, `'2nd Year'`, `'3rd Year'`, `'4th Year'`) |
| `year` | `VARCHAR(20)` | `DEFAULT '1st Year'` | Database academic year format (`'1.0'`, `'2.0'`, `'3.0'`, `'4.0'`) |
| `pass_out_year`| `VARCHAR(10)` | `NULLABLE` | Expected graduation year |
| `student_mobile` | `VARCHAR(20)` | `NULLABLE` | Student phone number |
| `parent_name` | `VARCHAR(100)`| `NULLABLE` | Parent or guardian full name |
| `parent_phone` | `VARCHAR(20)` | `NULLABLE` | Emergency guardian contact number |
| `emergency_contact` | `VARCHAR(20)` | `NULLABLE` | Alternate emergency contact phone number |
| `activation_key`| `VARCHAR(50)` | `NULLABLE` | Generated `AM-XXXX` cryptographic activation key |
| `password_hash`| `VARCHAR(255)`| `NULLABLE` | Securely hashed password (if student configured custom password) |
| `route_id` | `BIGINT` | `NULLABLE` | Assigned bus route foreign key reference |
| **`route_name`** | `VARCHAR(100)`| `NULLABLE` | **Directly persisted route name** (e.g., `"AMBUR"`, `"KANNAMANGALAM"`) |
| `stop_id` | `TEXT` / `VARCHAR(100)` | `NULLABLE` | Assigned stop ID (stored as string to accommodate high-precision IDs) |
| **`stop_name`** | `VARCHAR(100)`| `NULLABLE` | **Directly persisted stop name** (e.g., `"RANIPET"`, `"USSOOR"`) |
| `boarding_stop`| `VARCHAR(100)`| `NULLABLE` | Boarding location alias |
| `drop_stop` | `VARCHAR(100)`| `NULLABLE` | Evening drop-off stop location |
| `bus_number` | `VARCHAR(50)` | `NULLABLE` | Assigned bus vehicle number |
| `is_registered`| `BOOLEAN` | `DEFAULT FALSE` | Registration flag (set to true on mobile registration) |
| `registered_at`| `TIMESTAMPTZ` | `NULLABLE` | Timestamp when student completed registration |
| `last_login_at`| `TIMESTAMPTZ` | `NULLABLE` | Last student mobile application login timestamp |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Record modification timestamp |

> [!NOTE]
> `route_name` and `stop_name` are now stored directly in `bus_tracking.students` as persistent physical columns. They are automatically backfilled and maintained during student creation and editing, guaranteeing 0ms lookup latency and eliminating complex runtime joins.

---

### Table: `bus_tracking.gps_telemetry`
Stores time-series GPS readings from IoT tracking units.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `BIGINT` | `PRIMARY KEY GENERATED ALWAYS AS IDENTITY` | Unique telemetry entry ID |
| `vehicle_number` | `VARCHAR(50)` | `NOT NULL` | Tracked bus vehicle number or SkyNav unit ID |
| `latitude` | `DOUBLE PRECISION` | `NOT NULL` | Decimal latitude coordinate |
| `longitude` | `DOUBLE PRECISION` | `NOT NULL` | Decimal longitude coordinate |
| `speed` | `DOUBLE PRECISION` | `DEFAULT 0.0` | Vehicle speed in km/h |
| `heading` | `DOUBLE PRECISION` | `DEFAULT 0.0` | Direction heading in degrees (0–360) |
| `ignition_status`| `BOOLEAN` | `DEFAULT FALSE` | Engine ignition status |
| `timestamp` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Telemetry collection timestamp |

---

### Table: `bus_tracking.activation_keys`
Audit log recording every issued activation token and verification event.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `BIGINT` | `PRIMARY KEY GENERATED ALWAYS AS IDENTITY` | Unique record ID |
| `student_id` | `VARCHAR(50)` | `NOT NULL` | Associated student identifier |
| `activation_key`| `VARCHAR(50)` | `NOT NULL` | Issued `AM-XXXX` token |
| `is_used` | `BOOLEAN` | `DEFAULT FALSE` | Token usage state |
| `used_at` | `TIMESTAMPTZ` | `NULLABLE` | Token redemption timestamp |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Token issue timestamp |

---

### Table: `bus_tracking.system_configs`
Stores administrative system configurations and integration flags.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `BIGINT` | `PRIMARY KEY GENERATED ALWAYS AS IDENTITY` | Internal ID |
| `key` | `VARCHAR(100)`| `NOT NULL UNIQUE` | Configuration key (e.g., `'GPS_POLL_INTERVAL_MS'`) |
| `value` | `TEXT` | `NOT NULL` | Configuration value |
| `description` | `TEXT` | `NULLABLE` | Human-readable explanation of key |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Last update timestamp |

---

### View: `bus_tracking.students_with_stops_view`
A PostgreSQL lateral unnesting view providing backward-compatible dynamic join access between students and embedded JSON stops:

```sql
CREATE OR REPLACE VIEW bus_tracking.students_with_stops_view AS
SELECT 
    s.*,
    COALESCE(s.stop_name, stop_elem->>'stop_name', s.boarding_stop) AS resolved_stop_name,
    COALESCE(s.route_name, r.route_name) AS resolved_route_name,
    COALESCE(s.bus_number, b.bus_number) AS resolved_bus_number
FROM bus_tracking.students s
LEFT JOIN bus_tracking.bus_routes r ON s.route_id = r.id
LEFT JOIN LATERAL jsonb_array_elements(r.stops) AS stop_elem 
    ON (stop_elem->>'id')::text = s.stop_id::text
LEFT JOIN bus_tracking.buses b ON b.route_id = s.route_id;
```

---

### JSONB Stops Schema & Lateral Projection
Each route in `bus_tracking.bus_routes.stops` contains an ordered JSON array:

```json
[
  {
    "id": "1792671106096.69",
    "stop_name": "OCHERI",
    "stop_order": 1
  },
  {
    "id": "1792671110307.25",
    "stop_name": "KAVERIPAKKAM",
    "stop_order": 2
  },
  {
    "id": "1792671135006.47",
    "stop_name": "RANIPET",
    "stop_order": 3
  },
  {
    "id": "1792671139359.26",
    "stop_name": "AMCET",
    "stop_order": 4
  }
]
```

- **High-Precision Numeric IDs**: Encoded with floating-point Unix millisecond timestamps (e.g., `1792671106096.69`). Stored as `TEXT` in student records to prevent integer precision truncation.
- **Ordered Route Sequences**: `stop_order` guarantees deterministic sequencing for stop builder modals and driver navigation manifests.

---

## 4. Complete API Reference & Use Cases

### Overview & Base URLs
- **Local API Base**: `http://localhost:3001`
- **Standard Response Envelope**:
  ```json
  {
    "success": true,
    "message": "Operation completed successfully",
    "data": { ... }
  }
  ```

---

### Student Self-Service & Authentication APIs (Mobile)

#### 1. Student ID Verification
- **Endpoint**: `GET /api/students/verify/:student_id`
- **Access**: Public (Unauthenticated)
- **Use Case**: Called by the Flutter mobile app when a student enters their College ID. Verifies pre-loaded eligibility and returns their department, assigned route, and masked registration status.
- **Sample Response**:
  ```json
  {
    "success": true,
    "message": "Student ID verified successfully.",
    "student": {
      "student_id": "F26GQAD406",
      "student_name": "ANISH V",
      "department": "B.E - Computer Science and Engineering",
      "year": "1st Year",
      "route_name": "AMBUR",
      "stop_name": "RANIPET",
      "bus_number": "15",
      "is_registered": false
    }
  }
  ```

#### 2. Student Self-Registration
- **Endpoint**: `POST /api/students/register`
- **Access**: Public (Unauthenticated)
- **Use Case**: Called during mobile app onboarding. Validates student profile, assigns bus details, provisions a secure `AM-XXXX` activation key, and dispatches an email via Brevo.
- **Request Body**:
  ```json
  {
    "student_id": "F26GQAD406",
    "student_name": "ANISH V",
    "email": "anish@gmail.com",
    "student_mobile": "9876543210",
    "parent_name": "Venkatesan",
    "parent_phone": "9842012345",
    "route_name": "AMBUR",
    "stop_name": "RANIPET",
    "academic_year": "1st Year"
  }
  ```

#### 3. Student Mobile Login
- **Endpoint**: `POST /api/students/login`
- **Access**: Public (Unauthenticated)
- **Use Case**: Authenticates a student via their `student_id` and password or issued `AM-XXXX` activation key. Returns resolved route, assigned bus number, vehicle number, and driver details.
- **Request Body**:
  ```json
  {
    "student_id": "F26GQAD406",
    "password": "AM-8TZX"
  }
  ```

#### 4. Forgot Password / Request Key
- **Endpoint**: `POST /api/students/forgot-password`
- **Access**: Public (Unauthenticated)
- **Use Case**: Dispatches a new `AM-XXXX` reset token to the student's registered email address via Brevo.

#### 5. Reset Password
- **Endpoint**: `POST /api/students/reset-password`
- **Access**: Public (Unauthenticated)
- **Use Case**: Validates current reset token/key and stores new student password.

#### 6. Email Service Health & Test Dispatch
- `GET /api/students/email-status`: Returns Brevo transactional email configuration state.
- `POST /api/students/test-email`: Sends a test activation key to verify SMTP/HTTP delivery.

---

### Transit Routes & Dynamic Stops APIs

| Method | Route | Access | Description & Use Case |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/routes` | Permissive (`optionalAuthenticate`) | Retrieves all 12 college bus routes with embedded JSON stops. Populates admin and student route dropdowns. |
| `GET` | `/api/routes/:route_id/stops` | Permissive (`optionalAuthenticate`) | Extracts JSON stops array for a specific route without loading entire route metadata. |
| `GET` | `/api/routes/:id` | Permissive (`optionalAuthenticate`) | Returns single route details by route ID. |
| `POST` | `/api/routes` | Protected (`authenticate`) | Creates a new bus route with custom origin, destination, and sequenced JSON stops. |
| `PUT` | `/api/routes/:id` | Protected (`authenticate`) | Updates route name or re-sequences stop order. |
| `DELETE`| `/api/routes/:id` | Protected (`authenticate`) | Deletes a route record from the database. |

---

### Student Administration & Roster APIs

| Method | Route | Access | Description & Use Case |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/students` | Permissive (`optionalAuthenticate`) | Chunked pagination fetcher delivering the complete student roster with persistent `route_name` and `stop_name`. |
| `POST` | `/api/students` | Protected (`authenticate`) | Adds a single student record with immediate in-memory cache invalidation. |
| `POST` | `/api/students/import` | Protected (`authenticate`) | High-speed bulk CSV importer with in-CSV and in-DB duplicate skipping. |
| `PUT` | `/api/students/:id` | Protected (`authenticate`) | Updates student profile, contact numbers, route, and boarding stop. |
| `DELETE`| `/api/students/:id` | Protected (`authenticate`) | Removes a student from the transport database. |

---

### Bus Fleet Management APIs

| Method | Route | Access | Description & Use Case |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/buses` | Protected (`authenticate`) | Lists all buses merged with live GPS telemetry, driver information, and route paths. |
| `GET` | `/api/buses/:id` | Protected (`authenticate`) | Retrieves detailed specifications and driver contacts for a single bus. |
| `POST` | `/api/buses` | Protected (`authenticate`) | Adds a new bus vehicle to the transport fleet. |
| `PUT` | `/api/buses/:id` | Protected (`authenticate`) | Updates vehicle assignment, driver details, or maintenance status. |
| `DELETE`| `/api/buses/:id` | Protected (`authenticate`) | Decommissions a vehicle from the fleet. |

---

### Live GPS Telemetry & Hardware Push APIs

| Method | Route | Access | Description & Use Case |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/realtime/gps/update` | Protected (`authenticate`) | Ingests live latitude/longitude push from hardware IoT trackers and immediately emits Socket.IO update events. |
| `GET` | `/api/realtime/gps/live` | Protected (`authenticate`) | Reads current in-memory GPS state for all connected tracker units. |
| `GET` | `/api/realtime/gps/history` | Protected (`authenticate`) | Retrieves in-memory circular buffer breadcrumbs for route playback. |
| `GET` | `/api/gps/status` | Protected (`authenticate`) | Checks SkyNav background scheduler health, error rates, and last polling timestamp. |
| `GET` | `/api/gps/sync` | Protected (`authenticate`) | Triggers an immediate manual SkyNav API sync cycle. |
| `GET` | `/api/gps/vehicles` | Protected (`authenticate`) | Returns list of vehicles actively reporting telemetry on SkyNav. |
| `GET` | `/api/gps/location/:vehicleNumber`| Protected (`authenticate`) | Returns current GPS coordinates for a specific license plate. |

---

### Dashboard Analytics APIs

- **Endpoint**: `GET /api/dashboard`
- **Access**: Protected (`authenticate`)
- **Use Case**: Returns aggregated metrics for top KPI cards: Total Registered Buses, Active Units, Offline Fleet Units, and Fleet Health Status.

---

### System Configuration APIs

- `GET /api/admin/configs`: Reads system configurations (e.g. `GPS_POLL_INTERVAL_MS`).
- `PUT /api/admin/configs/:key`: Updates an administrative configuration parameter in `bus_tracking.system_configs`.

---

## 5. Repository Directory & File Structure

```text
BUSSYSTEM/web/
├── .env.example                                  # Root environment variables template
├── .gitignore                                    # Git exclusion rules
├── package-lock.json                             # Root lockfile
├── README.md                                     # System documentation (You are here)
├── supabase db.txt                               # Quick-reference Supabase schema connection notes
│
├── backend/                                      # Express 5 REST API & IoT GPS Engine
│   ├── .env                                      # Active backend environment variables (git-ignored)
│   ├── .env.example                              # Template with all required backend config keys
│   ├── app.js                                    # Express app factory, CORS, logger, and route mounting
│   ├── server.js                                 # HTTP server bootstrap, Socket.IO, and scheduler launch
│   ├── package.json                              # Backend dependencies (Express 5, Supabase, Socket.IO)
│   ├── nodemon.json                              # Nodemon hot-reloading configuration
│   ├── diagnose_supabase.js                      # Diagnostic utility verifying Supabase schema connectivity
│   ├── test-skynav.js                            # Standalone test script validating SkyNav IoT authentication
│   ├── test-supabase.js                          # Standalone verification script for Supabase tables
│   ├── tracker.js                                # Background simulation utility for vehicle telemetry
│   │
│   ├── config/                                   # Core Configuration Modules
│   │   ├── env.js                                # Environment variable validation & fallback defaults
│   │   ├── socket.js                             # Singleton Socket.IO server initialization
│   │   └── supabase.js                           # Supabase Client Factory (bus_tracking schema isolation)
│   │
│   ├── controllers/                              # Express Route Controllers
│   │   ├── bus.controller.js                     # Fleet CRUD & metadata query handlers
│   │   ├── dashboard.controller.js               # Fleet analytics and aggregate KPI calculations
│   │   ├── public.controller.js                  # Unauthenticated student endpoints (mobile fleet views)
│   │   └── route.controller.js                   # Route queries & JSON stops extraction handlers
│   │
│   ├── docs/                                     # System Architecture & Technical Specifications
│   │   ├── ARCHITECTURE.md                       # Comprehensive deep-dive into platform architecture
│   │   ├── DATABASE_SCHEMA_SEPARATION.md         # Schema separation migration documentation
│   │   ├── GPS_ARCHITECTURE.md                   # SkyNav polling & hardware push pipeline specifications
│   │   ├── TEAM_WALKTHROUGH.md                   # Engineering onboard walkthrough guide
│   │   └── skynav.txt                            # Raw SkyNav API payload responses & documentation
│   │
│   ├── gps/                                      # SkyNav Autonomous IoT GPS Integration
│   │   ├── gps.controller.js                     # Manual sync and GPS telemetry inspection handlers
│   │   ├── gps.routes.js                         # Express routing for /api/gps endpoints
│   │   ├── gps.service.js                        # SkyNav REST API client with automatic token renew
│   │   ├── gpsLogger.js                          # Standardized console & file logger for GPS events
│   │   ├── gpsParser.js                          # Raw telemetry sanitization & GPS data normalizer
│   │   ├── gpsScheduler.js                       # Autonomous 30s background polling scheduler
│   │   └── gpsUpdater.js                         # Coordinate delta comparison & Supabase batch updater
│   │
│   ├── middleware/                               # Request Lifecycle Middleware
│   │   ├── auth.middleware.js                    # Supabase JWT token verification & optionalAuthenticate
│   │   ├── error.middleware.js                   # Centralized error handler formatting JSON error responses
│   │   └── logger.middleware.js                  # Request logging interceptor (Method, URL, Status, Latency)
│   │
│   ├── routes/                                   # REST API Route Declarations
│   │   ├── admin.routes.js                       # System configuration routes (/api/admin)
│   │   ├── bus.routes.js                         # Fleet management routes (/api/buses)
│   │   ├── dashboard.routes.js                   # Dashboard KPI routes (/api/dashboard)
│   │   ├── public.routes.js                      # Unauthenticated student routes (/api/public)
│   │   ├── realtimeGps.routes.js                 # Direct hardware GPS push endpoints (/api/realtime/gps)
│   │   ├── route.routes.js                       # Bus route & stop sequences (/api/routes)
│   │   └── students.js                           # Student verification, registration, login & admin roster
│   │
│   ├── services/                                 # Database Data Access Layer
│   │   ├── admin.service.js                      # Supabase queries for admin configurations
│   │   ├── bus.service.js                        # Fleet bus operations merged with live GPS telemetry
│   │   ├── dashboard.service.js                  # Fleet operational status computations
│   │   └── route.service.js                      # Route & stop queries targeting bus_tracking schema
│   │
│   ├── sockets/                                  # WebSockets (Socket.IO)
│   │   └── location.socket.js                    # Live GPS event broadcaster for moving vehicles
│   │
│   ├── sql/                                      # PostgreSQL Database Migrations & Seeds
│   │   ├── 01_amcet_schema_separation.sql        # Baseline DDL establishing bus_tracking schema & tables
│   │   ├── 04_remove_route_code_migration.sql    # Clean-up migration removing deprecated route_code
│   │   ├── 06_alter_stop_id_type.sql             # Alters student stop_id to text for high-precision IDs
│   │   ├── 07_ensure_and_backfill_students_route_name.sql # Adds and backfills persistent route_name
│   │   ├── 08_ensure_and_backfill_students_stop_name.sql  # Adds and backfills persistent stop_name
│   │   ├── bus_routes_rows.sql                   # Seed dataset for 12 AMCET bus routes and stops
│   │   ├── buses_rows.sql                        # Seed dataset for fleet vehicles and driver details
│   │   ├── gps_telemetry_rows.sql                # Initial telemetry seed
│   │   └── students_rows.sql                     # Production student roster seed dataset
│   │
│   ├── tests/                                    # Automated Jest & Supertest Suite
│   │   ├── auth.test.js                          # Security tests: JWT verification, token expiry, schemas
│   │   └── postman_auth_security_collection.json # Automated Postman test collection
│   │
│   └── utils/                                    # Shared Helpers & Utilities
│       ├── email.js                              # Brevo HTTP REST API integration for AM-XXXX keys
│       ├── httpClient.js                         # HTTP client configured with retry logic
│       ├── realtimeState.js                      # In-memory circular buffer for high-frequency GPS logs
│       ├── responseHelper.js                     # Standardized success/error JSON response builder
│       └── sendEmail.js                          # Email dispatch helper module
│
└── frontend/bus-admin/                           # React 18 + Vite Administration Portal
    ├── .env                                      # Active frontend environment variables (git-ignored)
    ├── .env.example                              # Template for frontend environment variables
    ├── index.html                                # HTML5 single-page application entry point
    ├── vite.config.js                            # Vite bundler configuration (port 8000, alias resolution)
    ├── package.json                              # Frontend dependencies (React 18, Lucide, Leaflet)
    │
    └── src/
        ├── App.css                               # Root application layout, navigation drawer styles
        ├── App.jsx                               # Top-level shell navigation, auth sync, and route definitions
        ├── index.css                             # Global typography, color tokens, and design variables
        ├── main.jsx                              # Application mount point wrapped with ToastProvider
        │
        ├── components/                           # Modular UI Components
        │   ├── BusInfoCard.jsx                   # Selected bus telemetry & driver profile card
        │   ├── BusList.jsx                       # Tabular fleet status overview list
        │   ├── BusRow.jsx                        # Single vehicle row item with quick action buttons
        │   ├── ErrorBoundary.jsx                 # UI error boundary fallback interceptor
        │   ├── LogoutModal.jsx                   # Accessible sign-out confirmation dialog
        │   ├── MapView.jsx                       # Leaflet map container displaying real-time bus markers
        │   ├── Skeletons.jsx                     # Shimmer skeleton loaders for smooth loading
        │   ├── TrackLocationView.jsx             # Dedicated live vehicle tracking panel with telemetry
        │   ├── ViewStopsModal.css                # Stylesheet for route stops visualizer
        │   └── ViewStopsModal.jsx                # Sequenced stops viewer with order badges
        │
        ├── context/                              # Shared React Context
        │   └── ToastContext.jsx                  # Context provider managing animated toast notifications
        │
        ├── hooks/                                # Custom React Hooks
        │   ├── useDataCache.js                   # In-memory SWR caching and 220ms search debouncing
        │   ├── useModalFocusTrap.js              # Accessible modal focus trapping & Escape key listener
        │   └── useSocketBus.js                   # Socket.IO client hook managing live coordinate updates
        │
        ├── lib/                                  # API Clients & Service Integrations
        │   ├── apiClient.js                      # Centralized API client with automatic token attachment
        │   ├── studentService.js                 # Student normalization, mapping, and API endpoints
        │   └── supabaseClient.js                 # Supabase client factory for admin session management
        │
        └── pages/                                # Dashboard Route Views
            ├── BusesPage.jsx                     # Fleet bus management, driver assignment & CRUD
            ├── Dashboard.css                     # Grid styles and metric KPI card layouts
            ├── Dashboard.jsx                     # Primary analytics overview with map and fleet counters
            ├── login.jsx                         # Admin authentication form
            ├── Profile.jsx                       # Admin profile details and password manager
            ├── RoutesPage.jsx                    # Route builder & stop sequence editor
            ├── Students.css                      # Student table styling, sync bar, and modal forms
            └── StudentsPage.jsx                  # Event-driven student roster, search, CSV import & edit
```

---

## 6. Installation & Local Development

### Prerequisites
- **Node.js**: `v18.0.0` or higher (`v20+` recommended)
- **npm**: `v9.0.0` or higher
- **PostgreSQL / Supabase**: Active Supabase project with database privileges

---

### Environment Variables Setup

#### 1. Backend (`backend/.env`):
```ini
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:8000,http://localhost:3000

# Supabase Credentials (from Supabase Dashboard -> Settings -> API)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# SkyNav GPS Configuration (Optional for mock testing)
SKYNAV_API_URL=https://api.skynav.in/v1
SKYNAV_USERNAME=your-username
SKYNAV_PASSWORD=your-password
SKYNAV_PROJECT_ID=37
GPS_POLL_INTERVAL_MS=80000

# Brevo Transactional Email (Optional for student activation keys)
BREVO_API_KEY=your-brevo-api-key
SENDER_EMAIL=transport@amcet.in
SENDER_NAME="AMCET Transport"
```

#### 2. Frontend (`frontend/bus-admin/.env`):
```ini
# Backend API Base URL (no trailing slash)
VITE_API_URL=http://localhost:3001

# Supabase Public Keys for Admin Auth
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

---

### Running Backend & Frontend

```bash
# 1. Start the Express API Backend
cd backend
npm install
npm run dev

# 2. In a separate terminal, start the React Admin Portal
cd frontend/bus-admin
npm install
npm run dev
```

- **Backend API**: `http://localhost:3001`
- **Frontend Dashboard**: `http://localhost:8000`

---

### Running Test Suite

```bash
cd backend
npm test
```

Runs Jest and Supertest suites covering JWT authentication, permissive development access, token invalidation, and schema isolation.

---

## 7. Maintainers & License

Developed for **Annai Mira College of Engineering and Technology (AMCET)**.  
Maintained by the **ADIC (AMCET Digital Innovation Cell)**. All rights reserved.
