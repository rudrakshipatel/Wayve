export const TRAVEL_MODES = ["walking", "cycling", "driving", "bus", "train"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

export const TRAVEL_MODE_LABELS: Readonly<Record<TravelMode, string>> = {
  walking: "Walking",
  cycling: "Cycling",
  driving: "Driving",
  bus: "Bus",
  train: "Train",
};

/** Mapbox Directions profile used to fetch geometry for each mode. */
export const TRAVEL_MODE_ROUTING_PROFILE: Readonly<
  Record<TravelMode, "walking" | "cycling" | "driving" | "driving-traffic">
> = {
  walking: "walking",
  cycling: "cycling",
  driving: "driving-traffic",
  bus: "driving",
  // Mapbox has no rail profile; train journeys follow a driving route unless the
  // user draws one. The movement profile still models rail behaviour.
  train: "driving",
};

/** Allowed user-selectable cruise speed range per mode (km/h). */
export const TRAVEL_MODE_SPEED_LIMITS_KMH: Readonly<
  Record<TravelMode, { readonly min: number; readonly max: number; readonly default: number }>
> = {
  walking: { min: 1, max: 12, default: 5 },
  cycling: { min: 3, max: 60, default: 18 },
  driving: { min: 5, max: 200, default: 50 },
  bus: { min: 5, max: 120, default: 30 },
  train: { min: 10, max: 350, default: 90 },
};
