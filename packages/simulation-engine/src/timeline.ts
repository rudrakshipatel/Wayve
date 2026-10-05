import {
  bearingDelta,
  haversineDistance,
  initialBearing,
  kmhToMps,
  measurePolyline,
  pointAtDistance,
  type MeasuredPolyline,
} from "@wave/map-utils";
import type { LngLat, TravelMode } from "@wave/types";
import { resolveProfile, type MovementProfile, type MovementProfileOverrides } from "./profiles.ts";
import { createRandom, randomBetween, type Random } from "./random.ts";

export interface SegmentPlanInput {
  /** Route geometry for this segment, [lng, lat]. */
  readonly coordinates: readonly LngLat[];
  readonly travelMode: TravelMode;
  /** Cruise speed. When omitted (and no duration), the profile default is used. */
  readonly targetSpeedKmh?: number;
  /** Desired travel time for this segment, excluding `pauseAfterS`. Overrides speed. */
  readonly durationS?: number;
  /** Dwell at the end of the segment (waypoint pause). Ignored for the final segment. */
  readonly pauseAfterS?: number;
  readonly profile?: MovementProfileOverrides;
}

export interface JourneyPlanInput {
  /** Seed for deterministic variation and stop placement. */
  readonly seed: string;
  readonly segments: readonly SegmentPlanInput[];
}

export const DwellKind = { none: 0, stop: 1, waypoint: 2 } as const;
export type DwellKind = (typeof DwellKind)[keyof typeof DwellKind];

export interface TimelineSegment {
  readonly index: number;
  readonly travelMode: TravelMode;
  readonly profile: MovementProfile;
  readonly line: MeasuredPolyline;
  readonly startDistanceM: number;
  readonly endDistanceM: number;
  /** Global grid index of the segment's first / last point. */
  readonly startPoint: number;
  readonly endPoint: number;
  /** Time the segment starts moving (after any dwell at its first point). */
  readonly departureMs: number;
  /** Time the segment reaches its destination. */
  readonly arrivalMs: number;
  /** Arrival plus the waypoint pause. */
  readonly endMs: number;
  readonly cruiseSpeedMps: number;
  readonly requestedDurationMs: number | null;
  /** False when the requested duration was unreachable within the profile's speed bounds. */
  readonly durationSatisfied: boolean;
  readonly pauseAfterMs: number;
}

export interface TimelineWaypoint {
  /** The segment that ends at this waypoint. */
  readonly segmentIndex: number;
  readonly point: LngLat;
  readonly distanceM: number;
  readonly arrivalMs: number;
  readonly departureMs: number;
}

/**
 * A compiled, immutable journey. Kinematics are stored on a distance grid:
 * between grid points `i` and `i + 1` acceleration is constant.
 */
export interface Timeline {
  readonly seed: string;
  /** Distance from journey start at each grid point (m). */
  readonly distances: Float64Array;
  /** Speed at each grid point (m/s). */
  readonly speeds: Float64Array;
  /** Time of arrival at each grid point (ms from journey start). */
  readonly times: Float64Array;
  /** Time spent stationary at each grid point after arrival (ms). */
  readonly dwellMs: Float64Array;
  readonly dwellKind: Uint8Array;
  /** Segment index owning the cell that starts at grid point `i`. */
  readonly cellSegment: Uint16Array;
  readonly segments: readonly TimelineSegment[];
  readonly waypoints: readonly TimelineWaypoint[];
  readonly totalDistanceM: number;
  readonly totalDurationMs: number;
  readonly start: LngLat;
  readonly end: LngLat;
}

const MIN_GRID_STEP_M = 2;
const MAX_GRID_STEP_M = 25;
const TARGET_CELLS = 2000;
const MAX_CELLS_PER_SEGMENT = 20_000;
const DEGENERATE_LENGTH_M = 0.01;
const CONTINUITY_TOLERANCE_M = 0.5;

/** Seed-dependent, speed-independent properties of a segment's grid. */
interface SegmentFeatures {
  readonly line: MeasuredPolyline;
  readonly d: Float64Array;
  readonly variation: Float64Array;
  readonly turnDeg: Float64Array;
  readonly stopDwellMs: Float64Array;
}

interface SegmentKinematics {
  readonly v: Float64Array;
  readonly cellMs: Float64Array;
  readonly totalMs: number;
}

