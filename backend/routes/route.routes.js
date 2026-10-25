/**
 * routes/route.routes.js
 * ─────────────────────────────────────────────────────────────
 * Route API routes definition.
 * ─────────────────────────────────────────────────────────────
 */

const express = require("express");
const router = express.Router();
const routeController = require("../controllers/route.controller");

const { authenticate } = require("../middleware/auth.middleware");

// GET /api/routes — load list of routes
router.get("/", routeController.getAllRoutes);

// GET /api/routes/:route_id/stops — get stops JSON array for a specific route
router.get("/:route_id/stops", routeController.getRouteStops);

// GET /api/routes/:id — get a single route with stops
router.get("/:id", routeController.getRouteById);

// POST /api/routes — create a new route
router.post("/", authenticate, routeController.createRoute);

// PUT /api/routes/:id — update an existing route
router.put("/:id", authenticate, routeController.updateRoute);

// DELETE /api/routes/:id — delete a route
router.delete("/:id", authenticate, routeController.deleteRoute);

module.exports = router;
