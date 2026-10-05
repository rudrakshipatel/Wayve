import {
  haversineDistance,
  interpolate,
  MapboxError,
  type MapboxClient,
  type RouteOption,
} from "@wave/map-utils";
import {
  TRAVEL_MODE_ROUTING_PROFILE,
  type Coordinate,
  type LngLat,
  type TravelMode,
} from "@wave/types";
import { ApiError } from "./errors.ts";

export const MAX_ROUTE_POINTS = 20_000;

/** Rounds to 1e-6° so stored geometry round-trips exactly through polyline6. */
export const roundCoordinate = ([lng, lat]: LngLat): LngLat => [
  Math.round(lng * 1e6) / 1e6,
  Math.round(lat * 1e6) / 1e6,
];

const toLngLat = (c: Coordinate): LngLat => [c.longitude, c.latitude];

/** Great-circle polyline with a vertex roughly every `stepM` metres. */
export function straightLine(from: LngLat, to: LngLat, stepM = 1000): LngLat[] {
  const distance = haversineDistance(from, to);
  const steps = Math.max(1, Math.min(500, Math.ceil(distance / stepM)));
  return Array.from({ length: steps + 1 }, (_, i) => interpolate(from, to, i / steps));
}

/**
 * Route alternatives for one segment. Train journeys fall back to a straight line when no
 * road route exists, since Mapbox has no rail profile.
 */
export async function routeOptions(
  mapbox: MapboxClient | null,
  from: Coordinate,
  to: Coordinate,
  mode: TravelMode,
): Promise<RouteOption[]> {
  const a = toLngLat(from);
  const b = toLngLat(to);
  if (haversineDistance(a, b) < 1) return [{ coordinates: [a], distanceM: 0, durationS: 0 }];
  if (!mapbox) throw new ApiError(503, "routing_unavailable", "Routing is not configured");
  try {
    const routes = await mapbox.directions(TRAVEL_MODE_ROUTING_PROFILE[mode], [a, b], {
      alternatives: true,
    });
    const usable = routes.filter(
      (r) => r.coordinates.length >= 2 && r.coordinates.length <= MAX_ROUTE_POINTS,
    );
    if (usable.length > 0) {
      return usable.map((r) => ({ ...r, coordinates: r.coordinates.map(roundCoordinate) }));
    }
  } catch (error) {
    if (!(error instanceof MapboxError) || error.status !== 422) {
      throw new ApiError(502, "routing_failed", "The routing service is unavailable");
    }
  }
  if (mode === "train") {
    const coordinates = straightLine(a, b).map(roundCoordinate);
    return [{ coordinates, distanceM: haversineDistance(a, b), durationS: 0 }];
  }
  throw new ApiError(422, "no_route", "No route found between these places for this travel mode");
}
