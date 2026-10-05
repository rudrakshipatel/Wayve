import { encodePolyline } from "@wave/map-utils";
import { buildTimeline } from "@wave/simulation-engine";
import { routeOptionsInputSchema, type RouteOptionsResult } from "@wave/types";
import { fromZod } from "../errors.ts";
import { enforceRateLimit, RATE_LIMITS, requireUser, type Handler } from "../context.ts";
import { routeOptions as fetchRouteOptions } from "../routing.ts";

/** Route alternatives for the "Select route" step, with simulated durations. */
export const routeOptions: Handler<RouteOptionsResult> = async (ctx, body) => {
  const userId = requireUser(ctx);
  const parsed = routeOptionsInputSchema.safeParse(body);
  if (!parsed.success) throw fromZod(parsed.error);
  await enforceRateLimit(ctx, RATE_LIMITS.routeOptions, userId);
  const { from, to, travelMode } = parsed.data;

  const options = await fetchRouteOptions(ctx.mapbox, from, to, travelMode);
  return {
    options: options.map((option) => {
      const timeline = buildTimeline({
        seed: "preview",
        segments: [{ coordinates: option.coordinates, travelMode }],
      });
      return {
        polyline: encodePolyline(option.coordinates),
        distanceM: timeline.totalDistanceM,
        estimatedDurationMs: timeline.totalDurationMs,
      };
    }),
  };
};
