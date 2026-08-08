/**
 * server.js
 * ─────────────────────────────────────────────────────────────
 * HTTP server entry point.
 *
 * Boot sequence:
 *   1. Load environment variables (config/env.js validates them)
 *   2. Create Express app
 *   3. Create raw Node.js HTTP server from the Express app
 *   4. Attach Socket.IO to the HTTP server
 *   5. Start listening on configured port
 *   6. Start GPS background scheduler (after server is ready)
 *
 * Why separate server.js from app.js?
 *   app.js exports the Express instance for testing.
 *   server.js handles the real-world HTTP server lifecycle.
 * ─────────────────────────────────────────────────────────────
 */

const http   = require("http");
const path   = require("path");

// ── Load environment variables ─────────────────────────────────────────────
// Must be the FIRST thing that runs. config/env.js also validates
// required variables and exits the process if any are missing.
require("./config/env");

const app    = require("./app");
const config = require("./config/env");
const { initSocket }        = require("./config/socket");
const { startGpsScheduler } = require("./gps/gpsScheduler");

// ── Create HTTP server ─────────────────────────────────────────────────────
// Using http.createServer() instead of app.listen() so that
// Socket.IO can be attached to the same underlying server.
const httpServer = http.createServer(app);

// ── Attach Socket.IO ───────────────────────────────────────────────────────
// Must happen before httpServer.listen() so clients can connect
// immediately when the server starts.
initSocket(httpServer);

// ── Start listening ────────────────────────────────────────────────────────
httpServer.listen(config.port, () => {
  console.log("═══════════════════════════════════════════════");
  console.log("  🚌  AmcetTransit Bus Tracking — v2.1.0");
  console.log("═══════════════════════════════════════════════");
  console.log(`  🌐  HTTP   : http://localhost:${config.port}`);
  console.log(`  🔌  Socket : ws://localhost:${config.port}`);
  console.log(`  🌍  Env    : ${config.nodeEnv}`);
  console.log(`  📡  CORS   : ${config.frontendUrl}`);
  console.log("═══════════════════════════════════════════════");
  console.log("  Routes:");
  console.log(`  🔒  GET  /api/dashboard          (SkyNav stats)`);
  console.log(`  🔒  GET  /api/buses              (fleet list)`);
  console.log(`  🔒  GET  /api/gps/sync           (manual SkyNav sync)`);
  console.log(`  🔒  GET  /api/gps/status         (scheduler status)`);
  console.log(`  🔒  POST /api/realtime/gps/update (device GPS push)`);
  console.log(`  🔒  GET  /api/realtime/gps/live  (latest GPS location)`);
  console.log(`  🔑  POST /traccar/webhook         (Traccar webhook, public)`);
  console.log("═══════════════════════════════════════════════");

  // ── Start GPS scheduler AFTER server is ready ──────────────
  // This ensures Socket.IO is initialized before the first
  // GPS sync tries to broadcast events.
  startGpsScheduler();
});

// ── Graceful shutdown handler ──────────────────────────────────────────────
const { stopGpsScheduler } = require("./gps/gpsScheduler");

process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received. Shutting down gracefully…");
  stopGpsScheduler();
  httpServer.close(() => {
    console.log("[Server] HTTP server closed.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[Server] SIGINT received. Shutting down gracefully…");
  stopGpsScheduler();
  httpServer.close(() => {
    console.log("[Server] HTTP server closed.");
    process.exit(0);
  });
});