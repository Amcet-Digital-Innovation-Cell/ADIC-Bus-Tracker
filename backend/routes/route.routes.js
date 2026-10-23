/**
 * routes/route.routes.js
 * ─────────────────────────────────────────────────────────────
 * Route API routes definition.
 * ─────────────────────────────────────────────────────────────
 */

const express = require("express");
const router = express.Router();
const routeController = require("../controllers/route.controller");

// GET /api/routes — load list of routes
router.get("/", routeController.getAllRoutes);

// GET /api/routes/:id — get a single route with stops
router.get("/:id", routeController.getRouteById);

// POST /api/routes — create a new route
router.post("/", routeController.createRoute);

// PUT /api/routes/:id — update an existing route
router.put("/:id", routeController.updateRoute);

// DELETE /api/routes/:id — delete a route
router.delete("/:id", routeController.deleteRoute);

module.exports = router;
