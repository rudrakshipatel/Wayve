import { describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@wave/simulation-engine";
import type { SessionClock } from "@wave/types";
import {
  JourneyFollower,
  isSessionBroadcast,
  type BroadcastChannelLike,
  type ChannelStatus,
} from "./follower.ts";
import { liveJourneyState } from "./live.ts";

function fakeChannel() {
  const handlers = new Map<string, (p: unknown) => void>();
  let statusCb: ((s: ChannelStatus) => void) | null = null;
  const channel: BroadcastChannelLike & { unsubscribed: boolean } = {
    unsubscribed: false,
    onBroadcast: (event, cb) => handlers.set(event, cb),
    subscribe: (cb) => {
      statusCb = cb;
    },
    unsubscribe() {
      this.unsubscribed = true;
    },
  };
  return {
    channel,
    emit: (event: string, payload: unknown) => handlers.get(event)?.(payload),
    status: (s: ChannelStatus) => statusCb?.(s),
  };
}

const clock = (patch: Partial<SessionClock> = {}): SessionClock => ({
  status: "active",
  anchorWallMs: 1_000_000,
  anchorSimMs: 0,
  rate: 1,
  revision: 1,
  ...patch,
});

describe("JourneyFollower", () => {
  function setup(refresh?: () => Promise<{ clock: SessionClock; serverTimeMs: number } | null>) {
    let local = 500_000;
    const fake = fakeChannel();
    const topics: string[] = [];
    const follower = new JourneyFollower({
      topic: "share:abc",
      initialClock: clock(),
      serverTimeMs: 1_010_000,
      receivedAtMs: 500_000,
      channelFactory: (t) => {
        topics.push(t);
        return fake.channel;
      },
      now: () => local,
      ...(refresh ? { refresh } : {}),
    });
    return { follower, fake, topics, advance: (ms: number) => (local += ms) };
  }

  it("estimates server time from the initial response", () => {
    const { follower, advance } = setup();
    expect(follower.serverNow()).toBe(1_010_000);
    advance(1000);
    expect(follower.serverNow()).toBe(1_011_000);
  });

  it("applies newer session broadcasts and ignores stale ones", () => {
    const { follower, fake, topics } = setup();
    const listener = vi.fn();
    follower.subscribe(listener);
    follower.start();
    expect(topics).toEqual(["share:abc"]);

    fake.emit("session", {
      clock: clock({ status: "paused", revision: 3 }),
      serverTimeMs: 1_010_000,
    });
    expect(follower.getSnapshot().clock.status).toBe("paused");
    fake.emit("session", {
      clock: clock({ status: "active", revision: 2 }),
      serverTimeMs: 1_010_000,
    });
    expect(follower.getSnapshot().clock.status).toBe("paused");
    fake.emit("session", { clock: { bogus: true }, serverTimeMs: 1 });
    expect(follower.getSnapshot().clock.revision).toBe(3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("tracks connection state and resyncs after reconnecting", async () => {
    const refresh = vi.fn(() =>
      Promise.resolve({ clock: clock({ status: "completed", revision: 9 }), serverTimeMs: 1 }),
    );
    const { follower, fake } = setup(refresh);
    follower.start();
    expect(follower.getSnapshot().connection).toBe("connecting");
    fake.status("SUBSCRIBED");
    expect(follower.getSnapshot().connection).toBe("live");
    expect(refresh).not.toHaveBeenCalled();
    fake.status("CHANNEL_ERROR");
    expect(follower.getSnapshot().connection).toBe("reconnecting");
    fake.status("SUBSCRIBED");
    await Promise.resolve();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(follower.getSnapshot().clock.status).toBe("completed");
  });

  it("reports revocation and unsubscribes on stop", () => {
    const { follower, fake } = setup();
    follower.start();
    fake.emit("revoked", { reason: "revoked" });
    expect(follower.getSnapshot().revoked).toBe(true);
    follower.stop();
    expect(fake.channel.unsubscribed).toBe(true);
  });
});

describe("isSessionBroadcast", () => {
  it("validates payloads", () => {
    expect(isSessionBroadcast({ clock: clock(), serverTimeMs: 1 })).toBe(true);
    expect(isSessionBroadcast({ clock: { ...clock(), status: "flying" }, serverTimeMs: 1 })).toBe(
      false,
    );
    expect(isSessionBroadcast(null)).toBe(false);
  });
});

describe("liveJourneyState", () => {
  const timeline = buildTimeline({
    seed: "live",
    segments: [
      {
        coordinates: [
          [72.5714, 23.0225],
          [72.5814, 23.0325],
        ],
        travelMode: "walking",
      },
    ],
  });

  it("derives position, status and local ETA", () => {
    const c = clock({ anchorWallMs: 0 });
    const s = liveJourneyState(timeline, c, 60_000, 60_500);
    expect(s.status).toBe("active");
    expect(s.sample.elapsedMs).toBe(60_000);
    expect(s.etaLocalMs).toBe(timeline.totalDurationMs + 500);
    const done = liveJourneyState(timeline, c, timeline.totalDurationMs + 1, 0);
    expect(done.status).toBe("completed");
    expect(done.etaLocalMs).toBeNull();
  });
});
