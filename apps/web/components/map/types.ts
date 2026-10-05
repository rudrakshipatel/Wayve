import type { LiveJourneyState } from "@wave/client";
import type { LngLat } from "@wave/types";

export interface MapStop {
  readonly kind: "start" | "waypoint" | "destination";
  readonly name: string;
  readonly point: LngLat;
}

/** Screen area covered by UI (px); the map frames the route inside the rest. */
export interface MapInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface JourneyMapProps {
  readonly route: readonly LngLat[];
  readonly stops: readonly MapStop[];
  readonly isStatic: boolean;
  readonly insets: MapInsets;
}

/** Imperative per-frame updates; avoids React renders at 60 fps. */
export interface JourneyMapHandle {
  update(state: LiveJourneyState): void;
  recenter(): void;
}
