/**
 * tracker.js
 * ─────────────────────────────────────────────────────────────
 * GPS Simulator — development / testing tool.
 *
 * Simulates a bus moving along a fixed route by POSTing GPS
 * coordinates to the local backend every 5 seconds.
 *
 * Run separately (NOT as part of the main server):
 *   node tracker.js
 *
 * Make sure the backend is running on port 3000 first.
 * ─────────────────────────────────────────────────────────────
 */

const axios = require("axios");

const API_URL = "http://localhost:3000/api/realtime/gps/update";

// Sample route coordinates (Andhra Pradesh area)
const route = [
  { lat: 13.082700, lng: 80.270700 },
  { lat: 13.082900, lng: 80.270950 },
  { lat: 13.083150, lng: 80.271250 },
  { lat: 13.083450, lng: 80.271650 },
  { lat: 13.083800, lng: 80.272100 },
  { lat: 13.084200, lng: 80.272600 },
  { lat: 13.084650, lng: 80.273200 },
  { lat: 13.085100, lng: 80.273900 },
  { lat: 13.085600, lng: 80.274600 },
  { lat: 13.086100, lng: 80.275300 },
  { lat: 13.086600, lng: 80.276000 },
  { lat: 13.087100, lng: 80.276700 },
  { lat: 13.087600, lng: 80.277400 },
  { lat: 13.088100, lng: 80.278100 },
  { lat: 13.088600, lng: 80.278800 },
  { lat: 13.089100, lng: 80.279500 },
  { lat: 13.089600, lng: 80.280200 },
  { lat: 13.090100, lng: 80.280900 },
  { lat: 13.090600, lng: 80.281600 },
  { lat: 13.091100, lng: 80.282300 },
];

let index = 0;

console.log("🚍 GPS Tracker Simulator Started");
console.log(`   Sending to: ${API_URL}`);
console.log("   Press Ctrl+C to stop.\n");

setInterval(async () => {
  const point = route[index];

  const gpsData = {
    bus_id:  "BUS001",
    latitude: point.lat,
    longitude: point.lng,
    speed:   Math.floor(Math.random() * 20) + 30, // 30–50 km/h
    heading: 90 + Math.floor(Math.random() * 10),
  };

  try {
    await axios.post(API_URL, gpsData);
    console.log(
      `[${new Date().toLocaleTimeString()}] → Sent:`,
      gpsData
    );
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] ✗ Error:`, err.message);
  }

  index++;

  if (index >= route.length) {
    index = 0;
    console.log("🔄 Route complete — restarting from beginning...\n");
  }

}, 5000); // Send every 5 seconds
