/**
 * controllers/bus.controller.js
 * ─────────────────────────────────────────────────────────────
 * Handles HTTP requests for bus-related endpoints.
 *
 * All responses use the standardized responseHelper format:
 *   { success: true, data: ..., message: "..." }
 *   { success: false, error: "..." }
 * ─────────────────────────────────────────────────────────────
 */

const busService = require("../services/bus.service");
const { success, error } = require("../utils/responseHelper");

/**
 * GET /api/buses
 * Returns all buses with full details.
 */
exports.getAllBuses = async (req, res, next) => {
  try {
    const buses = await busService.getAllBuses();
    return success(res, buses, "Buses retrieved successfully");
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/buses/:id
 * Returns a single bus by ID.
 */
exports.getBusById = async (req, res, next) => {
  try {
    const bus = await busService.getBusById(req.params.id);
    return success(res, bus, "Bus retrieved successfully");
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/buses/:id
 * Updates bus metadata (driver, route, etc.).
 * GPS fields (lat, lng, status) are intentionally blocked here.
 */
exports.updateBus = async (req, res, next) => {
  try {
    const bus = await busService.updateBusMetadata(req.params.id, req.body);
    return success(res, bus, "Bus updated successfully");
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/buses
 * Creates a new bus record.
 */
exports.createBus = async (req, res, next) => {
  try {
    const bus = await busService.createBus(req.body);
    return success(res, bus, "Bus created successfully", 201);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/buses/:id
 * Deletes a bus record by ID.
 */
exports.deleteBus = async (req, res, next) => {
  try {
    await busService.deleteBus(req.params.id);
    return success(res, null, "Bus deleted successfully");
  } catch (err) {
    next(err);
  }
};
