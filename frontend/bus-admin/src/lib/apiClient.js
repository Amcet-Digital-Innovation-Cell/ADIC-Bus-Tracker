/**
 * src/lib/apiClient.js
 * ─────────────────────────────────────────────────────────────
 * Centralized HTTP API client for AmcetTransit.
 *
 * Features:
 *   1. Automatic Bearer Token Attachment (from Supabase session or storage)
 *   2. Token Expiry Detection & Automatic Session Refresh via Supabase Auth
 *   3. 401 Unauthorized Interception & Automatic Redirection to Login
 *   4. Uniform JSON response parsing & error handling
 * ─────────────────────────────────────────────────────────────
 */

import supabase from './supabaseClient';

const rawApiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_BASE = rawApiBase.replace(/\/+$/, '');

/**
 * Event name dispatched when the session is permanently invalid or expired.
 */
export const AUTH_EXPIRED_EVENT = 'amcet:auth:expired';

/**
 * Retrieve the active auth token, automatically refreshing if expired or near expiry.
 *
 * @returns {Promise<string|null>} The access token or null if unauthenticated.
 */
export async function getValidToken() {
  try {
    // 1. Check active Supabase session
    if (supabase?.auth?.getSession) {
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session;

      if (!error && session?.access_token) {
        // Check if token expires within 60 seconds
        const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
        const isExpiringSoon = expiresAt && (expiresAt - Date.now() < 60000);

        if (isExpiringSoon && supabase?.auth?.refreshSession) {
          console.log('[apiClient] Access token near expiry or expired, refreshing session...');
          const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
          if (!refreshErr && refreshData?.session?.access_token) {
            const freshToken = refreshData.session.access_token;
            localStorage.setItem('authToken', freshToken);
            sessionStorage.setItem('authToken', freshToken);
            return freshToken;
          }
        }

        // Cache active token in both storage locations
        localStorage.setItem('authToken', session.access_token);
        sessionStorage.setItem('authToken', session.access_token);
        return session.access_token;
      }
    }
  } catch (err) {
    console.warn('[apiClient] Error inspecting Supabase session:', err.message);
  }

  // 2. Direct fallback: Check localStorage and sessionStorage keys
  const directToken = 
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('authToken') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    localStorage.getItem('access_token');

  if (directToken && directToken.trim() !== '' && directToken !== 'null' && directToken !== 'undefined') {
    return directToken.trim();
  }

  // 3. Fallback: Parse Supabase internal localStorage session keys (e.g. sb-<project>-auth-token)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') && key.endsWith('-auth-token'))) {
        const item = JSON.parse(localStorage.getItem(key) || '{}');
        if (item?.access_token) {
          localStorage.setItem('authToken', item.access_token);
          return item.access_token;
        }
      }
    }
  } catch (_) {}

  return null;
}

/**
 * Trigger logout and dispatch expired event.
 */
export function handleAuthExpiry() {
  console.warn('[apiClient] 401 Unauthorized: Session is invalid or expired. Cleaning credentials & redirecting...');
  sessionStorage.removeItem('authToken');
  sessionStorage.removeItem('isLoggedIn');
  sessionStorage.removeItem('userEmail');
  localStorage.removeItem('authToken');
  localStorage.removeItem('amcet-transit-auth');

  if (supabase?.auth?.signOut) {
    supabase.auth.signOut().catch(() => { });
  }

  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, {
    detail: { message: 'Your session has expired. Please sign in again.' }
  }));
}

/**
 * Core authenticated fetch wrapper.
 *
 * @param {string} endpoint - Relative API path (e.g., '/api/buses') or full URL
 * @param {RequestInit} [options] - Fetch options
 * @param {boolean} [retryOn401=true] - Whether to attempt one token refresh on 401
 * @returns {Promise<Response>}
 */
export async function authFetch(endpoint, options = {}, retryOn401 = true) {
  // Normalize endpoint to prevent double-slash bugs (e.g. '//api/...' -> '/api/...')
  const cleanEndpoint = endpoint.startsWith('http') ? endpoint : `/${endpoint.replace(/^\/+/, '')}`;
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;
  const token = await getValidToken();

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const fetchOptions = {
    ...options,
    headers,
  };

  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (netErr) {
    console.error(`[apiClient] Network error for ${url}:`, netErr);
    throw netErr;
  }

  // Handle 401 Unauthorized
  if (response.status === 401) {
    if (retryOn401 && supabase?.auth?.refreshSession) {
      console.warn(`[apiClient] 401 received for ${url}. Attempting token refresh...`);
      try {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        if (!refreshErr && refreshData?.session?.access_token) {
          const newToken = refreshData.session.access_token;
          // Retry the request with the refreshed token
          const retryHeaders = new Headers(options.headers || {});
          if (!retryHeaders.has('Content-Type') && !(options.body instanceof FormData)) {
            retryHeaders.set('Content-Type', 'application/json');
          }
          retryHeaders.set('Authorization', `Bearer ${newToken}`);

          const retryResponse = await fetch(url, {
            ...options,
            headers: retryHeaders,
          });

          if (retryResponse.status !== 401) {
            return retryResponse;
          }
        }
      } catch (refreshException) {
        console.error('[apiClient] Refresh exception:', refreshException);
      }
    }

    // If retry also failed or not possible, trigger expiry and redirect
    handleAuthExpiry();
  }

  return response;
}

/**
 * Convenience methods for JSON requests.
 */
export const apiClient = {
  get: async (endpoint, options = {}) => {
    const res = await authFetch(endpoint, { method: 'GET', ...options });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const error = new Error(errorBody.error || errorBody.message || `Request failed with status ${res.status}`);
      error.status = res.status;
      error.data = errorBody;
      throw error;
    }
    return res.json();
  },

  post: async (endpoint, body, options = {}) => {
    const res = await authFetch(endpoint, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
      ...options,
    });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const error = new Error(errorBody.error || errorBody.message || `Request failed with status ${res.status}`);
      error.status = res.status;
      error.data = errorBody;
      throw error;
    }
    return res.json();
  },

  put: async (endpoint, body, options = {}) => {
    const res = await authFetch(endpoint, {
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
      ...options,
    });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const error = new Error(errorBody.error || errorBody.message || `Request failed with status ${res.status}`);
      error.status = res.status;
      error.data = errorBody;
      throw error;
    }
    return res.json();
  },

  delete: async (endpoint, options = {}) => {
    const res = await authFetch(endpoint, { method: 'DELETE', ...options });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const error = new Error(errorBody.error || errorBody.message || `Request failed with status ${res.status}`);
      error.status = res.status;
      error.data = errorBody;
      throw error;
    }
    return res.json();
  },

  getToken: getValidToken,
  API_BASE,
};

export default apiClient;
