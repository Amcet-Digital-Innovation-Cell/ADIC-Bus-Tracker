/**
 * verify-auth.mjs
 * ─────────────────────────────────────────────────────────────────
 * Supabase Auth & Environment Diagnostic Script
 * Checks frontend & backend .env files, decodes JWT payloads, and
 * verifies that both frontend & backend point to the SAME project.
 * ─────────────────────────────────────────────────────────────────
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  }
  return result;
}

function decodeJwtPayload(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return { header, payload };
  } catch (e) {
    return { error: e.message };
  }
}

function extractProjectRef(url) {
  if (!url) return null;
  const match = url.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return match ? match[1] : null;
}

console.log('='.repeat(70));
console.log('🔍 SUPABASE AUTH & PROJECT ENVIRONMENT DIAGNOSTIC');
console.log('='.repeat(70));

// 1. Check Frontend .env
const frontendEnvPath = path.resolve(__dirname, '.env');
const frontendEnv = parseEnvFile(frontendEnvPath);

console.log('\n[1] FRONTEND CONFIGURATION:');
console.log(`    File: ${frontendEnvPath}`);
if (!frontendEnv) {
  console.log('    ❌ Frontend .env file not found!');
} else {
  const feUrl = frontendEnv.VITE_SUPABASE_URL;
  const feKey = frontendEnv.VITE_SUPABASE_ANON_KEY;
  const feRef = extractProjectRef(feUrl);
  const feJwt = decodeJwtPayload(feKey);

  console.log(`    VITE_SUPABASE_URL     : ${feUrl || 'MISSING'}`);
  console.log(`    Detected Project Ref  : ${feRef || 'UNKNOWN'}`);
  if (feJwt?.payload) {
    console.log(`    Anon Key Project Ref  : ${feJwt.payload.ref}`);
    console.log(`    Anon Key Role         : ${feJwt.payload.role}`);
  }
  console.log(`    VITE_API_URL          : ${frontendEnv.VITE_API_URL || 'DEFAULT'}`);
}

// 2. Check Backend .env (check standard locations)
const possibleBackendPaths = [
  path.resolve(__dirname, '../../backend/.env'),
  path.resolve(__dirname, '../backend/.env'),
  path.resolve(__dirname, '../../../backend/.env')
];

let backendEnv = null;
let backendEnvPath = null;
for (const p of possibleBackendPaths) {
  if (fs.existsSync(p)) {
    backendEnv = parseEnvFile(p);
    backendEnvPath = p;
    break;
  }
}

console.log('\n[2] BACKEND CONFIGURATION:');
if (!backendEnv) {
  console.log('    ⚠️ Backend .env not found in standard relative paths.');
  console.log('       Please check: ../../backend/.env or ../backend/.env');
} else {
  console.log(`    File: ${backendEnvPath}`);
  const beUrl = backendEnv.SUPABASE_URL || backendEnv.VITE_SUPABASE_URL;
  const beKey = backendEnv.SUPABASE_ANON_KEY || backendEnv.SUPABASE_SERVICE_ROLE_KEY;
  const beRef = extractProjectRef(beUrl);
  const beJwt = decodeJwtPayload(beKey);

  console.log(`    SUPABASE_URL          : ${beUrl || 'MISSING'}`);
  console.log(`    Detected Project Ref  : ${beRef || 'UNKNOWN'}`);
  if (beJwt?.payload) {
    console.log(`    Key Project Ref       : ${beJwt.payload.ref}`);
    console.log(`    Key Role              : ${beJwt.payload.role}`);
  }
}

// 3. Comparison & Root Cause Check
console.log('\n[3] ALIGNMENT VERIFICATION:');
if (frontendEnv && backendEnv) {
  const feRef = extractProjectRef(frontendEnv.VITE_SUPABASE_URL);
  const beRef = extractProjectRef(backendEnv.SUPABASE_URL || backendEnv.VITE_SUPABASE_URL);

  if (feRef && beRef && feRef !== beRef) {
    console.log('    ❌ MISMATCH DETECTED!');
    console.log(`       Frontend Project Ref : ${feRef}`);
    console.log(`       Backend Project Ref  : ${beRef}`);
    console.log('    ----------------------------------------------------------');
    console.log('    💥 ROOT CAUSE OF "unrecognized JWT kid for algorithm ES256":');
    console.log('       Frontend is issuing tokens signed by project ' + feRef);
    console.log('       Backend is validating tokens against project ' + beRef);
    console.log('       Because ES256 key IDs (kid) differ per project, the backend');
    console.log('       rejects the token with 401 Unauthorized.');
    console.log('    ----------------------------------------------------------');
  } else if (feRef && beRef && feRef === beRef) {
    console.log('    ✅ MATCH! Both frontend and backend point to project: ' + feRef);
  }
}

console.log('\n' + '='.repeat(70) + '\n');
