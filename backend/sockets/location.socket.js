/**
 * sockets/location.socket.js
 * ─────────────────────────────────────────────────────────────
 * Socket.IO event broadcaster for live bus location updates.
 *
 * This module does NOT manage the Socket.IO server itself.
 * The server is initialized in config/socket.js.
 *
 * broadcastBusLocation() is called by gpsScheduler.js every
 * time GPS coordinates change in the database.
 *
 * Event name: 'busLocationUpdated'
 * Payload:
 *   {
 *     busNumber:   string,   // e.g. "01"
 *     latitude:    number,
 *     longitude:   number,
 *     speed:       number,   // km/h from SkyNav
 *     status:      string,   // "active" | "inactive"
 *     updatedAt:   string,   // ISO timestamp
 *   }
 * ─────────────────────────────────────────────────────────────
 */

const { getIO } = require("../config/socket");

/**
 * broadcastBusLocation
 * Emits a 'busLocationUpdated' event to ALL connected clients
 * and also to the bus-specific room 'bus:<busNumber>'.
 *
 * Called from gpsScheduler.js after a successful Supabase update.
 *
 * @param {{
 *   busNumber: string,
 *   registrationNumber: string,
 *   latitude: number,
 *   longitude: number,
 *   speed: number,
 *   status: string,
 *   updatedAt: string
 * }} payload
 */
exports.broadcastBusLocation = (payload) => {
  try {
    const io = getIO();

    // Broadcast to ALL connected clients (React dashboard)
    io.emit("busLocationUpdated", payload);

    // Also emit to the bus-specific room (for future Flutter per-bus tracking)
    if (payload.busNumber) {
      io.to(`bus:${payload.busNumber}`).emit("busLocationUpdated", payload);
    }
  } catch (err) {
    // If Socket.IO is not initialized (e.g. during startup), log and continue
    console.warn("[Socket] broadcastBusLocation failed:", err.message);
  }
};
