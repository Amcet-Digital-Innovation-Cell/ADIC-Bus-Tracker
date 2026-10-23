/**
 * config/supabase.js
 * ─────────────────────────────────────────────────────────────
 * Supabase Client & Database Configuration (bus_tracking Schema)
 *
 * Exports:
 *   1. supabase      — anon client targeting 'bus_tracking' schema
 *   2. adminSupabase — service-role client targeting 'bus_tracking' schema
 *   3. db            — query builders (default 'bus_tracking' schema):
 *                      • db.from(table)
 *                      • db.transport.from(table)
 *                      • db.students.from(table)
 *                      • db.admin.from(table)
 *                      • db.busTracking.from(table)
 *                      • db.public.from(table)
 *   4. getSchemaClient() — backward-compatible client resolver
 *   5. resolveSchema()   — returns "bus_tracking"
 * ─────────────────────────────────────────────────────────────
 */

const { createClient } = require("@supabase/supabase-js");
const config = require("./env");

const SCHEMA_NAME = "bus_tracking";

/**
 * Standard Supabase Client Options
 * Points strictly to the custom 'bus_tracking' schema.
 */
const defaultClientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  db: {
    schema: SCHEMA_NAME,
  },
};

/**
 * Public (anon) Supabase client configured for 'bus_tracking' schema.
 * Used for SELECT queries and JWT validation against the bus_tracking schema.
 */
const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey,
  defaultClientOptions
);

/**
 * Admin Supabase client (service-role) configured for 'bus_tracking' schema.
 * Bypasses RLS for GPS coordinate writes and admin operations in the bus_tracking schema.
 */
const adminSupabase = config.supabase.serviceRoleKey
  ? createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      defaultClientOptions
    )
  : null;

if (!adminSupabase) {
  console.warn(
    "⚠️  SUPABASE_SERVICE_ROLE_KEY is not set. Database writes may fail if RLS is enabled."
  );
}

/**
 * Resolves the client (preferring service-role admin client when available).
 *
 * @param {boolean} [preferAdmin=true]
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
const getClient = (preferAdmin = true) => {
  return preferAdmin && adminSupabase ? adminSupabase : supabase;
};

/**
 * Backward-compatible schema client resolver.
 * Communicates strictly with the configured 'bus_tracking' schema.
 */
const getSchemaClient = (schemaName = SCHEMA_NAME, preferAdmin = true) => {
  return getClient(preferAdmin);
};

const resolveSchema = () => SCHEMA_NAME;

/**
 * Helper to build clean query accessor objects targeting 'bus_tracking' schema
 */
const createAccessor = () => ({
  from: (table) => getClient(true).from(table),
  read: {
    from: (table) => getClient(false).from(table),
  },
  write: {
    from: (table) => getClient(true).from(table),
  },
  get schema() {
    return getClient(true);
  },
});

const defaultAccessor = createAccessor();

/**
 * Standard Database Accessors
 * All queries target the 'bus_tracking' schema cleanly:
 *   await db.from('buses').select('*');
 *   await db.transport.from('buses').select('*');
 *   await db.students.from('students').select('*');
 *   await db.admin.from('system_configs').select('*');
 */
const db = {
  // Global default from() targeting bus_tracking schema
  from: (table) => getClient(true).from(table),
  schema: (name = SCHEMA_NAME) => getClient(true).schema(name),

  // Accessors preserved for modular architecture
  transport: defaultAccessor,
  students: defaultAccessor,
  admin: defaultAccessor,
  busTracking: defaultAccessor,
  public: defaultAccessor,
};

module.exports = {
  supabase,
  adminSupabase,
  db,
  getSchemaClient,
  resolveSchema,
};