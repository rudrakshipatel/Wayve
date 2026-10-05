import type { SessionAction, SessionClock } from "@wave/types";
import { initialClock, simElapsedAt, effectiveStatus, transition } from "./clock.ts";
import { sampleTimeline, type SimulationSample } from "./sample.ts";
import type { Timeline } from "./timeline.ts";

export type LocationProviderState =
  "idle" | "scheduled" | "running" | "paused" | "stopped" | "completed";

export interface LocationStatus {
  readonly state: LocationProviderState;
  readonly sample: SimulationSample | null;
}

/**
 * Source of positions for Wave. Platform-specific providers (if ever added) live in
 * their own packages behind this interface and must rely on documented public APIs.
 */
export interface LocationProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  getStatus(): LocationStatus;
}

/** Schedules a repeating callback; returns a cancel function. */
export type Ticker = (callback: () => void, intervalMs: number) => () => void;

interface TimerGlobals {
  setInterval(cb: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const intervalTicker: Ticker = (callback, intervalMs) => {
  const g = globalThis as unknown as TimerGlobals;
  const handle = g.setInterval(callback, intervalMs);
  return () => {
    g.clearInterval(handle);
  };
};

export interface SimulatedLocationProviderOptions {
  readonly timeline: Timeline;
  /** Time source in the server-time domain (apply a ServerClockOffset when following a server clock). */
  readonly now?: () => number;
  readonly ticker?: Ticker;
  readonly tickMs?: number;
  readonly onSample?: (sample: SimulationSample) => void;
  readonly onStateChange?: (state: LocationProviderState) => void;
}

/**
 * Plays a compiled timeline. Either drives its own clock (preview, replay) or follows an
 * authoritative clock received from the server via `applyClock`.
 */
export class SimulatedLocationProvider implements LocationProvider {
  readonly #timeline: Timeline;
  readonly #now: () => number;
  readonly #ticker: Ticker;
  readonly #tickMs: number;
  readonly #onSample: ((s: SimulationSample) => void) | undefined;
  readonly #onStateChange: ((s: LocationProviderState) => void) | undefined;
  #clock: SessionClock;
  #cancelTick: (() => void) | null = null;
  #lastSample: SimulationSample | null = null;
  #lastState: LocationProviderState = "idle";

  constructor(options: SimulatedLocationProviderOptions) {
    this.#timeline = options.timeline;
    this.#now = options.now ?? (() => Date.now());
    this.#ticker = options.ticker ?? intervalTicker;
    this.#tickMs = options.tickMs ?? 1000;
    this.#onSample = options.onSample;
    this.#onStateChange = options.onStateChange;
    this.#clock = initialClock(this.#now());
  }

  get clock(): SessionClock {
    return this.#clock;
  }

  start(): Promise<void> {
    return this.#run({ type: "start" });
  }

  stop(): Promise<void> {
    return this.#run({ type: "stop" });
  }

  pause(): Promise<void> {
    return this.#run({ type: "pause" });
  }

  resume(): Promise<void> {
    return this.#run({ type: "resume" });
  }

  setRate(rate: number): void {
    this.#dispatch({ type: "set_rate", rate });
  }

  seek(simMs: number): void {
    this.#dispatch({ type: "seek", simMs });
  }

  restart(): void {
    this.#dispatch({ type: "restart" });
  }

  /** Follow an authoritative clock (e.g. from a realtime broadcast). Stale revisions are ignored. */
  applyClock(clock: SessionClock): void {
    if (clock.revision < this.#clock.revision) return;
    this.#clock = clock;
    this.#sync();
  }

  getStatus(): LocationStatus {
    return { state: this.#state(), sample: this.#lastSample };
  }

  /** Sample at the current time without waiting for a tick (e.g. per animation frame). */
  sampleNow(): SimulationSample {
    const now = this.#now();
    const sample = sampleTimeline(
      this.#timeline,
      simElapsedAt(this.#clock, now, this.#timeline.totalDurationMs),
      now,
    );
    this.#lastSample = sample;
    return sample;
  }

  dispose(): void {
    this.#stopTicking();
  }

  #run(action: SessionAction): Promise<void> {
    try {
      this.#dispatch(action);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  #dispatch(action: SessionAction): void {
    const result = transition(this.#clock, action, this.#now(), this.#timeline.totalDurationMs);
    if (!result.ok) {
      throw new Error(`Cannot ${action.type}: ${result.error.code}`);
    }
    this.#clock = result.clock;
    this.#sync();
  }

  #state(): LocationProviderState {
    switch (effectiveStatus(this.#clock, this.#now(), this.#timeline.totalDurationMs)) {
      case "draft":
        return "idle";
      case "scheduled":
        return "scheduled";
      case "active":
        return "running";
      case "paused":
        return "paused";
      case "cancelled":
        return "stopped";
      case "completed":
        return "completed";
    }
  }

  #sync(): void {
    const state = this.#state();
    if (state === "running" || state === "scheduled") {
      this.#cancelTick ??= this.#ticker(() => {
        this.#tick();
      }, this.#tickMs);
    } else {
      this.#stopTicking();
    }
    this.#emit();
    this.#notifyState(state);
  }

  #tick(): void {
    this.#emit();
    const state = this.#state();
    this.#notifyState(state);
    if (state === "completed") this.#stopTicking();
  }

  #emit(): void {
    const sample = this.sampleNow();
    this.#onSample?.(sample);
  }

  #notifyState(state: LocationProviderState): void {
    if (state !== this.#lastState) {
      this.#lastState = state;
      this.#onStateChange?.(state);
    }
  }

  #stopTicking(): void {
    this.#cancelTick?.();
    this.#cancelTick = null;
  }
}
