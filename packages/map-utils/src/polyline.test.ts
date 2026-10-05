import { describe, expect, it } from "vitest";
import type { LngLat } from "@wave/types";
import { destination, haversineDistance } from "./geodesy.ts";
import {
  bearingAtDistance,
  boundingBox,
  decodePolyline,
  dedupeCoordinates,
  encodePolyline,
  measurePolyline,
  pointAtDistance,
  upperBoundIndex,
  vertexTurnAngles,
} from "./polyline.ts";

const origin: LngLat = [72.5714, 23.0225];
const corner = destination(origin, 90, 1000);
const end = destination(corner, 0, 500);
const lShape: LngLat[] = [origin, corner, end];

describe("measurePolyline", () => {
  it("accumulates distances", () => {
    const line = measurePolyline(lShape);
    expect(line.length).toBeCloseTo(1500, 3);
    expect(line.cumulative[1]).toBeCloseTo(1000, 3);
  });
  it("drops duplicate vertices", () => {
    expect(dedupeCoordinates([origin, origin, corner, corner])).toEqual([origin, corner]);
  });
  it("rejects empty input", () => {
    expect(() => measurePolyline([])).toThrow();
  });
});

describe("pointAtDistance", () => {
  const line = measurePolyline(lShape);
  it("clamps to the ends", () => {
    expect(pointAtDistance(line, -5).point).toEqual(origin);
    expect(pointAtDistance(line, 1e9).point).toEqual(end);
  });
  it("interpolates within edges", () => {
    const { point, edgeIndex } = pointAtDistance(line, 1250);
    expect(edgeIndex).toBe(1);
    expect(haversineDistance(corner, point)).toBeCloseTo(250, 3);
  });
  it("is continuous across vertices", () => {
    const before = pointAtDistance(line, 999.999).point;
    const after = pointAtDistance(line, 1000.001).point;
    expect(haversineDistance(before, after)).toBeLessThan(0.01);
  });
});

describe("bearingAtDistance", () => {
  const line = measurePolyline(lShape);
  it("follows each leg and blends at the corner", () => {
    expect(bearingAtDistance(line, 500)).toBeCloseTo(90, 0);
    expect(bearingAtDistance(line, 1300)).toBeCloseTo(0, 0);
    const atCorner = bearingAtDistance(line, 1000, 20);
    expect(atCorner).toBeGreaterThan(30);
    expect(atCorner).toBeLessThan(60);
  });
});

describe("vertexTurnAngles", () => {
  it("measures a right angle", () => {
    const angles = vertexTurnAngles(measurePolyline(lShape));
    expect(angles[0]).toBe(0);
    expect(angles[1]).toBeCloseTo(90, 0);
    expect(angles[2]).toBe(0);
  });
});

describe("upperBoundIndex", () => {
  it("finds the last value <= target", () => {
    const v = [0, 10, 20, 30];
    expect(upperBoundIndex(v, -1)).toBe(0);
    expect(upperBoundIndex(v, 10)).toBe(1);
    expect(upperBoundIndex(v, 25)).toBe(2);
    expect(upperBoundIndex(v, 99)).toBe(3);
  });
});

describe("polyline codec", () => {
  it("decodes the reference precision-5 example", () => {
    const decoded = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5);
    expect(decoded).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });
  it("round-trips at precision 6", () => {
    const coords: LngLat[] = [
      [72.571362, 23.022505],
      [72.636941, 23.215635],
      [-0.127758, 51.507351],
    ];
    expect(decodePolyline(encodePolyline(coords))).toEqual(coords);
  });
  it("rejects truncated input", () => {
    expect(() => decodePolyline("_p~iF~ps|")).toThrow();
  });
});

describe("boundingBox", () => {
  it("encloses all points", () => {
    const b = boundingBox(lShape);
    expect(b.west).toBeCloseTo(origin[0], 9);
    expect(b.south).toBeCloseTo(Math.min(origin[1], corner[1]), 9);
    expect(b.east).toBeCloseTo(corner[0], 9);
    expect(b.north).toBeCloseTo(end[1], 9);
  });
});
