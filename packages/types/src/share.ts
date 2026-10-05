import type { LngLat } from "./geo.ts";
import type { JourneyStatus } from "./journey.ts";
import type { SessionClock } from "./session.ts";
import type { TravelMode } from "./travel.ts";

/** Minimal, anonymous view of a shared journey. Contains no user or row identifiers. */
export interface PublicJourneyView {
  readonly title: string;
  readonly status: JourneyStatus;
  readonly seed: string;
  readonly segments: readonly PublicSegmentView[];
  readonly totalDistanceM: number;
  readonly totalDurationMs: number;
  readonly scheduledStartAt: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly clock: SessionClock;
  readonly realtimeTopic: string;
  readonly expiresAt: string;
  readonly serverTimeMs: number;
}

export interface PublicSegmentView {
  readonly fromName: string;
  readonly toName: string;
  readonly travelMode: TravelMode;
  readonly targetSpeedKmh: number | null;
  readonly durationS: number | null;
  readonly pauseAfterS: number;
  readonly coordinates: readonly LngLat[];
}

export interface ShareLinkInfo {
  readonly id: string;
  readonly tokenPrefix: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly viewCount: number;
  readonly createdAt: string;
}

export const DEFAULT_SHARE_TTL_HOURS = 24;
export const MAX_SHARE_TTL_HOURS = 24 * 30;
