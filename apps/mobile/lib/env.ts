/** Public runtime configuration (EXPO_PUBLIC_* is inlined at build time). */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "",
  shareBaseUrl: process.env.EXPO_PUBLIC_SHARE_BASE_URL ?? "https://wave.app",
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "",
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
} as const;

export const isBackendConfigured = (): boolean => Boolean(env.supabaseUrl && env.supabaseAnonKey);
