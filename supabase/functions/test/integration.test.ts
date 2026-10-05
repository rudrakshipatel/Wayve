/**
 * End-to-end tests of the edge-function handlers against a real, migrated PostgreSQL
 * database (see supabase/tests/prepare.sh). Skipped when WAVE_TEST_DATABASE_URL is unset.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTimeline,
  planFromStoredSegments,
  sampleTimeline,
  simElapsedAt,
} from "@wave/simulation-engine";
import { decodePolyline } from "@wave/map-utils";
import type {
  CreateShareLinkResult,
  JourneyControlResult,
  PlanJourneyResult,
  PublicJourneyView,
  RouteOptionsResult,
  SessionBroadcast,
} from "@wave/types";
import { planJourney } from "../_shared/handlers/plan-journey.ts";
import { routeOptions } from "../_shared/handlers/route-options.ts";
import { journeyControl } from "../_shared/handlers/journey-control.ts";
import { createShareLink } from "../_shared/handlers/share-link.ts";
import { resolveShare } from "../_shared/handlers/resolve-share.ts";
import { JourneyFollower, liveJourneyState, type BroadcastChannelLike } from "@wave/client";
import { createHarness, DATABASE_URL, type Harness } from "./harness.ts";

const OWNER = "aaaaaaaa-1111-4111-8111-000000000001";
const STRANGER = "bbbbbbbb-2222-4222-8222-000000000002";

const ahmedabad = { name: "Ahmedabad", latitude: 23.0225, longitude: 72.5714 };
const college = { name: "College", latitude: 23.0395, longitude: 72.5466 };
const gandhinagar = { name: "Gandhinagar", latitude: 23.2156, longitude: 72.6369 };

describe.skipIf(!DATABASE_URL)("edge functions × Postgres", () => {
  let h: Harness;

  beforeAll(async () => {
    h = createHarness(DATABASE_URL!);
    await h.createUser(OWNER);
    await h.createUser(STRANGER);
  });
  afterAll(async () => {
    await h.close();
  });

  const control = (journeyId: string, action: unknown, user: string | null = OWNER) =>
    h.call<JourneyControlResult>(journeyControl, { user, body: { journeyId, action } });

  async function plan(): Promise<PlanJourneyResult> {
    const res = await h.call<PlanJourneyResult>(planJourney, {
      user: OWNER,
      body: {
        segments: [
          {
            from: ahmedabad,
            to: college,
            travelMode: "driving",
            targetSpeedKmh: 45,
            pauseAfterS: 30,
          },
          { from: college, to: gandhinagar, travelMode: "cycling", durationS: 3600 },
        ],
        routeChoice: [1, 0],
      },
    });
    expect(res.status).toBe(200);
    return res.body;
  }

  describe("create journey", () => {
    it("requires authentication", async () => {
      const res = await h.call(planJourney, { body: { segments: [] } });
      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe("unauthorized");
    });

    it("validates input", async () => {
      const res = await h.call(planJourney, {
        user: OWNER,
        body: {
          segments: [{ from: ahmedabad, to: college, travelMode: "walking", targetSpeedKmh: 80 }],
        },
      });
      expect(res.status).toBe(400);
      expect(res.body.error?.message).toMatch(/between 1 and 12/);
    });

    it("plans, compiles and persists a multi-segment journey", async () => {
      const result = await plan();
      expect(result.title).toBe("Ahmedabad → Gandhinagar");
      expect(result.segments).toHaveLength(2);
      expect(result.segments[1]!.durationSatisfied).toBe(true);
      expect(Math.abs(result.segments[1]!.durationMs - 3_600_000)).toBeLessThan(1000);

      const [journey] = await h.sql<{
        status: string;
        travel_modes: string;
        total_duration_ms: number;
      }>(
        "select status, travel_modes::text, total_duration_ms from public.journeys where id = $1",
        [result.journeyId],
      );
      expect(journey).toMatchObject({ status: "draft", travel_modes: "{driving,cycling}" });
      expect(journey!.total_duration_ms).toBeCloseTo(result.totalDurationMs, 6);

      const segments = await h.sql("select * from public.journey_segments where journey_id = $1", [
        result.journeyId,
      ]);
      expect(segments).toHaveLength(2);
      const [route] = await h.sql<{ waypoint_arrivals_ms: number[] }>(
        "select waypoint_arrivals_ms from public.journey_routes where journey_id = $1",
        [result.journeyId],
      );
      expect(route!.waypoint_arrivals_ms).toHaveLength(1);
    });

    it("honours the selected route alternative", async () => {
      const result = await plan();
      const detour = decodePolyline(result.segments[0]!.polyline);
      // Alternative 1 of the fake router bends east of the straight line.
      const straightMid = (ahmedabad.longitude + college.longitude) / 2;
      expect(Math.max(...detour.map((c) => c[0]))).toBeGreaterThan(straightMid + 0.009);
    });

    it("creates a static location", async () => {
      const res = await h.call<PlanJourneyResult>(planJourney, {
        user: OWNER,
        body: { kind: "static", location: { name: "Home", latitude: 23.03, longitude: 72.58 } },
      });
      expect(res.status).toBe(200);
      expect(res.body.totalDistanceM).toBe(0);
      expect(res.body.title).toBe("Home");
    });

    it("returns route options with simulated durations", async () => {
      const res = await h.call<RouteOptionsResult>(routeOptions, {
        user: OWNER,
        body: { from: ahmedabad, to: gandhinagar, travelMode: "driving" },
      });
      expect(res.status).toBe(200);
      expect(res.body.options).toHaveLength(2);
      expect(res.body.options[0]!.estimatedDurationMs).toBeGreaterThan(0);
      expect(res.body.options[1]!.distanceM).toBeGreaterThan(res.body.options[0]!.distanceM);
    });
  });

  describe("journey lifecycle", () => {
    it("starts, pauses, resumes, changes rate, skips to a waypoint and stops", async () => {
      const { journeyId, totalDurationMs } = await plan();

      const started = await control(journeyId, { type: "start" });
      expect(started.status).toBe(200);
      expect(started.body.status).toBe("active");

      const paused = await control(journeyId, { type: "pause" });
      expect(paused.body.clock.status).toBe("paused");
      const pausedAt = paused.body.clock.anchorSimMs;

      const resumed = await control(journeyId, { type: "resume" });
      expect(resumed.body.clock).toMatchObject({ status: "active", anchorSimMs: pausedAt });

      const faster = await control(journeyId, { type: "set_rate", rate: 2 });
      expect(faster.body.clock.rate).toBe(2);

      const [{ waypoint_arrivals_ms: arrivals }] = (await h.sql<{ waypoint_arrivals_ms: number[] }>(
        "select waypoint_arrivals_ms from public.journey_routes where journey_id = $1",
        [journeyId],
      )) as [{ waypoint_arrivals_ms: number[] }];
      const skipped = await control(journeyId, { type: "skip_to_waypoint", index: 0 });
      expect(skipped.body.clock.anchorSimMs).toBeCloseTo(arrivals[0]!, 6);
      expect(
        simElapsedAt(skipped.body.clock, skipped.body.serverTimeMs, totalDurationMs),
      ).toBeCloseTo(arrivals[0]!, 6);

      const badWaypoint = await control(journeyId, { type: "skip_to_waypoint", index: 5 });
      expect(badWaypoint.status).toBe(400);

      const stopped = await control(journeyId, { type: "stop" });
      expect(stopped.body.clock.status).toBe("cancelled");

      const [journey] = await h.sql<{
        status: string;
        started_at: Date | null;
        ended_at: Date | null;
      }>("select status, started_at, ended_at from public.journeys where id = $1", [journeyId]);
      expect(journey!.status).toBe("cancelled");
      expect(journey!.started_at).not.toBeNull();
      expect(journey!.ended_at).not.toBeNull();

      const invalid = await control(journeyId, { type: "resume" });
      expect(invalid.status).toBe(409);
      expect(invalid.body.error?.code).toBe("invalid_transition");
    });

    it("completes when the end is reached", async () => {
      const { journeyId, totalDurationMs } = await plan();
      await control(journeyId, { type: "start" });
      const done = await control(journeyId, { type: "seek", simMs: totalDurationMs + 1000 });
      expect(done.body.clock.status).toBe("completed");
      const [journey] = await h.sql<{ status: string; ended_at: Date }>(
        "select status, ended_at from public.journeys where id = $1",
        [journeyId],
      );
      expect(journey!.status).toBe("completed");
    });

    it("schedules a journey that the server activates and completes on its own", async () => {
      const { journeyId } = await plan();
      const startAt = Date.now() + 60 * 60_000;
      const scheduled = await control(journeyId, { type: "schedule", startAtMs: startAt });
      expect(scheduled.body.clock).toMatchObject({ status: "scheduled", anchorWallMs: startAt });
      const [row] = await h.sql<{ scheduled_start_at: Date }>(
        "select scheduled_start_at from public.journeys where id = $1",
        [journeyId],
      );
      expect(row!.scheduled_start_at.getTime()).toBe(startAt);

      const past = await control(journeyId, { type: "schedule", startAtMs: Date.now() - 1000 });
      expect(past.body.error?.code).toBe("schedule_in_past");

      // Time passes with every client closed: the cron job activates it.
      await h.sql(
        "update public.journey_sessions set anchor_wall_at = now() - interval '5 seconds' where journey_id = $1",
        [journeyId],
      );
      expect(await h.repo.consumeRateLimit("noop", "noop", 1, 1)).toBe(true);
      await h.sql("select public.advance_journey_sessions()");
      const [active] = await h.sql<{ status: string }>(
        "select status from public.journeys where id = $1",
        [journeyId],
      );
      expect(active!.status).toBe("active");

      await h.sql(
        "update public.journey_sessions set anchor_wall_at = now() - interval '1 day' where journey_id = $1",
        [journeyId],
      );
      await h.sql("select public.advance_journey_sessions()");
      const [completed] = await h.sql<{ status: string }>(
        "select status from public.journeys where id = $1",
        [journeyId],
      );
      expect(completed!.status).toBe("completed");
    });

    it("hides other people's journeys", async () => {
      const { journeyId } = await plan();
      const res = await control(journeyId, { type: "start" }, STRANGER);
      expect(res.status).toBe(404);
      const share = await h.call(createShareLink, { user: STRANGER, body: { journeyId } });
      expect(share.status).toBe(404);
    });

    it("serialises concurrent commands", async () => {
      const { journeyId } = await plan();
      await control(journeyId, { type: "start" });
      const results = await Promise.all([
        control(journeyId, { type: "set_rate", rate: 2 }),
        control(journeyId, { type: "set_rate", rate: 3 }),
        control(journeyId, { type: "pause" }),
      ]);
      expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
      const [session] = await h.sql<{ revision: string }>(
        "select revision from public.journey_sessions where journey_id = $1",
        [journeyId],
      );
      const succeeded = results.filter((r) => r.status === 200).length;
      expect(Number(session!.revision)).toBeGreaterThanOrEqual(1 + succeeded);
    });
  });

  describe("sharing", () => {
    it("generates a link, opens the share page data and stays in sync", async () => {
      const planned = await plan();
      const { journeyId } = planned;

      const created = await h.call<CreateShareLinkResult>(createShareLink, {
        user: OWNER,
        body: { journeyId, ttlHours: 2 },
      });
      expect(created.status).toBe(200);
      expect(created.body.url).toBe(`https://wave.test/journey/${created.body.token}`);
      const [stored] = await h.sql<{ token_hash: string }>(
        "select token_hash from public.share_links where id = $1",
        [created.body.id],
      );
      expect(stored!.token_hash).not.toContain(created.body.token);

      await control(journeyId, { type: "start" });

      // Recipient opens the link (anonymous).
      const opened = await h.call<PublicJourneyView>(resolveShare, {
        body: { token: created.body.token },
      });
      expect(opened.status).toBe(200);
      const view = opened.body;
      expect(view.title).toBe("Ahmedabad → Gandhinagar");
      expect(view.clock.status).toBe("active");
      expect(JSON.stringify(view)).not.toMatch(
        new RegExp(`${journeyId}|${OWNER}|${created.body.id}`),
      );
      expect(opened.headers.get("cache-control")).toBe("no-store");

      // The viewer rebuilds exactly the server's timeline from the public view.
      const timeline = buildTimeline(planFromStoredSegments(view.seed, view.segments));
      expect(timeline.totalDurationMs).toBe(planned.totalDurationMs);
      expect(timeline.totalDistanceM).toBe(planned.totalDistanceM);

      // Owner pauses: viewers receive a state event on their share topic.
      const paused = await control(journeyId, { type: "pause" });
      const messages = await h.sql<{ payload: SessionBroadcast; event: string }>(
        "select payload, event from realtime.messages where topic = $1 order by id",
        [view.realtimeTopic],
      );
      const last = messages[messages.length - 1]!;
      expect(last.event).toBe("session");
      expect(last.payload.clock).toEqual(paused.body.clock);
      const viewerPosition = sampleTimeline(
        timeline,
        simElapsedAt(
          last.payload.clock,
          last.payload.serverTimeMs + 60_000,
          timeline.totalDurationMs,
        ),
      );
      expect(viewerPosition.elapsedMs).toBeCloseTo(paused.body.clock.anchorSimMs, 6);
    });

    it("keeps a web viewer in sync through pause, resume, rate change and completion", async () => {
      const planned = await plan();
      const { journeyId } = planned;
      const link = await h.call<CreateShareLinkResult>(createShareLink, {
        user: OWNER,
        body: { journeyId },
      });
      const view = (
        await h.call<PublicJourneyView>(resolveShare, { body: { token: link.body.token } })
      ).body;
      const timeline = buildTimeline(planFromStoredSegments(view.seed, view.segments));

      // Deliver every broadcast the database sends on the viewer's topic.
      const handlers = new Map<string, (p: unknown) => void>();
      const channel: BroadcastChannelLike = {
        onBroadcast: (event, cb) => handlers.set(event, cb),
        subscribe: (cb) => {
          cb("SUBSCRIBED");
        },
        unsubscribe: () => undefined,
      };
      const follower = new JourneyFollower({
        topic: view.realtimeTopic,
        initialClock: view.clock,
        serverTimeMs: view.serverTimeMs,
        channelFactory: () => channel,
      });
      follower.start();
      let delivered = 0;
      const pump = async () => {
        const rows = await h.sql<{ payload: unknown; event: string }>(
          "select payload, event from realtime.messages where topic = $1 order by id offset $2",
          [view.realtimeTopic, delivered],
        );
        delivered += rows.length;
        for (const row of rows) handlers.get(row.event)?.(row.payload);
      };

      const status = () => {
        const now = Date.now();
        return liveJourneyState(timeline, follower.getSnapshot().clock, follower.serverNow(), now);
      };
      expect(status().status).toBe("draft");

      await control(journeyId, { type: "start" });
      await pump();
      expect(status().status).toBe("active");

      await control(journeyId, { type: "pause" });
      await pump();
      expect(status().status).toBe("paused");
      expect(status().etaLocalMs).toBeNull();

      await control(journeyId, { type: "resume" });
      await control(journeyId, { type: "set_rate", rate: 5 });
      await pump();
      expect(status()).toMatchObject({ status: "active", rate: 5 });

      await control(journeyId, { type: "skip_to_waypoint", index: 0 });
      await pump();
      expect(status().sample.segmentIndex).toBe(0);
      expect(["waypoint_pause", "moving"]).toContain(status().sample.status);

      await control(journeyId, { type: "seek", simMs: planned.totalDurationMs });
      await pump();
      const final = status();
      expect(final.status).toBe("completed");
      expect(final.sample.progress).toBe(1);

      await h.sql("update public.share_links set revoked_at = now() where id = $1", [link.body.id]);
      await h.sql("select realtime.send('{\"reason\":\"revoked\"}'::jsonb, 'revoked', $1, true)", [
        view.realtimeTopic,
      ]);
      await pump();
      expect(follower.getSnapshot().revoked).toBe(true);
    });

    it("rejects unknown, malformed and revoked tokens identically", async () => {
      const { journeyId } = await plan();
      const created = await h.call<CreateShareLinkResult>(createShareLink, {
        user: OWNER,
        body: { journeyId },
      });

      const malformed = await h.call(resolveShare, { body: { token: "nope" } });
      const unknown = await h.call(resolveShare, { body: { token: "A".repeat(43) } });
      expect(malformed.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(unknown.body).toEqual(malformed.body);

      await h.sql("update public.share_links set revoked_at = now() where id = $1", [
        created.body.id,
      ]);
      const revoked = await h.call(resolveShare, { body: { token: created.body.token } });
      expect(revoked.status).toBe(404);
      expect(revoked.body).toEqual(malformed.body);
    });

    it("supports GET for resolution", async () => {
      const res = await h.call(resolveShare, { method: "GET" });
      expect(res.status).toBe(404);
    });

    it("rate-limits share resolution per IP", async () => {
      let last = 0;
      for (let i = 0; i < 62; i++) {
        last = (await h.call(resolveShare, { body: { token: "x" }, ip: "198.51.100.7" })).status;
      }
      expect(last).toBe(429);
      const other = await h.call(resolveShare, { body: { token: "x" }, ip: "198.51.100.8" });
      expect(other.status).toBe(404);
    });
  });
});
