import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "./env";

let client: SupabaseClient | null = null;

/** Anonymous browser client. Viewers never sign in. */
export function getSupabase(): SupabaseClient | null {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return null;
  client ??= createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
