/**
 * middleware/logger.middleware.js
 * ─────────────────────────────────────────────────────────────
 * Structured HTTP request logger.
 *
 * Logs format (Render-friendly, one line per request):
 *   [2026-07-28T00:00:00.000Z] GET /api/buses 200 42ms
 *
 * Skips health-check endpoint to reduce noise.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Express middleware that logs each request after the response is sent.
 * Attaches response time via Date.now() delta.
 */
exports.logger = (req, res, next) => {
  // Skip the root health-check to keep logs clean
  if (req.url === "/" && req.method === "GET") {
    return next();
  }

  const start = Date.now();

  // Hook into the 'finish' event so we can log the final status code
  res.on("finish", () => {
    const duration = Date.now() - start;
    const timestamp = new Date().toISOString();
    const status = res.statusCode;

    // Colour-code status for local dev terminals
    const statusStr =
      status >= 500 ? `\x1b[31m${status}\x1b[0m` :   // red
      status >= 400 ? `\x1b[33m${status}\x1b[0m` :   // yellow
      status >= 200 ? `\x1b[32m${status}\x1b[0m` :   // green
      String(status);

    console.log(
      `[${timestamp}] ${req.method} ${req.originalUrl} ${statusStr} ${duration}ms`
    );
  });

  next();
};
