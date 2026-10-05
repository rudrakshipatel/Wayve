import {
  effectiveStatus,
  etaMs,
  sampleTimeline,
  simElapsedAt,
  type SimulationSample,
  type Timeline,
} from "@wave/simulation-engine";
import type { JourneyStatus, SessionClock } from "@wave/types";

export interface LiveJourneyState {
  readonly sample: SimulationSample;
  /** Status implied by the clock right now (e.g. a passed schedule reads as active). */
  readonly status: JourneyStatus;
  /** Estimated arrival in local device time, or null when not progressing. */
  readonly etaLocalMs: number | null;
  readonly rate: number;
}

/**
 * Everything a journey screen shows, derived from the deterministic timeline and the
 * authoritative clock. Call it every animation frame.
 */
export function liveJourneyState(
  timeline: Timeline,
  clock: SessionClock,
  serverNowMs: number,
  localNowMs: number,
): LiveJourneyState {
  const total = timeline.totalDurationMs;
  const sample = sampleTimeline(timeline, simElapsedAt(clock, serverNowMs, total), localNowMs);
  const eta = etaMs(clock, serverNowMs, total);
  return {
    sample,
    status: effectiveStatus(clock, serverNowMs, total),
    etaLocalMs: eta === null ? null : eta - (serverNowMs - localNowMs),
    rate: clock.rate,
  };
}
