/** GeoJSON ordering: [longitude, latitude]. Used for polylines and route geometry. */
export type LngLat = readonly [lng: number, lat: number];

/** Named-field coordinate used in UI and simulation output. */
export interface Coordinate {
  readonly latitude: number;
  readonly longitude: number;
}

export interface Place extends Coordinate {
  readonly name: string;
  readonly address?: string;
}

export interface BoundingBox {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}
