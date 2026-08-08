/**
 * src/hooks/useSocketBus.js
 * ─────────────────────────────────────────────────────────────
 * Custom React hook for real-time bus location updates.
 *
 * Responsibilities:
 *   1. Connect to the backend Socket.IO server
 *   2. Listen for 'busLocationUpdated' events
 *   3. Merge incoming GPS data into the local buses state
 *   4. Run client-side LINEAR INTERPOLATION every 200ms
 *      to smoothly animate bus markers between 30-second
 *      GPS packets (eliminates jumping/teleporting markers)
 *   5. Disconnect cleanly when the component unmounts
 *
 * ─────────────────────────────────────────────────────────────
 * SMOOTH GPS MOVEMENT EXPLAINED:
 *
 * SkyNav sends a new GPS position every 30 seconds.
 * Updating the map marker every 30s causes an abrupt jump.
 *
 * Solution: client-side interpolation
 *   - Store the PREVIOUS position and the NEW target position
 *   - Every 200ms, compute an intermediate position:
 *       t = elapsed / 30000  (0.0 → 1.0 over 30 seconds)
 *       interpLat = prevLat + (newLat - prevLat) * t
 *       interpLng = prevLng + (newLng - prevLng) * t
 *   - Move the marker to the interpolated position
 *   - This creates smooth, continuous movement
 * ─────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_URL || "https://bus-tracking-zbon.onrender.com";
const INTERPOLATION_INTERVAL_MS = 200;   // How often to update interpolated position
const GPS_PACKET_INTERVAL_MS    = 30000; // Expected interval between SkyNav packets

/**
 * useSocketBus
 *
 * @param {object[]} initialBuses - The initial bus array from /api/buses
 * @param {string|null} authToken  - Supabase access token (used for auth if needed)
 * @returns {{
 *   buses: object[],         // Interpolated bus positions (use this for the map)
 *   connected: boolean,      // Socket.IO connection status
 *   updateCount: number      // Number of GPS updates received (for debugging)
 * }}
 */
export function useSocketBus(initialBuses, authToken) {
  // The "live" buses state — updated by socket events
  const [liveBuses, setLiveBuses] = useState(initialBuses);

  // The "smoothed" buses state — updated by interpolation ticker
  const [buses, setBuses] = useState(initialBuses);

  const [connected, setConnected]     = useState(false);
  const [updateCount, setUpdateCount] = useState(0);

  // Store previous positions for interpolation calculation
  // Map: busNumber → { prevLat, prevLng, newLat, newLng, startTime }
  const interpolationRef = useRef({});
  const intervalRef      = useRef(null);
  const socketRef        = useRef(null);

  // ── Sync initialBuses changes into liveBuses ─────────────────────────────
  // This handles the initial load from /api/buses
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

    // ── Handle incoming GPS update ────────────────────────────────────────
    socket.on("busLocationUpdated", (payload) => {
      const { busNumber, latitude, longitude, status, updatedAt } = payload;

      setUpdateCount((c) => c + 1);

      // Update the live buses state with the new GPS position
      setLiveBuses((prev) => {
        const updated = prev.map((bus) => {
          if (bus.bus_number !== busNumber && bus.busId !== busNumber) return bus;

          // Record previous and new positions for interpolation
          const prevLat = bus._interpLat ?? bus.latitude;
          const prevLng = bus._interpLng ?? bus.longitude;

          interpolationRef.current[busNumber] = {
            prevLat: prevLat ?? latitude,
            prevLng: prevLng ?? longitude,
            newLat:  latitude,
            newLng:  longitude,
            startTime: Date.now(),
          };

          return {
            ...bus,
            latitude,
            longitude,
            status,
            updated_at: updatedAt,
            _interpLat: prevLat ?? latitude,
            _interpLng: prevLng ?? longitude,
          };
        });
        return updated;
      });
    });

    // ── Cleanup on unmount ────────────────────────────────────────────────
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ── Interpolation ticker ──────────────────────────────────────────────────
  // Runs every 200ms to compute intermediate bus positions
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const interp = interpolationRef.current;

      // Only update state if there are active interpolations
      const hasActive = Object.values(interp).some(
        (entry) => now - entry.startTime < GPS_PACKET_INTERVAL_MS
      );

      if (!hasActive) return;

      setBuses((prev) =>
        prev.map((bus) => {
          const key = bus.bus_number || bus.busId;
          const entry = interp[key];

          if (!entry) return bus;

          const elapsed = now - entry.startTime;
          const t = Math.min(elapsed / GPS_PACKET_INTERVAL_MS, 1.0);

          // Linear interpolation formula: a + (b - a) * t
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
  // The map should render _interpLat/_interpLng when available,
  // falling back to actual latitude/longitude.
  const displayBuses = buses.map((bus) => ({
    ...bus,
    latitude:  bus._interpLat  ?? bus.latitude,
    longitude: bus._interpLng  ?? bus.longitude,
  }));

  return { buses: displayBuses, connected, updateCount };
}
