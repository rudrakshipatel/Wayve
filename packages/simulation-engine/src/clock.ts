import {
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  type JourneyStatus,
  type SessionAction,
  type SessionClock,
} from "@wave/types";

export const initialClock = (nowMs: number): SessionClock => ({
  status: "draft",
  anchorWallMs: nowMs,
  anchorSimMs: 0,
  rate: 1,
  revision: 0,
});

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Simulated elapsed ms at wall time `nowMs` (server-time domain). */
export function simElapsedAt(clock: SessionClock, nowMs: number, totalDurationMs: number): number {
  switch (clock.status) {
    case "active":
      return clamp(
        clock.anchorSimMs + (nowMs - clock.anchorWallMs) * clock.rate,
        0,
        totalDurationMs,
      );
    case "scheduled":
      return nowMs < clock.anchorWallMs
        ? clamp(clock.anchorSimMs, 0, totalDurationMs)
        : clamp(clock.anchorSimMs + (nowMs - clock.anchorWallMs) * clock.rate, 0, totalDurationMs);
    case "completed":
      return totalDurationMs;
    case "draft":
    case "paused":
    case "cancelled":
      return clamp(clock.anchorSimMs, 0, totalDurationMs);
  }
}

/**
 * Status implied by the clock at `nowMs`: a scheduled journey whose start has passed is
 * active, and an active journey past its end is completed — even if no server process
 * has persisted that transition yet.
 */
export function effectiveStatus(
  clock: SessionClock,
  nowMs: number,
  totalDurationMs: number,
): JourneyStatus {
  if (clock.status === "scheduled" && nowMs >= clock.anchorWallMs) {
    return simElapsedAt(clock, nowMs, totalDurationMs) >= totalDurationMs ? "completed" : "active";
  }
  if (clock.status === "active" && simElapsedAt(clock, nowMs, totalDurationMs) >= totalDurationMs) {
    return "completed";
  }
  return clock.status;
}

/** Wall time at which the journey ends, or null when it is not progressing. */
export function endsAtMs(clock: SessionClock, totalDurationMs: number): number | null {
  if (clock.status !== "active" && clock.status !== "scheduled") return null;
  return clock.anchorWallMs + Math.max(0, totalDurationMs - clock.anchorSimMs) / clock.rate;
}

/** Estimated arrival (server time) at `nowMs`, or null while paused / not running. */
export function etaMs(clock: SessionClock, nowMs: number, totalDurationMs: number): number | null {
  const status = effectiveStatus(clock, nowMs, totalDurationMs);
  if (status !== "active" && status !== "scheduled") return null;
  return endsAtMs(clock, totalDurationMs);
}

/** Persists implicit transitions (scheduled → active → completed) into the clock. */
export function settle(clock: SessionClock, nowMs: number, totalDurationMs: number): SessionClock {
  const status = effectiveStatus(clock, nowMs, totalDurationMs);
  if (status === clock.status) return clock;
  if (status === "completed") {
    return {
      ...clock,
      status,
      anchorSimMs: totalDurationMs,
      anchorWallMs: endsAtMs(clock, totalDurationMs) ?? nowMs,
      revision: clock.revision + 1,
    };
  }
  return { ...clock, status, revision: clock.revision + 1 };
}

export type TransitionError =
  | {
      readonly code: "invalid_transition";
      readonly from: JourneyStatus;
      readonly action: SessionAction["type"];
    }
  | { readonly code: "schedule_in_past" }
  | { readonly code: "invalid_rate" }
  | { readonly code: "invalid_seek" }
  | { readonly code: "not_finished" };

export type TransitionResult =
  | { readonly ok: true; readonly clock: SessionClock }
  | { readonly ok: false; readonly error: TransitionError };

