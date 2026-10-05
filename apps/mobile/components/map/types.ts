import type { LiveJourneyState } from "@wave/client";
import type { LngLat } from "@wave/types";

export interface MapStop {
  readonly kind: "start" | "waypoint" | "destination";
  readonly point: LngLat;
  readonly name: string;
}

export interface MapLine {
  readonly key: string;
  readonly coordinates: readonly LngLat[];
  /** Muted lines are unselected alternatives. */
  readonly muted?: boolean;
}

export interface WaveMapProps {
  /** Route the live marker travels along (drawn with a progress wake). */
  readonly journeyRoute?: readonly LngLat[];
  /** Additional lines, e.g. route alternatives in the builder. */
  readonly lines?: readonly MapLine[];
  readonly stops?: readonly MapStop[];
  /** Dropped pin for static locations. */
  readonly pin?: LngLat | null;
  /** Camera centre when there is no geometry to frame. */
  readonly center?: LngLat;
  readonly onPress?: (point: LngLat) => void;
  /** Screen space covered by panels, so geometry is framed in the visible area. */
  readonly insets?: { readonly top: number; readonly bottom: number };
  readonly showLiveMarker?: boolean;
}

export interface WaveMapHandle {
  /** Called every frame while a journey is live. */
  setLive(state: LiveJourneyState): void;
  recenter(): void;
}

export const DEFAULT_CENTER: LngLat = [72.5714, 23.0225];
