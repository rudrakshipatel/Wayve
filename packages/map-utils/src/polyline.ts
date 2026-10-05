import type { BoundingBox, LngLat } from "@wave/types";
import { haversineDistance, initialBearing, interpolate } from "./geodesy.ts";

/** A polyline with precomputed cumulative distances for O(log n) lookups. */
export interface MeasuredPolyline {
  readonly coordinates: readonly LngLat[];
  /** `cumulative[i]` = distance in metres from the start to vertex `i`. */
  readonly cumulative: Float64Array;
  readonly length: number;
}

export interface PointAlong {
  readonly point: LngLat;
  /** Index of the polyline edge (vertex i → i+1) containing the point. */
  readonly edgeIndex: number;
}

/** Drops consecutive duplicate vertices (zero-length edges). */
export function dedupeCoordinates(coords: readonly LngLat[]): LngLat[] {
  const out: LngLat[] = [];
  for (const c of coords) {
    const last = out[out.length - 1];
    if (last?.[0] !== c[0] || last[1] !== c[1]) out.push(c);
  }
  return out;
}

export function measurePolyline(coordinates: readonly LngLat[]): MeasuredPolyline {
  const coords = dedupeCoordinates(coordinates);
  if (coords.length === 0) throw new Error("Polyline must contain at least one coordinate");
  const cumulative = new Float64Array(coords.length);
  for (let i = 1; i < coords.length; i++) {
    cumulative[i] = (cumulative[i - 1] ?? 0) + haversineDistance(coords[i - 1]!, coords[i]!);
  }
  return { coordinates: coords, cumulative, length: cumulative[coords.length - 1] ?? 0 };
}

/** Largest index `i` such that `values[i] <= target` (values ascending). */
export function upperBoundIndex(values: ArrayLike<number>, target: number): number {
  let lo = 0;
  let hi = values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((values[mid] ?? Infinity) <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Point at `distanceM` from the start; clamped to the polyline ends. */
export function pointAtDistance(line: MeasuredPolyline, distanceM: number): PointAlong {
  const { coordinates, cumulative, length } = line;
  if (coordinates.length === 1 || distanceM <= 0) {
    return { point: coordinates[0]!, edgeIndex: 0 };
  }
  if (distanceM >= length) {
    return { point: coordinates[coordinates.length - 1]!, edgeIndex: coordinates.length - 2 };
  }
  const i = Math.min(upperBoundIndex(cumulative, distanceM), coordinates.length - 2);
  const start = cumulative[i] ?? 0;
  const edge = (cumulative[i + 1] ?? start) - start;
  const t = edge > 0 ? (distanceM - start) / edge : 0;
  return { point: interpolate(coordinates[i]!, coordinates[i + 1]!, t), edgeIndex: i };
}

/**
 * Heading at `distanceM`, measured along a chord from `distanceM - window` to
 * `distanceM + window`. The chord smooths sharp vertices into gradual turns.
 */
export function bearingAtDistance(line: MeasuredPolyline, distanceM: number, windowM = 12): number {
  if (line.length === 0) return 0;
  let a = Math.max(0, distanceM - windowM);
  let b = Math.min(line.length, distanceM + windowM);
  if (b - a < 1e-6) {
    a = Math.max(0, b - 1);
    b = Math.min(line.length, a + 1);
  }
  return initialBearing(pointAtDistance(line, a).point, pointAtDistance(line, b).point);
}

/** Heading change in degrees (0..180) at each interior vertex; ends are 0. */
export function vertexTurnAngles(line: MeasuredPolyline): Float64Array {
  const { coordinates } = line;
  const out = new Float64Array(coordinates.length);
  for (let i = 1; i < coordinates.length - 1; i++) {
    const inBearing = initialBearing(coordinates[i - 1]!, coordinates[i]!);
    const outBearing = initialBearing(coordinates[i]!, coordinates[i + 1]!);
    const d = Math.abs(((outBearing - inBearing + 540) % 360) - 180);
    out[i] = d;
  }
  return out;
}

export function boundingBox(coords: readonly LngLat[]): BoundingBox {
  if (coords.length === 0) throw new Error("Cannot compute bounds of an empty coordinate list");
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of coords) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return { west, south, east, north };
}

/** Decodes a Google/Mapbox encoded polyline (precision 5 or 6) into [lng, lat] pairs. */
export function decodePolyline(encoded: string, precision = 6): LngLat[] {
  const factor = 10 ** precision;
  const coords: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new Error("Malformed encoded polyline");
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    coords.push([lng / factor, lat / factor]);
  }
  return coords;
}

export function encodePolyline(coords: readonly LngLat[], precision = 6): string {
  const factor = 10 ** precision;
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  const encode = (value: number): void => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const [lngRaw, latRaw] of coords) {
    const lat = Math.round(latRaw * factor);
    const lng = Math.round(lngRaw * factor);
    encode(lat - prevLat);
    encode(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}
