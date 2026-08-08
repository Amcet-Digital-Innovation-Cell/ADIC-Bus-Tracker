/**
 * gps/gps.routes.js
 * ─────────────────────────────────────────────────────────────
 * GPS API route definitions.
 *
 * Both routes are protected — a valid Supabase JWT is required.
 * Authentication is applied in app.js when mounting these routes.
 * ─────────────────────────────────────────────────────────────
 */

const express = require("express");
const router = express.Router();
const gpsController = require("./gps.controller");

// GET /api/gps/sync — manually trigger a GPS sync cycle
router.get("/sync", gpsController.syncNow);

// GET /api/gps/status — check scheduler health
router.get("/status", gpsController.getStatus);

module.exports = router;
