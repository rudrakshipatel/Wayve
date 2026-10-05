import type { LngLat, Place } from "@wave/types";
import { decodePolyline } from "./polyline.ts";

/** Minimal fetch signature so the client works in browsers, React Native, Node and Deno. */
export type FetchLike = (
  input: string,
  init?: {
    readonly signal?: AbortSignalLike | undefined;
    readonly headers?: Record<string, string>;
  },
) => Promise<ResponseLike>;

export interface ResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

/** Structural stand-in for AbortSignal (not in the ES lib). */
export interface AbortSignalLike {
  readonly aborted: boolean;
}

export type DirectionsProfile = "walking" | "cycling" | "driving" | "driving-traffic";

export interface MapboxClientOptions {
  readonly accessToken: string;
  readonly fetch?: FetchLike;
  readonly baseUrl?: string;
  /** Search Box session token groups suggest/retrieve calls for billing. */
  readonly language?: string;
}

export interface SearchOptions {
  readonly proximity?: LngLat;
  readonly limit?: number;
  readonly country?: string;
  readonly signal?: AbortSignalLike;
}

export interface PlaceResult extends Place {
  readonly id: string;
  readonly featureType: string;
  readonly placeFormatted: string | null;
}

export interface RouteOption {
  readonly coordinates: LngLat[];
  readonly distanceM: number;
  /** Mapbox's own travel-time estimate (the simulation computes its own). */
  readonly durationS: number;
}

export class MapboxError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "MapboxError";
    this.status = status;
    this.code = code;
  }
}

export interface MapboxClient {
  searchPlaces(query: string, options?: SearchOptions): Promise<PlaceResult[]>;
  reverseGeocode(
    point: LngLat,
    options?: { readonly signal?: AbortSignalLike },
  ): Promise<PlaceResult | null>;
  directions(
    profile: DirectionsProfile,
    coordinates: readonly LngLat[],
    options?: { readonly alternatives?: boolean; readonly signal?: AbortSignalLike },
  ): Promise<RouteOption[]>;
}

const MAX_DIRECTIONS_COORDINATES = 25;

export function createMapboxClient(options: MapboxClientOptions): MapboxClient {
  const { accessToken } = options;
  if (!accessToken) throw new MapboxError(0, "missing_token", "A Mapbox access token is required");
  const baseUrl = (options.baseUrl ?? "https://api.mapbox.com").replace(/\/+$/, "");
  const doFetch: FetchLike =
    options.fetch ??
    ((input, init) => (globalThis as unknown as { fetch: FetchLike }).fetch(input, init));

  const url = (path: string, params: Record<string, string | undefined>): string => {
    const pairs: string[] = [];
    for (const [k, v] of Object.entries({ ...params, access_token: accessToken })) {
      if (v) pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
    const query = pairs.join("&");
    return `${baseUrl}${path}?${query}`;
  };

  const get = async (target: string, signal?: AbortSignalLike): Promise<unknown> => {
    const res = await doFetch(target, signal ? { signal } : undefined);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const message = readString(body, "message") ?? `Mapbox request failed (${res.status})`;
      throw new MapboxError(res.status, readString(body, "code") ?? "http_error", message);
    }
    return body;
  };

  return {
    async searchPlaces(query, opts = {}) {
      const q = query.trim();
      if (q.length === 0) return [];
      const body = await get(
        url("/search/searchbox/v1/forward", {
          q: q.slice(0, 256),
          limit: String(Math.min(10, Math.max(1, opts.limit ?? 6))),
          proximity: opts.proximity ? `${opts.proximity[0]},${opts.proximity[1]}` : undefined,
          country: opts.country,
          language: options.language,
        }),
        opts.signal,
      );
      return parseFeatures(body);
    },

    async reverseGeocode(point, opts = {}) {
      const body = await get(
        url("/search/geocode/v6/reverse", {
          longitude: String(point[0]),
          latitude: String(point[1]),
          limit: "1",
          language: options.language,
        }),
        opts.signal,
      );
      return parseFeatures(body)[0] ?? null;
    },

    async directions(profile, coordinates, opts = {}) {
      if (coordinates.length < 2 || coordinates.length > MAX_DIRECTIONS_COORDINATES) {
        throw new MapboxError(0, "invalid_coordinates", "Directions need 2 to 25 coordinates");
      }
      const path = coordinates.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(";");
      const body = await get(
        url(`/directions/v5/mapbox/${profile}/${path}`, {
          geometries: "polyline6",
          overview: "full",
          steps: "false",
          alternatives: opts.alternatives ? "true" : "false",
        }),
        opts.signal,
      );
      const code = readString(body, "code");
      if (code !== "Ok") {
        throw new MapboxError(
          422,
          code ?? "no_route",
          readString(body, "message") ?? "No route found",
        );
      }
      const routes = isRecord(body) && Array.isArray(body["routes"]) ? body["routes"] : [];
      return routes.flatMap((route): RouteOption[] => {
        if (!isRecord(route)) return [];
        const geometry = route["geometry"];
        const distance = route["distance"];
        const duration = route["duration"];
        if (
          typeof geometry !== "string" ||
          typeof distance !== "number" ||
          typeof duration !== "number"
        ) {
          return [];
        }
        return [
          { coordinates: decodePolyline(geometry, 6), distanceM: distance, durationS: duration },
        ];
      });
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const v = value[key];
  return typeof v === "string" ? v : null;
}

function parseFeatures(body: unknown): PlaceResult[] {
  const features = isRecord(body) && Array.isArray(body["features"]) ? body["features"] : [];
  return features.flatMap((feature): PlaceResult[] => {
    if (!isRecord(feature) || !isRecord(feature["properties"])) return [];
    const p = feature["properties"];
    const coords = isRecord(p["coordinates"]) ? p["coordinates"] : null;
    const geometry = isRecord(feature["geometry"]) ? feature["geometry"] : null;
    const geomCoords: unknown[] | null =
      geometry && Array.isArray(geometry["coordinates"])
        ? (geometry["coordinates"] as unknown[])
        : null;
    const longitude: unknown =
      typeof coords?.["longitude"] === "number" ? coords["longitude"] : geomCoords?.[0];
    const latitude: unknown =
      typeof coords?.["latitude"] === "number" ? coords["latitude"] : geomCoords?.[1];
    const name = readString(p, "name");
    if (typeof longitude !== "number" || typeof latitude !== "number" || !name) return [];
    const address = readString(p, "full_address") ?? readString(p, "place_formatted");
    return [
      {
        id:
          readString(p, "mapbox_id") ??
          (typeof feature["id"] === "string" ? feature["id"] : `${longitude},${latitude}`),
        name,
        latitude,
        longitude,
        ...(address ? { address } : {}),
        featureType: readString(p, "feature_type") ?? "unknown",
        placeFormatted: readString(p, "place_formatted"),
      },
    ];
  });
}
