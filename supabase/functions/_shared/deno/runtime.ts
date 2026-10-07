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
  const allowedOrigins = (Deno.env.get("WAVE_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return {
    shareBaseUrl: Deno.env.get("WAVE_SHARE_BASE_URL") ?? "https://wave.app",
    // Unset means any origin: requests authenticate with bearer tokens, never cookies, so
    // CORS adds no protection beyond what token checks and rate limits already provide.
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : ["*"],
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

/** Deletes an auth user with the service role (cascades to all Wave data). */
export async function deleteAuthUser(userId: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(userId);
  if (error) throw error;
}

export interface ServeRouteOptions {
  readonly methods?: readonly ("GET" | "POST")[];
  readonly extraHeaders?: Record<string, string>;
}

/** Wraps a handler with auth, CORS, parsing and error handling for the Deno runtime. */
export function handlerServer<T>(
  handler: Handler<T>,
  options: ServeRouteOptions = {},
): (request: Request) => Promise<Response> {
  const cfg = config();
  const repo = createRepository(rpc);
  return createServer({
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
  });
}

/**
 * Serves several handlers from one function, routed by the last path segment:
 * /functions/v1/wave-api/<route>.
 */
export function serveRoutes(
  routes: Readonly<Record<string, (request: Request) => Promise<Response>>>,
): void {
  Deno.serve((request) => {
    const name = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
    const route = routes[name];
    if (route) return route(request);
    return new Response(
      JSON.stringify({ error: { code: "not_found", message: "Unknown endpoint" } }),
      {
        status: 404,
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
      },
    );
  });
}
