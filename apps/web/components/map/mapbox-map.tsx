"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import { boundingBox } from "@wave/map-utils";
import type { JourneyMapHandle, JourneyMapProps } from "./types";

const FOLLOW_INTERVAL_MS = 1200;
const GRADIENT_INTERVAL_MS = 100;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Mapbox GL map with a gradient "wake" behind the marker and a dashed route ahead. */
export const MapboxJourneyMap = forwardRef<
  JourneyMapHandle,
  JourneyMapProps & { readonly token: string }
>(function MapboxJourneyMap({ route, stops, isStatic, insets, token }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const markerEl = useRef<HTMLDivElement | null>(null);
  const headingEl = useRef<HTMLDivElement | null>(null);
  const follow = useRef(true);
  const lastFollow = useRef(0);
  const lastGradient = useRef(0);
  const ready = useRef(false);
  const insetsRef = useRef(insets);
  insetsRef.current = insets;

  useEffect(() => {
    let disposed = false;
    void import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (disposed || !container.current) return;
      mapboxgl.accessToken = token;
      const bounds = boundingBox(route.length > 0 ? route : stops.map((s) => s.point));
      const m = new mapboxgl.Map({
        container: container.current,
        style: prefersDark()
          ? "mapbox://styles/mapbox/dark-v11"
          : "mapbox://styles/mapbox/light-v11",
        bounds: [
          [bounds.west, bounds.south],
          [bounds.east, bounds.north],
        ],
        fitBoundsOptions: { padding: framePadding(insetsRef.current), maxZoom: 15 },
        attributionControl: true,
        cooperativeGestures: false,
        pitchWithRotate: false,
      });
      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.current = m;

      const el = document.createElement("div");
      el.className = "wave-marker";
      el.innerHTML =
        '<div class="wave-marker__halo"></div><div class="wave-marker__heading"></div><div class="wave-marker__dot"></div>';
      if (isStatic) el.querySelector(".wave-marker__heading")?.remove();
      markerEl.current = el;
      headingEl.current = el.querySelector<HTMLDivElement>(".wave-marker__heading");
      const start = route[0] ?? stops[0]?.point ?? [0, 0];
      marker.current = new mapboxgl.Marker({ element: el })
        .setLngLat([start[0], start[1]])
        .addTo(m);

      for (const stop of stops) {
        if (stop.kind === "start" && isStatic) continue;
        const pin = document.createElement("div");
        pin.className =
          stop.kind === "destination"
            ? "h-5 w-5 rounded-full border-[5px] border-[var(--wave-text)] bg-[var(--wave-surface-solid)] shadow-lg"
            : "h-3.5 w-3.5 rounded-full border-[3px] border-[var(--wave-tide)] bg-[var(--wave-surface-solid)]";
        pin.title = stop.name;
        new mapboxgl.Marker({ element: pin }).setLngLat([stop.point[0], stop.point[1]]).addTo(m);
      }

      m.on("dragstart", () => {
        follow.current = false;
      });
      m.on("load", () => {
        if (!isStatic && route.length > 1) {
          m.addSource("route", {
            type: "geojson",
            lineMetrics: true,
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: route.map((p) => [p[0], p[1]]) },
            },
          });
          m.addLayer({
            id: "route-casing",
            type: "line",
            source: "route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": cssVar("--wave-surface-solid"), "line-width": 10 },
          });
          m.addLayer({
            id: "route-ahead",
            type: "line",
            source: "route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": cssVar("--wave-route-ahead"),
              "line-width": 4,
              "line-dasharray": [0.4, 2],
            },
          });
          m.addLayer({
            id: "route-wake",
            type: "line",
            source: "route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-width": 6, "line-gradient": wakeGradient(0) },
          });
        }
        ready.current = true;
      });
    });
    return () => {
      disposed = true;
      ready.current = false;
      map.current?.remove();
      map.current = null;
    };
  }, [route, stops, isStatic, token]);

  useImperativeHandle(
    ref,
    () => ({
      update({ sample, status }) {
        const m = map.current;
        if (!m || !marker.current) return;
        const lngLat: [number, number] = [sample.longitude, sample.latitude];
        marker.current.setLngLat(lngLat);
        markerEl.current?.setAttribute("data-paused", String(status === "paused"));
        if (headingEl.current) {
          const bearing = sample.heading - m.getBearing();
          headingEl.current.style.transform = `rotate(${bearing.toFixed(1)}deg)`;
        }
        const now = performance.now();
        if (ready.current && !isStatic && now - lastGradient.current > GRADIENT_INTERVAL_MS) {
          lastGradient.current = now;
          if (m.getLayer("route-wake"))
            m.setPaintProperty("route-wake", "line-gradient", wakeGradient(sample.progress));
        }
        if (
          follow.current &&
          now - lastFollow.current > FOLLOW_INTERVAL_MS &&
          status === "active"
        ) {
          lastFollow.current = now;
          if (!m.getBounds()?.contains(lngLat)) m.easeTo({ center: lngLat, duration: 900 });
        }
      },
      recenter() {
        follow.current = true;
        const pos = marker.current?.getLngLat();
        if (pos) {
          map.current?.easeTo({
            center: pos,
            zoom: Math.max(map.current.getZoom(), 13),
            padding: framePadding(insetsRef.current),
            duration: 700,
          });
        }
      },
    }),
    [isStatic],
  );

  return <div ref={container} className="absolute inset-0" aria-label="Journey map" />;
});

function framePadding(insets: JourneyMapProps["insets"]) {
  return {
    top: insets.top + 48,
    right: insets.right + 48,
    bottom: insets.bottom + 48,
    left: insets.left + 48,
  };
}

function wakeGradient(progress: number): mapboxgl.ExpressionSpecification {
  const p = Math.min(0.9999, Math.max(0.0001, progress));
  const tide = cssVar("--wave-tide");
  const surf = cssVar("--wave-surf");
  return [
    "interpolate",
    ["linear"],
    ["line-progress"],
    0,
    tide,
    p,
    surf,
    Math.min(1, p + 0.00001),
    "rgba(0,0,0,0)",
  ];
}
