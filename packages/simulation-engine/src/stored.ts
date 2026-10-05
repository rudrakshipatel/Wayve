import type { LngLat, TravelMode } from "@wave/types";
import type { JourneyPlanInput } from "./timeline.ts";

/** Segment fields as persisted (journey_segments + journey_routes) or exposed publicly. */
export interface StoredSegment {
  readonly coordinates: readonly LngLat[];
  readonly travelMode: TravelMode;
  readonly targetSpeedKmh: number | null;
  readonly durationS: number | null;
  readonly pauseAfterS: number;
}

/**
 * Rebuilds the exact plan the server compiled. Given the same seed, segments and engine
 * version, `buildTimeline` reproduces the server's timeline bit for bit.
 */
export function planFromStoredSegments(
  seed: string,
  segments: readonly StoredSegment[],
): JourneyPlanInput {
  return {
    seed,
    segments: segments.map((s) => ({
      coordinates: s.coordinates,
      travelMode: s.travelMode,
      pauseAfterS: s.pauseAfterS,
      ...(s.targetSpeedKmh !== null ? { targetSpeedKmh: s.targetSpeedKmh } : {}),
      ...(s.durationS !== null ? { durationS: s.durationS } : {}),
    })),
  };
}