const ALLOWED: Readonly<Record<SessionAction["type"], readonly JourneyStatus[]>> = {
  start: ["draft", "scheduled"],
  schedule: ["draft", "scheduled"],
  pause: ["active"],
  resume: ["paused"],
  stop: ["draft", "scheduled", "active", "paused"],
  restart: ["active", "paused"],
  set_rate: ["scheduled", "active", "paused"],
  seek: ["active", "paused"],
  complete: ["active"],
};

export function canTransition(status: JourneyStatus, action: SessionAction["type"]): boolean {
  return ALLOWED[action].includes(status);
}

/**
 * The journey session state machine. Pure: the server calls it with its own clock
 * (`nowMs`) and persists the result; clients use it for local replay and previews.
 */
export function transition(
  current: SessionClock,
  action: SessionAction,
  nowMs: number,
  totalDurationMs: number,
): TransitionResult {
  const clock = settle(current, nowMs, totalDurationMs);
  const fail = (error: TransitionError): TransitionResult => ({ ok: false, error });
  if (!canTransition(clock.status, action.type)) {
    return fail({ code: "invalid_transition", from: clock.status, action: action.type });
  }
  const elapsed = simElapsedAt(clock, nowMs, totalDurationMs);
  const next = (patch: Partial<SessionClock>): TransitionResult => ({
    ok: true,
    clock: settle({ ...clock, ...patch, revision: current.revision + 1 }, nowMs, totalDurationMs),
  });

  switch (action.type) {
    case "start":
      return next({ status: "active", anchorWallMs: nowMs, anchorSimMs: 0 });
    case "schedule":
      if (!(action.startAtMs > nowMs)) return fail({ code: "schedule_in_past" });
      return next({ status: "scheduled", anchorWallMs: action.startAtMs, anchorSimMs: 0 });
    case "pause":
      return next({ status: "paused", anchorWallMs: nowMs, anchorSimMs: elapsed });
    case "resume":
      return next({ status: "active", anchorWallMs: nowMs });
    case "stop":
      return next({ status: "cancelled", anchorWallMs: nowMs, anchorSimMs: elapsed });
    case "restart":
      return next({ anchorWallMs: nowMs, anchorSimMs: 0 });
    case "set_rate": {
      const { rate } = action;
      if (!Number.isFinite(rate) || rate < MIN_PLAYBACK_RATE || rate > MAX_PLAYBACK_RATE) {
        return fail({ code: "invalid_rate" });
      }
      if (clock.status === "scheduled") return next({ rate });
      return next({ rate, anchorWallMs: nowMs, anchorSimMs: elapsed });
    }
    case "seek":
      if (!Number.isFinite(action.simMs) || action.simMs < 0) return fail({ code: "invalid_seek" });
      return next({ anchorWallMs: nowMs, anchorSimMs: Math.min(action.simMs, totalDurationMs) });
    case "complete":
      if (elapsed < totalDurationMs) return fail({ code: "not_finished" });
      return next({ status: "completed", anchorSimMs: totalDurationMs, anchorWallMs: nowMs });
  }
}

/**
 * Tracks the offset between the device clock and server time from timestamps carried
 * in responses and broadcasts. Uses the minimum-latency observations, smoothed.
 */
export class ServerClockOffset {
  #offsetMs = 0;
  #initialized = false;
  readonly #smoothing: number;

  constructor(smoothing = 0.2) {
    this.#smoothing = smoothing;
  }

  /** @param roundTripMs request round-trip when known (halved as one-way latency). */
  observe(serverTimeMs: number, receivedAtLocalMs: number, roundTripMs = 0): void {
    const sample = serverTimeMs + roundTripMs / 2 - receivedAtLocalMs;
    if (!this.#initialized) {
      this.#offsetMs = sample;
      this.#initialized = true;
      return;
    }
    this.#offsetMs += (sample - this.#offsetMs) * this.#smoothing;
  }

  get offsetMs(): number {
    return this.#offsetMs;
  }

  serverNow(localNowMs: number): number {
    return localNowMs + this.#offsetMs;
  }
}
