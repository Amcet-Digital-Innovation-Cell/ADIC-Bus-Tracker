/**
 * gps/gpsParser.js
 * ─────────────────────────────────────────────────────────────
 * Validates and normalizes the raw SkyNav API response.
 *
 * ─────────────────────────────────────────────────────────────
 * ACTUAL SKYNAV RESPONSE SHAPE (from official docs skynav.txt):
 *
 * {
 *   "root": {
 *     "VehicleData": [
 *       {
 *         "Vehicle_Name":  "Bus 01",
 *         "Company":       "SkyNav PRO DEMO",
 *         "Vehicle_No":    "TN33BA1234",        ← registration plate
 *         "Imeino":        "356218602130948",   ← NOTE: "Imeino" not "imei"
 *         "Latitude":      "12.9165",           ← string, needs parseFloat
 *         "Longitude":     "79.1325",           ← string, needs parseFloat
 *         "Speed":         "45.2",
 *         "Status":        "Moving",
 *         "GPSActualTime": "08-08-2026 10:30:00",
 *         "Datetime":      "08-08-2026 10:30:05",
 *         "Location":      "Vellore Main Road",
 *         "IGN":           "1",                ← ignition: "1"=on, "0"=off
 *         "AC":            "0",
 *         "Odometer":      "12345.67"
 *       }
 *     ]
 *   }
 * }
 *
 * ─────────────────────────────────────────────────────────────
 * WHAT THIS PARSER DOES:
 *   1. Navigates into response.root.VehicleData[]
 *   2. Maps SkyNav PascalCase field names → our camelCase names
 *   3. Validates and parses coordinate strings to floats
 *   4. Normalizes status strings → "active" | "inactive"
 *   5. Returns a clean, consistently shaped array
 * ─────────────────────────────────────────────────────────────
 */

"use strict";

const gpsLogger = require("./gpsLogger");

// ── Coordinate validator ──────────────────────────────────────────────────────
function parseCoordinate(value, type) {
  const num = parseFloat(value);
  if (isNaN(num) || !isFinite(num)) return null;
  if (type === "lat" && (num < -90  || num > 90))  return null;
  if (type === "lng" && (num < -180 || num > 180)) return null;
  return num;
}

// ── Status normalizer ─────────────────────────────────────────────────────────
// SkyNav Status field values: "Moving", "Stopped", "Idle", "Offline", "No Signal"
function mapStatus(skynavStatus) {
  const s = String(skynavStatus || "").toLowerCase().trim();
  if (s === "moving" || s === "running") return "active";
  return "inactive";
}

/**
 * parseGpsResponse
 * ─────────────────────────────────────────────────────────────
 * Parses the raw SkyNav API response into a normalized array.
 *
 * @param {any} rawResponse - Parsed JSON from SkyNav API
 * @returns {Array<{
 *   vehicleNumber: string,   ← Vehicle_No
 *   vehicleName:   string,   ← Vehicle_Name
 *   imei:          string,   ← Imeino
 *   simNumber:     string,   ← not in SkyNav response, empty string
 *   latitude:      number,   ← Latitude (parsed from string)
 *   longitude:     number,   ← Longitude (parsed from string)
 *   speed:         number,   ← Speed (parsed from string)
 *   status:        string,   ← "active" | "inactive"
 *   rawStatus:     string,   ← original Status string from SkyNav
 *   gpsActualTime: string,   ← GPSActualTime
 *   serverTime:    string,   ← Datetime
 *   location:      string,   ← Location
 *   ignition:      boolean,  ← IGN === "1"
 *   odometer:      number,   ← Odometer (parsed)
 * }>}
 */
