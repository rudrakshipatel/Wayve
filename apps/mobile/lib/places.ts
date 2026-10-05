import { createMapboxClient, type MapboxClient } from "@wave/map-utils";
import { env } from "./env";

let client: MapboxClient | null = null;

/** Place search with the public, platform-restricted Mapbox token. */
export function getPlacesClient(): MapboxClient | null {
  if (!env.mapboxToken) return null;
  client ??= createMapboxClient({ accessToken: env.mapboxToken });
  return client;
}
