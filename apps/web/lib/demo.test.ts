import { describe, expect, it } from "vitest";
import { buildTimeline, planFromStoredSegments, simElapsedAt } from "@wave/simulation-engine";
import { demoJourney } from "./demo";

describe("demoJourney", () => {
  it("builds a playable two-leg journey that starts mid-route", () => {
    const now = 1_800_000_000_000;
    const view = demoJourney(null, now);
    const timeline = buildTimeline(planFromStoredSegments(view.seed, view.segments));
    expect(timeline.segments).toHaveLength(2);
    expect(timeline.totalDistanceM).toBeGreaterThan(20_000);
    const elapsed = simElapsedAt(view.clock, now, timeline.totalDurationMs);
    expect(elapsed).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(timeline.totalDurationMs);
  });

  it("supports every preview state", () => {
    for (const state of ["paused", "scheduled", "completed"] as const) {
      expect(demoJourney(state, 0).clock.status).toBe(state);
    }
    expect(demoJourney("static", 0).kind).toBe("static");
  });
});
