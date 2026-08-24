/**
 * services/dashboard.service.js
 * ─────────────────────────────────────────────────────────────
 * Aggregates fleet statistics for the dashboard KPI cards.
 *
 * Queries Supabase directly — designed to be fast since it runs
 * every time the dashboard is loaded.
 * ─────────────────────────────────────────────────────────────
 */

const { supabase } = require("../config/supabase");

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
  // Fetch all buses
  const { data: busesData, error: busesError } = await supabase
    .from("buses")
    .select("status, updated_at, registration_number");

  if (busesError) throw busesError;

  // Fetch all gps telemetry to verify if coordinates exist
  const { data: gpsData, error: gpsError } = await supabase
    .from("gps_telemetry")
    .select("vehicle_number, latitude, longitude");

  if (gpsError) throw gpsError;

  const gpsMap = {};
  if (gpsData) {
    gpsData.forEach((g) => {
      if (g.vehicle_number) {
        gpsMap[g.vehicle_number.toUpperCase()] = g;
      }
    });
  }

  const buses = busesData || [];
  const totalBuses = buses.length;
  const activeBuses = buses.filter((b) => (b.status || "").toLowerCase() === "active").length;
  const offlineBuses = buses.filter((b) => (b.status || "").toLowerCase() === "inactive").length;
  const pendingGps = buses.filter((b) => {
    const isPending = (b.status || "").toLowerCase().includes("pending");
    const gpsItem = gpsMap[(b.registration_number || "").toUpperCase()];
    const hasGps = gpsItem && gpsItem.latitude != null && gpsItem.longitude != null;
    return isPending || !hasGps;
  }).length;

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
