import type {
  JourneyStatus,
  LngLat,
  PublicJourneyView,
  SessionClock,
  TravelMode,
} from "@wave/types";
import { RpcError } from "./errors.ts";

/** Calls a Postgres function with named arguments and returns its JSON result. */
export type RpcCaller = (fn: string, args: Readonly<Record<string, unknown>>) => Promise<unknown>;

export interface PlannedSegmentRecord {
  readonly from: { readonly name: string; readonly latitude: number; readonly longitude: number };
  readonly to: { readonly name: string; readonly latitude: number; readonly longitude: number };
  readonly travelMode: TravelMode;
  readonly targetSpeedKmh: number | null;
  readonly durationS: number | null;
  readonly pauseAfterS: number;
}

/** Payload of public.create_planned_journey. */
export interface PlannedJourneyRecord {
  readonly kind: "journey" | "static";
  readonly title: string;
  readonly seed: string;
  readonly engineVersion: string;
  readonly totalDistanceM: number;
  readonly totalDurationMs: number;
  readonly segments: readonly PlannedSegmentRecord[];
  readonly routeSegments: readonly {
    readonly coordinates: readonly LngLat[];
    readonly distanceM: number;
  }[];
  readonly waypointArrivalsMs: readonly number[];
}

export interface JourneyControlState {
  readonly kind: "journey" | "static";
  readonly clock: SessionClock;
  readonly totalDurationMs: number;
  readonly waypointArrivalsMs: readonly number[];
}

export interface WaveRepository {
  createPlannedJourney(ownerId: string, plan: PlannedJourneyRecord): Promise<string>;
  getJourneyControlState(journeyId: string, ownerId: string): Promise<JourneyControlState | null>;
  /** Throws RevisionConflictError when the session changed since `expectedRevision`. */
  applySessionClock(
    journeyId: string,
    expectedRevision: number,
    clock: SessionClock,
  ): Promise<SessionClock>;
  createShareLink(input: {
    readonly ownerId: string;
    readonly journeyId: string;
    readonly tokenHash: string;
    readonly tokenPrefix: string;
    readonly channelKey: string;
    readonly ttlHours: number;
  }): Promise<{ readonly id: string; readonly expiresAt: string }>;
  getSharedJourney(token: string): Promise<PublicJourneyView | null>;
  consumeRateLimit(
    scope: string,
    key: string,
    capacity: number,
    refillPerSecond: number,
  ): Promise<boolean>;
}

export class RevisionConflictError extends Error {
  constructor() {
    super("revision_conflict");
    this.name = "RevisionConflictError";
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function parseClock(value: unknown): SessionClock {
  if (!isRecord(value)) throw new Error("Malformed session clock");
  return {
    status: value["status"] as JourneyStatus,
    anchorWallMs: Number(value["anchorWallMs"]),
    anchorSimMs: Number(value["anchorSimMs"]),
    rate: Number(value["rate"]),
    revision: Number(value["revision"]),
  };
}

function parseSessionRow(value: unknown): SessionClock {
  if (!isRecord(value)) throw new Error("Malformed session row");
  return {
    status: value["status"] as JourneyStatus,
    anchorWallMs: Date.parse(String(value["anchor_wall_at"])),
    anchorSimMs: Number(value["anchor_sim_ms"]),
    rate: Number(value["rate"]),
    revision: Number(value["revision"]),
  };
}

export function createRepository(rpc: RpcCaller): WaveRepository {
  return {
    async createPlannedJourney(ownerId, plan) {
      const id = await rpc("create_planned_journey", { p_owner_id: ownerId, p_plan: plan });
      if (typeof id !== "string") throw new Error("create_planned_journey returned no id");
      return id;
    },

    async getJourneyControlState(journeyId, ownerId) {
      const state = await rpc("get_journey_control_state", {
        p_journey_id: journeyId,
        p_owner_id: ownerId,
      });
      if (!isRecord(state)) return null;
      const arrivals = state["waypointArrivalsMs"];
      return {
        kind: state["kind"] === "static" ? "static" : "journey",
        clock: parseClock(state["clock"]),
        totalDurationMs: Number(state["totalDurationMs"]),
        waypointArrivalsMs: Array.isArray(arrivals) ? arrivals.map(Number) : [],
      };
    },

    async applySessionClock(journeyId, expectedRevision, clock) {
      try {
        const row = await rpc("apply_session_clock", {
          p_journey_id: journeyId,
          p_expected_revision: expectedRevision,
          p_status: clock.status,
          p_anchor_wall_ms: clock.anchorWallMs,
          p_anchor_sim_ms: clock.anchorSimMs,
          p_rate: clock.rate,
          p_revision: clock.revision,
        });
        return parseSessionRow(row);
      } catch (error) {
        if (error instanceof RpcError && error.code === "40001") throw new RevisionConflictError();
        throw error;
      }
    },

    async createShareLink(input) {
      const result = await rpc("create_share_link", {
        p_owner_id: input.ownerId,
        p_journey_id: input.journeyId,
        p_token_hash: input.tokenHash,
        p_token_prefix: input.tokenPrefix,
        p_channel_key: input.channelKey,
        p_ttl_hours: input.ttlHours,
      });
      if (!isRecord(result)) throw new Error("create_share_link returned nothing");
      return { id: String(result["id"]), expiresAt: String(result["expiresAt"]) };
    },

    async getSharedJourney(token) {
      const view = await rpc("get_shared_journey", { p_token: token });
      return isRecord(view) ? (view as unknown as PublicJourneyView) : null;
    },

    async consumeRateLimit(scope, key, capacity, refillPerSecond) {
      return (
        (await rpc("consume_rate_limit", {
          p_scope: scope,
          p_key: key,
          p_capacity: capacity,
          p_refill_per_second: refillPerSecond,
        })) === true
      );
    },
  };
}
