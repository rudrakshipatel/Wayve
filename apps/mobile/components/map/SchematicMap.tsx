import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Line, Path, Stop } from "react-native-svg";
import type { LiveJourneyState } from "@wave/client";
import type { LngLat } from "@wave/types";
import { useWaveColors } from "@/lib/theme";
import { DEFAULT_CENTER, type WaveMapHandle, type WaveMapProps } from "./types";

const GRID = 36;
const DEFAULT_SPAN_DEG = 0.05;

interface Projection {
  readonly project: (p: LngLat) => [number, number];
  readonly unproject: (x: number, y: number) => LngLat;
}

function fit(
  points: readonly LngLat[],
  w: number,
  h: number,
  top: number,
  bottom: number,
  center: LngLat,
): Projection {
  const pad = 32;
  const lats = points.map((p) => p[1]);
  const lngs = points.map((p) => p[0]);
  const hasGeometry = points.length > 1;
  const midLat = hasGeometry
    ? (Math.min(...lats) + Math.max(...lats)) / 2
    : (points[0] ?? center)[1];
  const k = Math.cos((midLat * Math.PI) / 180);
  let minX: number, maxX: number, minY: number, maxY: number;
  if (hasGeometry) {
    minX = Math.min(...lngs) * k;
    maxX = Math.max(...lngs) * k;
    minY = Math.min(...lats);
    maxY = Math.max(...lats);
  } else {
    const c = points[0] ?? center;
    minX = c[0] * k - DEFAULT_SPAN_DEG / 2;
    maxX = c[0] * k + DEFAULT_SPAN_DEG / 2;
    minY = c[1] - DEFAULT_SPAN_DEG / 2;
    maxY = c[1] + DEFAULT_SPAN_DEG / 2;
  }
  const availW = Math.max(1, w - pad * 2);
  const availH = Math.max(1, h - top - bottom - pad * 2);
  const scale = Math.min(
    availW / Math.max(maxX - minX, 1e-5),
    availH / Math.max(maxY - minY, 1e-5),
  );
  const offX = pad + (availW - (maxX - minX) * scale) / 2;
  const offY = top + pad + (availH - (maxY - minY) * scale) / 2;
  return {
    project: (p) => [offX + (p[0] * k - minX) * scale, offY + (maxY - p[1]) * scale],
    unproject: (x, y) => [((x - offX) / scale + minX) / k, maxY - (y - offY) / scale],
  };
}

