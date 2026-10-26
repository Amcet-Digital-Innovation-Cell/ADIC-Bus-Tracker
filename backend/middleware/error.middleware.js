/**
 * middleware/error.middleware.js
 * ─────────────────────────────────────────────────────────────
 * Central Express error handler.
 *
 * Must be registered LAST in app.js (Express identifies it
 * as an error handler via the 4-argument signature).
 *
 * Always returns a JSON response — clients never receive an
 * HTML error page from this backend.
 * ─────────────────────────────────────────────────────────────
 */

const config = require("../config/env");

/**
 * Express 4-argument error handler.
 *
 * @param {Error} err  - Error object (may have .status and .code)
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
exports.errorHandler = (err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // Handle JSON parse errors from express.json() cleanly
  if (err instanceof SyntaxError && status === 400 && 'body' in err) {
    message = "Malformed or invalid JSON payload in request body.";
  }

  // Always log the full error on the server
  console.error(
    `[ERROR] ${req.method} ${req.originalUrl} → ${status}: ${message}`
  );

  // In development, include the stack trace for easier debugging
  if (config.isDev && err.stack) {
    console.error(err.stack);
  }

  // Consistent JSON response for mobile & web clients
  res.status(status).json({
    success: false,
    error: message,
    message: message, // Alias for Flutter apps reading message field
    ...(config.isDev && { stack: err.stack }),
  });
};
