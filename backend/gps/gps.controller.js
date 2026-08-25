/**
 * gps/gps.controller.js
 * ─────────────────────────────────────────────────────────────
 * GPS API endpoint handlers.
 *
 * Endpoints:
 *   GET /api/gps/status                  — Scheduler health
 *   GET /api/gps/sync                    — Manual trigger
 *   GET /api/gps/vehicles                — All vehicles' current GPS
 *   GET /api/gps/vehicles/:vehicleNumber — One vehicle's current GPS
 *   GET /api/gps/location/:vehicleNumber — Alias for frontend bus click
 * ─────────────────────────────────────────────────────────────
 */

"use strict";

const gpsService = require("./gps.service");
const { parseGpsResponse } = require("./gpsParser");
const { upsertGpsTelemetry } = require("./gpsUpdater");
const { broadcastBusLocation } = require("../sockets/location.socket");
const { getSchedulerStatus } = require("./gpsScheduler");
const { success, error } = require("../utils/responseHelper");
const { adminSupabase, supabase } = require("../config/supabase");
const gpsLogger = require("./gpsLogger");

/** Supabase client for reads — anon key is fine for SELECT */
const readClient = () => adminSupabase || supabase;

// ── Safe GPS response fields (never expose raw_payload to frontend) ────────
const SAFE_FIELDS = [
  "id",
  "vehicle_number",
  "imei",
  "latitude",
  "longitude",
  "speed",
  "raw_status",
  "ignition",
  "location_address",
  "gps_actual_time",
  "received_at",
];

/**
 * GET /api/gps/status
 * Returns the current state of the GPS background scheduler.
 */
exports.getStatus = (req, res) => {
  const status = getSchedulerStatus();
  return success(res, status, "GPS scheduler status");
};

/**
 * GET /api/gps/sync
 * Manually triggers a single GPS sync cycle.
 * Useful for testing, debugging, or on-demand refreshes.
 */
exports.syncNow = async (req, res, next) => {
  try {
    const syncStart = Date.now();

    // Fetch from SkyNav
    const rawData = await gpsService.fetchGpsData();

    if (rawData === null) {
      return success(
        res,
        { skynavConfigured: false, message: "SkyNav GPS credentials not configured or rate limit hit" },
        "GPS not available",
        200
      );
    }

    // Parse
    const gpsRecords = parseGpsResponse(rawData);

    if (gpsRecords.length === 0) {
      return success(
        res,
        { upserted: 0, failed: 0, message: "No valid GPS records in SkyNav response" },
        "GPS sync — no data",
        200
      );
    }

    // Upsert into gps_telemetry
    const { upserted, failed } = await upsertGpsTelemetry(gpsRecords, rawData);

    // Broadcast Socket.IO
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

    const duration = Date.now() - syncStart;

    return success(res, {
      upserted: upserted.length,
      failed,
      durationMs: duration,
      vehicles: upserted.map((r) => ({
        vehicleNumber: r.vehicleNumber,
        latitude: r.latitude,
        longitude: r.longitude,
        speed: r.speed,
        rawStatus: r.rawStatus,
        ignition: r.ignition,
        gpsActualTime: r.gpsActualTime,
      })),
    }, "GPS sync completed");

  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/gps/vehicles
 * Returns current GPS state for ALL vehicles in gps_telemetry.
 */
exports.getVehicles = async (req, res, next) => {
  try {
    const { data, error: dbError } = await readClient()
      .from("gps_telemetry")
      .select(SAFE_FIELDS.join(", "))
      .order("received_at", { ascending: false });

    if (dbError) {
      const err = new Error(`Failed to query gps_telemetry: ${dbError.message}`);
      err.status = 500;
      return next(err);
    }

    return success(res, {
      count: (data || []).length,
      vehicles: data || [],
    }, "GPS vehicle data retrieved");

  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/gps/vehicles/:vehicleNumber
 * Returns current GPS state for a specific vehicle.
 */
exports.getVehicleByNumber = async (req, res, next) => {
  try {
    const vehicleNumber = (req.params.vehicleNumber || "").trim().toUpperCase();

    if (!vehicleNumber) {
      const err = new Error("vehicleNumber parameter is required");
      err.status = 400;
      return next(err);
    }

    const { data, error: dbError } = await readClient()
      .from("gps_telemetry")
      .select(SAFE_FIELDS.join(", "))
      .ilike("vehicle_number", vehicleNumber)
      .single();

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return success(res, null,
          `No GPS data found for vehicle ${vehicleNumber}`, 404
        );
      }
      const err = new Error(dbError.message);
      err.status = 500;
      return next(err);
    }

    return success(res, data, "GPS vehicle data retrieved");

  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/gps/location/:vehicleNumber
 * ─────────────────────────────────────────────────────────────
 * PRIMARY FRONTEND ENDPOINT — called when admin clicks a bus.
 *
 * Returns the current GPS location in the exact format the
 * frontend expects:
 *   {
 *     success: true,
 *     vehicleNumber: "TN11BE7456",
 *     latitude: 12.9835728,
 *     longitude: 80.1844267,
 *     speed: 20,
 *     status: "active",
 *     ignition: "ON",
 *     location: "Perungudi, Chennai",
 *     gpsActualTime: "2026-08-11T15:43:00Z"
 *   }
 *
 * IMPORTANT: This queries gps_telemetry — NOT SkyNav directly.
 * The GPS scheduler keeps gps_telemetry always up-to-date.
 * Clicking a bus in the admin UI should NEVER call SkyNav.
 */
exports.getLocationByVehicle = async (req, res, next) => {
  try {
    const vehicleNumber = (req.params.vehicleNumber || "").trim().toUpperCase();

    if (!vehicleNumber) {
      return res.status(400).json({
        success: false,
        message: "vehicleNumber parameter is required",
      });
    }

    const { data, error: dbError } = await readClient()
      .from("gps_telemetry")
      .select(SAFE_FIELDS.join(", "))
      .ilike("vehicle_number", vehicleNumber)
      .single();

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return res.status(404).json({
          success: false,
          message: "Vehicle GPS data not found",
          vehicleNumber,
          hint: "The GPS scheduler may not have synced this vehicle yet, or the vehicle number may not match.",
        });
      }
      const err = new Error(dbError.message);
      err.status = 500;
      return next(err);
    }

    // Derive a normalized status from raw_status for the frontend
    const rawStatus = (data.raw_status || "").toUpperCase();
    const normalizedStatus =
      rawStatus === "RUNNING" || rawStatus === "MOVING" || rawStatus === "ACTIVE"
        ? "active"
        : "inactive";

    // Return the exact shape the frontend expects
    return res.status(200).json({
      success: true,
      vehicleNumber: data.vehicle_number,
      latitude: data.latitude,
      longitude: data.longitude,
      speed: data.speed,
      status: normalizedStatus,
      rawStatus: data.raw_status,
      ignition: data.ignition,
      location: data.location_address,
      gpsActualTime: data.gps_actual_time,
      receivedAt: data.received_at,
    });

  } catch (err) {
    next(err);
  }
};
