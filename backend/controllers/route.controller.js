/**
 * controllers/route.controller.js
 * ─────────────────────────────────────────────────────────────
 * Handles HTTP requests for routes.
 * ─────────────────────────────────────────────────────────────
 */

const routeService = require("../services/route.service");
const { success } = require("../utils/responseHelper");

/**
 * GET /api/routes
 * Returns all routes options.
 */
exports.getAllRoutes = async (req, res, next) => {
    try {
        const routes = await routeService.getAllRoutes();
        return success(res, routes, "Routes retrieved successfully");
    } catch (err) {
        next(err);
    }
};
