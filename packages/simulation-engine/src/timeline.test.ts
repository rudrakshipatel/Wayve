import { describe, expect, it } from "vitest";
import { haversineDistance, kmhToMps } from "@wave/map-utils";
import { buildTimeline, DwellKind, type JourneyPlanInput } from "./timeline.ts";
import { sampleTimeline, sampleSeries } from "./sample.ts";
import { DEFAULT_PROFILES } from "./profiles.ts";
import { AHMEDABAD, lRoute, straightRoute } from "./test-fixtures.ts";

const drive = (
  lengthM: number,
  extra: Partial<JourneyPlanInput["segments"][number]> = {},
): JourneyPlanInput => ({
  seed: "seed-1",
  segments: [
    { coordinates: straightRoute(AHMEDABAD, 30, lengthM), travelMode: "driving", ...extra },
  ],
});

describe("buildTimeline", () => {
  it("is deterministic for a seed and varies across seeds", () => {
    const a = buildTimeline(drive(8000));
    const b = buildTimeline(drive(8000));
    const c = buildTimeline({ ...drive(8000), seed: "seed-2" });
    expect(Array.from(a.times)).toEqual(Array.from(b.times));
    expect(Array.from(a.speeds)).toEqual(Array.from(b.speeds));
    expect(a.totalDurationMs).not.toBe(c.totalDurationMs);
  });

  it("produces monotonic distance and time grids", () => {
    const t = buildTimeline(drive(12_000));
    for (let i = 1; i < t.distances.length; i++) {
      expect(t.distances[i]!).toBeGreaterThan(t.distances[i - 1]!);
      expect(t.times[i]!).toBeGreaterThan(t.times[i - 1]!);
    }
    expect(t.totalDistanceM).toBeCloseTo(12_000, 0);
  });

  it("starts and ends at rest and never adjoins two zero-speed points", () => {
    const t = buildTimeline({
      ...drive(10_000),
      segments: [{ ...drive(10_000).segments[0]!, travelMode: "bus" }],
    });
    expect(t.speeds[0]).toBe(0);
    expect(t.speeds[t.speeds.length - 1]).toBe(0);
    for (let i = 1; i < t.speeds.length; i++) {
      expect(t.speeds[i]! + t.speeds[i - 1]!).toBeGreaterThan(0);
    }
  });

  it("honours acceleration and deceleration limits", () => {
    const t = buildTimeline(drive(10_000));
    const { accelerationMps2: a, decelerationMps2: b } = DEFAULT_PROFILES.driving;
    for (let i = 0; i < t.speeds.length - 1; i++) {
      const ds = t.distances[i + 1]! - t.distances[i]!;
      const dv2 = t.speeds[i + 1]! ** 2 - t.speeds[i]! ** 2;
      expect(dv2).toBeLessThanOrEqual(2 * a * ds + 1e-6);
      expect(-dv2).toBeLessThanOrEqual(2 * b * ds + 1e-6);
    }
  });

  it("walks at roughly the requested pace without stops", () => {
    const t = buildTimeline({
      seed: "walk",
      segments: [
        {
          coordinates: straightRoute(AHMEDABAD, 0, 1000),
          travelMode: "walking",
          targetSpeedKmh: 5,
        },
      ],
    });
    const expectedMs = (1000 / kmhToMps(5)) * 1000;
    expect(t.totalDurationMs / expectedMs).toBeGreaterThan(0.9);
    expect(t.totalDurationMs / expectedMs).toBeLessThan(1.15);
    expect(Array.from(t.dwellKind).every((k) => k === DwellKind.none)).toBe(true);
  });

  it("solves a requested duration", () => {
    const t = buildTimeline(drive(6000, { durationS: 600 }));
    expect(t.totalDurationMs).toBeGreaterThan(599_000);
    expect(t.totalDurationMs).toBeLessThan(601_000);
    expect(t.segments[0]!.durationSatisfied).toBe(true);
    expect(t.segments[0]!.requestedDurationMs).toBe(600_000);
  });

  it("flags an unreachable duration and clamps to the profile bounds", () => {
    const t = buildTimeline({
      seed: "x",
      segments: [
        { coordinates: straightRoute(AHMEDABAD, 0, 10_000), travelMode: "walking", durationS: 60 },
      ],
    });
    expect(t.segments[0]!.durationSatisfied).toBe(false);
    expect(t.segments[0]!.cruiseSpeedMps).toBeCloseTo(
      kmhToMps(DEFAULT_PROFILES.walking.maxSpeedKmh),
      6,
    );
  });

  it("places frequent stops for buses", () => {
    const t = buildTimeline({
      seed: "bus",
      segments: [{ coordinates: straightRoute(AHMEDABAD, 90, 5000), travelMode: "bus" }],
    });
    const stops = Array.from(t.dwellKind).filter((k) => k === DwellKind.stop).length;
    expect(stops).toBeGreaterThanOrEqual(6);
    expect(stops).toBeLessThanOrEqual(14);
  });

  it("lets trains reach cruise speed on long straight track", () => {
    const t = buildTimeline({
      seed: "rail",
      segments: [
        {
          coordinates: straightRoute(AHMEDABAD, 0, 30_000, 500),
          travelMode: "train",
          targetSpeedKmh: 120,
        },
      ],
    });
    expect(Math.max(...t.speeds)).toBeGreaterThan(kmhToMps(120) * 0.95);
  });

  it("slows down for sharp turns", () => {
    const t = buildTimeline({
      seed: "turn",
      segments: [
        {
          coordinates: lRoute(AHMEDABAD, 2000),
          travelMode: "driving",
          targetSpeedKmh: 60,
          profile: { stops: null, speedVariation: 0 },
        },
      ],
    });
    const cornerIdx = t.distances.findIndex((d) => d >= 2000);
    const cornerSpeed = t.speeds[cornerIdx]!;
    expect(cornerSpeed).toBeLessThan(kmhToMps(35));
    expect(Math.max(...t.speeds)).toBeCloseTo(kmhToMps(60), 3);
  });

  it("joins segments and records waypoint pauses", () => {
    const leg1 = straightRoute(AHMEDABAD, 90, 3000);
    const mid = leg1[leg1.length - 1]!;
    const leg2 = straightRoute(mid, 0, 800);
    const t = buildTimeline({
      seed: "multi",
      segments: [
        { coordinates: leg1, travelMode: "driving", targetSpeedKmh: 45, pauseAfterS: 30 },
        { coordinates: leg2, travelMode: "walking", targetSpeedKmh: 5 },
      ],
    });
    expect(t.waypoints).toHaveLength(1);
    const wp = t.waypoints[0]!;
    expect(wp.departureMs - wp.arrivalMs).toBe(30_000);
    expect(haversineDistance(wp.point, mid)).toBeLessThan(0.01);
    expect(t.segments[1]!.departureMs).toBe(wp.departureMs);
    expect(t.segments[1]!.startDistanceM).toBeCloseTo(3000, 0);

    const during = sampleTimeline(t, wp.arrivalMs + 15_000);
    expect(during.status).toBe("waypoint_pause");
    expect(during.speed).toBe(0);
    expect(sampleTimeline(t, wp.arrivalMs - 5_000).travelMode).toBe("driving");
    expect(sampleTimeline(t, wp.departureMs + 60_000).travelMode).toBe("walking");
  });

  it("bridges a gap between segment geometries instead of jumping", () => {
    const leg1 = straightRoute(AHMEDABAD, 90, 1000);
    const end1 = leg1[leg1.length - 1]!;
    const leg2 = straightRoute([end1[0] + 0.0005, end1[1]], 0, 500);
    const t = buildTimeline({
      seed: "gap",
      segments: [
        { coordinates: leg1, travelMode: "walking" },
        { coordinates: leg2, travelMode: "walking" },
      ],
    });
    const series = sampleSeries(t, 250);
    for (let i = 1; i < series.length; i++) {
      const a = series[i - 1]!;
      const b = series[i]!;
      const moved = haversineDistance([a.longitude, a.latitude], [b.longitude, b.latitude]);
      expect(moved).toBeLessThan(2);
    }
  });

  it("validates input", () => {
    expect(() => buildTimeline({ seed: "x", segments: [] })).toThrow();
    expect(() =>
      buildTimeline({ seed: "x", segments: [{ coordinates: [], travelMode: "driving" }] }),
    ).toThrow();
    expect(() =>
      buildTimeline({ seed: "x", segments: [{ coordinates: [[0, 95]], travelMode: "driving" }] }),
    ).toThrow();
    expect(() => buildTimeline(drive(1000, { targetSpeedKmh: -5 }))).toThrow();
  });

  it("handles a zero-length journey", () => {
    const t = buildTimeline({
      seed: "x",
      segments: [{ coordinates: [AHMEDABAD], travelMode: "walking" }],
    });
    expect(t.totalDistanceM).toBe(0);
    expect(t.totalDurationMs).toBe(0);
    const s = sampleTimeline(t, 0);
    expect(s.latitude).toBeCloseTo(AHMEDABAD[1], 9);
  });
});
