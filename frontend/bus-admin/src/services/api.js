/**
 * src/services/api.js
 * ─────────────────────────────────────────────────────────────
 * Central API Client Instance with Request & Response Interceptors.
 *
 * Automatically extracts the JWT Bearer Token from:
 *   1. Supabase Auth Active Session (auto-refreshed if expiring)
 *   2. localStorage ('authToken' / 'token' / 'access_token')
 *   3. sessionStorage ('authToken' / 'token')
 *   4. Supabase internal project storage ('sb-*-auth-token')
 *
 * Provides both:
 *   - Axios-compatible call signatures (api.get, api.post, api.put, api.delete)
 *   - Interceptor registration (api.interceptors.request, api.interceptors.response)
 * ─────────────────────────────────────────────────────────────
 */

import apiClient, { getValidToken, authFetch, AUTH_EXPIRED_EVENT } from '../lib/apiClient';

const rawApiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const API_BASE = rawApiBase.replace(/\/+$/, '');

// ── Interceptor Registry ──────────────────────────────────────────
const requestInterceptors = [];
const responseInterceptors = [];

/**
 * Register a request interceptor.
 * @param {(config: object) => object | Promise<object>} onFulfilled
 * @param {(error: any) => any} [onRejected]
 * @returns {number} Interceptor ID
 */
export function addRequestInterceptor(onFulfilled, onRejected) {
  const id = requestInterceptors.length;
  requestInterceptors.push({ onFulfilled, onRejected });
  return id;
}

/**
 * Register a response interceptor.
 * @param {(response: Response) => Response | Promise<Response>} onFulfilled
 * @param {(error: any) => any} [onRejected]
 * @returns {number} Interceptor ID
 */
export function addResponseInterceptor(onFulfilled, onRejected) {
  const id = responseInterceptors.length;
  responseInterceptors.push({ onFulfilled, onRejected });
  return id;
}

// ── Default Request Interceptor: Attach Authorization Bearer Token ─
addRequestInterceptor(async (config) => {
  const token = await getValidToken();
  const headers = { ...(config.headers || {}) };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!headers['Content-Type'] && !(config.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  return {
    ...config,
    headers,
  };
});

// ── Default Response Interceptor: 401 Expiry Handler ──────────────
addResponseInterceptor(
  (response) => response,
  (error) => {
    if (error?.status === 401) {
      console.warn('[api] 401 Unauthorized detected by interceptor.');
    }
    return Promise.reject(error);
  }
);

/**
 * Centralized fetch with full interceptor execution.
 */
export async function request(endpoint, options = {}) {
  let config = {
    url: endpoint.startsWith('http') ? endpoint : `${API_BASE}/${endpoint.replace(/^\/+/, '')}`,
    ...options,
  };

  // Run through request interceptors
  for (const interceptor of requestInterceptors) {
    if (interceptor.onFulfilled) {
      try {
        config = await interceptor.onFulfilled(config);
      } catch (err) {
        if (interceptor.onRejected) return interceptor.onRejected(err);
        throw err;
      }
    }
  }

  let response;
  try {
    response = await authFetch(config.url, config);
  } catch (netErr) {
    for (const interceptor of responseInterceptors) {
      if (interceptor.onRejected) {
        return interceptor.onRejected(netErr);
      }
    }
    throw netErr;
  }

  // Run through response interceptors
  for (const interceptor of responseInterceptors) {
    if (interceptor.onFulfilled) {
      try {
        response = await interceptor.onFulfilled(response);
      } catch (err) {
        if (interceptor.onRejected) return interceptor.onRejected(err);
        throw err;
      }
    }
  }

  return response;
}

/**
 * Centralized API service object.
 */
export const api = {
  get: async (endpoint, options = {}) => {
    return apiClient.get(endpoint, options);
  },

  post: async (endpoint, body, options = {}) => {
    return apiClient.post(endpoint, body, options);
  },

  put: async (endpoint, body, options = {}) => {
    return apiClient.put(endpoint, body, options);
  },

  delete: async (endpoint, options = {}) => {
    return apiClient.delete(endpoint, options);
  },

  interceptors: {
    request: {
      use: addRequestInterceptor,
    },
    response: {
      use: addResponseInterceptor,
    },
  },

  getToken: getValidToken,
  API_BASE,
  request,
  AUTH_EXPIRED_EVENT,
};

export default api;
