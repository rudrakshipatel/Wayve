import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredSegment } from "@wave/simulation-engine";
import {
  EDGE_FUNCTIONS,
  type ControlAction,
  type CreateShareLinkResult,
  type JourneyControlResult,
  type JourneySummary,
  type LocationFolder,
  type PlanJourneyResult,
  type PlanRequest,
  type PublicJourneyView,
  type RouteOptionsInput,
  type RouteOptionsResult,
  type SavedLocation,
  type SavedLocationInput,
  type SessionClock,
  type ShareLinkInfo,
  savedLocationInputSchema,
  locationFolderInputSchema,
} from "@wave/types";
import { WaveApiError } from "./errors.ts";
import type {
  JourneyRouteRow,
  JourneyRow,
  JourneySegmentRow,
  JourneySessionRow,
  LocationFolderRow,
  SavedLocationRow,
  ShareLinkRow,
} from "./rows.ts";

export interface JourneyDetail {
  readonly journey: JourneySummary & { readonly kind: "journey" | "static"; readonly seed: string };
  readonly segments: readonly (StoredSegment & {
    readonly fromName: string;
    readonly toName: string;
    readonly from: { latitude: number; longitude: number };
    readonly to: { latitude: number; longitude: number };
  })[];
  readonly clock: SessionClock;
  readonly waypointArrivalsMs: readonly number[];
  readonly engineVersion: string;
}

const JOURNEY_COLUMNS =
  "id, kind, title, status, seed, travel_modes, total_distance_m, total_duration_ms, scheduled_start_at, started_at, ended_at, source_journey_id, created_at";

