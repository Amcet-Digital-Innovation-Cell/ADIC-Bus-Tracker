/**
 * test-skynav.js
 * ─────────────────────────────────────────────────────────────
 * Standalone SkyNav API diagnostic script.
 * Run this directly to test SkyNav connectivity without
 * starting the full server.
 *
 * Usage:
 *   node test-skynav.js
 *
 * Reads credentials from backend/.env automatically.
 * ─────────────────────────────────────────────────────────────
 */

"use strict";

const path  = require("path");
const fetch = require("node-fetch");

// Load .env from backend directory first, then project root as fallback
// (mirrors how config/env.js works in the main server)
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });


// ── Read credentials from env ─────────────────────────────────────────────────
const BEARER_TOKEN  = process.env.SKYNAV_BEARER_TOKEN;
const USERNAME      = process.env.SKYNAV_USERNAME;
const PASSWORD      = process.env.SKYNAV_PASSWORD;
const PROJECT_ID    = process.env.SKYNAV_PROJECT_ID;
const COMPANY_NAME  = process.env.SKYNAV_COMPANY_NAME;
const IMEI          = process.env.SKYNAV_IMEI || "";
const API_URL       = (process.env.SKYNAV_API_URL || "https://api.skynavgps.com/v2").replace(/\/$/, "");

// ── Print what we're about to use (masked for safety) ────────────────────────
console.log("\n══════════════════════════════════════════════════");
console.log("  SkyNav API Diagnostic Test");
console.log("══════════════════════════════════════════════════");
console.log(`  API URL      : ${API_URL}`);
console.log(`  Username     : ${USERNAME || "❌ NOT SET"}`);
console.log(`  Password     : ${PASSWORD ? "****** (set)" : "❌ NOT SET"}`);
console.log(`  Bearer Token : ${BEARER_TOKEN ? BEARER_TOKEN.slice(0, 12) + "..." : "❌ NOT SET"}`);
console.log(`  Project ID   : ${PROJECT_ID || "❌ NOT SET"}`);
console.log(`  Company Name : ${COMPANY_NAME || "❌ NOT SET"}`);
console.log(`  IMEI         : ${IMEI || "❌ NOT SET (required)"}`);
console.log("══════════════════════════════════════════════════\n");

// ── Validate minimum required fields ────────────────────────────────────────
const missing = [];
if (!BEARER_TOKEN)  missing.push("SKYNAV_BEARER_TOKEN");
if (!USERNAME)      missing.push("SKYNAV_USERNAME");
if (!PASSWORD)      missing.push("SKYNAV_PASSWORD");
if (!PROJECT_ID)    missing.push("SKYNAV_PROJECT_ID");
if (!COMPANY_NAME)  missing.push("SKYNAV_COMPANY_NAME");
if (!IMEI)          missing.push("SKYNAV_IMEI");

if (missing.length > 0) {
  console.error("❌ Missing required env vars:");
  missing.forEach(k => console.error(`   • ${k}`));
  console.error("\n   Add them to backend/.env and retry.\n");
  process.exit(1);
}

// ── Build the request ─────────────────────────────────────────────────────────
const url = `${API_URL}/devices/?imei=${encodeURIComponent(IMEI)}`;

const formData = new URLSearchParams();
formData.append("username",    USERNAME);
formData.append("password",    PASSWORD);
formData.append("projectId",   PROJECT_ID);    // capital I as per SkyNav docs
formData.append("companyName", COMPANY_NAME);

console.log(`📡 Calling: POST ${url}`);
console.log(`   Body: username=${USERNAME} | projectId=${PROJECT_ID} | companyName=${COMPANY_NAME}\n`);

// ── Make the request ──────────────────────────────────────────────────────────
(async () => {
  try {
    const response = await fetch(url, {
      method:  "POST",
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
      },
      body: formData,
    });

    const text = await response.text();
    console.log(`HTTP Status : ${response.status} ${response.statusText}`);
    console.log(`Response    :\n`);

    let parsed;
    try {
      parsed = JSON.parse(text);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log(text);
      process.exit(1);
    }

    // ── Diagnose the response ────────────────────────────────────────────────
    console.log("\n══════════════════════════════════════════════════");
    console.log("  Diagnosis");
    console.log("══════════════════════════════════════════════════");

    if (parsed && parsed.result === 0) {
      console.log(`❌ SkyNav returned error: "${parsed.message}"`);
      console.log(`\n   Likely causes:`);
      console.log(`   1. IMEI "${IMEI}" is not registered in projectId=${PROJECT_ID}`);
      console.log(`   2. Bearer token is expired or wrong`);
      console.log(`   3. companyName "${COMPANY_NAME}" doesn't match the SkyNav account`);
      console.log(`   4. This IMEI belongs to a different project`);
    } else if (parsed && parsed.root && parsed.root.VehicleData) {
      const count = parsed.root.VehicleData.length;
      console.log(`✅ SUCCESS! Got ${count} vehicle(s)`);
      if (count > 0) {
        const v = parsed.root.VehicleData[0];
        console.log(`\n   First vehicle:`);
        console.log(`     Vehicle_Name : ${v.Vehicle_Name}`);
        console.log(`     Vehicle_No   : ${v.Vehicle_No}`);
        console.log(`     Imeino       : ${v.Imeino}`);
        console.log(`     Latitude     : ${v.Latitude}`);
        console.log(`     Longitude    : ${v.Longitude}`);
        console.log(`     Speed        : ${v.Speed}`);
        console.log(`     Status       : ${v.Status}`);
        console.log(`     IGN          : ${v.IGN}`);
        console.log(`     Location     : ${v.Location}`);
      }
    } else {
      console.log(`⚠️  Unexpected response shape. Keys: [${Object.keys(parsed || {}).join(", ")}]`);
    }

    console.log("\n══════════════════════════════════════════════════\n");

  } catch (err) {
    console.error(`\n❌ Request failed: ${err.message}\n`);
    process.exit(1);
  }
})();
