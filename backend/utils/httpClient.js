/**
 * utils/httpClient.js
 * ─────────────────────────────────────────────────────────────
 * HTTP client wrapper with timeout and retry logic.
 *
 * Used exclusively by gps.service.js to call the SkyNav API.
 * Implements exponential backoff to handle transient failures
 * without hammering the GPS provider.
 *
 * No third-party HTTP library required — uses node-fetch.
 * ─────────────────────────────────────────────────────────────
 */

const fetch = require("node-fetch");
const { AbortController } = globalThis;

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetchWithTimeout
 * Wraps node-fetch with an AbortController timeout.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs - Default 10 seconds
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * fetchWithRetry
 * Retries a failed HTTP request with exponential backoff.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {object} retryConfig
 * @param {number} retryConfig.retries     - Max retry attempts (default 3)
 * @param {number} retryConfig.baseDelayMs - Base delay in ms (default 1000)
 * @param {number} retryConfig.timeoutMs   - Per-request timeout (default 10000)
 * @returns {Promise<{ ok: boolean, status: number, data: any }>}
 */
async function fetchWithRetry(url, options = {}, retryConfig = {}) {
  const {
    retries = 3,
    baseDelayMs = 1000,
    timeoutMs = 10000,
  } = retryConfig;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      const text = await response.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch {
        data = text; // Return raw text if not JSON
      }

      return {
        ok: response.ok,
        status: response.status,
        data,
      };
    } catch (err) {
      lastError = err;

      if (attempt < retries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(
          `[httpClient] Attempt ${attempt + 1}/${retries + 1} failed: ${err.message}. Retrying in ${delay}ms…`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

module.exports = { fetchWithRetry };
