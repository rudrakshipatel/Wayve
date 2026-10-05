import type { JourneyDetail, WaveApi } from "@wave/client";
import { WaveApiError } from "@wave/client";
import { encodePolyline, interpolate, haversineDistance } from "@wave/map-utils";
import {
  buildTimeline,
  ENGINE_VERSION,
  initialClock,
  planFromStoredSegments,
  settle,
  transition,
  type StoredSegment,
} from "@wave/simulation-engine";
import {
  generateSeed,
  generateShareToken,
  type ControlAction,
  type LngLat,
  type LocationFolder,
  type PlanRequest,
  type SavedLocation,
  type SessionAction,
  type ShareLinkInfo,
} from "@wave/types";
import { env } from "./env";

/**
 * In-memory stand-in for the Wave backend, used when Supabase is not configured.
 * Lets people explore every screen offline; nothing leaves the device.
 */
interface Stored {
  detail: JourneyDetail;
  links: ShareLinkInfo[];
}

const journeys = new Map<string, Stored>();
const locations: SavedLocation[] = [];
const folders: LocationFolder[] = (["home", "work", "college", "favorites", "travel"] as const).map(
  (kind, i) => ({
    id: `folder-${kind}`,
    name: kind[0]!.toUpperCase() + kind.slice(1),
    kind,
    sortOrder: i,
  }),
);

let counter = 0;
const id = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** Gently curved line so local routes look like routes, with an alternative bending the other way. */
function localRoute(from: LngLat, to: LngLat, bend: number): LngLat[] {
  const d = haversineDistance(from, to);
  const n = Math.max(2, Math.min(200, Math.round(d / 80)));
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const [lng, lat] = interpolate(from, to, t);
    const off = Math.sin(Math.PI * t) * bend;
    return [
      Math.round((lng - dy * off) * 1e6) / 1e6,
      Math.round((lat + dx * off) * 1e6) / 1e6,
    ] as LngLat;
  });
}

function refreshStatus(stored: Stored): void {
  const clock = settle(stored.detail.clock, Date.now(), stored.detail.journey.totalDurationMs);
  if (clock !== stored.detail.clock) stored.detail = withClock(stored.detail, clock);
}

function withClock(detail: JourneyDetail, clock: JourneyDetail["clock"]): JourneyDetail {
  const now = new Date().toISOString();
  return {
    ...detail,
    clock,
    journey: {
      ...detail.journey,
      status: clock.status,
      startedAt:
        detail.journey.startedAt ??
        (clock.status === "active" || clock.status === "paused" ? now : null),
      endedAt:
        clock.status === "completed"
          ? new Date(clock.anchorWallMs).toISOString()
          : clock.status === "cancelled"
            ? now
            : null,
      scheduledStartAt:
        clock.status === "scheduled"
          ? new Date(clock.anchorWallMs).toISOString()
          : detail.journey.scheduledStartAt,
    },
  };
}

function get(journeyId: string): Stored {
  const stored = journeys.get(journeyId);
  if (!stored) throw new WaveApiError("not_found", "Journey not found", 404);
  refreshStatus(stored);
  return stored;
}

