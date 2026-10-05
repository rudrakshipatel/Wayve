import type { LngLat, Place } from "./geo.ts";
import type { TravelMode } from "./travel.ts";

/** Persisted lifecycle status of a journey (server-authoritative). */
export const JOURNEY_STATUSES = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "completed",
  "cancelled",
] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

export const TERMINAL_JOURNEY_STATUSES: readonly JourneyStatus[] = ["completed", "cancelled"];

/** Instantaneous kinematic state reported by the simulation engine. */
export const SIMULATION_STATUSES = [
  "not_started",
  "moving",
  "stopped",
  "waypoint_pause",
  "completed",
] as const;
export type SimulationStatus = (typeof SIMULATION_STATUSES)[number];

export interface JourneySegment {
  readonly from: Place;
  readonly to: Place;
  readonly travelMode: TravelMode;
  /** Desired cruise speed. Mutually exclusive with `durationS`. */
  readonly targetSpeedKmh?: number;
  /** Desired segment duration (excluding the pause after it). */
  readonly durationS?: number;
  /** Dwell time at `to` before the next segment starts. Ignored on the final segment. */
  readonly pauseAfterS: number;
}

export interface RouteSegmentGeometry {
  readonly coordinates: readonly LngLat[];
  readonly distanceM: number;
}

export interface JourneySummary {
  readonly id: string;
  readonly title: string;
  readonly status: JourneyStatus;
  readonly travelModes: readonly TravelMode[];
  readonly totalDistanceM: number;
  readonly totalDurationMs: number;
  readonly scheduledStartAt: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly createdAt: string;
}
