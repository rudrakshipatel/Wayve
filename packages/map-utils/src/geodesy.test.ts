import { describe, expect, it } from "vitest";
import {
  bearingDelta,
  destination,
  haversineDistance,
  initialBearing,
  interpolate,
  lerpBearing,
  normalizeBearing,
  normalizeLongitude,
} from "./geodesy.ts";

describe("haversineDistance", () => {
  it("measures London → Paris", () => {
    expect(haversineDistance([-0.1278, 51.5074], [2.3522, 48.8566]) / 1000).toBeCloseTo(343.5, 0);
  });
  it("measures one degree of latitude", () => {
    expect(haversineDistance([0, 0], [0, 1])).toBeCloseTo(111_195, -1);
  });
  it("is zero for identical points and symmetric", () => {
    expect(haversineDistance([72.57, 23.02], [72.57, 23.02])).toBe(0);
    const a = [72.5714, 23.0225] as const;
    const b = [72.6369, 23.2156] as const;
    expect(haversineDistance(a, b)).toBeCloseTo(haversineDistance(b, a), 6);
  });
});

describe("bearings", () => {
  it("computes cardinal bearings", () => {
    expect(initialBearing([0, 0], [0, 1])).toBeCloseTo(0, 6);
    expect(initialBearing([0, 0], [1, 0])).toBeCloseTo(90, 6);
    expect(initialBearing([0, 0], [0, -1])).toBeCloseTo(180, 6);
    expect(initialBearing([0, 0], [-1, 0])).toBeCloseTo(270, 6);
  });
  it("normalises and diffs along the shortest arc", () => {
    expect(normalizeBearing(-90)).toBe(270);
    expect(normalizeBearing(720)).toBe(0);
    expect(bearingDelta(350, 10)).toBe(20);
    expect(bearingDelta(10, 350)).toBe(-20);
    expect(lerpBearing(350, 10, 0.5)).toBeCloseTo(0, 6);
  });
});

describe("interpolate", () => {
  it("returns endpoints at t=0 and t=1", () => {
    const a = [72.5, 23] as const;
    const b = [72.6, 23.2] as const;
    expect(interpolate(a, b, 0)).toEqual(a);
    expect(interpolate(a, b, 1)).toEqual(b);
  });
  it("places the midpoint equidistant from both ends", () => {
    const a = [72.5, 23] as const;
    const b = [72.6, 23.2] as const;
    const m = interpolate(a, b, 0.5);
    expect(haversineDistance(a, m)).toBeCloseTo(haversineDistance(m, b), 3);
    expect(haversineDistance(a, m) * 2).toBeCloseTo(haversineDistance(a, b), 3);
  });
  it("crosses the antimeridian the short way", () => {
    const m = interpolate([179.9, 0], [-179.9, 0], 0.5);
    expect(Math.abs(m[0])).toBeCloseTo(180, 6);
    expect(m[1]).toBeCloseTo(0, 9);
  });
});

describe("destination", () => {
  it("round-trips with distance and bearing", () => {
    const origin = [72.5714, 23.0225] as const;
    const p = destination(origin, 45, 1500);
    expect(haversineDistance(origin, p)).toBeCloseTo(1500, 3);
    expect(initialBearing(origin, p)).toBeCloseTo(45, 2);
  });
  it("normalises longitude", () => {
    expect(normalizeLongitude(190)).toBe(-170);
    expect(normalizeLongitude(-190)).toBe(170);
  });
});
