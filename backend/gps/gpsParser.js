/**
 * gps/gpsParser.js
 * ─────────────────────────────────────────────────────────────
 * Validates and parses the raw SkyNav API response.
 *
 * SkyNav returns a JSON package with an array of device records.
 * Each record contains vehicle info and the latest GPS position.
 *
 * This parser:
 *   1. Validates the top-level response structure
 *   2. Iterates each device record
 *   3. Validates mandatory fields (IMEI, coordinates)
 *   4. Rejects out-of-range coordinates
 *   5. Returns a clean, normalized array of GPS records
 *
 * ─────────────────────────────────────────────────────────────
 * EXPECTED SKYNAV RESPONSE SHAPE:
 * {
 *   status: "success",
 *   data: [
 *     {
 *       vehicleNumber: "TN33BA1234",
 *       imei:          "123456789012345",
 *       latitude:      12.9165,
 *       longitude:     79.1325,
 *       speed:         45.2,
 *       status:        "Moving",
 *       gpsActualTime: "2026-07-28T00:00:00Z",
 *       datetime:      "2026-07-28T00:00:00Z",
 *       location:      "Vellore Main Road"
 *     },
 *     ...
 *   ]
 * }
 * ─────────────────────────────────────────────────────────────
 */

const gpsLogger = require("./gpsLogger");

/**
 * Validates that a coordinate is a finite number within valid range.
 *
 * @param {any}    value    - The raw value to check
 * @param {"lat"|"lng"} type
 * @returns {number | null}
 */
function parseCoordinate(value, type) {
  const num = parseFloat(value);
  if (isNaN(num) || !isFinite(num)) return null;

  if (type === "lat" && (num < -90  || num > 90))  return null;
  if (type === "lng" && (num < -180 || num > 180)) return null;

  return num;
}

/**
 * Maps SkyNav device status strings to our internal status values.
 *
 * @param {string} skynavStatus
 * @returns {"active" | "inactive"}
 */
function mapStatus(skynavStatus) {
  const s = (skynavStatus || "").toLowerCase();
  // SkyNav may return: "Moving", "Stopped", "Idle", "Offline", "No Signal"
  if (s === "moving" || s === "running") return "active";
  return "inactive";
}

/**
 * parseGpsResponse
 * Main parser. Takes raw SkyNav API response, returns array of
 * normalized GPS records (invalid records are skipped with a warning).
 *
 * @param {any} rawResponse - Parsed JSON from SkyNav API
 * @returns {Array<{
 *   vehicleNumber: string,
 *   imei: string,
 *   latitude: number,
 *   longitude: number,
 *   speed: number,
 *   status: string,
 *   gpsActualTime: string,
 *   location: string
 * }>}
 */
exports.parseGpsResponse = (rawResponse) => {
  // ── 1. Validate top-level structure ───────────────────────
  if (!rawResponse || typeof rawResponse !== "object") {
    gpsLogger.logParseWarning("response", "Response is null or not an object");
    return [];
  }

  // SkyNav may wrap data inside a 'data' array or return an array directly
  const records = Array.isArray(rawResponse)
    ? rawResponse
    : Array.isArray(rawResponse.data)
    ? rawResponse.data
    : rawResponse.devices || rawResponse.vehicles || [];

  if (!Array.isArray(records) || records.length === 0) {
    gpsLogger.logParseWarning("response.data", "No device records found in response");
    return [];
  }

  // ── 2. Parse each record ───────────────────────────────────
  const parsed = [];

  for (const record of records) {
    if (!record || typeof record !== "object") {
      gpsLogger.logParseWarning("record", "Skipping null/non-object record");
      continue;
    }

    // Extract identification fields
    const imei          = String(record.imei || record.IMEI || record.deviceId || "").trim();
    const simNumber     = String(record.simNumber || record.sim_number || record.sim || record.msisdn || "").trim();
    const vehicleNumber = String(
      record.vehicleNumber || record.vehicle_number || record.regNo || record.registrationNumber || ""
    ).trim();

    if (!imei && !vehicleNumber) {
      gpsLogger.logParseWarning("record.imei", "Record has no IMEI or vehicle number — skipped");
      continue;
    }

    // Validate coordinates
    const latitude  = parseCoordinate(record.latitude  || record.lat, "lat");
    const longitude = parseCoordinate(record.longitude || record.lng || record.lon, "lng");

    if (latitude === null || longitude === null) {
      gpsLogger.logParseWarning(
        vehicleNumber || imei,
        `Invalid coordinates: lat=${record.latitude} lng=${record.longitude} — skipped`
      );
      continue;
    }

    // Parse optional fields with safe fallbacks
    const speed         = parseFloat(record.speed || record.Speed || 0) || 0;
    const status        = mapStatus(record.status || record.deviceStatus || "");
    const gpsActualTime = record.gpsActualTime || record.gps_time || record.datetime || new Date().toISOString();
    const location      = String(record.location || record.address || record.place || "").trim();

    parsed.push({
      vehicleNumber,
      imei,
      simNumber,
      latitude,
      longitude,
      speed,
      status,
      gpsActualTime,
      location,
    });
  }

  return parsed;
};
