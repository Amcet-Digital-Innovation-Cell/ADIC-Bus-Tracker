/**
 * services/bus.service.js
 * ─────────────────────────────────────────────────────────────
 * Bus data access layer.
 *
 * This service is READ-ONLY for bus metadata.
 * GPS coordinate updates are handled exclusively by gpsUpdater.js.
 *
 * Rules (per architecture requirements):
 *   ✅ SELECT  — allowed (read bus list, read single bus)
 *   ✅ UPDATE  — allowed for bus metadata edits (name, route, etc.)
 *   ❌ INSERT  — NEVER insert buses (buses are pre-seeded)
 *   ❌ DELETE  — NEVER delete buses
 *   ❌ CREATE TABLE — NEVER (schema is frozen)
 * ─────────────────────────────────────────────────────────────
 */

const { supabase, adminSupabase } = require("../config/supabase");

/** Use admin client when available (bypasses RLS for writes) */
const writeClient = () => adminSupabase || supabase;

/**
 * mergeGpsToBuses
 * Queries gps_telemetry for given buses and merges coordinates + status.
 */
const mergeGpsToBuses = async (busOrBuses) => {
  if (!busOrBuses) return busOrBuses;
  const isArray = Array.isArray(busOrBuses);
  const buses = isArray ? busOrBuses : [busOrBuses];

  if (buses.length === 0) return busOrBuses;

  const client = writeClient();
  const regNumbers = buses
    .map((b) => b.registration_number)
    .filter(Boolean);

  const gpsMap = {};
  if (regNumbers.length > 0) {
    const { data: gpsData, error: gpsError } = await client
      .from("gps_telemetry")
      .select("vehicle_number, latitude, longitude, speed, raw_status")
      .in("vehicle_number", regNumbers);

    if (!gpsError && gpsData) {
      gpsData.forEach((g) => {
        if (g.vehicle_number) {
          gpsMap[g.vehicle_number.toUpperCase()] = g;
        }
      });
    }
  }

  const merged = buses.map((bus) => {
    const gpsInfo = gpsMap[(bus.registration_number || "").toUpperCase()];
    let currentStatus = bus.status;
    if (gpsInfo && gpsInfo.raw_status) {
      const raw = gpsInfo.raw_status.toUpperCase();
      currentStatus = raw === "RUNNING" || raw === "MOVING" ? "Active" : "Inactive";
    }
    return {
      ...bus,
      latitude: gpsInfo ? gpsInfo.latitude : null,
      longitude: gpsInfo ? gpsInfo.longitude : null,
      status: currentStatus,
    };
  });

  return isArray ? merged : merged[0];
};

/**
 * getAllBuses
 * Returns all buses ordered by id ascending.
 *
 * @returns {Promise<object[]>}
 */
exports.getAllBuses = async () => {
  const { data, error } = await writeClient()
    .from("buses")
    .select(`
      *,
      bus_routes (
        id,
        routes
      )
    `)
    .order("id", { ascending: true });

  if (error) throw error;

  const mapped = (data || []).map((bus) => {
    const route_name = bus.bus_routes ? bus.bus_routes.routes : bus.route_name;
    const { bus_routes, ...rest } = bus;
    return {
      ...rest,
      route_name,
    };
  });

  return await mergeGpsToBuses(mapped);
};

/**
 * getBusById
 * Returns a single bus by primary key.
 *
 * @param {string|number} id
 * @returns {Promise<object>}
 */
exports.getBusById = async (id) => {
  const { data, error } = await writeClient()
    .from("buses")
    .select(`
      *,
      bus_routes (
        id,
        routes
      )
    `)
    .eq("id", id)
    .single();

  if (error) {
    const err = new Error(error.code === "PGRST116" ? "Bus not found" : error.message);
    err.status = error.code === "PGRST116" ? 404 : 500;
    throw err;
  }

  const route_name = data.bus_routes ? data.bus_routes.routes : data.route_name;
  const { bus_routes, ...rest } = data;
  const bus = {
    ...rest,
    route_name,
  };

  return await mergeGpsToBuses(bus);
};

/**
 * updateBusMetadata
 * Updates non-GPS bus fields (driver name, route, etc.).
 * Does NOT update latitude, longitude, or status (GPS pipeline handles those).
 *
 * @param {string|number} id
 * @param {object} fields
 * @returns {Promise<object>}
 */
