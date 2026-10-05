"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { LngLat } from "@wave/types";
import type { JourneyMapHandle, JourneyMapProps } from "./types";

const SIZE = 1000;
const PAD = 40;

/** Equirectangular projection fitted to the route; accurate enough at city scale. */
function useProjection(points: readonly LngLat[]) {
  return useMemo(() => {
    const lats = points.map((p) => p[1]);
    const lngs = points.map((p) => p[0]);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const k = Math.cos((midLat * Math.PI) / 180);
    const minX = Math.min(...lngs) * k;
    const maxX = Math.max(...lngs) * k;
    const minY = Math.min(...lats);
    const maxY = Math.max(...lats);
    const span = Math.max(maxX - minX, maxY - minY, 0.004);
    const scale = (SIZE - PAD * 2) / span;
    const offX = (SIZE - (maxX - minX) * scale) / 2;
    const offY = (SIZE - (maxY - minY) * scale) / 2;
    return (p: LngLat): [number, number] => [
      offX + (p[0] * k - minX) * scale,
      SIZE - (offY + (p[1] - minY) * scale),
    ];
  }, [points]);
}

/**
 * Map fallback when no Mapbox token is configured: the route drawn on a nautical-chart
 * grid. Same props and per-frame handle as the Mapbox map.
 */
export const SchematicMap = forwardRef<JourneyMapHandle, JourneyMapProps>(function SchematicMap(
  { route, stops, isStatic, insets },
  ref,
) {
  const project = useProjection(route.length > 0 ? route : stops.map((s) => s.point));
  const d = useMemo(
    () =>
      route
        .map((p, i) => {
          const [x, y] = project(p);
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(""),
    [route, project],
  );
  const svg = useRef<SVGSVGElement>(null);
  // SVG units per CSS pixel, so strokes and markers keep a constant on-screen size.
  const [u, setU] = useState(1);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setU(SIZE / Math.min(width, height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);
  const travelled = useRef<SVGPathElement>(null);
  const marker = useRef<SVGGElement>(null);
  const heading = useRef<SVGGElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      update({ sample, status }) {
        const [x, y] = project([sample.longitude, sample.latitude]);
        marker.current?.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
        heading.current?.setAttribute("transform", `rotate(${sample.heading.toFixed(1)})`);
        marker.current?.setAttribute("data-paused", String(status === "paused"));
        travelled.current?.setAttribute("stroke-dasharray", `${sample.progress.toFixed(5)} 1`);
      },
      recenter() {
        // The schematic always shows the whole route.
      },
    }),
    [project],
  );

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-bg"
      aria-label="Journey map"
      role="img"
      style={{
        backgroundImage:
          "linear-gradient(var(--wave-border) 1px, transparent 1px), linear-gradient(90deg, var(--wave-border) 1px, transparent 1px)",
        backgroundSize: "36px 36px",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(75% 65% at 55% 40%, transparent 55%, var(--wave-bg) 100%)",
        }}
      />
      <svg
        ref={svg}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute overflow-visible transition-[inset] duration-300"
        style={{
          top: insets.top + 12,
          right: insets.right + 12,
          bottom: insets.bottom + 12,
          left: insets.left + 12,
          width: `calc(100% - ${insets.left + insets.right + 24}px)`,
          height: `calc(100% - ${insets.top + insets.bottom + 24}px)`,
        }}
      >
        <defs>
          <linearGradient id="wake" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--wave-tide)" />
            <stop offset="1" stopColor="var(--wave-surf)" />
          </linearGradient>
        </defs>
        {!isStatic && (
          <>
            <path
              d={d}
              fill="none"
              stroke="var(--wave-surface-solid)"
              strokeWidth={10 * u}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={d}
              fill="none"
              stroke="var(--wave-route-ahead)"
              strokeWidth={3 * u}
              strokeDasharray={`${1.5 * u} ${7 * u}`}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              ref={travelled}
              d={d}
              pathLength={1}
              strokeDasharray="0 1"
              fill="none"
              stroke="url(#wake)"
              strokeWidth={5 * u}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        {stops.map((stop) => {
          const [x, y] = project(stop.point);
          if (stop.kind === "destination") {
            return (
              <g key={`${stop.kind}-${stop.name}`} transform={`translate(${x} ${y})`}>
                <circle
                  r={10 * u}
                  fill="var(--wave-surface-solid)"
                  stroke="var(--wave-text)"
                  strokeWidth={3 * u}
                />
                <circle r={3.5 * u} fill="var(--wave-text)" />
              </g>
            );
          }
          return (
            <circle
              key={`${stop.kind}-${stop.name}`}
              cx={x}
              cy={y}
              r={(stop.kind === "start" ? 6 : 5) * u}
              fill="var(--wave-surface-solid)"
              stroke={stop.kind === "start" ? "var(--wave-tide)" : "var(--wave-muted)"}
              strokeWidth={2.5 * u}
            />
          );
        })}
        <g ref={marker} data-paused="false">
          <circle r={20 * u} fill="var(--wave-surf)" opacity="0.18">
            <animate
              attributeName="r"
              values={`${12 * u};${24 * u};${12 * u}`}
              dur="2.4s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.35;0;0.35"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </circle>
          <g ref={heading}>
            {!isStatic && (
              <path
                d={`M0,${-19 * u} L${6 * u},${-11 * u} L${-6 * u},${-11 * u} Z`}
                fill="var(--wave-tide)"
              />
            )}
          </g>
          <circle
            r={9 * u}
            fill="url(#wake)"
            stroke="var(--wave-surface-solid)"
            strokeWidth={3 * u}
          />
        </g>
      </svg>
    </div>
  );
});
