const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '../../frontend/bus-admin/src/lib/supabaseClient.js');

if (!fs.existsSync(target)) {
  console.error('Target file does not exist:', target);
  process.exit(1);
}

let content = fs.readFileSync(target, 'utf8');

// Ensure db: { schema: "bus_tracking" } is present in createClient options
if (content.includes('schema: "bus_tracking"') || content.includes("schema: 'bus_tracking'")) {
  console.log('Frontend supabaseClient.js already has bus_tracking schema configured.');
} else {
  // Replace auth options block with auth + db.schema options
  content = content.replace(
    /supabase = createClient\(supabaseUrl,\s*supabaseAnonKey,\s*\{([\s\S]*?)\}\);/,
    (match, inner) => {
      // Add db: { schema: 'bus_tracking' } before closing brace
      return `supabase = createClient(supabaseUrl, supabaseAnonKey, {\n    auth: {\n      persistSession: true,       // Keep user logged in on page refresh\n      autoRefreshToken: true,     // Auto-renew JWT before expiry\n      storageKey: "amcet-transit-auth", // Namespaced key in localStorage\n    },\n    db: {\n      schema: "bus_tracking",     // Target custom bus_tracking schema\n    },\n  });`;
    }
  );

  fs.writeFileSync(target, content, 'utf8');
  console.log('Successfully updated web/frontend/bus-admin/src/lib/supabaseClient.js with bus_tracking schema!');
}
