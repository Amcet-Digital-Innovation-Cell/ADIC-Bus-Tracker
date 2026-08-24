/**
 * gps/gpsScheduler.js
 * ─────────────────────────────────────────────────────────────
 * Background GPS polling service.
 *
 * Orchestrates the full GPS synchronization pipeline:
 *
 *   Every GPS_POLL_INTERVAL_MS (default 60s for demo):
 *     1. Call SkyNav API via gps.service.js
 *     2. Parse raw response via gpsParser.js
 *     3. UPSERT gps_telemetry via gpsUpdater.js
 *     4. Broadcast Socket.IO events via location.socket.js
 *     5. Log results via gpsLogger.js
 *
 * Features:
 *   ✅ Starts after server is ready
 *   ✅ Graceful error recovery (one failure doesn't stop the loop)
 *   ✅ Overlap prevention (skips cycle if previous still running)
 *   ✅ Status tracking (lastSync, syncCount, errorCount)
 *   ✅ Configurable polling interval via GPS_POLL_INTERVAL_MS
 *   ✅ Graceful shutdown on SIGTERM/SIGINT
 * ─────────────────────────────────────────────────────────────
 */

"use strict";

const config = require("../config/env");
const gpsService = require("./gps.service");
const { parseGpsResponse } = require("./gpsParser");
const { upsertGpsTelemetry } = require("./gpsUpdater");
const { broadcastBusLocation } = require("../sockets/location.socket");
const gpsLogger = require("./gpsLogger");

// ── Scheduler state ────────────────────────────────────────────────────────
const state = {
  running: false,
  syncing: false,  // Prevents overlapping sync calls
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
  // ── Prevent overlapping syncs ────────────────────────────────────────────
  if (state.syncing) {
    console.log("[GPS] ⏭️  Previous sync still running — skipping this cycle.");
    return;
  }

  state.syncing = true;
  state.syncCount++;
  const attempt = state.syncCount;
  const cycleStart = Date.now();

  gpsLogger.logSyncStart(attempt);

  try {
    // ── Step 1: Fetch raw GPS data from SkyNav ──────────────────────────
    const rawData = await gpsService.fetchGpsData();

    if (rawData === null) {
      // Credentials not configured OR SkyNav returned error (e.g. rate limit)
      state.lastSyncStatus = "skipped";
      state.lastSyncAt = new Date().toISOString();
      return;
    }

    // ── Step 2: Parse and validate the response ─────────────────────────
    const gpsRecords = parseGpsResponse(rawData);

    if (gpsRecords.length === 0) {
      console.log(`[GPS] Sync #${attempt} — no valid GPS records in response`);
      state.lastSyncStatus = "skipped";
      state.lastSyncAt = new Date().toISOString();
      return;
    }

    // ── Step 3: UPSERT into gps_telemetry ──────────────────────────────
    const { upserted, failed } = await upsertGpsTelemetry(gpsRecords, rawData);

    // ── Step 4: Broadcast Socket.IO events ──────────────────────────────
    for (const record of upserted) {
      broadcastBusLocation({
        vehicleNumber: record.vehicleNumber,
        latitude: record.latitude,
        longitude: record.longitude,
        speed: record.speed || 0,
        rawStatus: record.rawStatus,
        ignition: record.ignition,
        location: record.location,
        gpsActualTime: record.gpsActualTime,
        receivedAt: record.receivedAt,
      });
    }

    // ── Step 5: Log results ─────────────────────────────────────────────
    const duration = Date.now() - cycleStart;
    gpsLogger.logSyncSuccess(attempt, upserted.length, 0, duration);

    state.lastSyncStatus = "success";
    state.lastSyncAt = new Date().toISOString();
    state.errorCount = 0; // Reset consecutive error count on success

    if (failed > 0) {
      console.warn(`[GPS] ⚠️  ${failed} record(s) failed to upsert`);
    }

  } catch (err) {
    state.errorCount++;
    state.lastSyncStatus = "error";
    state.lastSyncAt = new Date().toISOString();
    gpsLogger.logSyncError(attempt, err);

    if (state.errorCount >= 5) {
      console.error(
        `[GPS] ⚠️  ${state.errorCount} consecutive GPS sync failures. Check SkyNav connectivity.`
      );
    }
  } finally {
    state.syncing = false;
  }
}

/**
 * startGpsScheduler
 * Starts the background polling interval.
 * Called once from server.js after the HTTP server is ready.
 */
exports.startGpsScheduler = () => {
  if (state.running) {
    console.warn("[GPS] Scheduler already running. Ignoring duplicate start.");
    return;
  }

  const intervalMs = config.skynav.pollIntervalMs;

  console.log(
    `[GPS] 📡 Scheduler starting — polling every ${intervalMs / 1000}s`
  );

  // Run the first sync after a short startup delay
  setTimeout(() => {
    runSyncCycle();
  }, 5000); // 5-second startup grace period

  // Schedule recurring sync
  state.intervalHandle = setInterval(runSyncCycle, intervalMs);
  state.running = true;
};

/**
 * stopGpsScheduler
 * Stops the background polling interval.
 * Called on SIGTERM/SIGINT graceful shutdown.
 */
exports.stopGpsScheduler = () => {
  if (state.intervalHandle) {
    clearInterval(state.intervalHandle);
    state.intervalHandle = null;
    state.running = false;
    console.log("[GPS] 🛑 Scheduler stopped.");
  }
};

/**
 * getSchedulerStatus
 * Returns current scheduler state for the /api/gps/status endpoint.
 */
exports.getSchedulerStatus = () => ({
  running: state.running,
  syncing: state.syncing,
  syncCount: state.syncCount,
  errorCount: state.errorCount,
  lastSyncAt: state.lastSyncAt,
  lastSyncStatus: state.lastSyncStatus,
  pollIntervalMs: config.skynav.pollIntervalMs,
  skynavConfigured: config.skynav.isConfigured,
});
