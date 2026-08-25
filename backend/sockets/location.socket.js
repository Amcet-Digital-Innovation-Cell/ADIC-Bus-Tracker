/**
 * sockets/location.socket.js
 * ─────────────────────────────────────────────────────────────
 * Socket.IO event broadcaster for live bus GPS location updates.
 *
 * This module does NOT manage the Socket.IO server itself.
 * The server is initialized in config/socket.js.
 *
 * broadcastBusLocation() is called by gpsScheduler.js every time
 * GPS data is upserted to gps_telemetry.
 *
 * Event name: 'busLocationUpdated'
 * Payload (safe — no secrets):
 *   {
 *     vehicleNumber: string,   // e.g. "TN11BE7456"
 *     latitude:      number,
 *     longitude:     number,
 *     speed:         number,   // km/h from SkyNav
 *     rawStatus:     string,   // "STOP" | "RUNNING" | etc.
 *     ignition:      string,   // "ON" | "OFF"
 *     location:      string,   // Location address from SkyNav
 *     gpsActualTime: string,   // ISO 8601 UTC timestamp
 *     receivedAt:    string,   // ISO 8601 UTC timestamp
 *   }
 *
 * IMPORTANT: Do NOT emit secrets, IMEI, passwords, or service-role keys.
 * ─────────────────────────────────────────────────────────────
 */

"use strict";

const { getIO } = require("../config/socket");

/**
 * broadcastBusLocation
 * Emits 'busLocationUpdated' to ALL connected clients and also
 * to the vehicle-specific room 'vehicle:<vehicleNumber>'.
 *
 * @param {{
 *   vehicleNumber: string,
 *   latitude:      number,
 *   longitude:     number,
 *   speed:         number,
 *   rawStatus:     string,
 *   ignition:      string,
 *   location:      string,
 *   gpsActualTime: string,
 *   receivedAt:    string
 * }} payload
 */
exports.broadcastBusLocation = (payload) => {
  try {
    const io = getIO();

    // Safe payload — strip anything that shouldn't reach the browser
    const safePayload = {
      vehicleNumber: payload.vehicleNumber,
      latitude: payload.latitude,
      longitude: payload.longitude,
      speed: payload.speed,
      rawStatus: payload.rawStatus,
      ignition: payload.ignition,
      location: payload.location,
      gpsActualTime: payload.gpsActualTime,
      receivedAt: payload.receivedAt,
    };

    // Broadcast to ALL connected clients (React dashboard)
    io.emit("busLocationUpdated", safePayload);

    // Also emit to the vehicle-specific room for targeted subscriptions
    if (payload.vehicleNumber) {
      io.to(`vehicle:${payload.vehicleNumber}`).emit("busLocationUpdated", safePayload);
    }

    console.log(`[Socket] 📡 Emitted busLocationUpdated | vehicle=${payload.vehicleNumber}`);

  } catch (err) {
    // Socket.IO not initialized yet (e.g. during startup tests) — log and continue
    console.warn("[Socket] broadcastBusLocation failed:", err.message);
  }
};