export function buildTimeline(plan: JourneyPlanInput): Timeline {
  if (plan.segments.length === 0) throw new RangeError("A journey needs at least one segment");
  if (plan.segments.length > 0xffff) throw new RangeError("Too many segments");

  const compiled: {
    readonly input: SegmentPlanInput;
    readonly profile: MovementProfile;
    readonly features: SegmentFeatures;
    readonly kin: SegmentKinematics;
    readonly cruise: number;
    readonly requestedMs: number | null;
    readonly satisfied: boolean;
  }[] = [];

  let previousEnd: LngLat | null = null;
  plan.segments.forEach((input, index) => {
    validateSegmentInput(input, index);
    const profile = resolveProfile(input.travelMode, input.profile);
    let coords = input.coordinates;
    const first = coords[0];
    // Join segments so the marker never jumps between a segment's end and the next start.
    if (previousEnd && first && haversineDistance(previousEnd, first) > CONTINUITY_TOLERANCE_M) {
      coords = [previousEnd, ...coords];
    }
    const line = measurePolyline(coords);
    previousEnd = line.coordinates[line.coordinates.length - 1] ?? null;
    const rng = createRandom(`${plan.seed}:${index}`);
    const features = buildFeatures(line, profile, rng);
    const solved = solveCruise(features, profile, input);
    compiled.push({ input, profile, features, ...solved });
  });

  // Concatenate segments onto one global grid; a segment's first point coincides with
  // the previous segment's last point and is not duplicated.
  const N = compiled.reduce((sum, c) => sum + c.features.d.length, 0) - (compiled.length - 1);

  const distances = new Float64Array(N);
  const speeds = new Float64Array(N);
  const times = new Float64Array(N);
  const dwellMs = new Float64Array(N);
  const dwellKind = new Uint8Array(N);
  const cellSegment = new Uint16Array(Math.max(0, N - 1));
  const cellMsGlobal = new Float64Array(Math.max(0, N - 1));

  let cursor = 0;
  let distanceOffset = 0;
  const bounds: { start: number; end: number; startDistance: number; endDistance: number }[] = [];

  compiled.forEach((c, s) => {
    const { d, stopDwellMs } = c.features;
    const skipFirst = s === 0 ? 0 : 1;
    const startPoint = s === 0 ? 0 : cursor - 1;
    for (let j = skipFirst; j < d.length; j++) {
      const g = cursor++;
      distances[g] = distanceOffset + (d[j] ?? 0);
      speeds[g] = c.kin.v[j] ?? 0;
      const stop = stopDwellMs[j] ?? 0;
      if (stop > 0) {
        dwellMs[g] = stop;
        dwellKind[g] = DwellKind.stop;
      }
      if (j > 0) {
        cellSegment[g - 1] = s;
        cellMsGlobal[g - 1] = c.kin.cellMs[j - 1] ?? 0;
      }
    }
    const endPoint = cursor - 1;
    const isLast = s === compiled.length - 1;
    const pauseMs = isLast ? 0 : secondsToMs(c.input.pauseAfterS ?? 0);
    if (pauseMs > 0) {
      dwellMs[endPoint] = (dwellMs[endPoint] ?? 0) + pauseMs;
      dwellKind[endPoint] = DwellKind.waypoint;
    } else if (!isLast) {
      dwellKind[endPoint] = DwellKind.waypoint;
    }
    bounds.push({
      start: startPoint,
      end: endPoint,
      startDistance: distanceOffset,
      endDistance: distanceOffset + c.features.line.length,
    });
    distanceOffset += c.features.line.length;
  });

  for (let i = 0; i < N - 1; i++) {
    times[i + 1] = (times[i] ?? 0) + (dwellMs[i] ?? 0) + (cellMsGlobal[i] ?? 0);
  }
  const totalDurationMs = (times[N - 1] ?? 0) + (N === 1 ? (dwellMs[0] ?? 0) : 0);

  const segments: TimelineSegment[] = [];
  compiled.forEach((c, s) => {
    const b = bounds[s]!;
    const pauseAfterMs = s === compiled.length - 1 ? 0 : secondsToMs(c.input.pauseAfterS ?? 0);
    // A segment departs when the previous one's waypoint pause ends.
    const departureMs = s === 0 ? 0 : segments[s - 1]!.endMs;
    const arrivalMs = Math.max(times[b.end] ?? 0, departureMs);
    segments.push({
      index: s,
      travelMode: c.input.travelMode,
      profile: c.profile,
      line: c.features.line,
      startDistanceM: b.startDistance,
      endDistanceM: b.endDistance,
      startPoint: b.start,
      endPoint: b.end,
      departureMs,
      arrivalMs,
      endMs: arrivalMs + pauseAfterMs,
      cruiseSpeedMps: c.cruise,
      requestedDurationMs: c.requestedMs,
      durationSatisfied: c.satisfied,
      pauseAfterMs,
    });
  });

  const waypoints: TimelineWaypoint[] = segments.slice(0, -1).map((seg) => ({
    segmentIndex: seg.index,
    point: seg.line.coordinates[seg.line.coordinates.length - 1]!,
    distanceM: seg.endDistanceM,
    arrivalMs: seg.arrivalMs,
    departureMs: seg.endMs,
  }));

  const firstLine = compiled[0]!.features.line;
  const lastLine = compiled[compiled.length - 1]!.features.line;
  return {
    seed: plan.seed,
    distances,
    speeds,
    times,
    dwellMs,
    dwellKind,
    cellSegment,
    segments,
    waypoints,
    totalDistanceM: distanceOffset,
    totalDurationMs,
    start: firstLine.coordinates[0]!,
    end: lastLine.coordinates[lastLine.coordinates.length - 1]!,
  };
}

