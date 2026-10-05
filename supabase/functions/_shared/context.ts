import type { MapboxClient } from "@wave/map-utils";
import { tooManyRequests, unauthorized } from "./errors.ts";
import type { WaveRepository } from "./repository.ts";

export interface FunctionConfig {
  /** Origin used to build share URLs, e.g. https://wave.app */
  readonly shareBaseUrl: string;
  /** Allowed CORS origins; "*" allows any. Native apps send no Origin. */
  readonly allowedOrigins: readonly string[];
}

export interface HandlerContext {
  readonly repo: WaveRepository;
  readonly mapbox: MapboxClient | null;
  readonly config: FunctionConfig;
  readonly now: () => number;
  readonly userId: string | null;
  readonly clientIp: string;
}

export type Handler<T> = (ctx: HandlerContext, body: unknown) => Promise<T>;

export function requireUser(ctx: HandlerContext): string {
  if (!ctx.userId) throw unauthorized();
  return ctx.userId;
}

export interface RateLimit {
  readonly scope: string;
  readonly capacity: number;
  /** Tokens refilled per second. */
  readonly refillPerSecond: number;
}

export const RATE_LIMITS = {
  plan: { scope: "plan", capacity: 30, refillPerSecond: 30 / 3600 },
  routeOptions: { scope: "route-options", capacity: 60, refillPerSecond: 1 },
  control: { scope: "control", capacity: 60, refillPerSecond: 1 },
  share: { scope: "share", capacity: 30, refillPerSecond: 30 / 3600 },
  resolve: { scope: "resolve", capacity: 60, refillPerSecond: 1 },
} as const satisfies Record<string, RateLimit>;

export async function enforceRateLimit(
  ctx: HandlerContext,
  limit: RateLimit,
  key: string,
): Promise<void> {
  const ok = await ctx.repo.consumeRateLimit(
    limit.scope,
    key,
    limit.capacity,
    limit.refillPerSecond,
  );
  if (!ok) throw tooManyRequests();
}
