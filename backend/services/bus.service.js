/**
 * services/bus.service.js
 * ─────────────────────────────────────────────────────────────
 * Bus data access layer.
 *
 * Bus stops are sourced directly from the bus's associated route
 * in transport.bus_routes (stops JSONB column).
 * GPS coordinate updates are handled exclusively by gpsUpdater.js.
 * ─────────────────────────────────────────────────────────────
 */

const { db } = require("../config/supabase");

/** Use schema-scoped transport client (targets transport schema) */
const writeClient = () => db.transport;

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
 * Normalizes stops array into a clean JSON array of objects
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
 * getAllBuses
 * Returns all buses ordered by id ascending with their route-specific stops attached.
 *
 * @returns {Promise<object[]>}
 */
exports.getAllBuses = async () => {
  const client = writeClient();
  const { data: busesData, error: busesError } = await client
    .from("buses")
    .select(`
      *,
      bus_routes (
        id,
        route_name,
        stops
      )
    `)
    .order("id", { ascending: true });

  if (busesError) throw busesError;

  const mapped = (busesData || []).map((bus) => {
    const route = bus.bus_routes;
    const route_name = route ? route.route_name : bus.route_name;
    const stops = route && route.stops ? normalizeStops(route.stops) : [];
    const { bus_routes, ...rest } = bus;

    return {
      ...rest,
      route_name,
      stops,
    };
  });

  return await mergeGpsToBuses(mapped);
};

/**
 * getBusById
 * Returns a single bus by primary key with its route-based stops.
 *
 * @param {string|number} id
 * @returns {Promise<object>}
 */
exports.getBusById = async (id) => {
  const client = writeClient();
  const { data, error } = await client
    .from("buses")
    .select(`
      *,
      bus_routes (
        id,
        route_name,
        stops
      )
    `)
    .eq("id", id)
    .single();

  if (error) {
    const err = new Error(error.code === "PGRST116" ? "Bus not found" : error.message);
    err.status = error.code === "PGRST116" ? 404 : 500;
    throw err;
  }

  const route = data.bus_routes;
  const route_name = route ? route.route_name : data.route_name;
  const stops = route && route.stops ? normalizeStops(route.stops) : [];
  const { bus_routes, ...rest } = data;

  const bus = {
    ...rest,
    route_name,
    stops,
  };

  return await mergeGpsToBuses(bus);
};

/**
 * updateBusMetadata
 * Updates non-GPS bus fields (driver name, route_id, registration, etc.).
 * Does NOT update latitude, longitude, or status (GPS pipeline handles those).
 *
 * @param {string|number} id
 * @param {object} fields
 * @returns {Promise<object>}
 */
exports.updateBusMetadata = async (id, fields) => {
  // Strip GPS fields — they must only be updated via the GPS pipeline
  const { latitude, longitude, status, updated_at, stops, ...safeFields } = fields;

  const toUpper = (val) => (typeof val === 'string' ? val.trim().toUpperCase() : val);
  const cleanBusNo = (val) => (typeof val === 'string' ? val.replace(/\s+/g, '').toUpperCase() : val);

  // Map frontend field aliases to database column names
  const payload = {
    ...(safeFields.bus_number !== undefined && { bus_number: toUpper(safeFields.bus_number) }),
    ...(safeFields.busId !== undefined && { bus_number: toUpper(safeFields.busId) }),
    ...(safeFields.registration_number !== undefined && { registration_number: cleanBusNo(safeFields.registration_number) }),
    ...(safeFields.busNo !== undefined && { registration_number: cleanBusNo(safeFields.busNo) }),
    ...(safeFields.driver_name !== undefined && { driver_name: toUpper(safeFields.driver_name) }),
    ...(safeFields.driver !== undefined && { driver_name: toUpper(safeFields.driver) }),
    ...(safeFields.driver_phone !== undefined && { driver_phone: toUpper(safeFields.driver_phone) }),
    ...(safeFields.contact !== undefined && { driver_phone: toUpper(safeFields.contact) }),
    ...(safeFields.license_number !== undefined && { license_number: toUpper(safeFields.license_number) }),
    ...(safeFields.license !== undefined && { license_number: toUpper(safeFields.license) }),
    ...(safeFields.capacity !== undefined && { capacity: safeFields.capacity }),
  };

  const routeIdVal = safeFields.route_id !== undefined ? safeFields.route_id : safeFields.routeId;

  if (routeIdVal !== undefined && routeIdVal !== null && routeIdVal !== "") {
    const { data: routeData, error: routeError } = await writeClient()
      .from("bus_routes")
      .select("id, route_name")
      .eq("id", routeIdVal)
      .maybeSingle();

    if (routeError) {
      console.error(`[updateBusMetadata] Route lookup error for route_id ${routeIdVal}:`, routeError.message);
      const err = new Error(`Route lookup failed: ${routeError.message}`);
      err.status = 500;
      throw err;
    }

    if (!routeData) {
      console.error(`[updateBusMetadata] Route not found for route_id ${routeIdVal}`);
      const err = new Error(`Invalid route selected (id: ${routeIdVal})`);
      err.status = 400;
      throw err;
    }

    const fetchedRouteName = routeData.route_name;
    payload.route_id = routeData.id;
    payload.route_name = fetchedRouteName ? fetchedRouteName.toUpperCase() : null;
  } else if (routeIdVal === null || routeIdVal === "") {
    payload.route_id = null;
    payload.route_name = null;
  }

  if (Object.keys(payload).length > 0) {
    const { error } = await writeClient()
      .from("buses")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.error(`[updateBusMetadata] DB update error for bus id ${id}:`, error.message, error.code);
      throw error;
    }
  }

  return await exports.getBusById(id);
};

