/**
 * gps/gps.controller.js
 * ─────────────────────────────────────────────────────────────
 * GPS API endpoint handlers.
 *
 * Provides two endpoints:
 *   GET /api/gps/sync   — Manually trigger one GPS sync cycle
 *   GET /api/gps/status — Return scheduler health status
 *
 * Both are protected by the Supabase JWT middleware.
 * ─────────────────────────────────────────────────────────────
 */

const gpsService = require("./gps.service");
const { parseGpsResponse } = require("./gpsParser");
const { updateGpsCoordinates } = require("./gpsUpdater");
const { broadcastBusLocation } = require("../sockets/location.socket");
const { getSchedulerStatus } = require("./gpsScheduler");
const { success, error } = require("../utils/responseHelper");
const gpsLogger = require("./gpsLogger");

/**
 * GET /api/gps/sync
 * Manually triggers a single GPS sync cycle.
 * Useful for testing, debugging, or on-demand refreshes.
 *
 * Returns summary of what was updated.
 */
exports.syncNow = async (req, res, next) => {
  try {
    const syncStart = Date.now();

    // Fetch from SkyNav
    const rawData = await gpsService.fetchGpsData();

    if (rawData === null) {
      return success(res, {
        message: "SkyNav GPS credentials not configured",
        skynavConfigured: false,
      }, "GPS not configured", 200);
    }

    // Parse
    const gpsRecords = parseGpsResponse(rawData);

    // Update Supabase
    const { updated, skipped, unknown } = await updateGpsCoordinates(gpsRecords);

    // Broadcast Socket.IO
    for (const bus of updated) {
      broadcastBusLocation({
        busNumber:          bus.bus_number,
        registrationNumber: bus.registration_number,
        latitude:           bus.latitude,
        longitude:          bus.longitude,
        speed:              bus.speed || 0,
        status:             bus.status,
        updatedAt:          bus.updated_at,
      });
    }

    const duration = Date.now() - syncStart;

    return success(res, {
      updated: updated.length,
      skipped,
      unknown,
      durationMs: duration,
      buses: updated.map((b) => ({
        id:                 b.id,
        busNumber:          b.bus_number,
        registrationNumber: b.registration_number,
        latitude:           b.latitude,
        longitude:          b.longitude,
        status:             b.status,
        updatedAt:          b.updated_at,
      })),
    }, "GPS sync completed");

  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/gps/status
 * Returns the current state of the GPS background scheduler.
 *
 * Response:
 *   {
 *     running:          boolean,
 *     syncCount:        number,
 *     errorCount:       number,
 *     lastSyncAt:       string | null,
 *     lastSyncStatus:   string,
 *     pollIntervalMs:   number,
 *     skynavConfigured: boolean
 *   }
 */
exports.getStatus = (req, res) => {
  const status = getSchedulerStatus();
  return success(res, status, "GPS scheduler status");
};
