/**
 * routes/public.routes.js
 * ─────────────────────────────────────────────────────────────
 * Public API routes for student app (unauthenticated).
 * ─────────────────────────────────────────────────────────────
 */

const express = require("express");
const router = express.Router();
const publicController = require("../controllers/public.controller");

// GET /api/public/buses — unauthenticated listing of routes & buses
router.get("/buses", publicController.getAllBuses);

// GET /api/public/buses/:id/tracking — unauthenticated vehicle tracking status
router.get("/buses/:id/tracking", publicController.getBusTracking);

module.exports = router;
