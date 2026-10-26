/**
 * services/route.service.js
 * ─────────────────────────────────────────────────────────────
 * Route data access layer.
 * Manages bus_routes table and associated JSONB stops.
 * ─────────────────────────────────────────────────────────────
 */

const { db } = require("../config/supabase");

/** Use schema-scoped transport client (targets transport schema) */
const writeClient = () => db.transport;

/**
 * Normalizes stops array into a clean JSON array of objects:
 * [{ id: 1, stop_name: "STOP NAME", stop_order: 1 }, ...]
 *
 * @param {Array|string} stops
 * @returns {Array}
 */
const normalizeStops = (stops) => {
    if (!stops) return [];
    let list = stops;
    if (typeof list === "string") {
        try {
            list = JSON.parse(list);
        } catch (e) {
            list = [];
        }
    }
    if (!Array.isArray(list)) return [];

    return list
        .map((s, index) => {
            if (typeof s === "string") {
                const name = s.trim().toUpperCase();
                return name ? { id: index + 1, stop_name: name, stop_order: index + 1 } : null;
            }
            if (typeof s === "object" && s !== null) {
                const name = String(s.stop_name || s.name || "").trim().toUpperCase();
                return name
                    ? {
                          id: s.id !== undefined ? s.id : index + 1,
                          stop_name: name,
                          stop_order: s.stop_order !== undefined ? Number(s.stop_order) : index + 1,
                      }
                    : null;
            }
            return null;
        })
        .filter(Boolean)
        .sort((a, b) => a.stop_order - b.stop_order);
};

/**
 * getAllRoutes
 * Returns all routes from bus_routes ordered by id ascending.
 *
 * @returns {Promise<object[]>}
 */
exports.getAllRoutes = async () => {
    const { data, error } = await writeClient()
        .from("bus_routes")
        .select("id, route_name, origin, destination, stops, created_at")
        .order("id", { ascending: true });

    if (error) throw error;

    return (data || []).map((r) => {
        let stops = [];
        if (Array.isArray(r.stops)) {
            stops = r.stops;
        } else if (typeof r.stops === "string") {
            try {
                stops = JSON.parse(r.stops);
            } catch (e) {
                stops = [];
            }
        }
        return {
            id: r.id,
            route_name: r.route_name || "",
            origin: r.origin || "",
            destination: r.destination || "",
            stops: stops || [],
            created_at: r.created_at || null,
            routeName: r.route_name || "",
        };
    });
};

/**
 * getRouteById
 * Returns a single route by primary key.
 *
 * @param {string|number} id
 * @returns {Promise<object>}
 */
exports.getRouteById = async (id) => {
    const { data, error } = await writeClient()
        .from("bus_routes")
        .select("id, route_name, origin, destination, stops, created_at")
        .eq("id", id)
        .single();

    if (error) throw error;

    let stops = [];
    if (Array.isArray(data.stops)) {
        stops = data.stops;
    } else if (typeof data.stops === "string") {
        try {
            stops = JSON.parse(data.stops);
        } catch (e) {
            stops = [];
        }
    }

    return {
        ...data,
        stops: stops || [],
        routeName: data.route_name,
    };
};

/**
 * createRoute
 * Inserts a new route into bus_routes table.
 *
 * @param {object} payload
 * @returns {Promise<object>}
 */
exports.createRoute = async ({ route_name, origin, destination, stops }) => {
    const cleanName = String(route_name || "").trim();
    const cleanOrigin = String(origin || "").trim();
    const cleanDestination = String(destination || "").trim();
    const cleanStops = normalizeStops(stops);

    if (!cleanName) {
        const err = new Error("Route Name is required");
        err.status = 400;
        throw err;
    }

    const payload = {
        route_name: cleanName,
        origin: cleanOrigin || null,
        destination: cleanDestination || null,
        stops: cleanStops,
        created_at: new Date().toISOString(),
    };

    const { data, error } = await writeClient()
        .from("bus_routes")
        .insert([payload])
        .select()
        .single();

    if (error) {
        console.error("[createRoute] Supabase error:", error.message);
        throw error;
    }

    return {
        ...data,
        stops: Array.isArray(data.stops) ? data.stops : [],
        routeName: data.route_name,
    };
};

/**
 * updateRoute
 * Updates an existing route by primary key.
 *
 * @param {string|number} id
 * @param {object} payload
 * @returns {Promise<object>}
 */
exports.updateRoute = async (id, { route_name, origin, destination, stops }) => {
    if (!id) {
        const err = new Error("Route ID is required");
        err.status = 400;
        throw err;
    }

    const payload = {};
    if (route_name !== undefined) payload.route_name = String(route_name).trim();
    if (origin !== undefined) payload.origin = String(origin).trim();
    if (destination !== undefined) payload.destination = String(destination).trim();
    if (stops !== undefined) payload.stops = normalizeStops(stops);

    const { data, error } = await writeClient()
        .from("bus_routes")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

    if (error) {
        console.error("[updateRoute] Supabase error:", error.message);
        throw error;
    }

    return {
        ...data,
        stops: Array.isArray(data.stops) ? data.stops : [],
        routeName: data.route_name,
    };
};

/**
 * deleteRoute
 * Deletes a route record by primary key.
 *
 * @param {string|number} id
 * @returns {Promise<void>}
 */
exports.deleteRoute = async (id) => {
    if (!id) {
        const err = new Error("Route ID is required");
        err.status = 400;
        throw err;
    }

    const { error } = await writeClient()
        .from("bus_routes")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("[deleteRoute] Supabase error:", error.message);
        throw error;
    }
};

/**
 * getStopsByRouteId
 * Extracts and returns the normalized stops JSON array from bus_routes for a specific route.
 *
 * @param {string|number} routeId
 * @returns {Promise<Array>}
 */
exports.getStopsByRouteId = async (routeId) => {
    if (!routeId) {
        const err = new Error("Route ID is required");
        err.status = 400;
        throw err;
    }

    const { data, error } = await writeClient()
        .from("bus_routes")
        .select("id, route_name, stops")
        .eq("id", routeId)
        .maybeSingle();

    if (error) {
        console.error("[getStopsByRouteId] Supabase error:", error.message);
        throw error;
    }

    if (!data) {
        const err = new Error(`Route with ID ${routeId} not found`);
        err.status = 404;
        throw err;
    }

    return normalizeStops(data.stops);
};
