/**
 * routes/traccar.routes.js
 * ─────────────────────────────────────────────────────────────
 * Traccar server webhook receiver.
 *
 * Traccar is an open-source GPS tracking server that can push
 * device position events to a configured HTTP endpoint.
 *
 * This route is mounted WITHOUT authentication in app.js
 * (before the auth middleware) because Traccar cannot send
 * a Supabase JWT with its webhook requests.
 *
 * Route:
 *   POST /traccar/webhook
 *
 * Expected payload from Traccar:
 *   {
 *     device:   { uniqueId: string, ... },
 *     position: { latitude, longitude, speed, course, fixTime, ... }
 *   }
 * ─────────────────────────────────────────────────────────────
 */

const express = require("express");
const router  = express.Router();

const { supabase }  = require("../config/supabase");
const { getIO }     = require("../config/socket");
const realtimeState = require("../utils/realtimeState");

// ─────────────────────────────────────────────────────────────
// POST /traccar/webhook
// ─────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    console.log("🔥 [Traccar] Webhook received");

    const { device, position } = req.body;

    if (!device || !position) {
      return res.status(400).json({
        success: false,
        message: "Invalid Traccar payload: missing device or position.",
      });
    }

    const gpsData = {
      bus_id:      device.uniqueId,
      latitude:    position.latitude,
      longitude:   position.longitude,
      speed:       position.speed   ?? null,
      heading:     position.course  ?? null,
      received_at: position.fixTime ?? new Date().toISOString(),
    };

    console.log("[Traccar] GPS data:", gpsData);

    // Persist to Supabase
    const { data, error } = await supabase
      .from("gps_logs")
      .insert([gpsData])
      .select();

    if (error) {
      console.error("[Traccar] Supabase error:", error.message);
      return res.status(500).json({ success: false, message: error.message });
    }

    // Update memory state
    realtimeState.currentLocation = gpsData;
    realtimeState.gpsHistory.push(gpsData);

    // Broadcast to connected dashboard clients
    try {
      getIO().emit("gpsUpdate", gpsData);
    } catch (socketErr) {
      console.warn("[Traccar] Socket.IO not ready:", socketErr.message);
    }

    console.log("✅ [Traccar] Saved to Supabase and broadcast to clients");

    // Traccar expects a 200 OK with no body
    return res.sendStatus(200);

  } catch (err) {
    console.error("[Traccar] Unhandled error:", err);
    return res.status(500).send(err.message);
  }
});

module.exports = router;
