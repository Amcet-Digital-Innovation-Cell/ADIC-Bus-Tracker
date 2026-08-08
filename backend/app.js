/**
 * app.js
 * ─────────────────────────────────────────────────────────────
 * Express application factory.
 *
 * This file creates and configures the Express app.
 * It does NOT start the HTTP server (that's server.js).
 *
 * Route Architecture:
 *   Public:    POST /traccar/webhook  (hardware GPS device, no JWT)
 *   Protected: all /api/* routes require a valid Supabase JWT
 *
 * Merged from real time/Bus-tracking1-SKR:
 *   ✅ /api/realtime/gps/*  — raw device GPS push endpoints
 *   ✅ /traccar/webhook     — Traccar GPS server webhook (public)
 *   ✅ tracker.js           — GPS simulator (dev tool, run separately)
 *
 * Removed from original:
 *   ❌ /api/auth  — frontend authenticates directly with Supabase
 *   ❌ /api/locations  — replaced by GPS scheduler pipeline
 *   ❌ /api/routes     — empty placeholder, removed
 *   ❌ /api/stops      — empty placeholder, removed
 * ─────────────────────────────────────────────────────────────
 */

const express = require("express");
const cors    = require("cors");

const config = require("./config/env");

const { authenticate } = require("./middleware/auth.middleware");
const { errorHandler }  = require("./middleware/error.middleware");
const { logger }        = require("./middleware/logger.middleware");

const busRoutes          = require("./routes/bus.routes");
const dashboardRoutes    = require("./routes/dashboard.routes");
const gpsRoutes          = require("./gps/gps.routes");
const realtimeGpsRoutes  = require("./routes/realtimeGps.routes");
const traccarRoutes      = require("./routes/traccar.routes");

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────
// Allow requests from the configured frontend URL.
// In production set FRONTEND_URL=https://your-app.vercel.app in Render.
// During development, defaults to '*' so local Vite dev server works.
const corsOptions = {
  origin: config.frontendUrl === "*"
    ? "*"
    : [config.frontendUrl, "http://localhost:5173", "http://localhost:3000"],
  methods:     ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
    message:     "AmcetTransit Bus Tracking API 🚌",
    version:     "2.0.0",
    environment: config.nodeEnv,
    timestamp:   new Date().toISOString(),
  });
});

// ── Protected API routes ──────────────────────────────────────────────────
// All routes below require a valid Supabase JWT in Authorization header.
// Format: Authorization: Bearer <supabase_access_token>

// Fleet dashboard statistics
app.use("/api/dashboard", authenticate, dashboardRoutes);

// Bus data (read + metadata update)
app.use("/api/buses",            authenticate, busRoutes);

// GPS sync (manual trigger, SkyNav scheduler) and scheduler status
app.use("/api/gps",              authenticate, gpsRoutes);

// Real-time device GPS push endpoints (direct device → server)
// Includes: POST /update, GET /live, GET /history, GET /history/db, DELETE /history
app.use("/api/realtime/gps",     authenticate, realtimeGpsRoutes);

// ── 404 catch-all ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err);
});

// ── Central error handler (must be last middleware) ───────────────────────
app.use(errorHandler);

module.exports = app;