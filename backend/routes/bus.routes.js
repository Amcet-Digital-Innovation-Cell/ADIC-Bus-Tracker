/**
 * routes/bus.routes.js
 * ─────────────────────────────────────────────────────────────
 * Bus API routes.
 *
 * All bus stops are sourced dynamically through each bus's
 * assigned route (bus_routes table with JSON stops).
 * ─────────────────────────────────────────────────────────────
 */

const express = require("express");
const router = express.Router();
const busController = require("../controllers/bus.controller");

// GET /api/buses — list all buses with assigned routes and stops
router.get("/", busController.getAllBuses);

// GET /api/buses/:id — get single bus by ID with assigned route and stops
router.get("/:id", busController.getBusById);

// POST /api/buses — create a new bus linked to a route
router.post("/", busController.createBus);

// PUT /api/buses/:id — update bus metadata (driver, route_id, registration, etc.)
router.put("/:id", busController.updateBus);

// GET /api/buses/:id/stops — get stops for a single bus
router.get("/:id/stops", busController.getBusStops);

// PUT /api/buses/:id/stops — replace all stops for a single bus
router.put("/:id/stops", busController.updateBusStops);

// DELETE /api/buses/:id — delete a bus
router.delete("/:id", busController.deleteBus);

module.exports = router;
