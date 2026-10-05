import type { Timeline } from "@wave/simulation-engine";
import type { LngLat } from "@wave/types";
import type { MapStop } from "@/components/map/types";

/** The whole journey as one line (segments joined without duplicate vertices). */
export function fullRoute(timeline: Timeline): LngLat[] {
  const out: LngLat[] = [];
  for (const seg of timeline.segments) {
    out.push(...(out.length > 0 ? seg.line.coordinates.slice(1) : seg.line.coordinates));
  }
  return out;
}

/** Start, waypoints and destination markers for a compiled journey. */
export function stopsFor(
  timeline: Timeline,
  segments: readonly { fromName: string; toName: string }[],
): MapStop[] {
  return [
    { kind: "start", name: segments[0]?.fromName ?? "Start", point: timeline.start },
    ...timeline.waypoints.map((w, i): MapStop => ({
      kind: "waypoint",
      name: segments[i]?.toName ?? "Stop",
      point: w.point,
    })),
    {
      kind: "destination",
      name: segments[segments.length - 1]?.toName ?? "Destination",
      point: timeline.end,
    },
  ];
}
