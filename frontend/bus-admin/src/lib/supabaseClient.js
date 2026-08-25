/**
 * src/lib/supabaseClient.js
 * ─────────────────────────────────────────────────────────────
 * Supabase client for the React admin dashboard.
 *
 * Used ONLY for authentication — the frontend never queries
 * bus data or any other table directly through this client.
 * All data comes from the Express backend API.
 *
 * Environment variables (set in Vercel Dashboard):
 *   VITE_SUPABASE_URL      — your Supabase project URL
 *   VITE_SUPABASE_ANON_KEY — your Supabase anon/public key
 * ─────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * If Supabase credentials are missing, we export a stub object
 * that surfaces a clear error instead of crashing the entire app
 * with an uncaught exception (which causes a blank white screen).
 */
let supabase;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.\n" +
    "Add them to Vercel Dashboard → Settings → Environment Variables,\n" +
    "then redeploy."
  );

  // Stub that prevents the app from crashing.
  // Any call to supabase.auth.signInWithPassword() will reject
  // with a descriptive error the user can see on the login page.
  supabase = {
    auth: {
      signInWithPassword: async () => ({
        data: null,
        error: { message: "Supabase is not configured. Contact the administrator." },
      }),
      signOut: async () => ({}),
      getUser: async () => ({ data: null, error: { message: "Not configured" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  };
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,       // Keep user logged in on page refresh
      autoRefreshToken: true,     // Auto-renew JWT before expiry
      storageKey: "amcet-transit-auth", // Namespaced key in localStorage
    },
  });
}

export default supabase;
