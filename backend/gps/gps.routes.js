/**
 * gps/gps.routes.js
 * ─────────────────────────────────────────────────────────────
 * GPS API route definitions.
 *
 * All routes are protected — a valid Supabase JWT is required.
 * Authentication is applied in app.js when mounting these routes.
 * ─────────────────────────────────────────────────────────────
 */

"use strict";

const express = require("express");
const router = express.Router();
const gpsController = require("./gps.controller");

// GET /api/gps/status — scheduler health check
router.get("/status", gpsController.getStatus);

// GET /api/gps/sync — manually trigger one GPS sync cycle
router.get("/sync", gpsController.syncNow);

// GET /api/gps/vehicles — current GPS state for all vehicles
router.get("/vehicles", gpsController.getVehicles);

// GET /api/gps/vehicles/:vehicleNumber — one vehicle's current GPS
router.get("/vehicles/:vehicleNumber", gpsController.getVehicleByNumber);

// GET /api/gps/location/:vehicleNumber
// PRIMARY endpoint called by admin frontend when bus is clicked.
// Queries gps_telemetry and returns latitude + longitude.
router.get("/location/:vehicleNumber", gpsController.getLocationByVehicle);

module.exports = router;
