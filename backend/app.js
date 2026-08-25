/**
 * app.js
 * ─────────────────────────────────────────────────────────────
 * Express application factory.
 *
 * This file creates and configures the Express app.
 * It does NOT start the HTTP server (that's server.js).
 *
 * Route Architecture:
 *   Public:    none (auth is handled entirely by Supabase on the frontend)
 *   Protected: all API routes require a valid Supabase JWT
 *
 * Removed from original:
 *   ❌ /api/auth  — frontend authenticates directly with Supabase
 *   ❌ /api/locations  — replaced by GPS scheduler pipeline
 *   ❌ /api/routes     — empty placeholder, removed
 *   ❌ /api/stops      — empty placeholder, removed
 * ─────────────────────────────────────────────────────────────
 */

const express = require("express");
const cors = require("cors");

const config = require("./config/env");

const { authenticate } = require("./middleware/auth.middleware");
const { errorHandler } = require("./middleware/error.middleware");
const { logger } = require("./middleware/logger.middleware");

const busRoutes = require("./routes/bus.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const gpsRoutes = require("./gps/gps.routes");
const routeRoutes = require("./routes/route.routes");
const publicRoutes = require("./routes/public.routes");
const realtimeGpsRoutes = require("./routes/realtimeGps.routes");
const traccarRoutes = require("./routes/traccar.routes");

const app = express();

// Parse FRONTEND_URL — supports comma-separated values for multiple domains
// e.g. FRONTEND_URL=https://bus-transit-indol.vercel.app,https://old-app.vercel.app
const parsedOrigins = config.frontendUrl === "*"
  ? "*"
  : [
    ...config.frontendUrl.split(",").map((u) => u.trim()).filter(Boolean),
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:8000",  // Vite dev server (current local dev port)
    "http://127.0.0.1:8000",
  ];

const corsOptions = {
  origin: parsedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: config.frontendUrl !== "*",
};

app.use(cors(corsOptions));
app.options("/{*path}", cors(corsOptions)); // Pre-flight (Express v5 wildcard syntax)

// ── Body parsing & logging ────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(logger);

// ── Public routes (no auth required) ─────────────────────────────────────
// Traccar webhook must be public — GPS hardware cannot send a user JWT.
app.use("/traccar/webhook", traccarRoutes);

// ── Health check (public) ─────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "AmcetTransit Bus Tracking API 🚌",
    version: "2.1.0",
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// ── Public API routes ─────────────────────────────────────────────────────
// These routes DO NOT require authentication (used by Student App).
app.use("/api/public", publicRoutes);

// ── Protected API routes ──────────────────────────────────────────────────
// All routes below require a valid Supabase JWT in Authorization header.
// Format: Authorization: Bearer <supabase_access_token>

// Fleet dashboard statistics
app.use("/api/dashboard", authenticate, dashboardRoutes);

// Bus data (read + metadata update)
app.use("/api/buses", authenticate, busRoutes);

// Routes list dropdown metadata
app.use("/api/routes", authenticate, routeRoutes);

// GPS sync (manual trigger) and scheduler status
app.use("/api/gps", authenticate, gpsRoutes);

// Real-time device GPS push endpoints (direct device → server)
app.use("/api/realtime/gps", authenticate, realtimeGpsRoutes);

// ── 404 catch-all ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err);
});

// ── Central error handler (must be last middleware) ───────────────────────
app.use(errorHandler);

module.exports = app;