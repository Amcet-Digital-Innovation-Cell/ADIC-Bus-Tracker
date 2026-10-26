/**
 * src/hooks/useDataCache.js
 * ─────────────────────────────────────────────────────────────
 * High-performance In-Memory SWR-style API Caching & State Hooks
 * for AMCET Transit Admin Dashboard.
 *
 * Capabilities:
 *  1. Stale-While-Revalidate (SWR) in-memory cache with TTL.
 *  2. Deduplicates simultaneous in-flight requests for identical keys.
 *  3. useCachedQuery: generic hook for automatic caching & revalidation.
 *  4. useDebounce: debounces search inputs to preserve 60fps responsiveness.
 *  5. useRoutesCache: pre-loads & caches bus routes and their embedded JSON stops.
 * ─────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import apiClient from '../lib/apiClient';

// Global singleton cache storage: Map<key, { data, timestamp, promise }>
const globalCache = new Map();

/**
 * In-memory Cache Manager
 */
export const apiCache = {
  get(key) {
    return globalCache.get(key);
  },

  set(key, data, ttlMs = 60000) {
    globalCache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      promise: null,
    });
  },

  has(key) {
    const entry = globalCache.get(key);
    if (!entry) return false;
    return Date.now() < entry.expiresAt;
  },

  invalidate(keyPattern) {
    if (!keyPattern) {
      globalCache.clear();
      return;
    }
    for (const key of globalCache.keys()) {
      if (typeof keyPattern === 'string' && key.includes(keyPattern)) {
        globalCache.delete(key);
      } else if (keyPattern instanceof RegExp && keyPattern.test(key)) {
        globalCache.delete(key);
      }
    }
  },
};

/**
 * useDebounce Hook
 * Debounces any fast-changing value (e.g. search query or filter input)
 *
 * @param {any} value - The input value to debounce
 * @param {number} delayMs - Delay in milliseconds (default 250ms)
 * @returns {any} Debounced value
 */
export function useDebounce(value, delayMs = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

/**
 * useCachedQuery Hook
 * Implements Stale-While-Revalidate caching pattern
 *
 * @param {string} key - Unique cache key
 * @param {Function} fetcherFn - Async function returning data
 * @param {Object} options - Configuration options
 * @param {number} [options.ttl=60000] - Cache validity in milliseconds
 * @param {boolean} [options.enabled=true] - Whether query is active
 * @param {boolean} [options.keepPreviousData=true] - Prevent layout shift during revalidation
 */
export function useCachedQuery(key, fetcherFn, options = {}) {
  const {
    ttl = 60000,
    enabled = true,
    keepPreviousData = true,
  } = options;

  const cachedEntry = key ? globalCache.get(key) : null;
  const isFresh = cachedEntry && Date.now() < cachedEntry.expiresAt;

  const [data, setData] = useState(() => (cachedEntry ? cachedEntry.data : null));
  const [loading, setLoading] = useState(() => !cachedEntry && enabled);
  const [isValidating, setIsValidating] = useState(() => !isFresh && enabled);
  const [error, setError] = useState(null);

  const fetcherRef = useRef(fetcherFn);
  fetcherRef.current = fetcherFn;

  const executeFetch = useCallback(async (force = false) => {
    if (!key || !enabled) return;

    const entry = globalCache.get(key);
    const valid = entry && Date.now() < entry.expiresAt;

    // Return instant cached data if fresh and not forced
    if (valid && !force) {
      setData(entry.data);
      setLoading(false);
      setIsValidating(false);
      return entry.data;
    }

    // Reuse existing in-flight promise to prevent duplicate API calls
    if (entry?.promise) {
      try {
        const promisedData = await entry.promise;
        setData(promisedData);
        setLoading(false);
        setIsValidating(false);
        return promisedData;
      } catch (err) {
        // Fall through to retry if in-flight failed
      }
    }

    if (!keepPreviousData || !entry?.data) {
      setLoading(true);
    }
    setIsValidating(true);
    setError(null);

    const fetchPromise = (async () => {
      try {
        const result = await fetcherRef.current();
        globalCache.set(key, {
          data: result,
          expiresAt: Date.now() + ttl,
          promise: null,
        });
        setData(result);
        return result;
      } catch (err) {
        setError(err);
        if (entry) {
          entry.promise = null;
        }
        throw err;
      } finally {
        setLoading(false);
        setIsValidating(false);
      }
    })();

    if (entry) {
      entry.promise = fetchPromise;
    } else {
      globalCache.set(key, {
        data: null,
        expiresAt: 0,
        promise: fetchPromise,
      });
    }

    return fetchPromise;
  }, [key, enabled, keepPreviousData, ttl]);

  useEffect(() => {
    if (enabled) {
      executeFetch(false);
    }
  }, [key, enabled, executeFetch]);

  const mutate = useCallback((updater, revalidate = false) => {
    let nextData;
    if (typeof updater === 'function') {
      nextData = updater(data);
    } else {
      nextData = updater;
    }
    globalCache.set(key, {
      data: nextData,
      expiresAt: Date.now() + ttl,
      promise: null,
    });
    setData(nextData);

    if (revalidate) {
      executeFetch(true);
    }
  }, [key, ttl, data, executeFetch]);

  const refetch = useCallback(() => executeFetch(true), [executeFetch]);

  return {
    data,
    loading,
    isValidating,
    error,
    mutate,
    refetch,
  };
}

/**
 * Specialized Routes & Embedded Stops Cache Hook
 * Pre-loads all routes and provides instant 0ms stops extraction from route.stops JSON.
 */
export function useRoutesCache() {
  const { data: routes, loading, error, refetch, mutate } = useCachedQuery(
    'routes_all',
    async () => {
      const res = await apiClient.get('/api/routes');
      const list = Array.isArray(res)
        ? res
        : Array.isArray(res?.routes)
        ? res.routes
        : Array.isArray(res?.data)
        ? res.data
        : [];
      return list;
    },
    { ttl: 120000 } // 2 minutes cache
  );

  /**
   * Instantly extract stops for a route synchronously from memory
   */
  const getStopsForRoute = useCallback((routeId) => {
    if (!routeId || !routes) return [];
    const matched = routes.find((r) => String(r.id) === String(routeId));
    if (!matched) return [];

    let stops = matched.stops;
    if (typeof stops === 'string') {
      try {
        stops = JSON.parse(stops);
      } catch (_) {
        stops = [];
      }
    }
    return Array.isArray(stops) ? stops : [];
  }, [routes]);

  return {
    routes: routes || [],
    loading,
    error,
    refetchRoutes: refetch,
    mutateRoutes: mutate,
    getStopsForRoute,
  };
}
