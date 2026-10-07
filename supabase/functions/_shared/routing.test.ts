import { describe, expect, it } from "vitest";
import { haversineDistance } from "@wave/map-utils";
import { routeOptions } from "./routing.ts";

describe("routeOptions without Mapbox", () => {
  it("falls back to a direct path so journeys can still be simulated", async () => {
    const from = { latitude: 23.0225, longitude: 72.5714 };
    const to = { latitude: 23.2156, longitude: 72.6369 };
    const [option, ...rest] = await routeOptions(null, from, to, "driving");
    expect(rest).toHaveLength(0);
    expect(option!.coordinates.length).toBeGreaterThan(50);
    expect(option!.coordinates[0]).toEqual([72.5714, 23.0225]);
    expect(option!.distanceM).toBeCloseTo(haversineDistance([72.5714, 23.0225], [72.6369, 23.2156]), 0);
  });
});
