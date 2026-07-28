/**
 * routes/bus.routes.js
 * ─────────────────────────────────────────────────────────────
 * Bus API routes.
 *
 * Note: POST (create) and DELETE routes are intentionally absent.
 * The database buses table is pre-seeded and managed externally.
 * GPS updates come from the GPS scheduler, not from these routes.
 * ─────────────────────────────────────────────────────────────
 */

const express = require("express");
const router = express.Router();
const busController = require("../controllers/bus.controller");

// GET /api/buses — list all buses
router.get("/", busController.getAllBuses);

// GET /api/buses/:id — get single bus by ID
router.get("/:id", busController.getBusById);

// PUT /api/buses/:id — update bus metadata (driver, route, etc.)
// NOTE: GPS fields are blocked in the service layer
router.put("/:id", busController.updateBus);

module.exports = router;