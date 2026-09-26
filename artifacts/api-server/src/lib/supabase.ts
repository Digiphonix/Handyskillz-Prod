import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function requireSupabase() {
  const client = getSupabaseAdmin();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const hasPlaceholderKey = Boolean(serviceRoleKey && /your[_-]|replace[_-]me|example/i.test(serviceRoleKey));
  if (!client || hasPlaceholderKey) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and a real server-side SUPABASE_SERVICE_ROLE_KEY (or Supabase secret key) in artifacts/api-server/.env.",
    );
  }
  return client;
}
