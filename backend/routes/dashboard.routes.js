/**
 * routes/dashboard.routes.js
 * ─────────────────────────────────────────────────────────────
 * Dashboard API routes.
 * ─────────────────────────────────────────────────────────────
 */

const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboard.controller");

// GET /api/dashboard — fleet statistics
router.get("/", dashboardController.getStats);

module.exports = router;
