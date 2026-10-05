import { describe, expect, it } from "vitest";
import { haversineDistance } from "@wave/map-utils";
import { buildTimeline } from "./timeline.ts";
import { sampleSeries, sampleTimeline } from "./sample.ts";
import { DEFAULT_PROFILES } from "./profiles.ts";
import { AHMEDABAD, lRoute, straightRoute } from "./test-fixtures.ts";

const timeline = buildTimeline({
  seed: "sample",
  segments: [{ coordinates: lRoute(AHMEDABAD, 4000), travelMode: "driving", targetSpeedKmh: 50 }],
});

describe("sampleTimeline", () => {
  it("reports start and end states", () => {
    const start = sampleTimeline(timeline, 0, 1000);
    expect(start.status).toBe("not_started");
    expect(start.timestamp).toBe(1000);
    expect(start.progress).toBe(0);
    expect(start.latitude).toBeCloseTo(AHMEDABAD[1], 9);
    expect(start.distanceRemaining).toBeCloseTo(timeline.totalDistanceM, 6);

    const end = sampleTimeline(timeline, timeline.totalDurationMs + 10_000);
    expect(end.status).toBe("completed");
    expect(end.progress).toBe(1);
    expect(end.speed).toBe(0);
    expect(end.distanceRemaining).toBe(0);
    expect(end.timeRemainingMs).toBe(0);
    expect(haversineDistance([end.longitude, end.latitude], timeline.end)).toBeLessThan(0.01);
  });

  it("never teleports: displacement is bounded by speed", () => {
    const dt = 100;
    const vmax = Math.max(...timeline.speeds);
    let prev = sampleTimeline(timeline, 0);
    for (let ms = dt; ms <= timeline.totalDurationMs; ms += dt) {
      const s = sampleTimeline(timeline, ms);
      const moved = haversineDistance([prev.longitude, prev.latitude], [s.longitude, s.latitude]);
      expect(moved).toBeLessThanOrEqual(vmax * (dt / 1000) + 0.05);
      expect(s.distanceTravelled).toBeGreaterThanOrEqual(prev.distanceTravelled);
      prev = s;
    }
  });

  it("changes speed smoothly", () => {
    const { accelerationMps2: a, decelerationMps2: b } = DEFAULT_PROFILES.driving;
    const series = sampleSeries(timeline, 200);
    for (let i = 1; i < series.length; i++) {
      const dv = series[i]!.speed - series[i - 1]!.speed;
      expect(dv).toBeLessThanOrEqual(a * 0.2 + 1e-6);
      expect(-dv).toBeLessThanOrEqual(b * 0.2 + 1e-6);
    }
  });

  it("turns the heading gradually through the corner", () => {
    const series = sampleSeries(timeline, 500);
    let maxStep = 0;
    for (let i = 1; i < series.length; i++) {
      const d = Math.abs(((series[i]!.heading - series[i - 1]!.heading + 540) % 360) - 180);
      maxStep = Math.max(maxStep, d);
    }
    expect(series[10]!.heading).toBeCloseTo(90, 0);
    expect(series[series.length - 10]!.heading).toBeCloseTo(0, 0);
    expect(maxStep).toBeLessThan(45);
  });

  it("is consistent: remaining + travelled = total, time remaining matches", () => {
    for (const f of [0.1, 0.33, 0.5, 0.9]) {
      const s = sampleTimeline(timeline, timeline.totalDurationMs * f);
      expect(s.distanceTravelled + s.distanceRemaining).toBeCloseTo(timeline.totalDistanceM, 6);
      expect(s.elapsedMs + s.timeRemainingMs).toBeCloseTo(timeline.totalDurationMs, 6);
      expect(s.progress).toBeCloseTo(s.distanceTravelled / timeline.totalDistanceM, 9);
    }
  });

  it("reports stopped status during a forced stop", () => {
    const bus = buildTimeline({
      seed: "bus",
      segments: [{ coordinates: straightRoute(AHMEDABAD, 0, 3000), travelMode: "bus" }],
    });
    const idx = bus.dwellMs.findIndex((d, i) => i > 0 && d > 0);
    expect(idx).toBeGreaterThan(0);
    const s = sampleTimeline(bus, bus.times[idx]! + 1);
    expect(s.status).toBe("stopped");
    expect(s.speed).toBe(0);
  });
});
