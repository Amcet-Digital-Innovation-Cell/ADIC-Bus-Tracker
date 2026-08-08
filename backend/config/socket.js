/**
 * config/socket.js
 * ─────────────────────────────────────────────────────────────
 * Socket.IO singleton.
 *
 * Pattern used: module-level singleton with init + getter.
 * This avoids circular import issues — any service can call
 * getIO() to broadcast events without importing the HTTP server.
 *
 * Usage:
 *   In server.js:  initSocket(httpServer)
 *   Anywhere else: const { getIO } = require('./config/socket');
 *                  getIO().emit('busLocationUpdated', payload);
 * ─────────────────────────────────────────────────────────────
 */

const { Server } = require("socket.io");
const config = require("./env");

/** @type {import("socket.io").Server | null} */
let io = null;

/**
 * Initialize Socket.IO on the given HTTP server.
 * Must be called once from server.js before the scheduler starts.
 *
 * @param {import("http").Server} httpServer
 * @returns {import("socket.io").Server}
 */
function initSocket(httpServer) {
  if (io) return io; // Guard against double-init

  io = new Server(httpServer, {
    cors: {
      origin: config.socket.corsOrigin,
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Increase ping timeout for mobile clients (Flutter app future support)
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on("connection", (socket) => {
    console.log(`[Socket.IO] Client connected   id=${socket.id}`);

    // Clients can join a named room (e.g. "bus:42") for targeted events
    socket.on("joinBus", (busId) => {
      socket.join(`bus:${busId}`);
      console.log(`[Socket.IO] Socket ${socket.id} joined room bus:${busId}`);
    });

    socket.on("leaveBus", (busId) => {
      socket.leave(`bus:${busId}`);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket.IO] Client disconnected id=${socket.id} reason=${reason}`);
    });
  });

  console.log("[Socket.IO] Server initialized ✅");
  return io;
}

/**
 * Returns the initialized Socket.IO instance.
 * Throws if called before initSocket().
 *
 * @returns {import("socket.io").Server}
 */
function getIO() {
  if (!io) {
    throw new Error(
      "[Socket.IO] Not initialized. Call initSocket(httpServer) in server.js first."
    );
  }
  return io;
}

module.exports = { initSocket, getIO };
