/**
 * diagnose_supabase.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone Supabase Diagnostic Script (bus_tracking Schema)
 *
 * Verifies that the custom schema 'bus_tracking' is accessible via:
 * 1. Standard client (anon key) with { db: { schema: 'bus_tracking' } }
 * 2. Admin client (service role key) with { db: { schema: 'bus_tracking' } }
 * 3. Probes tables: buses, students, bus_routes, bus_stops, gps_telemetry
 * ─────────────────────────────────────────────────────────────────────────────
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
if (!process.env.SUPABASE_URL) {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
}

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_KEY ||
  ""
).trim();

const SCHEMA_NAME = "bus_tracking";

function maskKey(key) {
  if (!key) return "MISSING / NOT SET";
  if (key.length <= 16) return "****** (short/invalid key)";
  return `${key.slice(0, 10)}...${key.slice(-6)} (len: ${key.length})`;
}

async function runDiagnostics() {
  console.log("\n==================================================================");
  console.log("       🔍 SUPABASE 'bus_tracking' SCHEMA DIAGNOSTIC SUITE        ");
  console.log("==================================================================\n");

  console.log("📁 STEP 1: Environment Variables");
  console.log("─────────────────────────────────");
  console.log(`• Node Version:            ${process.version}`);
  console.log(`• Target Schema:           ${SCHEMA_NAME}`);
  console.log(`• SUPABASE_URL:            ${SUPABASE_URL || "❌ NOT SET"}`);
  console.log(`• SUPABASE_ANON_KEY:       ${maskKey(SUPABASE_ANON_KEY)}`);
  console.log(`• SUPABASE_SERVICE_ROLE:   ${maskKey(SUPABASE_SERVICE_ROLE_KEY)}`);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("\n❌ FATAL: SUPABASE_URL or SUPABASE_ANON_KEY missing in .env.");
    process.exit(1);
  }

  // 1. Initialize Clients with bus_tracking schema
  const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    db: { schema: SCHEMA_NAME },
  });

  const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
        db: { schema: SCHEMA_NAME },
      })
    : null;

  console.log("\n🧪 STEP 2: Testing Standard Anon Client ({ db: { schema: 'bus_tracking' } })");
  console.log("───────────────────────────────────────────────────────────────────────");
  try {
    const { data, error, status, statusText } = await supabaseAnon
      .from("buses")
      .select("*")
      .limit(1);

    console.log(`• Query: supabaseAnon.from('buses').select('*').limit(1)`);
    console.log(`• HTTP Status: ${status} (${statusText || "OK"})`);

    if (error) {
      console.error("❌ Anon Client Error:", error.message, error);
    } else {
      console.log(`✅ Anon Client Query SUCCESS! Rows returned: ${data?.length || 0}`);
    }
  } catch (err) {
    console.error("❌ Anon Client Exception:", err.message);
  }

  console.log("\n🛡️  STEP 3: Testing Admin Service Role Client ({ db: { schema: 'bus_tracking' } })");
  console.log("───────────────────────────────────────────────────────────────────────");
  if (!supabaseAdmin) {
    console.log("⚠️  SKIPPED: SUPABASE_SERVICE_ROLE_KEY is not configured.");
  } else {
    try {
      const { data, error, status, statusText } = await supabaseAdmin
        .from("buses")
        .select("*")
        .limit(1);

      console.log(`• Query: supabaseAdmin.from('buses').select('*').limit(1)`);
      console.log(`• HTTP Status: ${status} (${statusText || "OK"})`);

      if (error) {
        console.error("❌ Admin Client Error:", error.message, error);
      } else {
        console.log(`✅ Admin Client Query SUCCESS! Rows returned: ${data?.length || 0}`);
        if (data && data[0]) {
          console.log("• Sample Bus Record:", {
            id: data[0].id,
            bus_number: data[0].bus_number,
            registration_number: data[0].registration_number,
            route_name: data[0].route_name,
            status: data[0].status,
          });
        }
      }
    } catch (err) {
      console.error("❌ Admin Client Exception:", err.message);
    }
  }

  console.log("\n📊 STEP 4: Verifying Core Tables in 'bus_tracking' Schema");
  console.log("───────────────────────────────────────────────────────────────────────");
  const testClient = supabaseAdmin || supabaseAnon;
  const coreTables = ["buses", "students", "bus_routes", "bus_stops", "gps_telemetry"];

  for (const table of coreTables) {
    try {
      const { data, error, status } = await testClient.from(table).select("*").limit(1);
      if (error) {
        console.log(`  ❌ ${table.padEnd(16)} -> Status: ${status} | Error: ${error.message}`);
      } else {
        console.log(`  ✅ ${table.padEnd(16)} -> Status: ${status} | OK (sample rows: ${data?.length || 0})`);
      }
    } catch (err) {
      console.log(`  ❌ ${table.padEnd(16)} -> Exception: ${err.message}`);
    }
  }

  console.log("\n==================================================================");
  console.log("                    DIAGNOSTICS COMPLETE                          ");
  console.log("==================================================================\n");
}

runDiagnostics().catch((err) => {
  console.error("DIAGNOSTIC CRASH:", err);
  process.exit(1);
});
