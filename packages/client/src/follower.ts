import type { SupabaseClient } from "@supabase/supabase-js";
import { ServerClockOffset } from "@wave/simulation-engine";
import {
  JOURNEY_STATUSES,
  REALTIME_EVENTS,
  type JourneyStatus,
  type SessionBroadcast,
  type SessionClock,
} from "@wave/types";

export type ChannelStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

/** The subset of a realtime channel the follower needs; lets tests use a fake. */
export interface BroadcastChannelLike {
  onBroadcast(event: string, callback: (payload: unknown) => void): void;
  subscribe(callback: (status: ChannelStatus) => void): void;
  unsubscribe(): void;
}

export type ChannelFactory = (topic: string) => BroadcastChannelLike;

/** Private (RLS-authorised) Supabase broadcast channels. */
export function supabaseChannelFactory(supabase: SupabaseClient): ChannelFactory {
  return (topic) => {
    const channel = supabase.channel(topic, { config: { private: true } });
    return {
      onBroadcast(event, callback) {
        channel.on("broadcast", { event }, (message: { payload?: unknown }) => {
          callback(message.payload);
        });
      },
      subscribe(callback) {
        channel.subscribe((status) => {
          callback(status);
        });
      },
      unsubscribe() {
        void supabase.removeChannel(channel);
      },
    };
  };
}

export type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";

export interface FollowerSnapshot {
  readonly clock: SessionClock;
  readonly revoked: boolean;
  readonly connection: ConnectionState;
}

export interface JourneyFollowerOptions {
  readonly topic: string;
  readonly initialClock: SessionClock;
  /** Server time of the response that carried `initialClock`. */
  readonly serverTimeMs: number;
  /** Local time the response was received and its round trip, for clock-offset estimation. */
  readonly receivedAtMs?: number;
  readonly roundTripMs?: number;
  readonly channelFactory: ChannelFactory;
  /** Re-fetches authoritative state after a reconnect (events may have been missed). */
  readonly refresh?: () => Promise<{
    readonly clock: SessionClock;
    readonly serverTimeMs: number;
  } | null>;
  readonly now?: () => number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export function isSessionBroadcast(value: unknown): value is SessionBroadcast {
  if (!isRecord(value) || !isRecord(value["clock"]) || typeof value["serverTimeMs"] !== "number")
    return false;
  const c = value["clock"];
  return (
    JOURNEY_STATUSES.includes(c["status"] as JourneyStatus) &&
    typeof c["anchorWallMs"] === "number" &&
    typeof c["anchorSimMs"] === "number" &&
    typeof c["rate"] === "number" &&
    typeof c["revision"] === "number"
  );
}

/**
 * Follows a journey's authoritative session clock over realtime. Exposes a
 * subscribe/getSnapshot pair compatible with React's useSyncExternalStore.
 */
export class JourneyFollower {
  readonly #options: JourneyFollowerOptions;
  readonly #offset = new ServerClockOffset();
  readonly #listeners = new Set<() => void>();
  readonly #now: () => number;
  #channel: BroadcastChannelLike | null = null;
  #snapshot: FollowerSnapshot;
  #everLive = false;

  constructor(options: JourneyFollowerOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => Date.now());
    this.#offset.observe(
      options.serverTimeMs,
      options.receivedAtMs ?? this.#now(),
      options.roundTripMs ?? 0,
    );
    this.#snapshot = { clock: options.initialClock, revoked: false, connection: "connecting" };
  }

  start(): void {
    if (this.#channel) return;
    const channel = this.#options.channelFactory(this.#options.topic);
    channel.onBroadcast(REALTIME_EVENTS.session, (payload) => {
      if (isSessionBroadcast(payload)) this.applyClock(payload.clock, payload.serverTimeMs);
    });
    channel.onBroadcast(REALTIME_EVENTS.revoked, () => {
      this.#set({ revoked: true });
    });
    channel.subscribe((status) => {
      this.#onStatus(status);
    });
    this.#channel = channel;
  }

  stop(): void {
    this.#channel?.unsubscribe();
    this.#channel = null;
  }

  /** Applies a clock from any authoritative source; older revisions are ignored. */
  applyClock(clock: SessionClock, serverTimeMs?: number): void {
    if (serverTimeMs !== undefined) this.#offset.observe(serverTimeMs, this.#now());
    if (clock.revision < this.#snapshot.clock.revision) return;
    if (
      clock.revision === this.#snapshot.clock.revision &&
      clock.status === this.#snapshot.clock.status
    )
      return;
    this.#set({ clock });
  }

  /** Re-fetch authoritative state (e.g. when a tab becomes visible again). */
  async resync(): Promise<void> {
    const fresh = await this.#options.refresh?.();
    if (fresh) this.applyClock(fresh.clock, fresh.serverTimeMs);
  }

  /** Current time in the server's clock domain. */
  serverNow(): number {
    return this.#offset.serverNow(this.#now());
  }

  get offsetMs(): number {
    return this.#offset.offsetMs;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getSnapshot = (): FollowerSnapshot => this.#snapshot;

  #onStatus(status: ChannelStatus): void {
    if (status === "SUBSCRIBED") {
      const wasReconnect = this.#everLive;
      this.#everLive = true;
      this.#set({ connection: "live" });
      if (wasReconnect) void this.resync();
    } else if (status === "CLOSED") {
      this.#set({ connection: "offline" });
    } else {
      this.#set({ connection: "reconnecting" });
    }
  }

  #set(patch: Partial<FollowerSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const listener of this.#listeners) listener();
  }
}
