import { destination } from "@wave/map-utils";
import type { LngLat } from "@wave/types";

export const AHMEDABAD: LngLat = [72.5714, 23.0225];

/** Straight route with a vertex every `stepM` metres. */
export function straightRoute(
  start: LngLat,
  bearing: number,
  lengthM: number,
  stepM = 50,
): LngLat[] {
  const out: LngLat[] = [start];
  for (let d = stepM; d < lengthM; d += stepM) out.push(destination(start, bearing, d));
  out.push(destination(start, bearing, lengthM));
  return out;
}

/** Route that heads east then turns 90° north. */
export function lRoute(start: LngLat, legM: number, stepM = 50): LngLat[] {
  const first = straightRoute(start, 90, legM, stepM);
  const corner = first[first.length - 1]!;
  return [...first, ...straightRoute(corner, 0, legM, stepM).slice(1)];
}