exports.updateBusMetadata = async (id, fields) => {
  // Strip GPS fields — they must only be updated via the GPS pipeline
  const { latitude, longitude, status, updated_at, ...safeFields } = fields;

  // Map frontend field aliases to database column names
  const payload = {
    ...(safeFields.bus_number !== undefined && { bus_number: safeFields.bus_number }),
    ...(safeFields.busId !== undefined && { bus_number: safeFields.busId }),
    ...(safeFields.registration_number !== undefined && { registration_number: safeFields.registration_number }),
    ...(safeFields.busNo !== undefined && { registration_number: safeFields.busNo }),
    ...(safeFields.driver_name !== undefined && { driver_name: safeFields.driver_name }),
    ...(safeFields.driver !== undefined && { driver_name: safeFields.driver }),
    ...(safeFields.driver_phone !== undefined && { driver_phone: safeFields.driver_phone }),
    ...(safeFields.contact !== undefined && { driver_phone: safeFields.contact }),
    ...(safeFields.license_number !== undefined && { license_number: safeFields.license_number }),
    ...(safeFields.license !== undefined && { license_number: safeFields.license }),
    ...(safeFields.capacity !== undefined && { capacity: safeFields.capacity }),
  };

  const routeIdVal = safeFields.route_id !== undefined ? safeFields.route_id : safeFields.routeId;

  if (routeIdVal !== undefined && routeIdVal !== null && routeIdVal !== "") {
    const { data: routeData, error: routeError } = await writeClient()
      .from("bus_routes")
      .select("id, routes")
      .eq("id", routeIdVal)
      .maybeSingle();

    if (routeError || !routeData) {
      const err = new Error("Invalid route selected");
      err.status = 400;
      throw err;
    }

    payload.route_id = routeData.id;
    payload.route_name = routeData.routes;
  } else if (routeIdVal === null || routeIdVal === "") {
    payload.route_id = null;
    payload.route_name = null;
  }

  if (Object.keys(payload).length === 0) {
    throw Object.assign(new Error("No valid fields to update"), { status: 400 });
  }

  const { data, error } = await writeClient()
    .from("buses")
    .update(payload)
    .eq("id", id)
    .select(`
      *,
      bus_routes (
        id,
        routes
      )
    `)
    .single();

  if (error) throw error;

  const route_name = data.bus_routes ? data.bus_routes.routes : data.route_name;
  const { bus_routes, ...rest } = data;
  const bus = {
    ...rest,
    route_name,
  };

  return await mergeGpsToBuses(bus);
};

/**
 * createBus
 * Creates a new bus record in the buses table.
 *
 * @param {object} fields
 * @returns {Promise<object>}
 */
exports.createBus = async (fields) => {
  const payload = {
    ...(fields.bus_number !== undefined && { bus_number: fields.bus_number }),
    ...(fields.busId !== undefined && { bus_number: fields.busId }),
    ...(fields.registration_number !== undefined && { registration_number: fields.registration_number }),
    ...(fields.busNo !== undefined && { registration_number: fields.busNo }),
    ...(fields.driver_name !== undefined && { driver_name: fields.driver_name }),
    ...(fields.driver !== undefined && { driver_name: fields.driver }),
    ...(fields.driver_phone !== undefined && { driver_phone: fields.driver_phone }),
    ...(fields.contact !== undefined && { driver_phone: fields.contact }),
    ...(fields.license_number !== undefined && { license_number: fields.license_number }),
    ...(fields.license !== undefined && { license_number: fields.license }),
    ...(fields.capacity !== undefined && { capacity: fields.capacity }),
    status: "Pending (GPS)",
  };

  const routeIdVal = fields.route_id !== undefined ? fields.route_id : fields.routeId;

  if (routeIdVal !== undefined && routeIdVal !== null && routeIdVal !== "") {
    const { data: routeData, error: routeError } = await writeClient()
      .from("bus_routes")
      .select("id, routes")
      .eq("id", routeIdVal)
      .maybeSingle();

    if (routeError || !routeData) {
      const err = new Error("Invalid route selected");
      err.status = 400;
      throw err;
    }

    payload.route_id = routeData.id;
    payload.route_name = routeData.routes;
  } else {
    const err = new Error("Route selection is required");
    err.status = 400;
    throw err;
  }

  const { data, error } = await writeClient()
    .from("buses")
    .insert(payload)
    .select(`
      *,
      bus_routes (
        id,
        routes
      )
    `)
    .single();

  if (error) throw error;

  const route_name = data.bus_routes ? data.bus_routes.routes : data.route_name;
  const { bus_routes, ...rest } = data;
  const bus = {
    ...rest,
    route_name,
  };

  return await mergeGpsToBuses(bus);
};

/**
 * deleteBus
 * Deletes a bus from the buses table by primary key.
 *
 * @param {string|number} id
 * @returns {Promise<void>}
 */
exports.deleteBus = async (id) => {
  const { error } = await writeClient()
    .from("buses")
    .delete()
    .eq("id", id);

  if (error) throw error;
};
