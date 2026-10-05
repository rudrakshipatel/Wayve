import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline.ts";
import { SimulatedLocationProvider, type LocationProviderState, type Ticker } from "./provider.ts";
import { AHMEDABAD, straightRoute } from "./test-fixtures.ts";

function harness() {
  let now = 1_000_000;
  let tick: (() => void) | null = null;
  const ticker: Ticker = (cb) => {
    tick = cb;
    return () => {
      tick = null;
    };
  };
  const states: LocationProviderState[] = [];
  const timeline = buildTimeline({
    seed: "p",
    segments: [{ coordinates: straightRoute(AHMEDABAD, 0, 500), travelMode: "walking" }],
  });
  const provider = new SimulatedLocationProvider({
    timeline,
    now: () => now,
    ticker,
    onStateChange: (s) => states.push(s),
  });
  return {
    provider,
    timeline,
    states,
    advance(ms: number) {
      now += ms;
      tick?.();
    },
    get ticking() {
      return tick !== null;
    },
  };
}

describe("SimulatedLocationProvider", () => {
  it("implements the LocationProvider lifecycle", async () => {
    const h = harness();
    expect(h.provider.getStatus().state).toBe("idle");
    await h.provider.start();
    expect(h.ticking).toBe(true);
    h.advance(60_000);
    const moving = h.provider.getStatus();
    expect(moving.state).toBe("running");
    expect(moving.sample?.distanceTravelled).toBeGreaterThan(0);

    await h.provider.pause();
    expect(h.ticking).toBe(false);
    const pausedAt = h.provider.getStatus().sample?.distanceTravelled;
    h.advance(60_000);
    expect(h.provider.sampleNow().distanceTravelled).toBe(pausedAt);

    await h.provider.resume();
    h.advance(h.timeline.totalDurationMs);
    expect(h.provider.getStatus().state).toBe("completed");
    expect(h.ticking).toBe(false);
    expect(h.states).toEqual(["running", "paused", "running", "completed"]);
  });

  it("follows an authoritative clock and ignores stale revisions", async () => {
    const h = harness();
    await h.provider.start();
    const current = h.provider.clock;
    h.provider.applyClock({
      ...current,
      status: "paused",
      anchorSimMs: 10_000,
      revision: current.revision + 5,
    });
    expect(h.provider.getStatus().state).toBe("paused");
    h.provider.applyClock({ ...current, status: "active", revision: current.revision });
    expect(h.provider.getStatus().state).toBe("paused");
  });

  it("rejects invalid commands", async () => {
    const h = harness();
    await expect(h.provider.pause()).rejects.toThrow(/invalid_transition/);
  });
});
