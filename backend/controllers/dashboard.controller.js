/**
 * controllers/dashboard.controller.js
 * ─────────────────────────────────────────────────────────────
 * Handles HTTP requests for the dashboard statistics endpoint.
 * ─────────────────────────────────────────────────────────────
 */

const dashboardService = require("../services/dashboard.service");
const { success } = require("../utils/responseHelper");

/**
 * GET /api/dashboard
 * Returns fleet-wide KPI statistics for the admin dashboard.
 *
 * Response:
 *   {
 *     totalBuses:   number,
 *     activeBuses:  number,
 *     offlineBuses: number,
 *     pendingGps:   number,
 *     lastSyncAt:   string | null
 *   }
 */
exports.getStats = async (req, res, next) => {
  try {
    const stats = await dashboardService.getFleetStats();
    return success(res, stats, "Dashboard statistics retrieved");
  } catch (err) {
    next(err);
  }
};
