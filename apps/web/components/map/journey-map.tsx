"use client";

import { forwardRef } from "react";
import { publicEnv } from "@/lib/env";
import { MapboxJourneyMap } from "./mapbox-map";
import { SchematicMap } from "./schematic-map";
import type { JourneyMapHandle, JourneyMapProps } from "./types";

export const JourneyMap = forwardRef<JourneyMapHandle, JourneyMapProps>(
  function JourneyMap(props, ref) {
    return publicEnv.mapboxToken ? (
      <MapboxJourneyMap ref={ref} token={publicEnv.mapboxToken} {...props} />
    ) : (
      <SchematicMap ref={ref} {...props} />
    );
  },
);

export type { JourneyMapHandle, MapStop } from "./types";
