/**
 * services/route.service.js
 * ─────────────────────────────────────────────────────────────
 * Route data access layer.
 * ─────────────────────────────────────────────────────────────
 */

const { supabase, adminSupabase } = require("../config/supabase");

/** Use admin client when available (bypasses RLS) */
const writeClient = () => adminSupabase || supabase;

/**
 * getAllRoutes
 * Returns all routes from bus_routes ordered by id ascending.
 *
 * @returns {Promise<object[]>}
 */
exports.getAllRoutes = async () => {
    const { data, error } = await writeClient()
        .from("bus_routes")
        .select("id, routes")
        .order("id", { ascending: true });

    if (error) throw error;

    // Format array payload for routes: mapping "routes" column to "routeName"
    return (data || []).map((r) => ({
        id: r.id,
        routeName: r.routes,
    }));
};
