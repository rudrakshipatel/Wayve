import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { createWaveApi, type WaveApi } from "@wave/client";
import { env, isBackendConfigured } from "./env";
import { createLocalApi } from "./local-api";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isBackendConfigured()) {
    throw new Error(
      "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: Platform.OS === "web",
      },
    });
    // Refresh tokens only while the app is in the foreground.
    const supabase = client;
    AppState.addEventListener("change", (state) => {
      if (state === "active") void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    });
  }
  return client;
}

let api: WaveApi | null = null;
/** The Wave API, or an on-device preview backend when Supabase is not configured. */
export function getApi(): WaveApi {
  api ??= isBackendConfigured() ? createWaveApi(getSupabase()) : createLocalApi();
  return api;
}