exports.parseGpsResponse = (rawResponse) => {

  // ── Step 1: Validate response exists ──────────────────────────────────────
  if (!rawResponse || typeof rawResponse !== "object") {
    gpsLogger.logParseWarning("response", "Response is null or not an object");
    return [];
  }

  // ── Step 2: Navigate to VehicleData array ─────────────────────────────────
  // Official SkyNav response shape: { root: { VehicleData: [...] } }
  // Also handle flat array or error shapes gracefully.
  let records;

  if (rawResponse.root && Array.isArray(rawResponse.root.VehicleData)) {
    // ✅ Official SkyNav format
    records = rawResponse.root.VehicleData;
  } else if (Array.isArray(rawResponse.VehicleData)) {
    // Fallback: root skipped
    records = rawResponse.VehicleData;
  } else if (Array.isArray(rawResponse.data)) {
    // Fallback: generic { data: [...] } shape
    records = rawResponse.data;
  } else if (Array.isArray(rawResponse)) {
    // Fallback: bare array
    records = rawResponse;
  } else {
    gpsLogger.logParseWarning(
      "response.root.VehicleData",
      `Could not find VehicleData array. Keys found: [${Object.keys(rawResponse).join(", ")}]`
    );
    return [];
  }

  if (records.length === 0) {
    gpsLogger.logParseWarning("VehicleData", "Array is empty — no devices returned");
    return [];
  }

  // ── Step 3: Map each record ────────────────────────────────────────────────
  const parsed = [];

  for (const record of records) {
    if (!record || typeof record !== "object") continue;

    // ── Identity fields ────────────────────────────────────────────────────
    // IMPORTANT: SkyNav uses "Imeino" (not "imei" or "IMEI")
    const imei = String(
      record.Imeino    ||   // ← official SkyNav field name
      record.imei      ||   // fallback
      record.IMEI      ||
      record.deviceId  ||
      ""
    ).trim();

    const vehicleNumber = String(
      record.Vehicle_No         ||   // ← official SkyNav field name
      record.vehicleNumber      ||   // fallback
      record.vehicle_number     ||
      record.regNo              ||
      record.registrationNumber ||
      ""
    ).trim();

    const vehicleName = String(
      record.Vehicle_Name  ||   // ← official SkyNav field name
      record.vehicleName   ||
      ""
    ).trim();

    const company = String(
      record.Company ||
      record.company ||
      ""
    ).trim();

    if (!imei && !vehicleNumber) {
      gpsLogger.logParseWarning("record", "Record has no Imeino or Vehicle_No — skipped");
      continue;
    }

    // ── Coordinates ─────────────────────────────────────────────────────────
    // SkyNav returns coordinates as strings — must parseFloat
    const latitude  = parseCoordinate(
      record.Latitude  || record.latitude  || record.lat,
      "lat"
    );
    const longitude = parseCoordinate(
      record.Longitude || record.longitude || record.lng || record.lon,
      "lng"
    );

    if (latitude === null || longitude === null) {
      gpsLogger.logParseWarning(
        vehicleNumber || imei,
        `Invalid coordinates: Latitude="${record.Latitude}" Longitude="${record.Longitude}" — skipped`
      );
      continue;
    }

    // ── Telemetry fields ────────────────────────────────────────────────────
    const rawStatus    = String(record.Status    || record.status    || "").trim();
    const speed        = parseFloat(record.Speed  || record.speed    || 0) || 0;
    const odometer     = parseFloat(record.Odometer || record.odometer || 0) || 0;
    const ignition     = (record.IGN === "1" || record.IGN === 1 || record.ignition === true);

    // Timestamps
    const gpsActualTime = String(
      record.GPSActualTime  ||  // ← official SkyNav field name
      record.gpsActualTime  ||
      record.gps_time       ||
      ""
    ).trim() || new Date().toISOString();

    const serverTime = String(
      record.Datetime   ||   // ← official SkyNav field name
      record.datetime   ||
      record.server_time ||
      ""
    ).trim();

    // Location address
    const location = String(
      record.Location  ||  // ← official SkyNav field name
      record.location  ||
      record.address   ||
      record.place     ||
      ""
    ).trim();

    // simNumber is not in the standard SkyNav response
    const simNumber = String(
      record.simNumber || record.sim_number || record.sim || record.msisdn || ""
    ).trim();

    parsed.push({
      vehicleNumber,
      vehicleName,
      company,
      imei,
      simNumber,
      latitude,
      longitude,
      speed,
      status:        mapStatus(rawStatus),
      rawStatus,              // Keep original for gps_telemetry table
      gpsActualTime,
      serverTime,
      location,
      ignition,
      odometer,
    });
  }

  console.log(`[GPS] ✅ Parsed ${parsed.length}/${records.length} records successfully`);
  return parsed;
};
