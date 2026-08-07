/**
 * services/dashboard.service.js
 * ─────────────────────────────────────────────────────────────
 * Aggregates fleet statistics for the dashboard KPI cards.
 *
 * Queries Supabase directly — designed to be fast since it runs
 * every time the dashboard is loaded.
 * ─────────────────────────────────────────────────────────────
 */

const { supabase, adminSupabase } = require("../config/supabase");

/** Use admin client when available (bypasses RLS) */
const readClient = () => adminSupabase || supabase;

/**
 * getFleetStats
 * Returns aggregated statistics about the bus fleet.
 *
 * @returns {Promise<{
 *   totalBuses: number,
 *   activeBuses: number,
 *   offlineBuses: number,
 *   pendingGps: number,
 *   lastSyncAt: string|null
 * }>}
 */
exports.getFleetStats = async () => {
  // Fetch all buses — lightweight query (only status + updated_at needed)
  const { data, error } = await readClient()
    .from("buses")
    .select("status, updated_at, latitude, longitude");

  if (error) throw error;

  const buses = data || [];
  const totalBuses   = buses.length;
  const activeBuses  = buses.filter((b) => (b.status || "").toLowerCase() === "active").length;
  const offlineBuses = buses.filter((b) => (b.status || "").toLowerCase() === "inactive").length;
  const pendingGps   = buses.filter((b) =>
    (b.status || "").toLowerCase().includes("pending") ||
    (b.latitude == null && b.longitude == null)
  ).length;

  // Find the most recent GPS update across the fleet
  const timestamps = buses
    .map((b) => b.updated_at)
    .filter(Boolean)
    .sort()
    .reverse();

  const lastSyncAt = timestamps[0] || null;

  return {
    totalBuses,
    activeBuses,
    offlineBuses,
    pendingGps,
    lastSyncAt,
  };
};
