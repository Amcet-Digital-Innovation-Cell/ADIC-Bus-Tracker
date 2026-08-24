/**
 * routes/realtimeGps.routes.js
 * ─────────────────────────────────────────────────────────────
 * Real-time GPS endpoints (device → server).
 *
 * These endpoints are designed to receive raw GPS data pushed
 * from hardware GPS devices or the Traccar server, and
 * immediately broadcast the position via Socket.IO.
 *
 * Unlike the SkyNav scheduler (which PULLS from SkyNav every
 * 30 s), these routes are PUSH endpoints — the device sends
 * data to us.
 *
 * Routes:
 *   POST   /api/realtime/gps/update      — Receive raw GPS data
 *   GET    /api/realtime/gps/live        — Latest location (memory)
 *   GET    /api/realtime/gps/history     — Full history (memory)
 *   GET    /api/realtime/gps/history/db  — Full history (Supabase)
 *   DELETE /api/realtime/gps/history     — Clear in-memory history
 *   POST   /traccar/webhook              — Traccar server webhook
 *
 * Note: /traccar/webhook is mounted as a PUBLIC route (no auth)
 * in app.js because Traccar cannot send a user JWT.
 * The other routes are protected by the Supabase JWT middleware.
 * ─────────────────────────────────────────────────────────────
 */

const express  = require("express");
const router   = express.Router();

const { supabase }    = require("../config/supabase");
const { getIO }       = require("../config/socket");
const realtimeState   = require("../utils/realtimeState");

// ─────────────────────────────────────────────────────────────
// Helper — emit gpsUpdate to all Socket.IO clients
// ─────────────────────────────────────────────────────────────
function broadcastRealtime(gpsData) {
  try {
    getIO().emit("gpsUpdate", gpsData);
  } catch (err) {
    console.warn("[Realtime] Socket.IO broadcast failed:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/realtime/gps/update
// Accept raw GPS data from a device or simulator.
// Saves to Supabase gps_logs table + broadcasts via Socket.IO.
// ─────────────────────────────────────────────────────────────
router.post("/update", async (req, res) => {
  try {
    const { bus_id, latitude, longitude, speed, heading } = req.body;

    if (!bus_id || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "bus_id, latitude and longitude are required.",
      });
    }

    const gpsData = {
      bus_id,
      latitude,
      longitude,
      speed:       speed    ?? null,
      heading:     heading  ?? null,
      received_at: new Date().toISOString(),
    };

    // Store in memory
    realtimeState.currentLocation = gpsData;
    realtimeState.gpsHistory.push(gpsData);

    // Persist to Supabase gps_logs
    const { data, error } = await supabase
      .from("gps_logs")
      .insert([gpsData])
      .select();

    if (error) {
      console.warn("[Realtime] Supabase insert error:", error.message);
      // Don't block the response — still broadcast the location
    }

    // Broadcast to all dashboard clients
    broadcastRealtime(gpsData);

    return res.status(200).json({
      success: true,
      message: "GPS location saved successfully.",
      data: data?.[0] ?? gpsData,
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/realtime/gps/live
// Returns the latest GPS location from memory.
// ─────────────────────────────────────────────────────────────
router.get("/live", (req, res) => {
  if (Object.keys(realtimeState.currentLocation).length === 0) {
    return res.status(404).json({
      success: false,
      message: "No GPS data available yet.",
    });
  }
  return res.json({ success: true, data: realtimeState.currentLocation });
});

// ─────────────────────────────────────────────────────────────
// GET /api/realtime/gps/history
// Returns all GPS events stored in memory since server start.
// ─────────────────────────────────────────────────────────────
router.get("/history", (req, res) => {
  return res.json({
    success: true,
    totalLocations: realtimeState.gpsHistory.length,
    data: realtimeState.gpsHistory,
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/realtime/gps/history/db
// Returns GPS history stored in Supabase (persistent).
// ─────────────────────────────────────────────────────────────
router.get("/history/db", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("gps_logs")
      .select("*")
      .order("received_at", { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.json({
      success: true,
      totalLocations: data.length,
      data,
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/realtime/gps/history
// Clears the in-memory GPS history and current location.
// (Does NOT delete records from Supabase.)
// ─────────────────────────────────────────────────────────────
router.delete("/history", (req, res) => {
  realtimeState.gpsHistory      = [];
  realtimeState.currentLocation = {};
  return res.json({ success: true, message: "In-memory GPS history cleared." });
});

module.exports = router;
