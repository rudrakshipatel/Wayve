import type { JourneyStatus } from "./journey.ts";

/**
 * The authoritative simulation clock. Clients derive the simulated elapsed time as
 * `anchorSimMs + (nowServer - anchorWallMs) * rate` while the session is active
 * (or scheduled and past its start), and `anchorSimMs` otherwise.
 */
export interface SessionClock {
  readonly status: JourneyStatus;
  /** Server wall-clock time (ms since epoch) at which `anchorSimMs` was valid. */
  readonly anchorWallMs: number;
  /** Simulated elapsed milliseconds at `anchorWallMs`. */
  readonly anchorSimMs: number;
  /** Playback rate (1 = real time). */
  readonly rate: number;
  /** Monotonic counter; consumers drop events with a lower revision. */
  readonly revision: number;
}

export const SESSION_ACTIONS = [
  "start",
  "schedule",
  "pause",
  "resume",
  "stop",
  "restart",
  "set_rate",
  "seek",
  "complete",
] as const;
export type SessionActionType = (typeof SESSION_ACTIONS)[number];

export type SessionAction =
  | { readonly type: "start" }
  | { readonly type: "schedule"; readonly startAtMs: number }
  | { readonly type: "pause" }
  | { readonly type: "resume" }
  | { readonly type: "stop" }
  | { readonly type: "restart" }
  | { readonly type: "set_rate"; readonly rate: number }
  | { readonly type: "seek"; readonly simMs: number }
  | { readonly type: "complete" };

export const MIN_PLAYBACK_RATE = 0.25;
export const MAX_PLAYBACK_RATE = 10;
export const REPLAY_RATES = [1, 2, 5, 10] as const;
export type ReplayRate = (typeof REPLAY_RATES)[number];
