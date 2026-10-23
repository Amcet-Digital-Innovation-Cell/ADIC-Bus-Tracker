/**
 * services/admin.service.js
 * ─────────────────────────────────────────────────────────────
 * Admin Service: System Configurations
 * Queries the 'admin' schema in PostgreSQL/Supabase.
 * ─────────────────────────────────────────────────────────────
 */

const { db } = require("../config/supabase");

/**
 * Fetch all system configurations from admin.system_configs.
 *
 * @returns {Promise<Record<string, any>>}
 */
exports.getSystemConfigs = async () => {
  const { data, error } = await db.admin
    .from("system_configs")
    .select("key, value, description, updated_at");

  if (error) throw error;

  const configMap = {};
  (data || []).forEach((c) => {
    configMap[c.key] = c.value;
  });

  return configMap;
};

/**
 * Update or set a system configuration value.
 *
 * @param {string} key
 * @param {any} value
 * @param {string} [updatedBy]
 * @param {string} [description]
 * @returns {Promise<object>}
 */
exports.setSystemConfig = async (key, value, updatedBy = null, description = null) => {
  const payload = {
    key,
    value,
    updated_at: new Date().toISOString(),
  };

  if (updatedBy) payload.updated_by = updatedBy;
  if (description) payload.description = description;

  const { data, error } = await db.admin
    .from("system_configs")
    .upsert(payload, { onConflict: "key" })
    .select()
    .single();

  if (error) throw error;
  return data;
};
