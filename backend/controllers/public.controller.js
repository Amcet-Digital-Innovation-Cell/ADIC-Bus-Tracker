/**
 * controllers/public.controller.js
 * ─────────────────────────────────────────────────────────────
 * Unauthenticated endpoints for the Student Flutter App.
 * ─────────────────────────────────────────────────────────────
 */

const { db } = require("../config/supabase");
const { success } = require("../utils/responseHelper");

const getClient = () => db.transport;

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
                  route_name,
                  origin,
                  destination,
                  stops
                )
            `)
            .order("id", { ascending: true });

        if (error) throw error;

        const formatted = (data || []).map((bus) => {
            const route = bus.bus_routes;
            const stops = route ? route.stops : [];
            const routeName = route ? route.route_name : bus.route_name;
            const rawStops = Array.isArray(stops) ? stops : [];
            const stopNames = rawStops
                .map((s) => (typeof s === "string" ? s : s.stop_name || s.name || ""))
                .filter(Boolean);

            return {
                id: bus.id,
                routeId: bus.route_id || (route ? route.id : null),
                routeName: routeName || "Unknown Route",
                origin: route ? route.origin : null,
                destination: route ? route.destination : null,
                busNo: bus.bus_number ? `Bus ${bus.bus_number.toString().padStart(2, "0")}` : "Unknown Bus",
                busId: bus.bus_number || "",
                driverName: bus.driver_name || "",
                driverPhone: bus.driver_phone || "",
                forwardStops: stopNames,
                stops: rawStops,
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
                    message: "Bus not found",
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
            routeId: bus.id.toString(), // Student app queries with bus.id
            vehicleId: bus.registration_number, // Registration number is used to join the socket room
            latitude: gps ? gps.latitude : 12.9165,
            longitude: gps ? gps.longitude : 79.1325,
            updatedAt: gps ? (gps.gps_actual_time || gps.received_at) : new Date().toISOString(),
            speedKph: gps ? (gps.speed || 0) : 0,
            status: gps ? (gps.raw_status || "STOP") : "STOP",
            ignition: gps ? (gps.ignition || "OFF") : "OFF",
        };

        return success(res, tracking, "Tracking data retrieved successfully");
    } catch (err) {
        next(err);
    }
};
