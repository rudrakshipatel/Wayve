import type { SessionClock } from "./session.ts";

export const REALTIME_EVENTS = {
  session: "session",
  revoked: "revoked",
} as const;

/** Broadcast payload on `journey:<id>` and `share:<topic>` channels. Never contains coordinates. */
export interface SessionBroadcast {
  readonly clock: SessionClock;
  readonly serverTimeMs: number;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly scheduledStartAt: string | null;
}

export const ownerTopic = (journeyId: string): string => `journey:${journeyId}`;
export const shareTopic = (channelKey: string): string => `share:${channelKey}`;