const pathFor = (coords: readonly LngLat[], project: Projection["project"]): string =>
  coords
    .map((p, i) => {
      const [x, y] = project(p);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");

/** Nautical-chart style map drawn with SVG: the web build and the no-token fallback. */
export const SchematicMap = forwardRef<WaveMapHandle, WaveMapProps>(function SchematicMap(
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
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [live, setLive] = useState<LiveJourneyState | null>(null);
  const lastUpdate = useRef(0);

  const framed = useMemo(
    () => [
      ...(journeyRoute ?? []),
      ...lines.flatMap((l) => l.coordinates),
      ...stops.map((s) => s.point),
    ],
    [journeyRoute, lines, stops],
  );
  const projection = useMemo(
    () => fit(framed, size.w, size.h, insets?.top ?? 0, insets?.bottom ?? 0, center),
    [framed, size, insets?.top, insets?.bottom, center],
  );

  useImperativeHandle(
    ref,
    () => ({
      setLive(state) {
        const now = Date.now();
        if (now - lastUpdate.current < 33) return;
        lastUpdate.current = now;
        setLive(state);
      },
      recenter() {
        // The schematic always frames the whole journey.
      },
    }),
    [],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const routePath =
    journeyRoute && journeyRoute.length > 1 ? pathFor(journeyRoute, projection.project) : null;
  const routeLength = useMemo(() => {
    if (!journeyRoute) return 0;
    let total = 0;
    for (let i = 1; i < journeyRoute.length; i++) {
      const [x0, y0] = projection.project(journeyRoute[i - 1]!);
      const [x1, y1] = projection.project(journeyRoute[i]!);
      total += Math.hypot(x1 - x0, y1 - y0);
    }
    return total;
  }, [journeyRoute, projection]);
  const marker = live ? projection.project([live.sample.longitude, live.sample.latitude]) : null;
  const pinXY = pin ? projection.project(pin) : null;

  const gridLines = [];
  for (let x = 0; x < size.w; x += GRID)
    gridLines.push(
      <Line
        key={`x${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={size.h}
        stroke={colors.border}
        strokeWidth={1}
      />,
    );
  for (let y = 0; y < size.h; y += GRID)
    gridLines.push(
      <Line
        key={`y${y}`}
        x1={0}
        y1={y}
        x2={size.w}
        y2={y}
        stroke={colors.border}
        strokeWidth={1}
      />,
    );

  return (
    <View
      className="absolute inset-0 bg-bg"
      onLayout={onLayout}
      onStartShouldSetResponder={() => Boolean(onPress)}
      onResponderRelease={(e) => {
        onPress?.(projection.unproject(e.nativeEvent.locationX, e.nativeEvent.locationY));
      }}
      accessibilityLabel="Map"
    >
      {size.w > 0 && (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id="wake" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.primary} />
              <Stop offset="1" stopColor={colors.accent} />
            </LinearGradient>
          </Defs>
          <G opacity={0.55}>{gridLines}</G>
          {lines.map((l) =>
            l.coordinates.length > 1 ? (
              <G key={l.key}>
                <Path
                  d={pathFor(l.coordinates, projection.project)}
                  fill="none"
                  stroke={colors.surface}
                  strokeWidth={9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Path
                  d={pathFor(l.coordinates, projection.project)}
                  fill="none"
                  stroke={l.muted ? colors.textMuted : colors.primary}
                  strokeOpacity={l.muted ? 0.45 : 1}
                  strokeWidth={l.muted ? 4 : 5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </G>
            ) : null,
          )}
          {routePath && (
            <>
              <Path
                d={routePath}
                fill="none"
                stroke={colors.surface}
                strokeWidth={10}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d={routePath}
                fill="none"
                stroke={colors.textMuted}
                strokeWidth={3}
                strokeDasharray="1.5 7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d={routePath}
                fill="none"
                stroke="url(#wake)"
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${(live?.sample.progress ?? 0) * routeLength} ${routeLength + 1}`}
              />
            </>
          )}
          {stops.map((s, i) => {
            const [x, y] = projection.project(s.point);
            return s.kind === "destination" ? (
              <G key={`${s.kind}-${i}`}>
                <Circle
                  cx={x}
                  cy={y}
                  r={10}
                  fill={colors.surface}
                  stroke={colors.text}
                  strokeWidth={3}
                />
                <Circle cx={x} cy={y} r={3.5} fill={colors.text} />
              </G>
            ) : (
              <Circle
                key={`${s.kind}-${i}`}
                cx={x}
                cy={y}
                r={s.kind === "start" ? 6 : 5}
                fill={colors.surface}
                stroke={s.kind === "start" ? colors.primary : colors.textMuted}
                strokeWidth={2.5}
              />
            );
          })}
          {pinXY && (
            <G>
              <Circle cx={pinXY[0]} cy={pinXY[1]} r={20} fill={colors.accent} opacity={0.2} />
              <Circle
                cx={pinXY[0]}
                cy={pinXY[1]}
                r={9}
                fill={colors.primary}
                stroke={colors.surface}
                strokeWidth={3}
              />
            </G>
          )}
          {showLiveMarker && marker && live && (
            <G>
              <Circle
                cx={marker[0]}
                cy={marker[1]}
                r={18}
                fill={live.status === "paused" ? colors.warning : colors.accent}
                opacity={0.22}
              />
              <G transform={`rotate(${live.sample.heading.toFixed(1)} ${marker[0]} ${marker[1]})`}>
                <Path
                  d={`M${marker[0]},${marker[1] - 19} L${marker[0] + 6},${marker[1] - 11} L${marker[0] - 6},${marker[1] - 11} Z`}
                  fill={colors.primary}
                />
              </G>
              <Circle
                cx={marker[0]}
                cy={marker[1]}
                r={9}
                fill="url(#wake)"
                stroke={colors.surface}
                strokeWidth={3}
              />
            </G>
          )}
        </Svg>
      )}
    </View>
  );
});
