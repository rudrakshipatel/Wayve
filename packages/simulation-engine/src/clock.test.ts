import { describe, expect, it } from "vitest";
import type { SessionClock } from "@wave/types";
import {
  ServerClockOffset,
  canTransition,
  effectiveStatus,
  etaMs,
  initialClock,
  settle,
  simElapsedAt,
  transition,
} from "./clock.ts";

const TOTAL = 600_000;
const T0 = 1_700_000_000_000;

function apply(
  clock: SessionClock,
  action: Parameters<typeof transition>[1],
  now: number,
): SessionClock {
  const r = transition(clock, action, now, TOTAL);
  if (!r.ok) throw new Error(r.error.code);
  return r.clock;
}

describe("session clock", () => {
  it("runs start → pause → resume → complete", () => {
    let c = apply(initialClock(T0), { type: "start" }, T0);
    expect(c.status).toBe("active");
    expect(simElapsedAt(c, T0 + 60_000, TOTAL)).toBe(60_000);

    c = apply(c, { type: "pause" }, T0 + 60_000);
    expect(c.status).toBe("paused");
    expect(simElapsedAt(c, T0 + 500_000, TOTAL)).toBe(60_000);
    expect(etaMs(c, T0 + 500_000, TOTAL)).toBeNull();

    c = apply(c, { type: "resume" }, T0 + 120_000);
    expect(simElapsedAt(c, T0 + 180_000, TOTAL)).toBe(120_000);
    expect(etaMs(c, T0 + 180_000, TOTAL)).toBe(T0 + 120_000 + 540_000);

    expect(effectiveStatus(c, T0 + 700_000, TOTAL)).toBe("completed");
    const done = settle(c, T0 + 700_000, TOTAL);
    expect(done.status).toBe("completed");
    expect(done.anchorWallMs).toBe(T0 + 660_000);
    expect(simElapsedAt(done, T0 + 10_000_000, TOTAL)).toBe(TOTAL);
  });

  it("increments the revision on every transition", () => {
    const a = apply(initialClock(T0), { type: "start" }, T0);
    const b = apply(a, { type: "pause" }, T0 + 1);
    expect(b.revision).toBeGreaterThan(a.revision);
  });

  it("changes rate without jumping", () => {
    let c = apply(initialClock(T0), { type: "start" }, T0);
    c = apply(c, { type: "set_rate", rate: 2 }, T0 + 100_000);
    expect(simElapsedAt(c, T0 + 100_000, TOTAL)).toBe(100_000);
    expect(simElapsedAt(c, T0 + 110_000, TOTAL)).toBe(120_000);
    expect(transition(c, { type: "set_rate", rate: 0 }, T0, TOTAL)).toMatchObject({
      ok: false,
      error: { code: "invalid_rate" },
    });
  });

  it("seeks and restarts", () => {
    let c = apply(initialClock(T0), { type: "start" }, T0);
    c = apply(c, { type: "seek", simMs: 300_000 }, T0 + 1000);
    expect(simElapsedAt(c, T0 + 1000, TOTAL)).toBe(300_000);
    c = apply(c, { type: "restart" }, T0 + 2000);
    expect(simElapsedAt(c, T0 + 2000, TOTAL)).toBe(0);
    c = apply(c, { type: "seek", simMs: TOTAL * 2 }, T0 + 3000);
    expect(c.status).toBe("completed");
  });

  it("activates a scheduled journey without any server action", () => {
    const c = apply(initialClock(T0), { type: "schedule", startAtMs: T0 + 3_600_000 }, T0);
    expect(c.status).toBe("scheduled");
    expect(effectiveStatus(c, T0 + 1_000, TOTAL)).toBe("scheduled");
    expect(simElapsedAt(c, T0 + 1_000, TOTAL)).toBe(0);
    expect(effectiveStatus(c, T0 + 3_600_000 + 5_000, TOTAL)).toBe("active");
    expect(simElapsedAt(c, T0 + 3_600_000 + 5_000, TOTAL)).toBe(5_000);
    expect(etaMs(c, T0, TOTAL)).toBe(T0 + 3_600_000 + TOTAL);
    expect(effectiveStatus(c, T0 + 3_600_000 + TOTAL, TOTAL)).toBe("completed");
  });

  it("rejects schedules in the past and invalid transitions", () => {
    expect(
      transition(initialClock(T0), { type: "schedule", startAtMs: T0 - 1 }, T0, TOTAL),
    ).toMatchObject({
      ok: false,
      error: { code: "schedule_in_past" },
    });
    expect(transition(initialClock(T0), { type: "pause" }, T0, TOTAL)).toMatchObject({
      ok: false,
      error: { code: "invalid_transition", from: "draft", action: "pause" },
    });
    const done = settle(apply(initialClock(T0), { type: "start" }, T0), T0 + TOTAL + 1, TOTAL);
    expect(transition(done, { type: "resume" }, T0 + TOTAL + 2, TOTAL).ok).toBe(false);
    expect(canTransition("cancelled", "start")).toBe(false);
  });

  it("stops (cancels) and freezes position", () => {
    let c = apply(initialClock(T0), { type: "start" }, T0);
    c = apply(c, { type: "stop" }, T0 + 42_000);
    expect(c.status).toBe("cancelled");
    expect(simElapsedAt(c, T0 + 999_999, TOTAL)).toBe(42_000);
  });

  it("completes only when the end is reached", () => {
    const c = apply(initialClock(T0), { type: "start" }, T0);
    expect(transition(c, { type: "complete" }, T0 + 1000, TOTAL)).toMatchObject({
      ok: false,
      error: { code: "not_finished" },
    });
  });
});

describe("ServerClockOffset", () => {
  it("estimates and smooths offsets", () => {
    const o = new ServerClockOffset(0.5);
    o.observe(10_000, 9_000, 200);
    expect(o.offsetMs).toBe(1_100);
    o.observe(10_000, 9_100, 0);
    expect(o.offsetMs).toBe(1_000);
    expect(o.serverNow(5_000)).toBe(6_000);
  });
});