function validateSegmentInput(input: SegmentPlanInput, index: number): void {
  if (input.coordinates.length === 0) {
    throw new RangeError(`Segment ${index} has no coordinates`);
  }
  for (const [lng, lat] of input.coordinates) {
    if (
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      throw new RangeError(`Segment ${index} has an invalid coordinate`);
    }
  }
  if (input.targetSpeedKmh !== undefined && !(input.targetSpeedKmh > 0)) {
    throw new RangeError(`Segment ${index} speed must be positive`);
  }
  if (input.durationS !== undefined && !(input.durationS > 0)) {
    throw new RangeError(`Segment ${index} duration must be positive`);
  }
  if (input.pauseAfterS !== undefined && !(input.pauseAfterS >= 0)) {
    throw new RangeError(`Segment ${index} pause must be non-negative`);
  }
}

const secondsToMs = (s: number): number => Math.round(s * 1000);

function buildFeatures(
  line: MeasuredPolyline,
  profile: MovementProfile,
  rng: Random,
): SegmentFeatures {
  const L = line.length;
  if (L < DEGENERATE_LENGTH_M) {
    const one = new Float64Array(1);
    return {
      line,
      d: one,
      variation: new Float64Array([1]),
      turnDeg: new Float64Array(1),
      stopDwellMs: new Float64Array(1),
    };
  }
  let step = Math.min(MAX_GRID_STEP_M, Math.max(MIN_GRID_STEP_M, L / TARGET_CELLS));
  step = Math.max(step, L / MAX_CELLS_PER_SEGMENT);
  const cells = Math.max(2, Math.ceil(L / step));
  const n = cells + 1;
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) d[i] = (L * i) / cells;
  const ds = L / cells;

  // Speed variation: one random factor per chunk, linearly blended between chunk centres.
  const chunkCount = Math.ceil(L / profile.variationChunkM) + 1;
  const factors = new Float64Array(chunkCount + 1);
  for (let k = 0; k < factors.length; k++) {
    factors[k] = 1 + profile.speedVariation * (2 * rng() - 1);
  }
  const variation = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = (d[i] ?? 0) / profile.variationChunkM;
    const k = Math.floor(x);
    const t = x - k;
    variation[i] = (factors[k] ?? 1) * (1 - t) + (factors[k + 1] ?? 1) * t;
  }

  // Heading change measured over a window either side of each point.
  const turnDeg = new Float64Array(n);
  const turn = profile.turnSlowdown;
  if (turn) {
    for (let i = 1; i < n - 1; i++) {
      const at = d[i] ?? 0;
      const back = Math.max(0, at - turn.windowM);
      const ahead = Math.min(L, at + turn.windowM);
      if (at - back < 0.5 || ahead - at < 0.5) continue;
      const p0 = pointAtDistance(line, back).point;
      const p1 = pointAtDistance(line, at).point;
      const p2 = pointAtDistance(line, ahead).point;
      turnDeg[i] = Math.abs(bearingDelta(initialBearing(p0, p1), initialBearing(p1, p2)));
    }
  }

  // Forced stops. Never on, or adjacent to, a segment end or another stop.
  const stopDwellMs = new Float64Array(n);
  const stops = profile.stops;
  if (stops && n >= 5) {
    const clearance = Math.min(profile.stopEndClearanceM, L / 4);
    const positions: number[] = [];
    if (stops.kind === "random") {
      const mean = 1000 / stops.perKm;
      let pos = clearance;
      for (;;) {
        pos += Math.max(stops.minSpacingM, -Math.log(1 - rng()) * mean);
        if (pos > L - clearance) break;
        positions.push(pos);
      }
    } else {
      let pos = stops.spacingM + stops.jitterM * (2 * rng() - 1);
      while (pos <= L - clearance) {
        if (pos >= clearance) positions.push(pos);
        pos += Math.max(stops.spacingM / 4, stops.spacingM + stops.jitterM * (2 * rng() - 1));
      }
    }
    let lastIndex = -10;
    for (const pos of positions) {
      const dwell = randomBetween(rng, stops.minDwellS, stops.maxDwellS);
      const idx = Math.round(pos / ds);
      if (idx < 2 || idx > n - 3 || idx - lastIndex < 2) continue;
      stopDwellMs[idx] = secondsToMs(dwell);
      lastIndex = idx;
    }
  }

  return { line, d, variation, turnDeg, stopDwellMs };
}

