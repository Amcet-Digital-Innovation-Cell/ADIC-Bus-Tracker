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
 * Returns all routes options with their stops.
 */
exports.getAllRoutes = async (req, res, next) => {
    try {
        const routes = await routeService.getAllRoutes();
        return success(res, routes, "Routes retrieved successfully");
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/routes/:id
 * Returns a single route by ID.
 */
exports.getRouteById = async (req, res, next) => {
    try {
        const route = await routeService.getRouteById(req.params.id);
        return success(res, route, "Route retrieved successfully");
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/routes/:route_id/stops
 * Returns stops JSON array from bus_tracking.bus_routes for that specific route.
 */
exports.getRouteStops = async (req, res, next) => {
    try {
        const routeId = req.params.route_id || req.params.id;
        const stops = await routeService.getStopsByRouteId(routeId);
        return success(res, stops, "Route stops retrieved successfully");
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/routes
 * Creates a new route record with stops.
 */
exports.createRoute = async (req, res, next) => {
    try {
        const route = await routeService.createRoute(req.body);
        return success(res, route, "Route created successfully", 201);
    } catch (err) {
        next(err);
    }
};

/**
 * PUT /api/routes/:id
 * Updates an existing route record and its stops.
 */
exports.updateRoute = async (req, res, next) => {
    try {
        const route = await routeService.updateRoute(req.params.id, req.body);
        return success(res, route, "Route updated successfully");
    } catch (err) {
        next(err);
    }
};

/**
 * DELETE /api/routes/:id
 * Deletes a route record by primary key.
 */
exports.deleteRoute = async (req, res, next) => {
    try {
        await routeService.deleteRoute(req.params.id);
        return success(res, null, "Route deleted successfully");
    } catch (err) {
        next(err);
    }
};
