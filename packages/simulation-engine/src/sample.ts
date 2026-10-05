import { bearingAtDistance, mpsToKmh, pointAtDistance, upperBoundIndex } from "@wave/map-utils";
import type { SimulationStatus, TravelMode } from "@wave/types";
import { DwellKind, type Timeline, type TimelineSegment } from "./timeline.ts";

export interface SimulationSample {
  /** Wall-clock time this sample represents (ms since epoch), as supplied by the caller. */
  readonly timestamp: number;
  readonly latitude: number;
  readonly longitude: number;
  /** Simulated speed in m/s. */
  readonly speed: number;
  readonly speedKmh: number;
  /** Degrees clockwise from north, [0, 360). */
  readonly heading: number;
  /** 0..1 by distance (by time when the journey has no distance). */
  readonly progress: number;
  readonly distanceTravelled: number;
  readonly distanceRemaining: number;
  readonly elapsedMs: number;
  readonly timeRemainingMs: number;
  readonly segmentIndex: number;
  readonly travelMode: TravelMode;
  readonly status: SimulationStatus;
}

interface Kinematics {
  readonly distance: number;
  readonly speed: number;
  readonly status: SimulationStatus;
  /** Grid point (when stationary) or cell start index. */
  readonly index: number;
}

/** Distance, speed and status at simulated time `simMs`. */
export function kinematicsAt(t: Timeline, simMs: number): Kinematics {
  const n = t.distances.length;
  if (!(simMs > 0)) return { distance: 0, speed: 0, status: "not_started", index: 0 };
  if (simMs >= t.totalDurationMs) {
    return { distance: t.totalDistanceM, speed: 0, status: "completed", index: n - 1 };
  }
  const i = upperBoundIndex(t.times, simMs);
  const local = simMs - (t.times[i] ?? 0);
  const dwell = t.dwellMs[i] ?? 0;
  const atDistance = t.distances[i] ?? 0;
  if (local < dwell || i >= n - 1) {
    const kind = t.dwellKind[i];
    return {
      distance: atDistance,
      speed: 0,
      status: kind === DwellKind.waypoint ? "waypoint_pause" : "stopped",
      index: i,
    };
  }
  const tau = (local - dwell) / 1000;
  const ds = (t.distances[i + 1] ?? atDistance) - atDistance;
  const v0 = t.speeds[i] ?? 0;
  const v1 = t.speeds[i + 1] ?? 0;
  const accel = ds > 0 ? (v1 * v1 - v0 * v0) / (2 * ds) : 0;
  const s = Math.min(ds, Math.max(0, v0 * tau + 0.5 * accel * tau * tau));
  const speed = Math.max(0, Math.min(Math.max(v0, v1), v0 + accel * tau));
  return { distance: atDistance + s, speed, status: "moving", index: i };
}

export function segmentForIndex(t: Timeline, index: number): TimelineSegment {
  const cell = t.cellSegment.length === 0 ? 0 : Math.min(index, t.cellSegment.length - 1);
  return t.segments[t.cellSegment[cell] ?? 0] ?? t.segments[0]!;
}

/**
 * Samples the timeline at simulated time `simMs`. Pure and O(log n), cheap enough
 * to call on every animation frame.
 */
export function sampleTimeline(
  t: Timeline,
  simMs: number,
  timestamp: number = simMs,
): SimulationSample {
  const elapsedMs = Math.min(Math.max(simMs, 0), t.totalDurationMs);
  const k = kinematicsAt(t, simMs);
  const seg = segmentForIndex(t, k.index);
  const local = Math.min(seg.line.length, Math.max(0, k.distance - seg.startDistanceM));
  const [longitude, latitude] = pointAtDistance(seg.line, local).point;
  const heading = bearingAtDistance(seg.line, local, seg.profile.headingWindowM);
  const progress =
    t.totalDistanceM > 0
      ? k.distance / t.totalDistanceM
      : t.totalDurationMs > 0
        ? elapsedMs / t.totalDurationMs
        : k.status === "completed"
          ? 1
          : 0;
  return {
    timestamp,
    latitude,
    longitude,
    speed: k.speed,
    speedKmh: mpsToKmh(k.speed),
    heading,
    progress: Math.min(1, Math.max(0, progress)),
    distanceTravelled: k.distance,
    distanceRemaining: Math.max(0, t.totalDistanceM - k.distance),
    elapsedMs,
    timeRemainingMs: Math.max(0, t.totalDurationMs - elapsedMs),
    segmentIndex: seg.index,
    travelMode: seg.travelMode,
    status: k.status,
  };
}

/** Evenly spaced samples, e.g. for previews, tests or exporting a track. */
export function sampleSeries(t: Timeline, intervalMs: number): SimulationSample[] {
  if (!(intervalMs > 0)) throw new RangeError("intervalMs must be positive");
  const out: SimulationSample[] = [];
  for (let ms = 0; ms < t.totalDurationMs; ms += intervalMs) out.push(sampleTimeline(t, ms));
  out.push(sampleTimeline(t, t.totalDurationMs));
  return out;
}
