import Mapbox, {
  Camera,
  CircleLayer,
  LineLayer,
  MapView,
  ShapeSource,
  type LineLayerStyle,
} from "@rnmapbox/maps";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import type { LiveJourneyState } from "@wave/client";
import { boundingBox } from "@wave/map-utils";
import type { LngLat } from "@wave/types";
import { env } from "@/lib/env";
import { useWaveColors } from "@/lib/theme";
import { SchematicMap } from "./SchematicMap";
import { DEFAULT_CENTER, type WaveMapHandle, type WaveMapProps } from "./types";

if (env.mapboxToken) void Mapbox.setAccessToken(env.mapboxToken);

const MARKER_FPS = 30;

const lineFeature = (coords: readonly LngLat[]): GeoJSON.Feature<GeoJSON.LineString> => ({
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: coords.map((c) => [c[0], c[1]]) },
});

/** Native Mapbox map; falls back to the schematic map when no token is configured. */
export const WaveMap = forwardRef<WaveMapHandle, WaveMapProps>(function WaveMap(props, ref) {
  if (!env.mapboxToken) return <SchematicMap ref={ref} {...props} />;
  return <NativeMap ref={ref} {...props} />;
});

const NativeMap = forwardRef<WaveMapHandle, WaveMapProps>(function NativeMap(
  {
    journeyRoute,
    lines = [],
    stops = [],
    pin,
    center = DEFAULT_CENTER,
    onPress,
    insets,
    showLiveMarker,
  },
  ref,
) {
  const colors = useWaveColors();
  const camera = useRef<Camera>(null);
  const [live, setLive] = useState<LiveJourneyState | null>(null);
  const lastUpdate = useRef(0);
  const padding = {
    paddingTop: (insets?.top ?? 0) + 40,
    paddingBottom: (insets?.bottom ?? 0) + 40,
    paddingLeft: 40,
    paddingRight: 40,
  };

  const framed = useMemo(
    () => [
      ...(journeyRoute ?? []),
      ...lines.flatMap((l) => l.coordinates),
      ...stops.map((s) => s.point),
    ],
    [journeyRoute, lines, stops],
  );
  const bounds = framed.length > 1 ? boundingBox(framed) : null;

  useImperativeHandle(
    ref,
    () => ({
      setLive(state) {
        const now = Date.now();
        if (now - lastUpdate.current < 1000 / MARKER_FPS) return;
        lastUpdate.current = now;
        setLive(state);
      },
      recenter() {
        if (!live) return;
        camera.current?.setCamera({
          centerCoordinate: [live.sample.longitude, live.sample.latitude],
          zoomLevel: 14,
          padding,
          animationDuration: 700,
        });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- padding derives from insets
    [live, insets?.top, insets?.bottom],
  );

  const progress = Math.min(0.9999, Math.max(0.0001, live?.sample.progress ?? 0));
  const wakeGradient: NonNullable<LineLayerStyle["lineGradient"]> = [
    "interpolate",
    ["linear"],
    ["line-progress"],
    0,
    colors.primary,
    progress,
    colors.accent,
    Math.min(1, progress + 0.00001),
    "rgba(0,0,0,0)",
  ];

  return (
    <View className="absolute inset-0">
      <MapView
        style={{ flex: 1 }}
        styleURL={colors.scheme === "dark" ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Light}
        scaleBarEnabled={false}
        pitchEnabled={false}
        onPress={(feature) => {
          if (onPress) {
            const [lng, lat] = feature.geometry.coordinates as [number, number];
            onPress([lng, lat]);
          }
        }}
      >
        <Camera
          ref={camera}
          {...(bounds
            ? {
                bounds: {
                  ne: [bounds.east, bounds.north],
                  sw: [bounds.west, bounds.south],
                  ...padding,
                },
              }
            : { centerCoordinate: [...(pin ?? center)], zoomLevel: 13 })}
          animationDuration={600}
        />
        {lines.map((l) =>
          l.coordinates.length > 1 ? (
            <ShapeSource key={l.key} id={`line-${l.key}`} shape={lineFeature(l.coordinates)}>
              <LineLayer
                id={`line-casing-${l.key}`}
                style={{
                  lineColor: colors.surface,
                  lineWidth: 9,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
              <LineLayer
                id={`line-${l.key}`}
                style={{
                  lineColor: l.muted ? colors.textMuted : colors.primary,
                  lineOpacity: l.muted ? 0.45 : 1,
                  lineWidth: l.muted ? 4 : 5,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </ShapeSource>
          ) : null,
        )}
        {journeyRoute && journeyRoute.length > 1 && (
          <ShapeSource id="journey" shape={lineFeature(journeyRoute)} lineMetrics>
            <LineLayer
              id="journey-casing"
              style={{
                lineColor: colors.surface,
                lineWidth: 10,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            <LineLayer
              id="journey-ahead"
              style={{
                lineColor: colors.textMuted,
                lineWidth: 3,
                lineDasharray: [0.4, 2],
                lineCap: "round",
              }}
            />
            <LineLayer
              id="journey-wake"
              style={{
                lineWidth: 6,
                lineGradient: wakeGradient,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </ShapeSource>
        )}
        <ShapeSource
          id="stops"
          shape={{
            type: "FeatureCollection",
            features: stops.map((s) => ({
              type: "Feature",
              properties: { kind: s.kind },
              geometry: { type: "Point", coordinates: [s.point[0], s.point[1]] },
            })),
          }}
        >
          <CircleLayer
            id="stops-circle"
            style={{
              circleRadius: ["match", ["get", "kind"], "destination", 9, 6],
              circleColor: colors.surface,
              circleStrokeWidth: ["match", ["get", "kind"], "destination", 4, 3],
              circleStrokeColor: [
                "match",
                ["get", "kind"],
                "destination",
                colors.text,
                "start",
                colors.primary,
                colors.textMuted,
              ],
            }}
          />
        </ShapeSource>
        {pin && (
          <ShapeSource
            id="pin"
            shape={{
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: [pin[0], pin[1]] },
            }}
          >
            <CircleLayer
              id="pin-halo"
              style={{ circleRadius: 20, circleColor: colors.accent, circleOpacity: 0.2 }}
            />
            <CircleLayer
              id="pin-dot"
              style={{
                circleRadius: 9,
                circleColor: colors.primary,
                circleStrokeColor: colors.surface,
                circleStrokeWidth: 3,
              }}
            />
          </ShapeSource>
        )}
        {showLiveMarker && live && (
          <ShapeSource
            id="marker"
            shape={{
              type: "Feature",
              properties: {},
              geometry: {
                type: "Point",
                coordinates: [live.sample.longitude, live.sample.latitude],
              },
            }}
          >
            <CircleLayer
              id="marker-halo"
              style={{
                circleRadius: 18,
                circleColor: live.status === "paused" ? colors.warning : colors.accent,
                circleOpacity: 0.22,
              }}
            />
            <CircleLayer
              id="marker-dot"
              style={{
                circleRadius: 9,
                circleColor: colors.primary,
                circleStrokeColor: colors.surface,
                circleStrokeWidth: 3,
              }}
            />
          </ShapeSource>
        )}
      </MapView>
    </View>
  );
});
