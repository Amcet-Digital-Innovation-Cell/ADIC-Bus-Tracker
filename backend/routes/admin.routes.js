/**
 * routes/admin.routes.js
 * ─────────────────────────────────────────────────────────────
 * Admin Management Routes (Admin Schema Operations)
 *
 * Endpoints:
 *   GET /api/admin/configs        — Retrieve system configuration settings
 *   PUT /api/admin/configs/:key   — Update system configuration setting
 *
 * All routes require valid Supabase JWT with admin authorization.
 * ─────────────────────────────────────────────────────────────
 */

const express = require("express");
const router = express.Router();
const adminService = require("../services/admin.service");
const { success } = require("../utils/responseHelper");

/**
 * GET /api/admin/configs
 * Fetch system configs.
 */
router.get("/configs", async (req, res, next) => {
  try {
    const configs = await adminService.getSystemConfigs();
    return success(res, configs, "System configurations retrieved successfully");
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/configs/:key
 * Update a specific system config.
 */
router.put("/configs/:key", async (req, res, next) => {
  try {
    const key = req.params.key;
    const { value, description } = req.body;

    const updated = await adminService.setSystemConfig(
      key,
      value,
      req.user?.id,
      description
    );

    return success(res, updated, `Config '${key}' updated successfully`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
