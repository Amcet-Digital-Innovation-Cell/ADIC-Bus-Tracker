/**
 * middleware/validator.middleware.js
 * ─────────────────────────────────────────────────────────────
 * Lightweight request validation middleware.
 *
 * Usage:
 *   router.post('/', validate({ body: ['field1', 'field2'] }), controller)
 *
 * Validates that required fields are present and non-empty.
 * Returns 400 with a descriptive message if validation fails.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * validate — Returns Express middleware that checks required fields.
 *
 * @param {{ body?: string[], params?: string[], query?: string[] }} schema
 * @returns {import("express").RequestHandler}
 */
exports.validate = (schema = {}) => (req, res, next) => {
  const errors = [];

  // Check required body fields
  if (schema.body) {
    schema.body.forEach((field) => {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === "") {
        errors.push(`Body field '${field}' is required`);
      }
    });
  }

  // Check required URL params
  if (schema.params) {
    schema.params.forEach((field) => {
      if (!req.params[field]) {
        errors.push(`URL param '${field}' is required`);
      }
    });
  }

  // Check required query params
  if (schema.query) {
    schema.query.forEach((field) => {
      if (!req.query[field]) {
        errors.push(`Query param '${field}' is required`);
      }
    });
  }

  if (errors.length > 0) {
    const error = new Error(errors.join("; "));
    error.status = 400;
    return next(error);
  }

  next();
};
