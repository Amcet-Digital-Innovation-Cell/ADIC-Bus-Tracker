/**
 * gps/gps.service.js
 * ─────────────────────────────────────────────────────────────
 * SkyNav GPS API client.
 *
 * Calls POST https://api.skynavgps.com/v2/devices/?imei=<IMEI>
 * with multipart/form-data credentials and returns the raw JSON.
 *
 * IMPORTANT — BEARER TOKEN:
 *   The official SkyNav docs require Bearer-token authentication.
 *   However, the demo credentials work WITHOUT a Bearer token.
 *   Therefore: if SKYNAV_BEARER_TOKEN is set, it is sent.
 *              if SKYNAV_BEARER_TOKEN is absent, no Authorization
 *              header is added — the demo credentials continue to work.
 *
 * IMPORTANT — RATE LIMIT:
 *   The demo SkyNav API allows approximately ONE request per minute.
 *   The GPS_POLL_INTERVAL_MS env var controls this (default 60s).
 *   The retry logic below uses a CONSERVATIVE approach: it does NOT
 *   retry on API-level errors (root.error) since a retry immediately
 *   would just hit the rate limit again.
 *
 * IMPORTANT — ERROR DETECTION:
 *   SkyNav returns HTTP 200 even for errors, e.g.:
 *     { "root": { "error": "The call exceeded the limit..." } }
 *   This is detected and returned as null (not passed to the parser).
 * ─────────────────────────────────────────────────────────────
 */

"use strict";

const config = require("../config/env");
const gpsLogger = require("./gpsLogger");

// node-fetch v2 is CommonJS-compatible
const fetch = require("node-fetch");

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * fetchGpsData
 * ─────────────────────────────────────────────────────────────
 * Calls the SkyNav /v2/devices/ endpoint.
 *
 * @returns {Promise<object|null>}
 *   Raw JSON from SkyNav, or null if not configured / API fails.
 */
exports.fetchGpsData = async () => {
  const { skynav } = config;

  // ── Guard: skip if credentials aren't set ────────────────────────────
  if (!skynav.isConfigured) {
    gpsLogger.logNotConfigured();
    return null;
  }

  // ── Build the URL with IMEI query parameter ───────────────────────────
  const baseUrl = (skynav.apiUrl || "https://api.skynavgps.com/v2").replace(/\/$/, "");
  const imeiList = skynav.imei || "";
  const url = `${baseUrl}/devices/?imei=${encodeURIComponent(imeiList)}`;

  // ── Build form-data body (SkyNav expects form-data, not JSON) ─────────
  const formData = new URLSearchParams();
  formData.append("username", skynav.username || "");
  formData.append("password", skynav.password || "");
  formData.append("projectId", skynav.projectId || "");
  formData.append("companyName", skynav.companyName || "");

  // ── Build headers — Bearer token is OPTIONAL ──────────────────────────
  // Demo credentials work without it; production may require it.
  const headers = {};
  if (skynav.bearerToken && skynav.bearerToken !== "your-bearer-token-here") {
    headers["Authorization"] = `Bearer ${skynav.bearerToken}`;
  }

  console.log(`[GPS] 🔄 Fetching GPS data | IMEI: ${imeiList} | URL: ${url}`);

  // ── Single attempt with timeout ───────────────────────────────────────
  // NOTE: We do NOT retry on API-level failures (root.error) because an
  // immediate retry would just re-trigger the SkyNav rate limit.
  // Network errors (timeout, DNS) get retried once.
  const MAX_RETRIES = 2;
  const TIMEOUT_MS = 20000; // 20s — SkyNav can be slow
  const BASE_DELAY = 2000;  // 2s delay between retries

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse response body
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error(
          `[GPS] ❌ Non-JSON response from SkyNav (HTTP ${response.status}): ${text.slice(0, 300)}`
        );
        throw new Error(`SkyNav returned non-JSON (HTTP ${response.status})`);
      }

      // ── HTTP-level error ──────────────────────────────────────────────
      if (!response.ok) {
        throw new Error(`SkyNav HTTP ${response.status}: ${JSON.stringify(data).slice(0, 200)}`);
      }

      // ── SkyNav application-level errors (HTTP 200 but error body) ──────
      // Pattern 1: { "root": { "error": "..." } }
      if (data && data.root && data.root.error) {
        const errMsg = data.root.error;
        console.warn(`[GPS] ⚠️  SkyNav API error (HTTP 200): ${errMsg}`);
        // Rate limit error — do NOT retry
        if (
          errMsg.toLowerCase().includes("limit") ||
          errMsg.toLowerCase().includes("one minute") ||
          errMsg.toLowerCase().includes("exceeded")
        ) {
          console.warn("[GPS] 🚫 Rate limit hit. Will retry on next scheduler cycle.");
          return null;
        }
        // Other API errors — also return null (invalid data)
        return null;
      }

      // Pattern 2: { "result": 0, "message": "..." } (older SkyNav format)
      if (data && data.result === 0) {
        console.warn(`[GPS] ⚠️  SkyNav API error: ${data.message || "Unknown error"}`);
        return null;
      }

      // ── Check VehicleData is present before declaring success ──────────
      if (!data?.root?.VehicleData) {
        console.warn(
          `[GPS] ⚠️  Response has no VehicleData. Keys: [${Object.keys(data?.root || data || {}).join(", ")}]`
        );
        // Return the raw data so gpsParser can log a proper warning
        return data;
      }

      console.log(`[GPS] ✅ SkyNav response received (attempt ${attempt}) | ${data.root.VehicleData.length} vehicle(s)`);
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
        console.log(`[GPS] ⏳ Retrying in ${BASE_DELAY}ms…`);
        await sleep(BASE_DELAY);
      }
    }
  }

  console.error(`[GPS] 💀 All ${MAX_RETRIES} attempts failed. Last error: ${lastError?.message}`);
  return null;
};
