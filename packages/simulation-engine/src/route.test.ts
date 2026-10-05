import { describe, expect, it } from "vitest";
import { haversineDistance } from "@wave/map-utils";
import { planFromRoute } from "./route.ts";
import { buildTimeline } from "./timeline.ts";
import { resolveProfile, DEFAULT_PROFILES } from "./profiles.ts";
import { createRandom, hashString } from "./random.ts";
import { AHMEDABAD, straightRoute } from "./test-fixtures.ts";

describe("planFromRoute", () => {
  const route = straightRoute(AHMEDABAD, 45, 6000, 100);
  it("splits at waypoints and spreads duration by length", () => {
    const wp1 = route[20]!;
    const wp2 = route[40]!;
    const plan = planFromRoute({
      seed: "r",
      route,
      travelMode: "cycling",
      durationS: 1200,
      waypoints: [{ coordinate: wp1, pauseS: 60 }, { coordinate: wp2 }],
    });
    expect(plan.segments).toHaveLength(3);
    expect(plan.segments[0]!.coordinates.at(-1)).toEqual(wp1);
    expect(plan.segments[1]!.coordinates[0]).toEqual(wp1);
    expect(plan.segments[0]!.pauseAfterS).toBe(60);
    const durations = plan.segments.map((s) => s.durationS ?? 0);
    expect(durations.reduce((a, b) => a + b, 0)).toBeCloseTo(1200, 6);

    const t = buildTimeline(plan);
    expect(t.waypoints).toHaveLength(2);
    expect(haversineDistance(t.end, route.at(-1)!)).toBeLessThan(0.01);
  });
  it("requires a real route", () => {
    expect(() => planFromRoute({ seed: "r", route: [AHMEDABAD], travelMode: "walking" })).toThrow();
  });
});

describe("profiles", () => {
  it("merges overrides and validates them", () => {
    expect(resolveProfile("driving")).toBe(DEFAULT_PROFILES.driving);
    expect(resolveProfile("driving", { accelerationMps2: 3 }).accelerationMps2).toBe(3);
    expect(() => resolveProfile("driving", { accelerationMps2: -1 })).toThrow();
    expect(() => resolveProfile("driving", { speedVariation: 1.5 })).toThrow();
  });
});

describe("random", () => {
  it("is deterministic and in range", () => {
    const a = createRandom("x");
    const b = createRandom("x");
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});
