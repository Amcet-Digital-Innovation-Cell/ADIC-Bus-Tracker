/**
 * config/env.js
 * ─────────────────────────────────────────────────────────────
 * Centralized environment variable loader & validator.
 *
 * Validates all required variables on startup.
 * Exports a single typed config object used across the app
 * so no other file needs to call process.env directly.
 * ─────────────────────────────────────────────────────────────
 */

const path = require("path");

// Load .env from backend directory first, then project root as fallback.
// This ensures local dev and Render both work correctly.
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

// ── Required variables (app will not start without these) ──────────────────
const REQUIRED = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `\n❌ FATAL: Missing required environment variables:\n   ${missing.join(", ")}\n` +
    `   Add them to backend/.env or set them in your Render dashboard.\n`
  );
  process.exit(1);
}

// ── Optional GPS (SkyNav) variables — logged as warnings if absent ──────────
// SKYNAV_BEARER_TOKEN is intentionally excluded — the demo credentials work
// WITHOUT a bearer token. It is only sent if explicitly set in the environment.
const GPS_VARS = [
  "SKYNAV_API_URL",
  "SKYNAV_USERNAME",
  "SKYNAV_PASSWORD",
  "SKYNAV_PROJECT_ID",
  "SKYNAV_COMPANY_NAME",
];

// REQUIRED for isConfigured (bearer token is optional)
const REQUIRED_GPS_VARS = [
  "SKYNAV_USERNAME",
  "SKYNAV_PASSWORD",
  "SKYNAV_PROJECT_ID",
  "SKYNAV_COMPANY_NAME",
];

const missingGps = GPS_VARS.filter((key) => !process.env[key]);
if (missingGps.length > 0) {
  console.warn(
    `\n⚠️  SkyNav GPS not fully configured. Missing: ${missingGps.join(", ")}.\n` +
    `   GPS scheduler will start but skip sync until credentials are added.\n`
  );
}

// ── Exported config object ─────────────────────────────────────────────────
const config = {
  // Server
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  isDev: (process.env.NODE_ENV || "development") === "development",

  // CORS — restrict in production; use * in development/fallback
  frontendUrl: process.env.FRONTEND_URL || "*",

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE ||
      process.env.SUPABASE_KEY ||
      null,
  },

  // SkyNav GPS Credentials (null when not configured)
  skynav: {
    apiUrl: process.env.SKYNAV_API_URL || null,
    bearerToken: process.env.SKYNAV_BEARER_TOKEN || null,
    username: process.env.SKYNAV_USERNAME || null,
    password: process.env.SKYNAV_PASSWORD || null,
    projectId: process.env.SKYNAV_PROJECT_ID || null,
    companyName: process.env.SKYNAV_COMPANY_NAME || null,
    imei: process.env.SKYNAV_IMEI || null,                  // Primary device IMEI (optional)
    pollIntervalMs: parseInt(process.env.GPS_POLL_INTERVAL_MS || "60000", 10),
    // isConfigured: bearer token is optional — only require username/password/projectId/companyName
    isConfigured: REQUIRED_GPS_VARS.every((key) => !!process.env[key]),
  },

  // Socket.IO
  socket: {
    corsOrigin: process.env.FRONTEND_URL || "*",
  },
};

module.exports = config;
