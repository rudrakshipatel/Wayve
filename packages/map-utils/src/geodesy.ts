import type { LngLat } from "@wave/types";

/** IUGG mean Earth radius in metres. */
export const EARTH_RADIUS_M = 6_371_008.8;

const DEG = Math.PI / 180;

export const toRadians = (deg: number): number => deg * DEG;
export const toDegrees = (rad: number): number => rad / DEG;

/** Normalises any angle to [0, 360). */
export function normalizeBearing(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Signed smallest rotation from `from` to `to`, in (-180, 180]. */
export function bearingDelta(from: number, to: number): number {
  const d = normalizeBearing(to - from);
  return d > 180 ? d - 360 : d;
}

/** Interpolates headings along the shortest arc. */
export function lerpBearing(from: number, to: number, t: number): number {
  return normalizeBearing(from + bearingDelta(from, to) * t);
}

/** Great-circle distance in metres. */
export function haversineDistance(a: LngLat, b: LngLat): number {
  const φ1 = toRadians(a[1]);
  const φ2 = toRadians(b[1]);
  const dφ = φ2 - φ1;
  const dλ = toRadians(b[0] - a[0]);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from `a` to `b`, degrees clockwise from north in [0, 360). */
export function initialBearing(a: LngLat, b: LngLat): number {
  const φ1 = toRadians(a[1]);
  const φ2 = toRadians(b[1]);
  const dλ = toRadians(b[0] - a[0]);
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return normalizeBearing(toDegrees(Math.atan2(y, x)));
}

/**
 * Point at fraction `t` ∈ [0, 1] along the great circle from `a` to `b`.
 * Uses spherical interpolation, so it stays correct across the antimeridian.
 */
export function interpolate(a: LngLat, b: LngLat, t: number): LngLat {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const φ1 = toRadians(a[1]);
  const λ1 = toRadians(a[0]);
  const φ2 = toRadians(b[1]);
  const λ2 = toRadians(b[0]);
  const δ = haversineDistance(a, b) / EARTH_RADIUS_M;
  if (δ < 1e-12) return a;
  const sinδ = Math.sin(δ);
  const A = Math.sin((1 - t) * δ) / sinδ;
  const B = Math.sin(t * δ) / sinδ;
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
  const λ = Math.atan2(y, x);
  return [normalizeLongitude(toDegrees(λ)), toDegrees(φ)];
}

/** Normalises longitude to [-180, 180). */
export function normalizeLongitude(lng: number): number {
  const r = (((lng + 180) % 360) + 360) % 360;
  return r - 180;
}

/** Destination point travelling `distanceM` from `origin` along `bearingDeg`. */
export function destination(origin: LngLat, bearingDeg: number, distanceM: number): LngLat {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = toRadians(bearingDeg);
  const φ1 = toRadians(origin[1]);
  const λ1 = toRadians(origin[0]);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [normalizeLongitude(toDegrees(λ2)), toDegrees(φ2)];
}
