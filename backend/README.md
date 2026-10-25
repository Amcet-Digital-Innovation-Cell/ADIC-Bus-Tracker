# 🚍 AMCET Transit — College Bus Tracking & Transit Management System

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B%20%7C%20v20%2B%20%7C%20v22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-v5.2.1-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-v18.3.1-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-v6.0.5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v15%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20Database-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Jest](https://img.shields.io/badge/Jest-Tested%20100%25-C21325?logo=jest&logoColor=white)](https://jestjs.io/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-v4.8.1-010101?logo=socket.io&logoColor=white)](https://socket.io/)

> **Enterprise-grade bus tracking and transit administration platform** for AMCET (Adhiyamaan College of Engineering and Technology). Connects college administrators, fleet operators, hardware IoT GPS units, and student mobile applications into a unified, secure real-time ecosystem.

---

## 📑 Table of Contents

- [1. Project Overview & System Architecture](#1-project-overview--system-architecture)
  - [Core Capabilities](#core-capabilities)
  - [Architectural Diagram](#architectural-diagram)
  - [JSON-Based Stops Architecture](#json-based-stops-architecture)
  - [Authentication & Security Model](#authentication--security-model)
- [2. Frontend Features, Updates & Directory Structure](#2-frontend-features-updates--directory-structure)
  - [Current Features](#current-frontend-features)
  - [Recent Performance & UX Updates](#recent-frontend-performance--ux-updates)
  - [Frontend Folder Structure](#frontend-folder-structure)
- [3. Backend Features, Updates & Directory Structure](#3-backend-features-updates--directory-structure)
  - [Current Features](#current-backend-features)
  - [Recent Architectural & Security Updates](#recent-backend-architectural--security-updates)
  - [Complete API Endpoints Reference](#complete-api-endpoints-reference)
  - [Backend Folder Structure](#backend-folder-structure)
- [4. Installation & Getting Started](#4-installation--getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables (.env) Setup](#environment-variables-env-setup)
  - [Dependency Installation](#dependency-installation)
  - [Running the Services Locally](#running-the-services-locally)
  - [Running Automated Tests](#running-automated-tests)
  - [Database Setup & Migrations](#database-setup--migrations)
- [5. License & Team](#5-license--team)

---

## 1. Project Overview & System Architecture

**AMCET Transit** is a full-stack transit management solution built specifically for college transportation fleets. The platform eliminates paper passes and manual route tracking by providing automated IoT GPS streaming, digital student pass verification, route dispatching, and self-service mobile registration.

### Core Capabilities:
1. **Live GPS Fleet Tracking**: Ingests automated telemetry from SkyNav IoT hardware every 30 seconds alongside direct device push streams (`/api/realtime/gps/update`), streaming live coordinates to administrative maps via WebSockets (Socket.IO).
2. **Student & Pass Management**: Full administrative lifecycle management (add, edit, bulk CSV import, activation, pass validity) with dual-envelope JSON API contracts.
3. **Flexible JSON Stop Architecture**: Dynamic bus stops stored directly inside `bus_routes.stops` as structured JSONB arrays, removing the overhead of complex many-to-many join tables while enabling rapid route alterations.
4. **Stateless JWT Security**: Multi-tier authentication verifying Supabase JWT tokens statelessly across all protected admin routes with isolated schema access (`bus_tracking`).

### Architectural Diagram:

```text
 ┌─────────────────────────────────────────┐       ┌─────────────────────────────────────────┐
 │       Student Mobile Application        │       │       Transport Admin Web Portal        │
 │            (Flutter / Dart)             │       │            (React 18 + Vite)            │
 └────────────────────┬────────────────────┘       └────────────────────┬────────────────────┘
                      │ HTTPS (REST)                                    │ HTTPS + WebSockets
                      ▼                                                 ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────┐
 │                                Node.js Express Backend API                                │
 │   ├── JWT Auth Middleware (Bearer Token)   ├── SkyNav IoT GPS Pull Scheduler (30s)        │
 │   ├── JSON Stop Resolution & Validation    ├── Hardware Push Telemetry Receiver           │
 │   ├── Brevo Email Dispatcher (AM-XXXX)     └── Socket.IO Broadcast Engine                 │
 └───────────────────────────────────────────┬───────────────────────────────────────────────┘
                                             │ Supabase Client v2 (Pool & Service Role)
                                             ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────┐
 │                              Supabase PostgreSQL Database                                 │
 │                        Dedicated Schema: "bus_tracking"                                   │
 │   ├── buses (fleet metadata & driver info) ├── students (profiles, stop_id, pass status)  │
 │   ├── bus_routes (JSONB stops array)       ├── gps_telemetry (live coordinates & speed)   │
 │   └── system_configs (admin settings)      └── students_with_stops_view (LATERAL join)    │
 └───────────────────────────────────────────────────────────────────────────────────────────┘
```

### JSON-Based Stops Architecture

Instead of rigid normalized tables that require multiple joins, each route in `bus_tracking.bus_routes` contains a structured JSONB array in the `stops` column:

```json
[
  {
    "id": 1792417045014,
    "stop_name": "SANKARANPALAYAM",
    "stop_order": 1,
    "pickup_time": "07:15 AM",
    "drop_time": "05:45 PM"
  },
  {
    "id": 1792417045015,
    "stop_name": "BAGALUR HUDCO",
    "stop_order": 2,
    "pickup_time": "07:25 AM",
    "drop_time": "05:35 PM"
  }
]
```

- **High-Precision IDs**: Stop IDs use Unix millisecond timestamps (`1792417045014`), stored and parsed as 64-bit values (`BIGINT` or string equivalents) to prevent 32-bit integer overflow.
- **Dynamic Lateral Projection**: The backend queries stops using Postgres `jsonb_array_elements` via the `bus_tracking.students_with_stops_view` view, automatically mapping `stop_name` without application-level overhead.

### Authentication & Security Model

```text
Client Request ──► Authorization: Bearer <supabase_jwt>
                         │
                         ▼
               auth.middleware.js
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
Token Missing / Corrupted?         Valid Supabase Token?
   └── Return 401 Unauthorized        ├── Verify user via Supabase Auth
                                      ├── Attach req.user = { id, email }
                                      └── Next() ──► Protected Controller
```

- **Stateless Verification**: Protected endpoints validate tokens directly using the Supabase Auth verification engine.
- **Production Isolation**: In development mode, public endpoints bypass auth if credentials are not configured, while production strictly enforces tokens across all `/api/buses`, `/api/routes`, `/api/students`, and `/api/gps` routes.

---

## 2. Frontend Features, Updates & Directory Structure

The administrator frontend is built with **React 18** and **Vite**, delivering a fast, responsive Single Page Application (SPA) styled with custom modern CSS and responsive Tailwind utilities.

### Current Frontend Features:
- **Interactive Fleet Dashboard**: Real-time status cards (Active, Inactive, Maintenance), emergency alerts, quick actions, and automated WebSocket updates for moving buses.
- **Student Roster Management**: Comprehensive student directory with multi-column filtering, department categorization, pass status indicators, and live bus stop badges.
- **Add & Edit Student Modal**: Fully validated input forms with real-time route selection, dependent stop dropdowns, contact verification, and academic year pickers.
- **Interactive Bus Map View**: Leaflet-powered visual tracking showcasing live bus coordinates, route polylines, stop markers, and vehicle telemetry cards.
- **Route & Fleet Management**: CRUD interfaces for configuring route paths, updating JSON stops order, and assigning drivers to buses.

### Recent Frontend Performance & UX Updates:
1. **SWR State Caching (`useDataCache`)**: Built-in in-memory caching hook with stale-while-revalidate pattern to avoid redundant network roundtrips when reopening modals or toggling tabs.
2. **Synchronous Dependent Dropdowns**: Selecting a route instantaneously filters and populates the stop dropdown from local route cache, eliminating race conditions and visual stutter.
3. **Debounced Search (`useDebounce`)**: 220ms search debouncing prevents expensive table re-renders and network thrashing during live student filtering.
4. **Accessible Modal Focus Trap (`useModalFocusTrap`)**: Automatically locks keyboard focus within open modals and handles <kbd>Escape</kbd> key dismissal for WCAG compliance.
5. **Centralized Toast System (`ToastContext`)**: Smooth, animated notifications for CRUD actions (`Student added successfully`, `Route updated`, `Deletion confirmed`).
6. **Skeleton Loaders (`Skeletons.jsx`)**: Clean placeholder shimmer animations replace layout shifts during initial fetches.

### Frontend Folder Structure:

```text
frontend/bus-admin/
├── index.html                        # Single-page HTML entry point
├── package.json                      # Frontend dependencies (React 18, Vite, Lucide, Leaflet)
├── vite.config.js                    # Vite configuration (port 8000, alias resolution)
└── src/
    ├── App.css                       # Global layouts & transition styles
    ├── App.jsx                       # Top-level shell navigation & protected route guards
    ├── index.css                     # Design tokens, variables & typography imports
    ├── main.jsx                      # Application mount point wrapped with ToastProvider
    ├── components/                   # Reusable UI components
    │   ├── BusInfoCard.jsx           # Vehicle telemetry detail card
    │   ├── BusList.jsx               # Tabular bus fleet overview
    │   ├── BusRow.jsx                # Single vehicle row with action buttons
    │   ├── ErrorBoundary.jsx         # React UI error boundary fallback
    │   ├── LogoutModal.jsx           # Secure sign-out confirmation dialog
    │   ├── MapView.jsx               # Leaflet map container with custom bus markers
    │   ├── Skeletons.jsx             # Shimmer skeleton loaders (Table, Card, Dropdown)
    │   ├── TrackLocationView.jsx     # Live GPS vehicle telemetry panel
    │   ├── ViewStopsModal.css        # Modal dialog stylesheet
    │   └── ViewStopsModal.jsx        # Route stops viewer & sequence visualizer
    ├── context/
    │   └── ToastContext.jsx          # Context provider for animated toast alerts
    ├── hooks/                        # Custom React hooks
    │   ├── useDataCache.js           # In-memory SWR data caching & search debouncing
    │   ├── useModalFocusTrap.js      # Accessible keyboard focus trapping & ESC handler
    │   └── useSocketBus.js           # Real-time Socket.IO telemetry hook
    ├── lib/                          # Core service libraries & network clients
    │   ├── apiClient.js              # Axios instance configured with JWT interceptors
    │   ├── studentService.js         # Student & Route API integration service
    │   └── supabaseClient.js         # Supabase client for admin authentication
    └── pages/                        # Primary route pages
        ├── BusesPage.jsx             # Bus fleet management page
        ├── Dashboard.css             # Dashboard grid & card layouts
        ├── Dashboard.jsx             # Fleet metrics & analytics page
        ├── login.jsx                 # Admin authentication view
        ├── Profile.jsx               # Admin user profile & preferences
        ├── RoutesPage.jsx            # Route creation and stops configuration page
        ├── Students.css              # Student roster table & modal styling
        └── StudentsPage.jsx          # Student directory & Add/Edit student workflows
```

---

## 3. Backend Features, Updates & Directory Structure

The backend is built with **Node.js** and **Express 5**, using a modular layered architecture (Routes $\rightarrow$ Controllers $\rightarrow$ Services $\rightarrow$ Supabase Database).

### Current Backend Features:
- **Express 5 REST API**: Strict RESTful architecture with standardized response envelopes (`{ success, message, data, student }`).
- **PostgreSQL Schema Isolation**: Dedicated `bus_tracking` schema isolating fleet tables (`buses`, `bus_routes`, `students`, `gps_telemetry`) from default schemas.
- **SkyNav GPS Autonomous Poller**: Resilient 30-second background polling cycle that extracts IoT telemetry, handles token refresh, and upserts vehicle coordinates.
- **Direct Real-Time Push Gateway**: High-frequency push endpoint (`/api/realtime/gps/update`) capable of receiving continuous GPS simulator streams.
- **Transactional Email Dispatch (Brevo)**: Asynchronous delivery of cryptographically secure `AM-XXXX` activation keys upon registration or password reset.
- **Automated Security Test Suite**: End-to-end Jest and Supertest test suite validating token security, schema isolation, and error middleware.

### Recent Backend Architectural & Security Updates:
1. **JSONB Stop Extraction Endpoint**: Dedicated `GET /api/routes/:route_id/stops` extracts stop lists cleanly from `bus_tracking.bus_routes.stops` without overhead.
2. **Postgres Lateral Stop View**: Added `bus_tracking.students_with_stops_view` using `jsonb_array_elements` for instant cross-table stop name resolution.
3. **Comprehensive Student Validation**: Mandatory field checks (`student_id`, `academic_year`, `student_name`, `department`, `student_mobile`, `student_email`, `parent_name`, `parent_phone`, `route_id`, `stop_id`) before persistence.
4. **Multi-Field Payload Normalization**: Flexible request parsers supporting both camelCase and snake_case properties from mobile and web clients.
5. **Standardized Error Middleware**: Centralized error interceptor ensuring stack traces are redacted in production and formatted as clean JSON.

### Complete API Endpoints Reference:

#### Public Endpoints (Mobile App & Health Checks)
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/` | API status, version, and server timestamp |
| `GET` | `/api/public/buses` | Public read-only list of routes and fleet units |
| `GET` | `/api/public/buses/:id/tracking` | Public vehicle tracking status for mobile app |
| `GET` | `/api/students/verify/:student_id` | Student ID pre-verification (returns masked email) |
| `POST` | `/api/students/register` | Student self-registration and activation |
| `POST` | `/api/students/login` | Student login via password or `AM-XXXX` key |
| `POST` | `/api/students/forgot-password` | Generate and dispatch password reset key |
| `POST` | `/api/students/reset-password` | Reset password using verified key |
| `GET` | `/api/students/email-status` | Brevo email service configuration health check |
| `POST` | `/api/students/test-email` | Trigger test email delivery |

#### Protected Endpoints (Requires `Authorization: Bearer <token>`)
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/dashboard` | Fleet analytics and aggregate KPI statistics |
| `GET` | `/api/buses` | List all buses with drivers, routes, and stops |
| `GET` | `/api/buses/:id` | Fetch details for a specific bus |
| `POST` | `/api/buses` | Register a new bus in the fleet |
| `PUT` | `/api/buses/:id` | Update bus driver, route, or metadata |
| `DELETE`| `/api/buses/:id` | Remove a bus from the fleet |
| `GET` | `/api/routes` | List all routes with embedded JSON stops |
| `GET` | `/api/routes/:route_id/stops` | Extract stops JSON array for a specific route |
| `GET` | `/api/routes/:id` | Fetch specific route by ID |
| `POST` | `/api/routes` | Create a new bus route with stops |
| `PUT` | `/api/routes/:id` | Update an existing route and stops array |
| `DELETE`| `/api/routes/:id` | Delete a bus route |
| `GET` | `/api/students` | Fetch student roster with route & stop names |
| `POST` | `/api/students` | Register a single student (Admin) |
| `POST` | `/api/students/import` | Bulk import student profiles from CSV/JSON |
| `PUT` | `/api/students/:id` | Update student profile and transit assignments |
| `DELETE`| `/api/students/:id` | Delete student record from roster |
| `GET` | `/api/gps/status` | SkyNav GPS background scheduler status |
| `GET` | `/api/gps/sync` | Manually trigger a SkyNav GPS sync cycle |
| `GET` | `/api/gps/vehicles` | All vehicles' current GPS telemetry |
| `GET` | `/api/gps/location/:vehicleNumber`| Real-time latitude/longitude for vehicle |
| `POST` | `/api/realtime/gps/update` | Ingest raw hardware GPS coordinates & emit Socket.IO |
| `GET` | `/api/realtime/gps/live` | Current in-memory GPS position |
| `GET` | `/api/realtime/gps/history` | In-memory GPS breadcrumb history |
| `GET` | `/api/admin/configs` | Retrieve system configuration settings |
| `PUT` | `/api/admin/configs/:key` | Update system configuration setting |

### Backend Folder Structure:

```text
backend/
├── app.js                            # Express application setup, CORS & route mounts
├── server.js                         # HTTP server, Socket.IO & GPS scheduler startup
├── package.json                      # Backend dependencies & test scripts
├── .env.example                      # Template for backend environment variables
├── config/
│   ├── env.js                        # Environment variable schema & validation
│   ├── socket.js                     # Singleton Socket.IO instance
│   └── supabase.js                   # Supabase client (Anon & Service Role for bus_tracking)
├── controllers/
│   ├── bus.controller.js             # Bus fleet CRUD handlers
│   ├── dashboard.controller.js       # KPI metrics aggregation handler
│   ├── public.controller.js          # Unauthenticated mobile app endpoints
│   └── route.controller.js           # Route & stop extraction handlers
├── gps/                              # SkyNav GPS integration pipeline
│   ├── gps.controller.js             # GPS sync & vehicle query controller
│   ├── gps.routes.js                 # Express routes for GPS endpoints
│   ├── gps.service.js                # SkyNav external API HTTP client
│   ├── gpsLogger.js                  # Standardized GPS logger
│   ├── gpsParser.js                  # Telemetry sanitization & parser
│   ├── gpsScheduler.js               # 30-second autonomous polling scheduler
│   └── gpsUpdater.js                 # Coordinates comparison & Supabase batch updater
├── middleware/
│   ├── auth.middleware.js            # Bearer JWT verification against Supabase Auth
│   ├── error.middleware.js           # Centralized global error handling middleware
│   └── logger.middleware.js          # HTTP request logger (Method, URL, Status, Latency)
├── routes/
│   ├── admin.routes.js               # Admin configuration routes (/api/admin)
│   ├── bus.routes.js                 # Fleet management routes (/api/buses)
│   ├── dashboard.routes.js           # Dashboard metrics routes (/api/dashboard)
│   ├── public.routes.js              # Unauthenticated student routes (/api/public)
│   ├── realtimeGps.routes.js         # Hardware device push routes (/api/realtime/gps)
│   ├── route.routes.js               # Route management routes (/api/routes)
│   └── students.js                   # Student management & auth routes (/api/students)
├── services/
│   ├── admin.service.js              # Database operations for admin configurations
│   ├── bus.service.js                # Bus operations with dynamic GPS telemetry merge
│   ├── dashboard.service.js          # Fleet metrics computation
│   └── route.service.js              # Route & stop queries targeting bus_tracking schema
├── sockets/
│   └── location.socket.js            # WebSocket event emitters for live telemetry
├── sql/                              # Database Schema & Migrations
│   ├── 01_amcet_schema_separation.sql# Core bus_tracking schema DDL
│   ├── 04_remove_route_code_migration.sql # Drop legacy route_code column
│   └── 05_students_stops_lateral_view.sql # JSON stops LATERAL view
├── tests/                            # Automated Testing Suite
│   ├── auth.test.js                  # Jest & Supertest authentication test suite
│   └── postman_auth_security_collection.json # Postman security testing collection
└── utils/
    ├── email.js                      # Brevo HTTP API email sender (AM-XXXX keys)
    ├── httpClient.js                 # Axios HTTP client with retry logic
    ├── realtimeState.js              # In-memory circular buffer for push GPS logs
    └── responseHelper.js             # Standardized JSON response envelope helpers
```

---

## 4. Installation & Getting Started

### Prerequisites:
- **Node.js**: `v18.0.0` or higher (`v20+` recommended)
- **npm**: `v9.0.0` or higher
- **PostgreSQL / Supabase**: Active Supabase project with database privileges

---

### Environment Variables (.env) Setup

#### 1. Backend Environment Setup:
Create a `.env` file in `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

Populate the required configuration keys:
```ini
# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:8000,http://localhost:3000

# Supabase Credentials (from Supabase Dashboard -> Settings -> API)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# SkyNav GPS Configuration (Optional for local testing)
SKYNAV_API_URL=https://api.skynav.in/v1
SKYNAV_BEARER_TOKEN=your-bearer-token
SKYNAV_USERNAME=your-username
SKYNAV_PASSWORD=your-password
SKYNAV_PROJECT_ID=your-project-id
SKYNAV_COMPANY_NAME=your-company
GPS_POLL_INTERVAL_MS=30000

# Brevo Transactional Email (Optional for student activation keys)
BREVO_API_KEY=your-brevo-api-key
SENDER_EMAIL=transport@amcet.edu.in
SENDER_NAME="AMCET Transit"
```

#### 2. Frontend Environment Setup:
Create a `.env` file in `frontend/bus-admin/.env`:

```bash
cp frontend/bus-admin/.env.example frontend/bus-admin/.env
```

Populate the frontend variables (must be prefixed with `VITE_`):
```ini
# Backend API Base URL (no trailing slash)
VITE_API_URL=http://localhost:3001

# Supabase Public Keys for Admin Auth
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

---

### Dependency Installation

Install dependencies for both projects from your terminal:

```bash
# 1. Install Backend Dependencies
cd backend
npm install

# 2. Install Frontend Dependencies
cd ../frontend/bus-admin
npm install
```

---

### Running the Services Locally

#### Start the Backend API Server:
```bash
cd backend
npm run dev
```
*The backend API will start on **`http://localhost:3001`** with hot reloading enabled via Nodemon.*

#### Start the Frontend Admin Portal:
```bash
cd frontend/bus-admin
npm run dev
```
*The React admin dashboard will start on **`http://localhost:8000`** with Vite HMR.*

---

### Running Automated Tests

The backend includes a comprehensive Jest and Supertest test suite covering authentication middleware, token invalidation, expired tokens, and schema isolation:

```bash
cd backend
npm test
```

Expected test output:
```text
 PASS  tests/auth.test.js
  Authentication Middleware & Endpoint Security Suite
    1. Unauthenticated Requests (Missing Token)
      √ should return 401 Unauthorized when Authorization header is missing (124 ms)
      √ should return 401 Unauthorized when Bearer token is empty (18 ms)
    2. Malformed / Invalid JWT Tokens
      √ should return 401 Unauthorized for completely bogus JWT string (24 ms)
      √ should return 401 Unauthorized for token missing signatures (15 ms)
      √ should reject tokens with invalid headers (16 ms)
    3. Expired JWT Tokens
      √ should reject expired tokens with 401 Unauthorized (19 ms)
    4. Valid Authenticated Requests
      √ should permit access to /api/routes with a valid Supabase token (35 ms)
      √ should permit access to /api/students with a valid Supabase token (28 ms)
    5. Public Endpoint Accessibility
      √ should permit access to GET / without any Authorization header (14 ms)
      √ should permit access to GET /api/public/buses without any token (18 ms)
    6. Database Schema Isolation
      √ should verify backend is configured to query bus_tracking schema (12 ms)

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        4.69 s
```

#### Testing with Postman:
Import the pre-configured Postman test collection located at:
```text
backend/tests/postman_auth_security_collection.json
```
The collection includes automated assertion scripts for all positive and negative security test cases.

---

### Database Setup & Migrations

All SQL table definitions, functions, and views are located in `backend/sql/`.

To apply or verify the database schema:
1. Open your **Supabase Dashboard** $\rightarrow$ **SQL Editor**.
2. Run [01_amcet_schema_separation.sql](file:///c:/Users/lokesh/Documents/flutter/BUSSYSTEM/web/backend/sql/01_amcet_schema_separation.sql) to create the `bus_tracking` schema, tables (`buses`, `bus_routes`, `students`, `gps_telemetry`), and security policies.
3. Run [05_students_stops_lateral_view.sql](file:///c:/Users/lokesh/Documents/flutter/BUSSYSTEM/web/backend/sql/05_students_stops_lateral_view.sql) to create the `students_with_stops_view` for automatic JSON stop resolution.

To verify Supabase connectivity directly from the backend:
```bash
cd backend
node diagnose_supabase.js
```

---

## 5. License & Team

Developed for **ANNAI MIRA COLLEGE OF ENGINEERING AND TECHNOLOGY (AMCET)**.  
Maintained by the **ADIC (AMCET Digital Innovation Cell)**. All rights reserved.
