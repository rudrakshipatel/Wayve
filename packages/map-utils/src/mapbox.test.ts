import { describe, expect, it } from "vitest";
import { createMapboxClient, MapboxError, type FetchLike } from "./mapbox.ts";
import { encodePolyline } from "./polyline.ts";

function fakeFetch(status: number, body: unknown) {
  const calls: string[] = [];
  const fetch: FetchLike = (input) => {
    calls.push(input);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  };
  return { fetch, calls };
}

const feature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [72.5714, 23.0225] },
  properties: {
    mapbox_id: "dXJuOm1ieHBsYzpBaG1lZGFiYWQ",
    feature_type: "place",
    name: "Ahmedabad",
    full_address: "Ahmedabad, Gujarat, India",
    place_formatted: "Gujarat, India",
    coordinates: { longitude: 72.5714, latitude: 23.0225 },
  },
};

describe("createMapboxClient", () => {
  it("requires a token", () => {
    expect(() => createMapboxClient({ accessToken: "" })).toThrow(MapboxError);
  });

  it("searches places and parses features", async () => {
    const { fetch, calls } = fakeFetch(200, {
      type: "FeatureCollection",
      features: [feature, { properties: {} }],
    });
    const client = createMapboxClient({ accessToken: "pk.test", fetch, language: "en" });
    const results = await client.searchPlaces("  ahmedabad ", { proximity: [72.5, 23], limit: 3 });
    expect(results).toEqual([
      {
        id: "dXJuOm1ieHBsYzpBaG1lZGFiYWQ",
        name: "Ahmedabad",
        latitude: 23.0225,
        longitude: 72.5714,
        address: "Ahmedabad, Gujarat, India",
        featureType: "place",
        placeFormatted: "Gujarat, India",
      },
    ]);
    const url = new URL(calls[0]!);
    expect(url.pathname).toBe("/search/searchbox/v1/forward");
    expect(url.searchParams.get("q")).toBe("ahmedabad");
    expect(url.searchParams.get("proximity")).toBe("72.5,23");
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.get("access_token")).toBe("pk.test");
  });

  it("skips empty searches without a request", async () => {
    const { fetch, calls } = fakeFetch(200, {});
    expect(await createMapboxClient({ accessToken: "pk", fetch }).searchPlaces("   ")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("reverse geocodes", async () => {
    const { fetch, calls } = fakeFetch(200, { features: [feature] });
    const place = await createMapboxClient({ accessToken: "pk", fetch }).reverseGeocode([
      72.5714, 23.0225,
    ]);
    expect(place?.name).toBe("Ahmedabad");
    expect(new URL(calls[0]!).pathname).toBe("/search/geocode/v6/reverse");
  });

  it("fetches and decodes directions", async () => {
    const coords = [
      [72.5714, 23.0225],
      [72.6, 23.1],
      [72.6369, 23.2156],
    ] as const;
    const { fetch, calls } = fakeFetch(200, {
      code: "Ok",
      routes: [
        { geometry: encodePolyline(coords), distance: 25_000, duration: 1800 },
        { geometry: encodePolyline([coords[0], coords[2]]), distance: 27_000, duration: 1900 },
      ],
    });
    const routes = await createMapboxClient({ accessToken: "pk", fetch }).directions(
      "driving-traffic",
      [coords[0], coords[2]],
      { alternatives: true },
    );
    expect(routes).toHaveLength(2);
    expect(routes[0]!.coordinates).toEqual(coords);
    expect(routes[0]!.distanceM).toBe(25_000);
    const url = new URL(calls[0]!);
    expect(url.pathname).toBe(
      "/directions/v5/mapbox/driving-traffic/72.571400,23.022500;72.636900,23.215600",
    );
    expect(url.searchParams.get("geometries")).toBe("polyline6");
    expect(url.searchParams.get("alternatives")).toBe("true");
  });

  it("maps NoRoute and HTTP errors", async () => {
    const noRoute = fakeFetch(200, { code: "NoRoute", message: "No route found" });
    await expect(
      createMapboxClient({ accessToken: "pk", fetch: noRoute.fetch }).directions("walking", [
        [0, 0],
        [1, 1],
      ]),
    ).rejects.toMatchObject({ code: "NoRoute", status: 422 });

    const unauthorized = fakeFetch(401, { message: "Not Authorized - Invalid Token" });
    await expect(
      createMapboxClient({ accessToken: "pk", fetch: unauthorized.fetch }).searchPlaces("x"),
    ).rejects.toMatchObject({ status: 401, message: "Not Authorized - Invalid Token" });

    await expect(
      createMapboxClient({ accessToken: "pk", fetch: unauthorized.fetch }).directions("walking", [
        [0, 0],
      ]),
    ).rejects.toMatchObject({ code: "invalid_coordinates" });
  });
});
