/**
 * utils/realtimeState.js
 * ─────────────────────────────────────────────────────────────
 * Shared in-memory state for real-time GPS endpoints.
 *
 * Exported as a plain object so that both the route handler and
 * any future WebSocket handler share the exact same reference.
 *
 * Shape:
 *   currentLocation — last received GPS payload (or {})
 *   gpsHistory      — array of all received GPS payloads
 * ─────────────────────────────────────────────────────────────
 */

const realtimeState = {
  /** @type {Object} Latest GPS payload received from a device */
  currentLocation: {},

  /** @type {Array<Object>} Full history of GPS payloads (in-memory only) */
  gpsHistory: [],
};

module.exports = realtimeState;
