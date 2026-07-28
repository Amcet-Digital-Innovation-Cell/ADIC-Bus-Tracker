/**
 * gps/gpsLogger.js
 * ─────────────────────────────────────────────────────────────
 * Dedicated GPS pipeline logger.
 *
 * Separates GPS log messages from general HTTP request logs so
 * Render log output is easy to read and filter.
 *
 * Prefix: [GPS]
 *
 * In future, replace console.* calls here with Winston or Pino
 * without changing any other file in the GPS pipeline.
 * ─────────────────────────────────────────────────────────────
 */

const PREFIX = "[GPS]";

/**
 * Log a GPS sync start.
 * @param {number} attempt - Sync attempt number (cumulative)
 */
exports.logSyncStart = (attempt) => {
  console.log(`${PREFIX} Sync #${attempt} started at ${new Date().toISOString()}`);
};

/**
 * Log a successful GPS sync.
 * @param {number} attempt
 * @param {number} updatedCount - Number of buses whose coordinates changed
 * @param {number} skippedCount - Number of buses where coordinates were identical
 * @param {number} durationMs
 */
exports.logSyncSuccess = (attempt, updatedCount, skippedCount, durationMs) => {
  console.log(
    `${PREFIX} Sync #${attempt} completed ✅ | updated=${updatedCount} skipped=${skippedCount} time=${durationMs}ms`
  );
};

/**
 * Log a skipped update (coordinates unchanged).
 * @param {string} busNumber
 */
exports.logSkipped = (busNumber) => {
  console.log(`${PREFIX} Bus ${busNumber} — coordinates unchanged, skipping update`);
};

/**
 * Log a GPS sync failure.
 * @param {number} attempt
 * @param {Error | string} error
 */
exports.logSyncError = (attempt, error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${PREFIX} Sync #${attempt} FAILED ❌ | ${message}`);
};

/**
 * Log a parse/validation warning (non-fatal).
 * @param {string} context - What was being parsed
 * @param {string} reason  - Why it was skipped
 */
exports.logParseWarning = (context, reason) => {
  console.warn(`${PREFIX} Parse warning | ${context}: ${reason}`);
};

/**
 * Log that GPS is not yet configured.
 */
exports.logNotConfigured = () => {
  console.warn(
    `${PREFIX} SkyNav credentials not configured. Add SKYNAV_* env vars to enable GPS sync.`
  );
};
