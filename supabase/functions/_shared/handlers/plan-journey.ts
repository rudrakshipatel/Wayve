import { encodePolyline } from "@wave/map-utils";
import { buildTimeline, ENGINE_VERSION, type SegmentPlanInput } from "@wave/simulation-engine";
import { generateSeed, planRequestSchema, type LngLat, type PlanJourneyResult } from "@wave/types";
import { badRequest, fromZod } from "../errors.ts";
import { enforceRateLimit, RATE_LIMITS, requireUser, type Handler } from "../context.ts";
import type { PlannedJourneyRecord, PlannedSegmentRecord } from "../repository.ts";
import { roundCoordinate, routeOptions } from "../routing.ts";

/**
 * Plans a journey server-side: fetches routes, compiles the timeline with the shared
 * simulation engine and persists everything. The server is authoritative for route,
 * distance and duration.
 */
export const planJourney: Handler<PlanJourneyResult> = async (ctx, body) => {
  const userId = requireUser(ctx);
  const parsed = planRequestSchema.safeParse(body);
  if (!parsed.success) throw fromZod(parsed.error);
  await enforceRateLimit(ctx, RATE_LIMITS.plan, userId);
  const input = parsed.data;

  let segments: PlannedSegmentRecord[];
  let geometries: LngLat[][];
  if (input.kind === "static") {
    const { location } = input;
    const place = {
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
    };
    segments = [
      {
        from: place,
        to: place,
        travelMode: "walking",
        targetSpeedKmh: null,
        durationS: null,
        pauseAfterS: 0,
      },
    ];
    geometries = [[roundCoordinate([location.longitude, location.latitude])]];
  } else {
    segments = input.segments.map((s) => ({
      from: { name: s.from.name, latitude: s.from.latitude, longitude: s.from.longitude },
      to: { name: s.to.name, latitude: s.to.latitude, longitude: s.to.longitude },
      travelMode: s.travelMode,
      targetSpeedKmh: s.targetSpeedKmh ?? null,
      durationS: s.durationS ?? null,
      pauseAfterS: s.pauseAfterS,
    }));
    geometries = await Promise.all(
      input.segments.map(async (s, i) => {
        const options = await routeOptions(ctx.mapbox, s.from, s.to, s.travelMode);
        const choice = input.routeChoice?.[i] ?? 0;
        return (options[choice] ?? options[0])!.coordinates;
      }),
    );
  }

  const seed = generateSeed();
  const planSegments: SegmentPlanInput[] = segments.map((s, i) => ({
    coordinates: geometries[i]!,
    travelMode: s.travelMode,
    pauseAfterS: s.pauseAfterS,
    ...(s.targetSpeedKmh !== null ? { targetSpeedKmh: s.targetSpeedKmh } : {}),
    ...(s.durationS !== null ? { durationS: s.durationS } : {}),
  }));
  let timeline;
  try {
    timeline = buildTimeline({ seed, segments: planSegments });
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : "Invalid journey");
  }

  const first = segments[0]!;
  const last = segments[segments.length - 1]!;
  const title =
    input.title ??
    (input.kind === "static" ? first.from.name : `${first.from.name} → ${last.to.name}`);

  const record: PlannedJourneyRecord = {
    kind: input.kind,
    title: title.slice(0, 120),
    seed,
    engineVersion: ENGINE_VERSION,
    totalDistanceM: timeline.totalDistanceM,
    totalDurationMs: timeline.totalDurationMs,
    segments,
    routeSegments: timeline.segments.map((seg, i) => ({
      coordinates: geometries[i]!,
      distanceM: seg.line.length,
    })),
    waypointArrivalsMs: timeline.waypoints.map((w) => w.arrivalMs),
  };
  const journeyId = await ctx.repo.createPlannedJourney(userId, record);

  return {
    journeyId,
    title: record.title,
    seed,
    engineVersion: ENGINE_VERSION,
    totalDistanceM: timeline.totalDistanceM,
    totalDurationMs: timeline.totalDurationMs,
    segments: timeline.segments.map((seg, i) => ({
      travelMode: seg.travelMode,
      polyline: encodePolyline(geometries[i]!),
      distanceM: seg.line.length,
      durationMs: seg.arrivalMs - seg.departureMs,
      durationSatisfied: seg.durationSatisfied,
    })),
  };
};
