import * as Location from "expo-location";
import { useEffect, useState } from "react";
import type { LngLat } from "@wave/types";
import { DEFAULT_CENTER } from "@/components/map/types";

/**
 * Centres maps near the user (when they allow it) so picking places is quick.
 * The real location is only used for the camera — never stored, shared or simulated.
 */
export function useDeviceCenter(): LngLat {
  const [center, setCenter] = useState<LngLat>(DEFAULT_CENTER);
  useEffect(() => {
    const state = { cancelled: false };
    void (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== Location.PermissionStatus.GRANTED) return;
        const pos = await Location.getLastKnownPositionAsync();
        if (pos !== null && !state.cancelled)
          setCenter([pos.coords.longitude, pos.coords.latitude]);
      } catch {
        // Keep the default centre.
      }
    })();
    return () => {
      state.cancelled = true;
    };
  }, []);
  return center;
}
