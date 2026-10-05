import type { ApiErrorBody } from "@wave/types";
import { ApiError } from "./errors.ts";
import type { FunctionConfig, Handler, HandlerContext } from "./context.ts";

export interface ServeOptions<T> {
  readonly handler: Handler<T>;
  readonly methods: readonly ("GET" | "POST")[];
  /** Resolves the caller's user id from the Authorization header (null when absent/invalid). */
  readonly authenticate: (request: Request) => Promise<string | null>;
  readonly context: (request: Request, userId: string | null) => Omit<HandlerContext, "userId">;
  readonly config: FunctionConfig;
  readonly extraHeaders?: Readonly<Record<string, string>>;
  readonly log?: (message: string, error: unknown) => void;
}

const MAX_BODY_BYTES = 256 * 1024;

export function corsHeaders(request: Request, config: FunctionConfig): Record<string, string> {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (config.allowedOrigins.includes("*")) {
    headers["access-control-allow-origin"] = "*";
  } else if (origin && config.allowedOrigins.includes(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? request.headers.get("cf-connecting-ip") ?? "unknown";
}

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function readBody(request: Request): Promise<unknown> {
  if (request.method === "GET") {
    return Object.fromEntries(new URL(request.url).searchParams.entries());
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES)
    throw new ApiError(413, "payload_too_large", "Request body too large");
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be JSON");
  }
}

/** Wraps a handler with CORS, method checks, JSON parsing, auth and uniform error responses. */
export function createServer<T>(options: ServeOptions<T>): (request: Request) => Promise<Response> {
  return async (request) => {
    const cors = { ...corsHeaders(request, options.config), ...options.extraHeaders };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      if (!options.methods.includes(request.method as "GET" | "POST")) {
        throw new ApiError(405, "method_not_allowed", "Method not allowed");
      }
      const body = await readBody(request);
      const userId = await options.authenticate(request);
      const result = await options.handler({ ...options.context(request, userId), userId }, body);
      return json(200, result, cors);
    } catch (error) {
      if (error instanceof ApiError) {
        const body: ApiErrorBody = { error: { code: error.code, message: error.message } };
        return json(error.status, body, cors);
      }
      options.log?.("Unhandled error", error);
      const body: ApiErrorBody = { error: { code: "internal", message: "Something went wrong" } };
      return json(500, body, cors);
    }
  };
}
