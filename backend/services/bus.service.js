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

/** Use admin client when available (bypasses RLS for reads AND writes) */
const readClient  = () => adminSupabase || supabase;
const writeClient = () => adminSupabase || supabase;

/**
 * getAllBuses
 * Returns all buses ordered by id ascending.
 *
 * @returns {Promise<object[]>}
 */
exports.getAllBuses = async () => {
  const { data, error } = await readClient()
    .from("buses")
    .select("*")
    .order("id", { ascending: true });

  if (error) throw error;
  return data;
};

/**
 * getBusById
 * Returns a single bus by primary key.
 *
 * @param {string|number} id
 * @returns {Promise<object>}
 */
exports.getBusById = async (id) => {
  const { data, error } = await readClient()
    .from("buses")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    const err = new Error(error.code === "PGRST116" ? "Bus not found" : error.message);
    err.status = error.code === "PGRST116" ? 404 : 500;
    throw err;
  }

  return data;
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
    ...(safeFields.bus_number   !== undefined && { bus_number:          safeFields.bus_number }),
    ...(safeFields.busId        !== undefined && { bus_number:          safeFields.busId }),
    ...(safeFields.registration_number !== undefined && { registration_number: safeFields.registration_number }),
    ...(safeFields.busNo        !== undefined && { registration_number: safeFields.busNo }),
    ...(safeFields.driver_name  !== undefined && { driver_name:         safeFields.driver_name }),
    ...(safeFields.driver       !== undefined && { driver_name:         safeFields.driver }),
    ...(safeFields.driver_phone !== undefined && { driver_phone:        safeFields.driver_phone }),
    ...(safeFields.contact      !== undefined && { driver_phone:        safeFields.contact }),
    ...(safeFields.route_name   !== undefined && { route_name:          safeFields.route_name }),
    ...(safeFields.route        !== undefined && { route_name:          safeFields.route }),
    ...(safeFields.license_number !== undefined && { license_number:    safeFields.license_number }),
    ...(safeFields.license      !== undefined && { license_number:      safeFields.license }),
    ...(safeFields.capacity     !== undefined && { capacity:            safeFields.capacity }),
  };

  if (Object.keys(payload).length === 0) {
    throw Object.assign(new Error("No valid fields to update"), { status: 400 });
  }

  const { data, error } = await writeClient()
    .from("buses")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
};