export function createLocalApi(): WaveApi {
  return {
    planJourney(input: PlanRequest) {
      const seed = generateSeed();
      const segments: (StoredSegment & {
        fromName: string;
        toName: string;
        from: { latitude: number; longitude: number };
        to: { latitude: number; longitude: number };
      })[] =
        input.kind === "static"
          ? [
              {
                coordinates: [[input.location.longitude, input.location.latitude]],
                travelMode: "walking",
                targetSpeedKmh: null,
                durationS: null,
                pauseAfterS: 0,
                fromName: input.location.name,
                toName: input.location.name,
                from: input.location,
                to: input.location,
              },
            ]
          : input.segments.map((s, i) => ({
              coordinates: localRoute(
                [s.from.longitude, s.from.latitude],
                [s.to.longitude, s.to.latitude],
                (input.routeChoice?.[i] ?? 0) === 0 ? 0.08 : -0.12,
              ),
              travelMode: s.travelMode,
              targetSpeedKmh: s.targetSpeedKmh ?? null,
              durationS: s.durationS ?? null,
              pauseAfterS: s.pauseAfterS ?? 0,
              fromName: s.from.name,
              toName: s.to.name,
              from: s.from,
              to: s.to,
            }));
      const timeline = buildTimeline(planFromStoredSegments(seed, segments));
      const journeyId = id("local");
      const first = segments[0]!;
      const last = segments[segments.length - 1]!;
      const title =
        input.title ??
        (input.kind === "static" ? first.fromName : `${first.fromName} → ${last.toName}`);
      journeys.set(journeyId, {
        links: [],
        detail: {
          journey: {
            id: journeyId,
            kind: input.kind ?? "journey",
            seed,
            title,
            status: "draft",
            travelModes: [...new Set(segments.map((s) => s.travelMode))],
            totalDistanceM: timeline.totalDistanceM,
            totalDurationMs: timeline.totalDurationMs,
            scheduledStartAt: null,
            startedAt: null,
            endedAt: null,
            createdAt: new Date().toISOString(),
          },
          segments,
          clock: initialClock(Date.now()),
          waypointArrivalsMs: timeline.waypoints.map((w) => w.arrivalMs),
          engineVersion: ENGINE_VERSION,
        },
      });
      return Promise.resolve({
        journeyId,
        title,
        seed,
        engineVersion: ENGINE_VERSION,
        totalDistanceM: timeline.totalDistanceM,
        totalDurationMs: timeline.totalDurationMs,
        segments: timeline.segments.map((seg, i) => ({
          travelMode: seg.travelMode,
          polyline: encodePolyline(segments[i]!.coordinates),
          distanceM: seg.line.length,
          durationMs: seg.arrivalMs - seg.departureMs,
          durationSatisfied: seg.durationSatisfied,
        })),
      });
    },

    routeOptions({ from, to, travelMode }) {
      const options = [0.08, -0.12].map((bend) => {
        const coordinates = localRoute(
          [from.longitude, from.latitude],
          [to.longitude, to.latitude],
          bend,
        );
        const t = buildTimeline({ seed: "preview", segments: [{ coordinates, travelMode }] });
        return {
          polyline: encodePolyline(coordinates),
          distanceM: t.totalDistanceM,
          estimatedDurationMs: t.totalDurationMs,
        };
      });
      return Promise.resolve({ options });
    },

    control(journeyId: string, requested: ControlAction) {
      const stored = get(journeyId);
      const { detail } = stored;
      let action: SessionAction;
      if (requested.type === "skip_to_waypoint") {
        const arrival = detail.waypointArrivalsMs[requested.index];
        if (arrival === undefined)
          return Promise.reject(new WaveApiError("invalid_waypoint", "No such waypoint", 400));
        action = { type: "seek", simMs: arrival };
      } else {
        action = requested;
      }
      const now = Date.now();
      const result = transition(detail.clock, action, now, detail.journey.totalDurationMs);
      if (!result.ok)
        return Promise.reject(new WaveApiError(result.error.code, `Can't do that right now`, 409));
      stored.detail = withClock(detail, result.clock);
      return Promise.resolve({
        clock: result.clock,
        status: result.clock.status,
        serverTimeMs: now,
      });
    },

    createShareLink(journeyId: string, ttlHours = 24) {
      const stored = get(journeyId);
      const token = generateShareToken();
      const link: ShareLinkInfo = {
        id: id("link"),
        tokenPrefix: token.slice(0, 6),
        expiresAt: new Date(Date.now() + ttlHours * 3_600_000).toISOString(),
        revokedAt: null,
        viewCount: 0,
        createdAt: new Date().toISOString(),
      };
      stored.links.unshift(link);
      return Promise.resolve({
        id: link.id,
        token,
        url: `${env.shareBaseUrl}/journey/${token}`,
        expiresAt: link.expiresAt,
      });
    },

    deleteAccount() {
      journeys.clear();
      locations.splice(0, locations.length);
      return Promise.resolve({ deleted: true as const });
    },

    resolveShare() {
      return Promise.reject(
        new WaveApiError("not_found", "Share links need the Wave backend", 404),
      );
    },

    revokeShareLink(linkId: string) {
      for (const stored of journeys.values()) {
        stored.links = stored.links.map((l) =>
          l.id === linkId && !l.revokedAt ? { ...l, revokedAt: new Date().toISOString() } : l,
        );
      }
      return Promise.resolve(true);
    },

    revokeAllShareLinks(journeyId: string) {
      const stored = get(journeyId);
      const live = stored.links.filter((l) => !l.revokedAt).length;
      stored.links = stored.links.map((l) => ({
        ...l,
        revokedAt: l.revokedAt ?? new Date().toISOString(),
      }));
      return Promise.resolve(live);
    },

    duplicateJourney(journeyId: string, title?: string) {
      const source = get(journeyId).detail;
      const copyId = id("local");
      journeys.set(copyId, {
        links: [],
        detail: {
          ...source,
          clock: initialClock(Date.now()),
          journey: {
            ...source.journey,
            id: copyId,
            title: title ?? `${source.journey.title} (copy)`,
            status: "draft",
            startedAt: null,
            endedAt: null,
            scheduledStartAt: null,
            createdAt: new Date().toISOString(),
          },
        },
      });
      return Promise.resolve(copyId);
    },

    listJourneys(options = {}) {
      const list = [...journeys.values()]
        .map((s) => {
          refreshStatus(s);
          return s.detail.journey;
        })
        .filter((j) => !options.kind || j.kind === options.kind)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, options.limit ?? 50);
      return Promise.resolve(list);
    },

    getJourney(journeyId: string) {
      return Promise.resolve(get(journeyId).detail);
    },

    renameJourney(journeyId: string, title: string) {
      const stored = get(journeyId);
      stored.detail = {
        ...stored.detail,
        journey: { ...stored.detail.journey, title: title.trim() },
      };
      return Promise.resolve();
    },

    deleteJourney(journeyId: string) {
      journeys.delete(journeyId);
      return Promise.resolve();
    },

    listShareLinks(journeyId: string) {
      return Promise.resolve(get(journeyId).links);
    },

    listFolders() {
      return Promise.resolve(folders);
    },

    createFolder(input) {
      folders.push({
        id: id("folder"),
        name: input.name,
        kind: input.kind ?? "custom",
        sortOrder: folders.length,
      });
      return Promise.resolve();
    },

    listLocations() {
      return Promise.resolve([...locations]);
    },

    saveLocation(input) {
      const location: SavedLocation = {
        id: id("loc"),
        folderId: input.folderId ?? null,
        name: input.name.trim(),
        latitude: input.latitude,
        longitude: input.longitude,
        address: input.address ?? null,
        createdAt: new Date().toISOString(),
      };
      locations.unshift(location);
      return Promise.resolve(location);
    },

    updateLocation(locationId, patch) {
      const i = locations.findIndex((l) => l.id === locationId);
      const current = locations[i];
      if (current) {
        locations[i] = {
          ...current,
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}),
        };
      }
      return Promise.resolve();
    },

    deleteLocation(locationId) {
      const i = locations.findIndex((l) => l.id === locationId);
      if (i >= 0) locations.splice(i, 1);
      return Promise.resolve();
    },
  };
}
