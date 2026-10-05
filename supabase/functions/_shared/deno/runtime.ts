// Deno-only wiring for edge functions: environment, Supabase admin client, auth, Mapbox.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createMapboxClient, type MapboxClient } from "@wave/map-utils";
import { RpcError } from "../errors.ts";
import type { FunctionConfig, Handler } from "../context.ts";
import { clientIp, createServer } from "../http.ts";
import { createRepository, type RpcCaller } from "../repository.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

let admin: SupabaseClient | null = null;
function adminClient(): SupabaseClient {
  admin ??= createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

const rpc: RpcCaller = async (fn, args) => {
  const result: { data: unknown; error: { code: string; message: string } | null } =
    await adminClient().rpc(fn, args);
  if (result.error) throw new RpcError(result.error.code, result.error.message);
  return result.data;
};

async function authenticate(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) return null;
  const { data, error } = await adminClient().auth.getUser(match[1]);
  if (error) return null;
  return data.user.id;
}

function config(): FunctionConfig {
  return {
    shareBaseUrl: Deno.env.get("WAVE_SHARE_BASE_URL") ?? "https://wave.app",
    allowedOrigins: (Deno.env.get("WAVE_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  };
}

let mapbox: MapboxClient | null | undefined;
function mapboxClient(): MapboxClient | null {
  if (mapbox === undefined) {
    const token = Deno.env.get("MAPBOX_SECRET_TOKEN");
    mapbox = token ? createMapboxClient({ accessToken: token }) : null;
  }
  return mapbox;
}

export function serve<T>(
  handler: Handler<T>,
  options: {
    readonly methods?: readonly ("GET" | "POST")[];
    readonly extraHeaders?: Record<string, string>;
  } = {},
): void {
  const cfg = config();
  const repo = createRepository(rpc);
  Deno.serve(
    createServer({
      handler,
      methods: options.methods ?? ["POST"],
      authenticate,
      config: cfg,
      ...(options.extraHeaders ? { extraHeaders: options.extraHeaders } : {}),
      context: (request) => ({
        repo,
        mapbox: mapboxClient(),
        config: cfg,
        now: () => Date.now(),
        clientIp: clientIp(request),
      }),
      log: (message, error) => {
        console.error(message, error instanceof Error ? (error.stack ?? error.message) : error);
      },
    }),
  );
}
