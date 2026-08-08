/**
 * gps/gpsScheduler.js
 * ─────────────────────────────────────────────────────────────
 * Background GPS polling service.
 *
 * Orchestrates the full GPS synchronization pipeline:
 *
 *   Every 30 seconds (configurable via GPS_POLL_INTERVAL_MS):
 *     1. Call SkyNav API via gps.service.js
 *     2. Parse raw response via gpsParser.js
 *     3. Update Supabase buses table via gpsUpdater.js
 *     4. Broadcast Socket.IO events via location.socket.js
 *     5. Log results via gpsLogger.js
 *
 * Features:
 *   ✅ Starts automatically when Express server starts
 *   ✅ Graceful error recovery (one failure doesn't stop the loop)
 *   ✅ Status tracking (lastSync, syncCount, errorCount)
 *   ✅ Skips poll cycle if SkyNav credentials not configured
 *   ✅ Can be queried via GET /api/gps/status
 * ─────────────────────────────────────────────────────────────
 */

const config = require("../config/env");
const gpsService = require("./gps.service");
const { parseGpsResponse } = require("./gpsParser");
const { updateGpsCoordinates } = require("./gpsUpdater");
const { broadcastBusLocation } = require("../sockets/location.socket");
const gpsLogger = require("./gpsLogger");

// ── Scheduler state ────────────────────────────────────────────────────────
const state = {
  running: false,
  syncCount: 0,
  errorCount: 0,
  lastSyncAt: null,
  lastSyncStatus: "not_started", // "success" | "error" | "skipped" | "not_started"
  intervalHandle: null,
};

/**
 * runSyncCycle
 * Executes one complete GPS synchronization cycle.
 * Errors are caught here so the interval continues running.
 */
async function runSyncCycle() {
  state.syncCount++;
  const attempt = state.syncCount;
  const cycleStart = Date.now();

  gpsLogger.logSyncStart(attempt);

  try {
    // ── Step 1: Fetch raw GPS data from SkyNav ─────────────
    const rawData = await gpsService.fetchGpsData();

    if (rawData === null) {
      // Credentials not configured — skip this cycle silently
      state.lastSyncStatus = "skipped";
      state.lastSyncAt = new Date().toISOString();
      return;
    }

    // ── Step 2: Parse and validate the response ────────────
    const gpsRecords = parseGpsResponse(rawData);

    if (gpsRecords.length === 0) {
      console.log(`[GPS] Sync #${attempt} — no valid GPS records in response`);
      state.lastSyncStatus = "skipped";
      state.lastSyncAt = new Date().toISOString();
      return;
    }

    // ── Step 3: Update Supabase ────────────────────────────
    const { updated, skipped, unknown } = await updateGpsCoordinates(gpsRecords);

    // ── Step 4: Broadcast Socket.IO events ─────────────────
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

    // ── Step 5: Log results ────────────────────────────────
    const duration = Date.now() - cycleStart;
    gpsLogger.logSyncSuccess(attempt, updated.length, skipped, duration);

    state.lastSyncStatus = "success";
    state.lastSyncAt = new Date().toISOString();
    state.errorCount = 0; // Reset consecutive error count on success

  } catch (err) {
    state.errorCount++;
    state.lastSyncStatus = "error";
    state.lastSyncAt = new Date().toISOString();
    gpsLogger.logSyncError(attempt, err);

    // If there are many consecutive errors, increase log severity
    if (state.errorCount >= 5) {
      console.error(
        `[GPS] ⚠️  ${state.errorCount} consecutive GPS sync failures. Check SkyNav connectivity.`
      );
    }
  }
}

/**
 * startGpsScheduler
 * Starts the background polling interval.
 * Called once from server.js after the HTTP server is ready.
 *
 * @returns {void}
 */
exports.startGpsScheduler = () => {
  if (state.running) {
    console.warn("[GPS] Scheduler already running. Ignoring duplicate start.");
    return;
  }

  const intervalMs = config.skynav.pollIntervalMs;

  console.log(
    `[GPS] Scheduler starting — polling every ${intervalMs / 1000}s ⏱️`
  );

  // Run the first sync immediately after a short startup delay
  // so the server finishes booting before the first SkyNav call
  setTimeout(() => {
    runSyncCycle();
  }, 3000); // 3-second startup grace period

  // Schedule recurring sync
  state.intervalHandle = setInterval(runSyncCycle, intervalMs);
  state.running = true;
};

/**
 * stopGpsScheduler
 * Stops the background polling interval.
 * Useful for graceful shutdown.
 *
 * @returns {void}
 */
exports.stopGpsScheduler = () => {
  if (state.intervalHandle) {
    clearInterval(state.intervalHandle);
    state.intervalHandle = null;
    state.running = false;
    console.log("[GPS] Scheduler stopped.");
  }
};

/**
 * getSchedulerStatus
 * Returns current scheduler state for the /api/gps/status endpoint.
 *
 * @returns {{
 *   running: boolean,
 *   syncCount: number,
 *   errorCount: number,
 *   lastSyncAt: string|null,
 *   lastSyncStatus: string,
 *   pollIntervalMs: number,
 *   skynavConfigured: boolean
 * }}
 */
exports.getSchedulerStatus = () => ({
  running: state.running,
  syncCount: state.syncCount,
  errorCount: state.errorCount,
  lastSyncAt: state.lastSyncAt,
  lastSyncStatus: state.lastSyncStatus,
  pollIntervalMs: config.skynav.pollIntervalMs,
  skynavConfigured: config.skynav.isConfigured,
});
