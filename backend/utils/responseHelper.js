/**
 * utils/responseHelper.js
 * ─────────────────────────────────────────────────────────────
 * Standardized API response builders.
 *
 * Ensures all endpoints return a consistent JSON structure:
 *   { success: true,  data: ..., message: "..." }
 *   { success: false, error: "..." }
 *
 * This makes it easy for the React dashboard and the future
 * Flutter app to parse responses uniformly.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Send a successful JSON response.
 *
 * @param {import("express").Response} res
 * @param {any}    data       - Payload to return
 * @param {string} message    - Optional human-readable message
 * @param {number} statusCode - HTTP status (default 200)
 */
exports.success = (res, data = null, message = "Success", statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Send an error JSON response.
 *
 * @param {import("express").Response} res
 * @param {string} message    - Error description
 * @param {number} statusCode - HTTP status (default 500)
 */
exports.error = (res, message = "Internal Server Error", statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    error: message,
  });
};