/**
 * createBus
 * Creates a new bus record in the buses table linked to a route in bus_routes.
 *
 * @param {object} fields
 * @returns {Promise<object>}
 */
exports.createBus = async (fields) => {
  const { stops, ...safeFields } = fields;

  const toUpper = (val) => (typeof val === 'string' ? val.trim().toUpperCase() : val);
  const cleanBusNo = (val) => (typeof val === 'string' ? val.replace(/\s+/g, '').toUpperCase() : val);

  const payload = {
    ...(safeFields.bus_number !== undefined && { bus_number: toUpper(safeFields.bus_number) }),
    ...(safeFields.busId !== undefined && { bus_number: toUpper(safeFields.busId) }),
    ...(safeFields.registration_number !== undefined && { registration_number: cleanBusNo(safeFields.registration_number) }),
    ...(safeFields.busNo !== undefined && { registration_number: cleanBusNo(safeFields.busNo) }),
    ...(safeFields.driver_name !== undefined && { driver_name: toUpper(safeFields.driver_name) }),
    ...(safeFields.driver !== undefined && { driver_name: toUpper(safeFields.driver) }),
    ...(safeFields.driver_phone !== undefined && { driver_phone: toUpper(safeFields.driver_phone) }),
    ...(safeFields.contact !== undefined && { driver_phone: toUpper(safeFields.contact) }),
    ...(safeFields.license_number !== undefined && { license_number: toUpper(safeFields.license_number) }),
    ...(safeFields.license !== undefined && { license_number: toUpper(safeFields.license) }),
    ...(safeFields.capacity !== undefined && { capacity: safeFields.capacity }),
    status: "Pending (GPS)",
  };

  const routeIdVal = safeFields.route_id !== undefined ? safeFields.route_id : safeFields.routeId;

  if (routeIdVal !== undefined && routeIdVal !== null && routeIdVal !== "") {
    const { data: routeData, error: routeError } = await writeClient()
      .from("bus_routes")
      .select("id, route_name")
      .eq("id", routeIdVal)
      .maybeSingle();

    if (routeError || !routeData) {
      const err = new Error("Invalid route selected");
      err.status = 400;
      throw err;
    }

    payload.route_id = routeData.id;
    payload.route_name = routeData.route_name;
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
        route_name,
        stops
      )
    `)
    .single();

  if (error) throw error;

  return await exports.getBusById(data.id);
};

/**
 * deleteBus
 * Deletes a bus from the buses table by primary key.
 *
 * @param {string|number} id
 * @returns {Promise<void>}
 */
exports.deleteBus = async (id) => {
  const client = writeClient();
  const { error } = await client
    .from("buses")
    .delete()
    .eq("id", id);

  if (error) throw error;
};
