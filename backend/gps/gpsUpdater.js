/**
 * gps/gpsUpdater.js
 * ─────────────────────────────────────────────────────────────
 * Supabase GPS coordinate updater.
 *
 * Takes parsed GPS records and writes them to the buses table.
 *
 * STRICT RULES (enforced in code):
 *   ✅ UPDATE only  — latitude, longitude, status, updated_at
 *   ❌ INSERT never — buses are pre-seeded, never created here
 *   ❌ DELETE never — buses are never deleted by the GPS pipeline
 *
 * MATCHING STRATEGY:
 *   1. Try to match by registration_number (vehicleNumber from SkyNav)
 *   2. If no match, try by IMEI (stored in a future buses.imei column)
 *   3. If still no match, log a warning and skip (unknown device)
 *
 * DEDUPLICATION:
 *   If the new coordinates are identical to the stored coordinates
 *   (within 6 decimal places), skip the update to avoid redundant
 *   Supabase writes and Socket.IO noise.
 * ─────────────────────────────────────────────────────────────
 */

const { supabase, adminSupabase } = require("../config/supabase");
const gpsLogger = require("./gpsLogger");

/** Use the admin client for writes (bypasses RLS) */
const writeClient = () => adminSupabase || supabase;

/**
 * Rounds a coordinate to 6 decimal places for comparison.
 * ~11cm precision — sufficient for bus tracking deduplication.
 *
 * @param {number} coord
 * @returns {number}
 */
const round6 = (coord) => Math.round(coord * 1e6) / 1e6;

/**
 * updateGpsCoordinates
 * Main updater function. Takes an array of parsed GPS records,
 * matches them to buses, and performs UPDATE queries.
 *
 * @param {Array<{
 *   vehicleNumber: string,
 *   imei: string,
 *   latitude: number,
 *   longitude: number,
 *   speed: number,
 *   status: string,
 *   gpsActualTime: string
 * }>} gpsRecords
 *
 * @returns {Promise<{
 *   updated: Array<object>,   // Buses that were updated in Supabase
 *   skipped: number,          // Buses skipped due to no coordinate change
 *   unknown: number           // Records that couldn't be matched to a bus
 * }>}
 */
exports.updateGpsCoordinates = async (gpsRecords) => {
  if (!gpsRecords || gpsRecords.length === 0) {
    return { updated: [], skipped: 0, unknown: 0 };
  }

  // ── Step 1: Load current bus data for comparison ───────────
  const { data: allBuses, error: fetchError } = await supabase
    .from("buses")
    .select("id, bus_number, registration_number, imei, latitude, longitude");

  if (fetchError) {
    throw new Error(`Failed to fetch buses for GPS update: ${fetchError.message}`);
  }

  const buses = allBuses || [];
  const updated = [];
  let skipped = 0;
  let unknown = 0;

  // ── Step 2: Process each GPS record ───────────────────────
  for (const record of gpsRecords) {
    // Find matching bus by registration_number or bus_number
    let bus = buses.find(
      (b) =>
        b.registration_number &&
        record.vehicleNumber &&
        b.registration_number.replace(/\s/g, "").toUpperCase() ===
          record.vehicleNumber.replace(/\s/g, "").toUpperCase()
    );

    // Fallback: match by bus_number
    if (!bus && record.vehicleNumber) {
      bus = buses.find(
        (b) =>
          b.bus_number &&
          b.bus_number.toUpperCase() === record.vehicleNumber.toUpperCase()
      );
    }

    if (!bus) {
      // Third fallback: match by IMEI (if buses.imei column is populated)
      if (record.imei) {
        bus = buses.find(
          (b) => b.imei && b.imei.trim() === record.imei.trim()
        );
      }
    }

    if (!bus) {
      gpsLogger.logParseWarning(
        record.vehicleNumber || record.imei,
        "No matching bus found in database — skipped"
      );
      unknown++;
      continue;
    }

    // ── Deduplication check ───────────────────────────────
    const newLat = round6(record.latitude);
    const newLng = round6(record.longitude);
    const oldLat = bus.latitude != null ? round6(parseFloat(bus.latitude)) : null;
    const oldLng = bus.longitude != null ? round6(parseFloat(bus.longitude)) : null;

    if (oldLat === newLat && oldLng === newLng) {
      gpsLogger.logSkipped(bus.bus_number || bus.registration_number);
      skipped++;
      continue;
    }

    // ── Perform UPDATE ─────────────────────────────────────
    const updatePayload = {
      latitude:         record.latitude,
      longitude:        record.longitude,
      status:           record.status,
      updated_at:       new Date().toISOString(),
      // GPS device identity fields (written on every sync)
      ...(record.imei          && { imei:             record.imei }),
      ...(record.simNumber      && { sim_number:       record.simNumber }),
      // Telemetry fields
      ...(record.speed  != null && { speed:            record.speed }),
      ...(record.gpsActualTime  && { gps_actual_time:  record.gpsActualTime }),
      ...(record.location       && { last_location:    record.location }),
    };

    const { data: updatedBus, error: updateError } = await writeClient()
      .from("buses")
      .update(updatePayload)
      .eq("id", bus.id)
      .select()
      .single();

    if (updateError) {
      gpsLogger.logSyncError(
        0,
        `Failed to update bus ${bus.id}: ${updateError.message}`
      );
      continue;
    }

    updated.push({
      ...updatedBus,
      speed: record.speed,
      gpsActualTime: record.gpsActualTime,
    });
  }

  return { updated, skipped, unknown };
};