function toSummary(row: JourneyRow): JourneyDetail["journey"] {
  return {
    id: row.id,
    kind: row.kind,
    seed: row.seed,
    title: row.title,
    status: row.status,
    travelModes: row.travel_modes,
    totalDistanceM: row.total_distance_m,
    totalDurationMs: row.total_duration_ms,
    scheduledStartAt: row.scheduled_start_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

export const clockFromRow = (row: JourneySessionRow): SessionClock => ({
  status: row.status,
  anchorWallMs: Date.parse(row.anchor_wall_at),
  anchorSimMs: row.anchor_sim_ms,
  rate: row.rate,
  revision: row.revision,
});

const toLocation = (row: SavedLocationRow): SavedLocation => ({
  id: row.id,
  folderId: row.folder_id,
  name: row.name,
  latitude: row.latitude,
  longitude: row.longitude,
  address: row.address,
  createdAt: row.created_at,
});

/** Throws a WaveApiError for a PostgREST error, otherwise returns data. */
function unwrap<T>(result: {
  data: T | null;
  error: { message: string; code?: string } | null;
}): T {
  if (result.error) throw new WaveApiError(result.error.code ?? "db_error", result.error.message);
  if (result.data === null) throw new WaveApiError("not_found", "Not found", 404);
  return result.data;
}

interface ResponseLike {
  readonly status: number;
  json(): Promise<unknown>;
}

async function invokeError(error: unknown): Promise<WaveApiError> {
  const context = (error as { context?: ResponseLike }).context;
  if (context && typeof context.json === "function") {
    try {
      const body = (await context.json()) as { error?: { code?: string; message?: string } };
      if (body.error?.code) {
        return new WaveApiError(
          body.error.code,
          body.error.message ?? "Request failed",
          context.status,
        );
      }
    } catch {
      // fall through
    }
    return new WaveApiError("http_error", "Request failed", context.status);
  }
  return new WaveApiError("network_error", "Can't reach Wave. Check your connection.");
}

/** Typed access to Wave's database (RLS) and edge functions for web and mobile. */
export function createWaveApi(supabase: SupabaseClient) {
  async function invoke<T>(name: string, body: unknown): Promise<T> {
    const result: { data: T | null; error: unknown } = await supabase.functions.invoke<T>(name, {
      body: body as Record<string, unknown>,
    });
    if (result.error) throw await invokeError(result.error);
    if (result.data === null) throw new WaveApiError("empty_response", "Empty response");
    return result.data;
  }

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const result: { data: unknown; error: { code: string; message: string } | null } =
      await supabase.rpc(fn, args);
    if (result.error) throw new WaveApiError(result.error.code, result.error.message);
    return result.data as T;
  }

  return {
    // Edge functions --------------------------------------------------------------
    planJourney: (input: PlanRequest) =>
      invoke<PlanJourneyResult>(EDGE_FUNCTIONS.planJourney, input),
    routeOptions: (input: RouteOptionsInput) =>
      invoke<RouteOptionsResult>(EDGE_FUNCTIONS.routeOptions, input),
    control: (journeyId: string, action: ControlAction) =>
      invoke<JourneyControlResult>(EDGE_FUNCTIONS.journeyControl, { journeyId, action }),
    createShareLink: (journeyId: string, ttlHours?: number) =>
      invoke<CreateShareLinkResult>(EDGE_FUNCTIONS.shareLink, {
        journeyId,
        ...(ttlHours ? { ttlHours } : {}),
      }),
    resolveShare: (token: string) =>
      invoke<PublicJourneyView>(EDGE_FUNCTIONS.resolveShare, { token }),

    // Owner RPCs ---------------------------------------------------------------------
    revokeShareLink: (id: string) => rpc<boolean>("revoke_share_link", { p_share_link_id: id }),
    revokeAllShareLinks: (journeyId: string) =>
      rpc<number>("revoke_all_share_links", { p_journey_id: journeyId }),
    duplicateJourney: (journeyId: string, title?: string) =>
      rpc<string>("duplicate_journey", {
        p_journey_id: journeyId,
        ...(title ? { p_title: title } : {}),
      }),

    // Journeys -------------------------------------------------------------------------
    async listJourneys(
      options: { readonly limit?: number; readonly kind?: "journey" | "static" } = {},
    ) {
      let query = supabase
        .from("journeys")
        .select(JOURNEY_COLUMNS)
        .order("created_at", { ascending: false });
      if (options.kind) query = query.eq("kind", options.kind);
      const rows = unwrap(await query.limit(options.limit ?? 50)) as unknown as JourneyRow[];
      return rows.map(toSummary);
    },

    async getJourney(journeyId: string): Promise<JourneyDetail> {
      const [journey, segments, route, session] = await Promise.all([
        supabase.from("journeys").select(JOURNEY_COLUMNS).eq("id", journeyId).maybeSingle(),
        supabase.from("journey_segments").select("*").eq("journey_id", journeyId).order("position"),
        supabase.from("journey_routes").select("*").eq("journey_id", journeyId).maybeSingle(),
        supabase.from("journey_sessions").select("*").eq("journey_id", journeyId).maybeSingle(),
      ]);
      const j = unwrap(journey) as unknown as JourneyRow;
      const segs = unwrap(segments) as unknown as JourneySegmentRow[];
      const r = unwrap(route) as unknown as JourneyRouteRow;
      const s = unwrap(session) as unknown as JourneySessionRow;
      return {
        journey: toSummary(j),
        segments: segs.map((seg) => ({
          coordinates: r.segments[seg.position]?.coordinates ?? [],
          travelMode: seg.travel_mode,
          targetSpeedKmh: seg.target_speed_kmh,
          durationS: seg.duration_s,
          pauseAfterS: seg.pause_after_s,
          fromName: seg.from_name,
          toName: seg.to_name,
          from: { latitude: seg.from_latitude, longitude: seg.from_longitude },
          to: { latitude: seg.to_latitude, longitude: seg.to_longitude },
        })),
        clock: clockFromRow(s),
        waypointArrivalsMs: r.waypoint_arrivals_ms,
        engineVersion: r.engine_version,
      };
    },

    async renameJourney(journeyId: string, title: string) {
      const trimmed = title.trim();
      if (trimmed.length < 1 || trimmed.length > 120) {
        throw new WaveApiError("invalid_input", "Names must be 1–120 characters");
      }
      unwrap(
        await supabase
          .from("journeys")
          .update({ title: trimmed })
          .eq("id", journeyId)
          .select("id")
          .single(),
      );
    },

    async deleteJourney(journeyId: string) {
      const { error } = await supabase.from("journeys").delete().eq("id", journeyId);
      if (error) throw new WaveApiError(error.code, error.message);
    },

    async listShareLinks(journeyId: string): Promise<ShareLinkInfo[]> {
      const rows = unwrap(
        await supabase
          .from("share_links")
          .select("id, token_prefix, expires_at, revoked_at, view_count, created_at")
          .eq("journey_id", journeyId)
          .order("created_at", { ascending: false }),
      ) as unknown as ShareLinkRow[];
      return rows.map((r) => ({
        id: r.id,
        tokenPrefix: r.token_prefix,
        expiresAt: r.expires_at,
        revokedAt: r.revoked_at,
        viewCount: r.view_count,
        createdAt: r.created_at,
      }));
    },

    // Saved locations ---------------------------------------------------------------------
    async listFolders(): Promise<LocationFolder[]> {
      const rows = unwrap(
        await supabase
          .from("location_folders")
          .select("id, name, kind, sort_order")
          .order("sort_order"),
      ) as unknown as LocationFolderRow[];
      return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, sortOrder: r.sort_order }));
    },

    async createFolder(input: { name: string; kind?: LocationFolder["kind"] }) {
      const parsed = locationFolderInputSchema.parse(input);
      unwrap(await supabase.from("location_folders").insert(parsed).select("id").single());
    },

    async listLocations(): Promise<SavedLocation[]> {
      const rows = unwrap(
        await supabase
          .from("saved_locations")
          .select("id, folder_id, name, latitude, longitude, address, created_at")
          .order("created_at", { ascending: false }),
      ) as unknown as SavedLocationRow[];
      return rows.map(toLocation);
    },

    async saveLocation(input: SavedLocationInput): Promise<SavedLocation> {
      const parsed = savedLocationInputSchema.safeParse(input);
      if (!parsed.success)
        throw new WaveApiError("invalid_input", parsed.error.issues[0]?.message ?? "Invalid");
      const { folderId, ...rest } = parsed.data;
      const result = await supabase
        .from("saved_locations")
        .insert({ ...rest, folder_id: folderId })
        .select("id, folder_id, name, latitude, longitude, address, created_at")
        .single();
      const row: SavedLocationRow = unwrap<SavedLocationRow>(result);
      return toLocation(row);
    },

    async updateLocation(id: string, patch: { name?: string; folderId?: string | null }) {
      const update: Record<string, unknown> = {};
      if (patch.name !== undefined) update["name"] = patch.name.trim();
      if (patch.folderId !== undefined) update["folder_id"] = patch.folderId;
      unwrap(
        await supabase.from("saved_locations").update(update).eq("id", id).select("id").single(),
      );
    },

    async deleteLocation(id: string) {
      const { error } = await supabase.from("saved_locations").delete().eq("id", id);
      if (error) throw new WaveApiError(error.code, error.message);
    },
  };
}

export type WaveApi = ReturnType<typeof createWaveApi>;
