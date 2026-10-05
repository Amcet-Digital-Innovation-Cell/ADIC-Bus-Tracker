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
 * getBusStops
 * Returns all bus_stops for a given bus_id, ordered by stop_order ascending.
 *
 * @param {string|number} busId
 * @returns {Promise<object[]>}
 */
exports.getBusStops = async (busId) => {
  const { data, error } = await writeClient()
    .from("bus_stops")
    .select("*")
    .eq("bus_id", busId)
    .order("stop_order", { ascending: true });

  if (error) {
    console.warn(`[getBusStops] Failed for bus_id ${busId}:`, error.message);
    return [];
  }

  return (data || []).map((s) => ({
    id: s.id,
    bus_id: s.bus_id,
    stop_name: (s.stop_name || "").toUpperCase(),
    stop_order: s.stop_order,
  }));
};

/**
 * saveBusStops
 * Replaces existing bus_stops for a given bus_id with new ordered stops.
 *
 * @param {string|number} busId
 * @param {Array} stops
 * @returns {Promise<object[]>}
 */
exports.saveBusStops = async (busId, stops) => {
  const client = writeClient();
  const numericBusId = parseInt(busId, 10);

  // Safety guard: require a non-empty array to proceed with delete+insert.
  // An empty or non-array value is treated as "no change" to prevent accidental data wipe.
  if (!Array.isArray(stops) || stops.length === 0) {
    console.warn(`[saveBusStops] Skipping empty stops array for bus_id ${numericBusId} — existing stops preserved.`);
    return await exports.getBusStops(numericBusId);
  }

  // 1. Build and validate the insert payload BEFORE deleting existing stops
  const stopPayloads = stops
    .map((s, index) => {
      const name = typeof s === "string" ? s : (s.stop_name || "");
      const trimmedName = name.trim().toUpperCase();
      if (!trimmedName) return null;
      return {
        bus_id: numericBusId,
        stop_name: trimmedName,
        stop_order: index + 1,
      };
    })
    .filter(Boolean);

  // If all stops had empty names, preserve existing data
  if (stopPayloads.length === 0) {
    console.warn(`[saveBusStops] All stop names were empty for bus_id ${numericBusId} — existing stops preserved.`);
    return await exports.getBusStops(numericBusId);
  }

  // 2. Delete existing stops for this bus
  const { error: delErr } = await client
    .from("bus_stops")
    .delete()
    .eq("bus_id", numericBusId);

  if (delErr) {
    console.error(`[saveBusStops] Delete error for bus_id ${numericBusId}:`, delErr.message);
    throw delErr;
  }

  // 3. Insert new stops
  const { data: insertedStops, error: insErr } = await client
    .from("bus_stops")
    .insert(stopPayloads)
    .select();

  if (insErr) {
    console.error(`[saveBusStops] Insert error for bus_id ${numericBusId}:`, insErr.message);
    throw insErr;
  }

  return (insertedStops || [])
    .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0))
    .map((s) => ({
      id: s.id,
      bus_id: s.bus_id,
      stop_name: s.stop_name,
      stop_order: s.stop_order,
    }));
};

/**
 * getAllBuses
 * Returns all buses ordered by id ascending with their bus-specific stops attached.
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
        routes
      )
    `)
    .order("id", { ascending: true });

  if (busesError) throw busesError;

  // Fetch all bus stops
  const { data: stopsData, error: stopsErr } = await client
    .from("bus_stops")
    .select("*")
    .order("stop_order", { ascending: true });

  if (stopsErr) {
    console.warn("[getAllBuses] Failed to fetch bus_stops:", stopsErr.message);
  }

  const stopsMap = {};
  (stopsData || []).forEach((s) => {
    if (!stopsMap[s.bus_id]) stopsMap[s.bus_id] = [];
    stopsMap[s.bus_id].push({
      id: s.id,
      bus_id: s.bus_id,
      stop_name: (s.stop_name || "").toUpperCase(),
      stop_order: s.stop_order,
    });
  });

  const mapped = (busesData || []).map((bus) => {
    const route_name = bus.bus_routes ? bus.bus_routes.routes : bus.route_name;
    const { bus_routes, ...rest } = bus;
    return {
      ...rest,
      route_name,
      stops: stopsMap[bus.id] || [],
    };
  });

  return await mergeGpsToBuses(mapped);
};

/**
 * getBusById
 * Returns a single bus by primary key with its bus-specific stops.
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
  const stops = await exports.getBusStops(id);

  const bus = {
    ...rest,
    route_name,
    stops,
  };

  return await mergeGpsToBuses(bus);
};

/**
 * updateBusMetadata
 * Updates non-GPS bus fields (driver name, route, stops, etc.).
 * Does NOT update latitude, longitude, or status (GPS pipeline handles those).
 *
 * @param {string|number} id
 * @param {object} fields
 * @returns {Promise<object>}
 */
exports.updateBusMetadata = async (id, fields) => {
  // Strip GPS fields — they must only be updated via the GPS pipeline
  const { latitude, longitude, status, updated_at, stops: inputStops, ...safeFields } = fields;

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
      .select("id, routes")
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

    payload.route_id = routeData.id;
    payload.route_name = routeData.routes ? routeData.routes.toUpperCase() : null;
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

  // Handle bus_stops update if stops array was provided
  let stops = [];
  if (inputStops !== undefined && Array.isArray(inputStops)) {
    try {
      stops = await exports.saveBusStops(id, inputStops);
    } catch (stopsErr) {
      console.error(`[updateBusMetadata] saveBusStops failed for bus id ${id}:`, stopsErr.message);
      throw stopsErr;
    }
  } else {
    stops = await exports.getBusStops(id);
  }

  const updatedBus = await exports.getBusById(id);
  return {
    ...updatedBus,
    stops,
  };
};

/**
 * updateBusStops
 * Dedicated function to update only the stops for a bus.
 * Used by PUT /api/buses/:id/stops endpoint.
 *
 * @param {string|number} id
 * @param {Array} stops
 * @returns {Promise<object[]>}
 */
exports.updateBusStops = async (id, stops) => {
  if (!Array.isArray(stops)) {
    const err = new Error("stops must be an array");
    err.status = 400;
    throw err;
  }
  return await exports.saveBusStops(id, stops);
};

/**
 * createBus
 * Creates a new bus record in the buses table and inserts its bus_stops.
 *
 * @param {object} fields
 * @returns {Promise<object>}
 */
exports.createBus = async (fields) => {
  const { stops: inputStops, ...safeFields } = fields;

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

  // Save stops for the newly created bus if provided
  let stops = [];
  if (inputStops !== undefined && Array.isArray(inputStops) && inputStops.length > 0) {
    stops = await exports.saveBusStops(data.id, inputStops);
  }

  const createdBus = await exports.getBusById(data.id);
  return {
    ...createdBus,
    stops,
  };
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
  // Delete associated bus_stops first
  await client.from("bus_stops").delete().eq("bus_id", id);

  const { error } = await client
    .from("buses")
    .delete()
    .eq("id", id);

  if (error) throw error;
};
