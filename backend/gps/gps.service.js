/**
 * gps/gps.service.js
 * ─────────────────────────────────────────────────────────────
 * SkyNav GPS API client — strictly follows the official SkyNav
 * API documentation (v2).
 *
 * ─────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES:
 *   Calls POST https://api.skynavgps.com/v2/devices/?imei=<IMEI>
 *   with multipart/form-data credentials and returns the raw JSON.
 *
 * WHAT IT DOES NOT DO:
 *   - No authentication is handled here (Bearer token is a static env var)
 *   - No DB writes — that is gpsUpdater.js
 *   - No field parsing — that is gpsParser.js
 *
 * ─────────────────────────────────────────────────────────────
 * OFFICIAL SKYNAV API SPEC (from skynav.txt):
 *
 *   Method  : POST
 *   Endpoint: https://api.skynavgps.com/v2/devices/
 *   Header  : Authorization: Bearer <BEARER_TOKEN>
 *   Body    : multipart/form-data
 *               username    = <USERNAME>
 *               password    = <PASSWORD>
 *               projectId   = <PROJECT_ID>      ← capital I (as per docs)
 *               companyName = <COMPANY_NAME>
 *   Query   : ?imei=<IMEI_1>,<IMEI_2>           ← comma-separated, URL param
 *
 *   Successful Response:
 *   {
 *     "root": {
 *       "VehicleData": [
 *         {
 *           "Vehicle_Name": "...",
 *           "Company":      "...",
 *           "Vehicle_No":   "...",
 *           "Imeino":       "...",
 *           "Latitude":     "...",
 *           "Longitude":    "...",
 *           "Speed":        "...",
 *           "Status":       "...",
 *           "GPSActualTime":"...",
 *           "Datetime":     "...",
 *           "Location":     "...",
 *           "IGN":          "...",
 *           "AC":           "...",
 *           "Odometer":     "..."
 *         }
 *       ]
 *     }
 *   }
 *
 * ─────────────────────────────────────────────────────────────
 * ENVIRONMENT VARIABLES REQUIRED (set in Render dashboard):
 *   SKYNAV_API_URL      = https://api.skynavgps.com/v2
 *   SKYNAV_BEARER_TOKEN = <your bearer token>
 *   SKYNAV_USERNAME     = <your username>
 *   SKYNAV_PASSWORD     = <your password>
 *   SKYNAV_PROJECT_ID   = <your project ID>
 *   SKYNAV_COMPANY_NAME = <your company name>
 *   SKYNAV_IMEI         = <comma-separated IMEI numbers>
 * ─────────────────────────────────────────────────────────────
 */

"use strict";

const config    = require("../config/env");
const gpsLogger = require("./gpsLogger");

// node-fetch v2 is CommonJS-compatible; already in package.json
const fetch = require("node-fetch");

// ── Abort timeout helper ──────────────────────────────────────────────────────
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * fetchGpsData
 * ─────────────────────────────────────────────────────────────
 * Calls the SkyNav /v2/devices/ endpoint using:
 *   - POST method
 *   - multipart/form-data body  (username, password, projectId, companyName)
 *   - ?imei= query parameter    (one or comma-separated IMEI list)
 *   - Authorization: Bearer <token> header
 *
 * @returns {Promise<object|null>}
 *   Raw JSON from SkyNav, or null if not configured / API fails.
 */
exports.fetchGpsData = async () => {
  const { skynav } = config;

  // ── Guard: only run if all credentials are present ───────────────────────
  if (!skynav.isConfigured) {
    gpsLogger.logNotConfigured();
    return null;
  }

  // ── Build the URL with IMEI query parameter ───────────────────────────────
  // Per docs: POST https://api.skynavgps.com/v2/devices/?imei=<IMEI1>,<IMEI2>
  // IMEI is a query param NOT a path segment.
  const baseUrl  = (skynav.apiUrl || "https://api.skynavgps.com/v2").replace(/\/$/, "");
  const imeiList = skynav.imei || "";                          // e.g. "356218602130948"
  const url      = `${baseUrl}/devices/?imei=${encodeURIComponent(imeiList)}`;

  // ── Build multipart/form-data body ───────────────────────────────────────
  // SkyNav requires form-data (NOT JSON). Using URLSearchParams gives us
  // application/x-www-form-urlencoded which is compatible with $_POST on
  // most PHP/server backends — SkyNav accepts both, but form-data is safest.
  const formData = new URLSearchParams();
  formData.append("username",    skynav.username    || "");
  formData.append("password",    skynav.password    || "");
  formData.append("projectId",   skynav.projectId   || "");   // Capital I — matches SkyNav docs
  formData.append("companyName", skynav.companyName || "");

  gpsLogger.logSyncStart?.() ||
    console.log(`[GPS] 🔄 Fetching device data | IMEI: ${imeiList} | URL: ${url}`);

  // ── Retry loop (max 3 attempts with exponential backoff) ─────────────────
  const MAX_RETRIES  = 3;
  const BASE_DELAY   = 1000;   // ms
  const TIMEOUT_MS   = 20000;  // 20s — SkyNav can be slow

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method:  "POST",
        headers: {
          // Authorization header — Bearer token as per SkyNav docs
          Authorization: `Bearer ${skynav.bearerToken}`,
          // Content-Type is set automatically by URLSearchParams
          // Do NOT manually set 'application/json' here — SkyNav expects form data
        },
        body:   formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse response body
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        // SkyNav returned non-JSON — treat as error
        console.error(`[GPS] ❌ Non-JSON response from SkyNav (HTTP ${response.status}): ${text.slice(0, 200)}`);
        throw new Error(`SkyNav returned non-JSON (HTTP ${response.status})`);
      }

      // ── Handle SkyNav error responses ─────────────────────────────────────
      // SkyNav returns HTTP 200 even for errors, check body content
      if (!response.ok) {
        throw new Error(`SkyNav HTTP ${response.status}: ${JSON.stringify(data)}`);
      }

      // SkyNav error pattern: { "result": 0, "message": "Error in Service : Data Not Found !" }
      if (data && data.result === 0) {
        console.warn(`[GPS] ⚠️  SkyNav API error: ${data.message || "Unknown error"}`);
        console.warn(`[GPS]    → Check: IMEI (${imeiList}), credentials, projectId, companyName`);
        return null;
      }

      console.log(`[GPS] ✅ SkyNav response received (attempt ${attempt})`);
      return data;

    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;

      if (err.name === "AbortError") {
        console.error(`[GPS] ⏱️  Request timed out after ${TIMEOUT_MS}ms (attempt ${attempt})`);
      } else {
        console.error(`[GPS] ❌ Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      }

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        console.log(`[GPS] ⏳ Retrying in ${delay}ms…`);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  console.error(`[GPS] 💀 All ${MAX_RETRIES} attempts failed. Last error: ${lastError?.message}`);
  return null;
};