/** Forward/backward pass over the speed envelope, then constant-acceleration time per cell. */
function integrate(
  f: SegmentFeatures,
  profile: MovementProfile,
  cruise: number,
): SegmentKinematics {
  const n = f.d.length;
  const v = new Float64Array(n);
  const cellMs = new Float64Array(Math.max(0, n - 1));
  if (n === 1) return { v, cellMs, totalMs: 0 };

  const vmax = new Float64Array(n);
  const turn = profile.turnSlowdown;
  const minTurn = turn ? kmhToMps(turn.minSpeedKmh) : 0;
  for (let i = 0; i < n; i++) {
    let cap = cruise * (f.variation[i] ?? 1);
    const angle = f.turnDeg[i] ?? 0;
    if (turn && angle > turn.minAngleDeg && cap > minTurn) {
      const k = 1 - (angle - turn.minAngleDeg) / (180 - turn.minAngleDeg);
      cap = Math.min(cap, minTurn + (cap - minTurn) * k * k);
    }
    vmax[i] = (f.stopDwellMs[i] ?? 0) > 0 ? 0 : cap;
  }
  vmax[0] = 0;
  vmax[n - 1] = 0;

  const a = profile.accelerationMps2;
  const b = profile.decelerationMps2;
  v[0] = 0;
  for (let i = 0; i < n - 1; i++) {
    const ds = (f.d[i + 1] ?? 0) - (f.d[i] ?? 0);
    v[i + 1] = Math.min(vmax[i + 1] ?? 0, Math.sqrt((v[i] ?? 0) ** 2 + 2 * a * ds));
  }
  v[n - 1] = 0;
  for (let i = n - 2; i >= 0; i--) {
    const ds = (f.d[i + 1] ?? 0) - (f.d[i] ?? 0);
    v[i] = Math.min(v[i] ?? 0, Math.sqrt((v[i + 1] ?? 0) ** 2 + 2 * b * ds));
  }

  let totalMs = 0;
  for (let i = 0; i < n - 1; i++) {
    const ds = (f.d[i + 1] ?? 0) - (f.d[i] ?? 0);
    const vSum = (v[i] ?? 0) + (v[i + 1] ?? 0);
    // vSum > 0 is guaranteed: zero-speed points are never adjacent.
    const ms = vSum > 0 ? (2 * ds * 1000) / vSum : 0;
    cellMs[i] = ms;
    totalMs += ms + (i > 0 ? (f.stopDwellMs[i] ?? 0) : 0);
  }
  return { v, cellMs, totalMs };
}

function solveCruise(
  f: SegmentFeatures,
  profile: MovementProfile,
  input: SegmentPlanInput,
): { kin: SegmentKinematics; cruise: number; requestedMs: number | null; satisfied: boolean } {
  if (input.durationS === undefined) {
    const cruise = kmhToMps(input.targetSpeedKmh ?? profile.defaultSpeedKmh);
    return { kin: integrate(f, profile, cruise), cruise, requestedMs: null, satisfied: true };
  }
  const target = secondsToMs(input.durationS);
  let lo = kmhToMps(profile.minSpeedKmh);
  let hi = kmhToMps(profile.maxSpeedKmh);
  const fast = integrate(f, profile, hi);
  if (fast.totalMs >= target)
    return { kin: fast, cruise: hi, requestedMs: target, satisfied: fast.totalMs - target < 1000 };
  const slow = integrate(f, profile, lo);
  if (slow.totalMs <= target)
    return { kin: slow, cruise: lo, requestedMs: target, satisfied: target - slow.totalMs < 1000 };
  let best = fast;
  let bestCruise = hi;
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    const k = integrate(f, profile, mid);
    best = k;
    bestCruise = mid;
    if (Math.abs(k.totalMs - target) < 1) break;
    if (k.totalMs > target) lo = mid;
    else hi = mid;
  }
  return {
    kin: best,
    cruise: bestCruise,
    requestedMs: target,
    satisfied: Math.abs(best.totalMs - target) < 1000,
  };
}
