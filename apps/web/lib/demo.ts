import { interpolate, haversineDistance } from "@wave/map-utils";
import type { JourneyStatus, LngLat, PublicJourneyView, SessionClock } from "@wave/types";

/** Hand-drawn Ahmedabad → Gandhinagar corridor, densified so the marker follows curves. */
const CORRIDOR: LngLat[] = [
  [72.5714, 23.0225],
  [72.5622, 23.0331],
  [72.5531, 23.0467],
  [72.5402, 23.0615],
  [72.5308, 23.0802],
  [72.5297, 23.0991],
  [72.5361, 23.1204],
  [72.5489, 23.1417],
  [72.5652, 23.1648],
  [72.5826, 23.1803],
  [72.6004, 23.1951],
  [72.6188, 23.2072],
  [72.6369, 23.2156],
];

function densify(points: readonly LngLat[], stepM = 120): LngLat[] {
  const out: LngLat[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const n = Math.max(1, Math.round(haversineDistance(a, b) / stepM));
    for (let k = 1; k <= n; k++) {
      const p = interpolate(a, b, k / n);
      out.push([Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6]);
    }
  }
  return out;
}

const route = densify(CORRIDOR);
const split = Math.floor(route.length * 0.42);

/**
 * A self-contained shared journey for previews and visual QA (`/journey/demo`).
 * `?state=` selects active | paused | scheduled | completed | static.
 */
export function demoJourney(state: string | null, nowMs: number): PublicJourneyView {
  const isStatic = state === "static";
  const status: JourneyStatus =
    state === "paused" || state === "scheduled" || state === "completed" ? state : "active";
  const segments: PublicJourneyView["segments"] = isStatic
    ? [
        {
          fromName: "Sabarmati Riverfront",
          toName: "Sabarmati Riverfront",
          travelMode: "walking",
          targetSpeedKmh: null,
          durationS: null,
          pauseAfterS: 0,
          coordinates: [[72.5797, 23.0396]],
        },
      ]
    : [
        {
          fromName: "Ahmedabad",
          toName: "Thaltej",
          travelMode: "driving",
          targetSpeedKmh: 42,
          durationS: null,
          pauseAfterS: 45,
          coordinates: route.slice(0, split + 1),
        },
        {
          fromName: "Thaltej",
          toName: "Gandhinagar",
          travelMode: "driving",
          targetSpeedKmh: 55,
          durationS: null,
          pauseAfterS: 0,
          coordinates: route.slice(split),
        },
      ];
  // Clock anchors chosen so the marker is mid-route when the page opens.
  const clock: SessionClock = {
    status,
    anchorWallMs: status === "scheduled" ? nowMs + 25 * 60_000 : nowMs,
    anchorSimMs:
      status === "completed" ? Number.MAX_SAFE_INTEGER : status === "scheduled" ? 0 : 14 * 60_000,
    rate: 1,
    revision: 1,
  };
  return {
    title: isStatic ? "Sabarmati Riverfront" : "Ahmedabad → Gandhinagar",
    kind: isStatic ? "static" : "journey",
    status,
    seed: "wave-demo",
    engineVersion: "1",
    planVersion: 1,
    segments,
    totalDistanceM: 0,
    totalDurationMs: 0,
    scheduledStartAt: status === "scheduled" ? new Date(clock.anchorWallMs).toISOString() : null,
    startedAt:
      status === "active" || status === "paused"
        ? new Date(nowMs - 14 * 60_000).toISOString()
        : null,
    endedAt: null,
    clock,
    realtimeTopic: "share:demo",
    expiresAt: new Date(nowMs + 86_400_000).toISOString(),
    serverTimeMs: nowMs,
  };
}
