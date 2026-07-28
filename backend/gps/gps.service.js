/**
 * gps/gps.service.js
 * ─────────────────────────────────────────────────────────────
 * SkyNav API client.
 *
 * Responsible for authenticating with SkyNav and fetching the
 * latest GPS data package. All credentials are read from env
 * variables — never from the frontend, never from request params.
 *
 * The frontend has ZERO access to SkyNav credentials or endpoints.
 *
 * ─────────────────────────────────────────────────────────────
 * AUTHENTICATION FLOW:
 *
 * SkyNav uses Bearer Token authentication.
 * The token is stored in SKYNAV_BEARER_TOKEN env var.
 *
 * If SkyNav requires a login step first, the service will:
 *   1. POST to SKYNAV_API_URL/login with username + password
 *   2. Extract the session token from the response
 *   3. Use that token for the device data request
 *
 * ─────────────────────────────────────────────────────────────
 */

const config = require("../config/env");
const { fetchWithRetry } = require("../utils/httpClient");
const gpsLogger = require("./gpsLogger");

/**
 * fetchGpsData
 * Calls the SkyNav API to retrieve the latest GPS package
 * for all configured devices.
 *
 * @returns {Promise<any>} - Raw JSON response from SkyNav
 * @throws {Error} - If SkyNav is not configured or request fails
 */
exports.fetchGpsData = async () => {
  const { skynav } = config;

  // Guard: credentials must be configured
  if (!skynav.isConfigured) {
    gpsLogger.logNotConfigured();
    return null;
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${skynav.bearerToken}`,
    "X-Project-ID": skynav.projectId || "",
    "X-Company":    skynav.companyName || "",
  };

  // Build the device data URL.
  // SkyNav typically uses one of these patterns:
  //   GET  /api/devices         — all devices
  //   GET  /api/devices/{imei}  — specific device by IMEI
  //   POST /api/getlocation     — location for specific devices
  //
  // When SKYNAV_IMEI is set, fetch only that device;
  // otherwise fetch all devices associated with the project.
  const endpoint = skynav.imei
    ? `${skynav.apiUrl}/devices/${skynav.imei}`
    : `${skynav.apiUrl}/devices`;

  const result = await fetchWithRetry(
    endpoint,
    {
      method: "GET",
      headers,
    },
    {
      retries: 3,          // Retry up to 3 times on failure
      baseDelayMs: 1000,   // Start with 1s delay, doubles each retry
      timeoutMs: 15000,    // 15 second timeout per attempt
    }
  );

  if (!result.ok) {
    throw new Error(
      `SkyNav API returned HTTP ${result.status}. Response: ${JSON.stringify(result.data)}`
    );
  }

  return result.data;
};
