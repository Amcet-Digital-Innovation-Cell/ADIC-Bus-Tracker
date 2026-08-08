/**
 * config/supabase.js
 * ─────────────────────────────────────────────────────────────
 * Exports two Supabase clients:
 *
 *  supabase      — anon/public client used for:
 *                  • Reading bus data (SELECT)
 *                  • Validating Supabase JWTs in auth middleware
 *
 *  adminSupabase — service-role client that bypasses Row Level
 *                  Security, used for:
 *                  • GPS coordinate updates (UPDATE buses)
 *                  • Only available when SUPABASE_SERVICE_ROLE_KEY is set
 *
 * All credentials come from config/env.js (not process.env directly).
 * ─────────────────────────────────────────────────────────────
 */

const { createClient } = require("@supabase/supabase-js");
const config = require("./env");

/**
 * Public (anon) Supabase client.
 * Used for SELECT queries and JWT validation.
 * Session persistence is disabled — this is a server-side client.
 */
const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * Admin Supabase client (service-role).
 * Bypasses RLS for GPS coordinate writes.
 * Null when SUPABASE_SERVICE_ROLE_KEY is not provided.
 */
const adminSupabase = config.supabase.serviceRoleKey
  ? createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

if (!adminSupabase) {
  console.warn(
    "⚠️  SUPABASE_SERVICE_ROLE_KEY is not set. GPS coordinate writes may fail if RLS is enabled."
  );
}

module.exports = { supabase, adminSupabase };