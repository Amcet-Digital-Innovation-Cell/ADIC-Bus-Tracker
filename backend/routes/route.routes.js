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

module.exports = router;
