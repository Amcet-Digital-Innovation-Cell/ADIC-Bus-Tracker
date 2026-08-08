/**
 * middleware/auth.middleware.js
 * ─────────────────────────────────────────────────────────────
 * Supabase JWT validation middleware.
 *
 * The frontend obtains a Supabase access token by calling
 *   supabase.auth.signInWithPassword() directly.
 *
 * Every protected API request must include the header:
 *   Authorization: Bearer <supabase_access_token>
 *
 * This middleware validates the token against Supabase (checks
 * signature, expiry, and that the user still exists) then
 * attaches the user object to req.user.
 *
 * The backend never generates its own JWTs.
 * ─────────────────────────────────────────────────────────────
 */

const { supabase } = require("../config/supabase");

/**
 * authenticate — Express middleware
 *
 * Attaches req.user = { id, email, role } on success.
 * Calls next(error) with status 401 on failure.
 */
exports.authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Ensure the header is present and correctly formatted
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const error = new Error("Authorization token required");
    error.status = 401;
    return next(error);
  }

  const token = authHeader.split(" ")[1];

  try {
    // Validate token against Supabase — verifies signature,
    // expiry, and that the user still exists in the project
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      const authError = new Error("Invalid or expired token");
      authError.status = 401;
      return next(authError);
    }

    // Attach user info to the request for downstream handlers
    req.user = {
      id: data.user.id,
      email: data.user.email,
      role: data.user.user_metadata?.role || "admin",
    };

    next();
  } catch (err) {
    err.status = 401;
    err.message = "Token validation failed";
    next(err);
  }
};
