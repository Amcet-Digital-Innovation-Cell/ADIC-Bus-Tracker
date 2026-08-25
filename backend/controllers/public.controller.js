/**
 * controllers/public.controller.js
 * ─────────────────────────────────────────────────────────────
 * Unauthenticated endpoints for the Student Flutter App.
 * ─────────────────────────────────────────────────────────────
 */

const { supabase, adminSupabase } = require("../config/supabase");
const { success } = require("../utils/responseHelper");

const getClient = () => adminSupabase || supabase;

/**
 * GET /api/public/buses
 * Returns all available buses with their routes and stops.
 */
exports.getAllBuses = async (req, res, next) => {
    try {
        const client = getClient();
        const { data, error } = await client
            .from("buses")
            .select(`
        id,
        bus_number,
        registration_number,
        driver_name,
        driver_phone,
        status,
        route_id,
        bus_routes (
          id,
          routes,
          stops
        )
      `)
            .order("id", { ascending: true });

        if (error) throw error;

        const formatted = (data || []).map((bus) => {
            const stops = bus.bus_routes ? bus.bus_routes.stops : [];
            const routeName = bus.bus_routes ? bus.bus_routes.routes : bus.route_name;
            return {
                id: bus.id,
                routeName: routeName || "Unknown Route",
                busNo: bus.bus_number ? `Bus ${bus.bus_number.toString().padStart(2, '0')}` : "Unknown Bus",
                forwardStops: Array.isArray(stops) ? stops : [],
                registrationNumber: bus.registration_number,
                status: bus.status,
            };
        });

        return success(res, formatted, "Buses retrieved successfully");
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/public/buses/:id/tracking
 * Returns the tracking details of a specific bus.
 */
exports.getBusTracking = async (req, res, next) => {
    try {
        const busId = req.params.id;
        const client = getClient();

        // 1. Fetch bus metadata
        const { data: bus, error: busError } = await client
            .from("buses")
            .select("id, registration_number, route_id, status")
            .eq("id", busId)
            .single();

        if (busError) {
            if (busError.code === "PGRST116") {
                return res.status(404).json({
                    success: false,
                    error: "Bus not found",
                });
            }
            throw busError;
        }

        // 2. Fetch the latest telemetry details
        const { data: gps, error: gpsError } = await client
            .from("gps_telemetry")
            .select("*")
            .ilike("vehicle_number", bus.registration_number)
            .maybeSingle();

        if (gpsError) throw gpsError;

        // 3. Format response in the structure expected by VehicleTrackingModel
        const tracking = {
            routeId: bus.id.toString(), // Student app queries with widget.bus.id
            vehicleId: bus.registration_number, // Registration number is used to join the socket room
            latitude: gps ? gps.latitude : 12.9165,
            longitude: gps ? gps.longitude : 79.1325,
            updatedAt: gps ? (gps.gps_actual_time || gps.received_at) : new Date().toISOString(),
            speedKph: gps ? (gps.speed || 0) : 0,
            status: gps ? (gps.raw_status || "STOP") : "STOP",
        };

        return success(res, tracking, "Tracking data retrieved successfully");
    } catch (err) {
        next(err);
    }
};
