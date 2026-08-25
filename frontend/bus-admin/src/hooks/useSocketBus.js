/**
 * src/hooks/useSocketBus.js
 * ─────────────────────────────────────────────────────────────
 * Custom React hook for real-time bus location updates.
 *
 * Responsibilities:
 *   1. Connect to the backend Socket.IO server
 *   2. Listen for 'busLocationUpdated' events (vehicleNumber-based)
 *   3. Merge incoming GPS telemetry into the local buses state
 *      using vehicle_number / registration_number matching
 *   4. Run client-side LINEAR INTERPOLATION every 200ms
 *      to smoothly animate bus markers between GPS packets
 *   5. Disconnect cleanly when the component unmounts
 *
 * IMPORTANT: GPS data comes from gps_telemetry (via backend), NOT
 * directly from SkyNav. The Socket.IO event payload is emitted by
 * gpsScheduler.js after each successful UPSERT to gps_telemetry.
 * ─────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_URL || "https://bustransit-g4ks.onrender.com";
const INTERPOLATION_INTERVAL_MS = 200;
const GPS_PACKET_INTERVAL_MS = 60000; // Match GPS_POLL_INTERVAL_MS in backend

/**
 * useSocketBus
 *
 * @param {object[]} initialBuses - The initial bus array from /api/buses
 * @param {string|null} authToken  - Supabase access token
 * @returns {{
 *   buses: object[],         // Interpolated bus positions (use this for the map)
 *   connected: boolean,      // Socket.IO connection status
 *   updateCount: number      // Number of GPS updates received
 * }}
 */
export function useSocketBus(initialBuses, authToken) {
  const [liveBuses, setLiveBuses] = useState(initialBuses);
  const [buses, setBuses] = useState(initialBuses);
  const [connected, setConnected] = useState(false);
  const [updateCount, setUpdateCount] = useState(0);

  // Store previous positions for interpolation
  // Map: vehicleNumber → { prevLat, prevLng, newLat, newLng, startTime }
  const interpolationRef = useRef({});
  const intervalRef = useRef(null);
  const socketRef = useRef(null);

  // ── Sync initialBuses changes into liveBuses ──────────────────────────────
  useEffect(() => {
    setLiveBuses(initialBuses);
    setBuses(initialBuses);
  }, [initialBuses]);

  // ── Socket.IO connection ──────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(API_BASE, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[Socket.IO] Connected:", socket.id);
      setConnected(true);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket.IO] Disconnected:", reason);
      setConnected(false);
    });

    // ── Handle incoming GPS update from gps_telemetry pipeline ────────────
    // Payload fields: vehicleNumber, latitude, longitude, speed,
    //                 rawStatus, ignition, location, gpsActualTime, receivedAt
    socket.on("busLocationUpdated", (payload) => {
      const {
        vehicleNumber,
        latitude,
        longitude,
        speed,
        rawStatus,
        ignition,
        location,
        gpsActualTime,
        receivedAt,
      } = payload;

      if (!vehicleNumber || latitude == null || longitude == null) return;

      setUpdateCount((c) => c + 1);
      console.log(
        `[Socket.IO] busLocationUpdated | vehicle=${vehicleNumber} ` +
        `lat=${latitude} lng=${longitude} ignition=${ignition}`
      );

      // ── Derive GPS status ─────────────────────────────────────────────
      // "Online"  → GPS is reporting valid coordinates AND ignition is ON
      // "Pending" → ignition is OFF or GPS signal is absent
      const ignitionOn = String(ignition || "").toUpperCase() === "ON";
      const gpsStatus = ignitionOn ? "Online" : "Pending";

      setLiveBuses((prev) => {
        return prev.map((bus) => {
          // Match by registration_number (our buses table) or busNo
          const busRegNo = (bus.registration_number || bus.busNo || "").toUpperCase();
          if (busRegNo !== vehicleNumber.toUpperCase()) return bus;

          // Record positions for smooth interpolation
          const prevLat = bus._interpLat ?? bus.latitude;
          const prevLng = bus._interpLng ?? bus.longitude;

          interpolationRef.current[vehicleNumber] = {
            prevLat: prevLat ?? latitude,
            prevLng: prevLng ?? longitude,
            newLat: latitude,
            newLng: longitude,
            startTime: Date.now(),
          };

          // Derive normalized status from rawStatus
          const normalizedStatus = (rawStatus || "").toUpperCase() === "RUNNING" ||
            (rawStatus || "").toUpperCase() === "MOVING"
            ? "active"
            : "inactive";

          return {
            ...bus,
            latitude,
            longitude,
            status: normalizedStatus,
            speed,
            ignition,
            gpsStatus,           // ← "Online" | "Pending"
            location_address: location,
            gps_actual_time: gpsActualTime,
            received_at: receivedAt,
            _interpLat: prevLat ?? latitude,
            _interpLng: prevLng ?? longitude,
          };
        });
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ── Interpolation ticker ──────────────────────────────────────────────────
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const interp = interpolationRef.current;

      const hasActive = Object.values(interp).some(
        (entry) => now - entry.startTime < GPS_PACKET_INTERVAL_MS
      );

      if (!hasActive) return;

      setBuses((prev) =>
        prev.map((bus) => {
          const key = (bus.registration_number || bus.busNo || "").toUpperCase();
          const entry = interp[key];

          if (!entry) return bus;

          const elapsed = now - entry.startTime;
          const t = Math.min(elapsed / GPS_PACKET_INTERVAL_MS, 1.0);

          const interpLat = entry.prevLat + (entry.newLat - entry.prevLat) * t;
          const interpLng = entry.prevLng + (entry.newLng - entry.prevLng) * t;

          return {
            ...bus,
            _interpLat: interpLat,
            _interpLng: interpLng,
          };
        })
      );
    }, INTERPOLATION_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ── Return smoothed buses ─────────────────────────────────────────────────
  const displayBuses = buses.map((bus) => ({
    ...bus,
    latitude: bus._interpLat ?? bus.latitude,
    longitude: bus._interpLng ?? bus.longitude,
  }));

  return { buses: displayBuses, connected, updateCount };
}
