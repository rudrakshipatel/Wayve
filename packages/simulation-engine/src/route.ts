import { haversineDistance } from "@wave/map-utils";
import type { LngLat, TravelMode } from "@wave/types";
import type { MovementProfileOverrides } from "./profiles.ts";
import type { JourneyPlanInput, SegmentPlanInput } from "./timeline.ts";

export interface RouteWaypoint {
  readonly coordinate: LngLat;
  readonly pauseS?: number;
}

export interface SingleRoutePlanInput {
  readonly seed: string;
  readonly route: readonly LngLat[];
  readonly travelMode: TravelMode;
  readonly targetSpeedKmh?: number;
  /** Total travel time across all legs (excluding waypoint pauses). */
  readonly durationS?: number;
  readonly waypoints?: readonly RouteWaypoint[];
  readonly profile?: MovementProfileOverrides;
}

/**
 * Builds a plan from one route and intermediate waypoints by splitting the route at the
 * vertex nearest to each waypoint (searching forward, so waypoints keep their order).
 * A requested duration is distributed across legs proportionally to their length.
 */
export function planFromRoute(input: SingleRoutePlanInput): JourneyPlanInput {
  const { route, waypoints = [] } = input;
  if (route.length < 2) throw new RangeError("A route needs at least two coordinates");

  const cuts: number[] = [];
  let from = 0;
  for (const wp of waypoints) {
    let best = from;
    let bestDist = Infinity;
    for (let i = from; i < route.length; i++) {
      const d = haversineDistance(route[i]!, wp.coordinate);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    cuts.push(best);
    from = best;
  }

  const legs: LngLat[][] = [];
  let startIdx = 0;
  for (const cut of cuts) {
    legs.push(route.slice(startIdx, cut + 1));
    startIdx = cut;
  }
  legs.push(route.slice(startIdx));

  const lengths = legs.map(legLength);
  const totalLength = lengths.reduce((a, b) => a + b, 0);

  const segments: SegmentPlanInput[] = legs.map((coordinates, i) => {
    const share = totalLength > 0 ? (lengths[i] ?? 0) / totalLength : 1 / legs.length;
    const seg: SegmentPlanInput = {
      coordinates,
      travelMode: input.travelMode,
      pauseAfterS: waypoints[i]?.pauseS ?? 0,
      ...(input.targetSpeedKmh !== undefined ? { targetSpeedKmh: input.targetSpeedKmh } : {}),
      ...(input.durationS !== undefined ? { durationS: Math.max(1, input.durationS * share) } : {}),
      ...(input.profile ? { profile: input.profile } : {}),
    };
    return seg;
  });
  return { seed: input.seed, segments };
}

function legLength(coords: readonly LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversineDistance(coords[i - 1]!, coords[i]!);
  return total;
}
