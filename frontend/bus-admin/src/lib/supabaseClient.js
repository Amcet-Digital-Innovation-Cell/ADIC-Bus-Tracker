/**
 * src/lib/supabaseClient.js
 * ─────────────────────────────────────────────────────────────
 * Supabase client for the React admin dashboard.
 *
 * Used ONLY for authentication — the frontend never queries
 * bus data or any other table directly through this client.
 * All data comes from the Express backend API.
 *
 * Environment variables (set in frontend/.env or Vercel):
 *   VITE_SUPABASE_URL      — your Supabase project URL
 *   VITE_SUPABASE_ANON_KEY — your Supabase anon/public key
 * ─────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.\n" +
    "Add them to frontend/bus-admin/.env"
  );
}

/**
 * Supabase client singleton.
 * Used only for signInWithPassword and signOut.
 */
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,       // Keep user logged in on page refresh
    autoRefreshToken: true,     // Auto-renew JWT before expiry
    storageKey: "amcet-transit-auth", // Namespaced key in localStorage
  },
});

export default supabase;
