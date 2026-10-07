import type { JourneyStatus } from "./journey.ts";
import type { SessionClock } from "./session.ts";
import type { TravelMode } from "./travel.ts";

/** Response bodies of the Wave edge functions. */

export interface ApiErrorBody {
  readonly error: { readonly code: string; readonly message: string };
}

export interface PlannedSegmentResult {
  readonly travelMode: TravelMode;
  /** Encoded polyline (precision 6) of the segment geometry. */
  readonly polyline: string;
  readonly distanceM: number;
  readonly durationMs: number;
  readonly durationSatisfied: boolean;
}

export interface PlanJourneyResult {
  readonly journeyId: string;
  readonly title: string;
  readonly seed: string;
  readonly engineVersion: string;
  readonly totalDistanceM: number;
  readonly totalDurationMs: number;
  readonly segments: readonly PlannedSegmentResult[];
}

export interface RouteOptionResult {
  readonly polyline: string;
  readonly distanceM: number;
  /** Simulated duration at the mode's default speed. */
  readonly estimatedDurationMs: number;
}

export interface RouteOptionsResult {
  readonly options: readonly RouteOptionResult[];
}

export interface JourneyControlResult {
  readonly clock: SessionClock;
  readonly status: JourneyStatus;
  readonly serverTimeMs: number;
}

export interface CreateShareLinkResult {
  readonly id: string;
  readonly url: string;
  readonly token: string;
  readonly expiresAt: string;
}

/** Routes of the single `wave-api` edge function (functions.invoke paths). */
export const EDGE_FUNCTIONS = {
  planJourney: "wave-api/plan-journey",
  routeOptions: "wave-api/route-options",
  journeyControl: "wave-api/journey-control",
  shareLink: "wave-api/share-link",
  resolveShare: "wave-api/resolve-share",
  deleteAccount: "wave-api/delete-account",
} as const;
