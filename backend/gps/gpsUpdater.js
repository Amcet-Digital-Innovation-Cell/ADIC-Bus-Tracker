/**
 * gps/gpsUpdater.js
 * ─────────────────────────────────────────────────────────────
 * Supabase GPS telemetry updater.
 *
 * Takes parsed GPS records and UPSERTs them into gps_telemetry.
 *
 * STRICT RULES:
 *   ✅ UPSERT — one current row per vehicle_number (UNIQUE)
 *   ❌ Never insert duplicate rows for the same vehicle
 *   ❌ Never touch the buses table for GPS data
 *
 * TABLE: gps_telemetry
 * UNIQUE CONFLICT COLUMN: vehicle_number
 *
 * Behavior:
 *   First GPS reading for TN11BE7456  → INSERT
 *   Second GPS reading for TN11BE7456 → UPDATE same row
 *   Result: ONE current-state row per vehicle at all times
 * ─────────────────────────────────────────────────────────────
 */

"use strict";

const { adminSupabase, supabase } = require("../config/supabase");
const gpsLogger = require("./gpsLogger");

/** Use admin client (bypasses RLS) when available */
const writeClient = () => adminSupabase || supabase;

/**
 * upsertGpsTelemetry
 * ─────────────────────────────────────────────────────────────
 * Writes an array of parsed GPS records to gps_telemetry.
 * Uses PostgreSQL UPSERT (INSERT … ON CONFLICT DO UPDATE).
 *
 * @param {Array<{
 *   vehicleNumber: string,
 *   imei: string,
 *   latitude: number,
 *   longitude: number,
 *   speed: number,
 *   rawStatus: string,
 *   ignition: boolean | string,
 *   location: string,
 *   gpsActualTime: string,
 *   rawPayload?: object
 * }>} gpsRecords - Parsed GPS records from gpsParser.js
 *
 * @param {object} [rawPayload] - The original raw SkyNav response
 *
 * @returns {Promise<{
 *   upserted: Array<object>,   // Rows successfully written to Supabase
 *   failed:   number           // Records that failed to upsert
 * }>}
 */
exports.upsertGpsTelemetry = async (gpsRecords, rawPayload = null) => {
  if (!gpsRecords || gpsRecords.length === 0) {
    return { upserted: [], failed: 0 };
  }

  const upserted = [];
  let failed = 0;
  const receivedAt = new Date().toISOString();

  for (const record of gpsRecords) {
    // ── Guard: skip records without vehicle number ───────────
    if (!record.vehicleNumber) {
      gpsLogger.logParseWarning("upsert", "Record missing vehicleNumber — skipped");
      failed++;
      continue;
    }

    // ── Parse gpsActualTime to ISO 8601 for PostgreSQL timestamptz ──────
    // SkyNav returns: "11-08-2026 00:17:51" (DD-MM-YYYY HH:mm:ss)
    // We need: "2026-08-11T00:17:51Z" (ISO 8601 / UTC)
    let gpsActualTimeISO = null;
    if (record.gpsActualTime) {
      try {
        // Format: "DD-MM-YYYY HH:mm:ss"
        const match = record.gpsActualTime.match(
          /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/
        );
        if (match) {
          const [, day, month, year, hour, min, sec] = match;
          // Treat as UTC (do NOT add +05:30 offset — see architecture notes)
          gpsActualTimeISO = `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;
        } else {
          // Fallback: attempt native Date parse
          const parsed = new Date(record.gpsActualTime);
          if (!isNaN(parsed.getTime())) {
            gpsActualTimeISO = parsed.toISOString();
          }
        }
      } catch {
        gpsActualTimeISO = null;
      }
    }

    // ── Normalize ignition to string "ON"/"OFF" ──────────────
    let ignitionStr;
    if (typeof record.ignition === "boolean") {
      ignitionStr = record.ignition ? "ON" : "OFF";
    } else {
      ignitionStr = String(record.ignition || "OFF").toUpperCase();
    }

    // ── Build the telemetry record ───────────────────────────
    const telemetryRecord = {
      vehicle_number:   record.vehicleNumber,
      imei:             record.imei             || null,
      latitude:         record.latitude,
      longitude:        record.longitude,
      speed:            record.speed            ?? 0,
      raw_status:       record.rawStatus         || null,
      ignition:         ignitionStr,
      location_address: record.location          || null,
      gps_actual_time:  gpsActualTimeISO,
      received_at:      receivedAt,
      raw_payload:      rawPayload               || null,
    };

    // ── UPSERT into gps_telemetry ────────────────────────────
    // vehicle_number is UNIQUE → first call = INSERT, subsequent = UPDATE
    const { data, error } = await writeClient()
      .from("gps_telemetry")
      .upsert(telemetryRecord, { onConflict: "vehicle_number" })
      .select()
      .single();

    if (error) {
      gpsLogger.logSyncError(
        0,
        `Supabase upsert failed for ${record.vehicleNumber}: ${error.message}`
      );
      failed++;
      continue;
    }

    upserted.push({
      ...data,
      // Include parsed fields for Socket.IO emission
      vehicleNumber:  record.vehicleNumber,
      latitude:       record.latitude,
      longitude:      record.longitude,
      speed:          record.speed,
      rawStatus:      record.rawStatus,
      ignition:       ignitionStr,
      location:       record.location,
      gpsActualTime:  gpsActualTimeISO,
      receivedAt,
    });

    console.log(
      `[GPS] ✅ Upserted telemetry | vehicle=${record.vehicleNumber} ` +
      `lat=${record.latitude} lng=${record.longitude} status=${record.rawStatus}`
    );
  }

  return { upserted, failed };
};
