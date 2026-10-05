declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_SUPABASE_URL?: string;
    readonly EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    readonly EXPO_PUBLIC_MAPBOX_TOKEN?: string;
    readonly EXPO_PUBLIC_SHARE_BASE_URL?: string;
    readonly EXPO_PUBLIC_POSTHOG_KEY?: string;
    readonly EXPO_PUBLIC_POSTHOG_HOST?: string;
  }
}
declare const process: { env: NodeJS.ProcessEnv };
