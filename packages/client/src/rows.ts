import type { JourneyStatus, LngLat, LocationFolderKind, TravelMode } from "@wave/types";

/** Row shapes as returned by PostgREST (snake_case). */
export interface JourneyRow {
  readonly id: string;
  readonly kind: "journey" | "static";
  readonly title: string;
  readonly status: JourneyStatus;
  readonly seed: string;
  readonly travel_modes: TravelMode[];
  readonly total_distance_m: number;
  readonly total_duration_ms: number;
  readonly scheduled_start_at: string | null;
  readonly started_at: string | null;
  readonly ended_at: string | null;
  readonly source_journey_id: string | null;
  readonly created_at: string;
}

export interface JourneySegmentRow {
  readonly position: number;
  readonly from_name: string;
  readonly from_latitude: number;
  readonly from_longitude: number;
  readonly to_name: string;
  readonly to_latitude: number;
  readonly to_longitude: number;
  readonly travel_mode: TravelMode;
  readonly target_speed_kmh: number | null;
  readonly duration_s: number | null;
  readonly pause_after_s: number;
}

export interface JourneyRouteRow {
  readonly plan_version: number;
  readonly engine_version: string;
  readonly segments: { coordinates: LngLat[]; distanceM: number }[];
  readonly distance_m: number;
  readonly duration_ms: number;
  readonly waypoint_arrivals_ms: number[];
}

export interface JourneySessionRow {
  readonly status: JourneyStatus;
  readonly anchor_wall_at: string;
  readonly anchor_sim_ms: number;
  readonly rate: number;
  readonly revision: number;
}

export interface SavedLocationRow {
  readonly id: string;
  readonly folder_id: string | null;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly address: string | null;
  readonly created_at: string;
}

export interface LocationFolderRow {
  readonly id: string;
  readonly name: string;
  readonly kind: LocationFolderKind;
  readonly sort_order: number;
}

export interface ShareLinkRow {
  readonly id: string;
  readonly token_prefix: string;
  readonly expires_at: string;
  readonly revoked_at: string | null;
  readonly view_count: number;
  readonly created_at: string;
}
