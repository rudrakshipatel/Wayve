import { describe, expect, it } from "vitest";
import {
  createShareLinkInputSchema,
  journeyControlInputSchema,
  journeySegmentSchema,
  planJourneyInputSchema,
} from "./schemas.ts";

const place = (name: string, latitude: number, longitude: number) => ({
  name,
  latitude,
  longitude,
});
const from = place("Ahmedabad", 23.0225, 72.5714);
const to = place("Gandhinagar", 23.2156, 72.6369);

describe("journeySegmentSchema", () => {
  it("accepts a valid segment and defaults the pause", () => {
    const seg = journeySegmentSchema.parse({ from, to, travelMode: "driving", targetSpeedKmh: 45 });
    expect(seg.pauseAfterS).toBe(0);
  });
  it("rejects speed and duration together", () => {
    const r = journeySegmentSchema.safeParse({
      from,
      to,
      travelMode: "driving",
      targetSpeedKmh: 45,
      durationS: 600,
    });
    expect(r.success).toBe(false);
  });
  it("enforces per-mode speed limits", () => {
    expect(
      journeySegmentSchema.safeParse({ from, to, travelMode: "walking", targetSpeedKmh: 40 })
        .success,
    ).toBe(false);
    expect(
      journeySegmentSchema.safeParse({ from, to, travelMode: "train", targetSpeedKmh: 300 })
        .success,
    ).toBe(true);
  });
  it("rejects invalid coordinates and modes", () => {
    expect(
      journeySegmentSchema.safeParse({ from: { ...from, latitude: 91 }, to, travelMode: "driving" })
        .success,
    ).toBe(false);
    expect(journeySegmentSchema.safeParse({ from, to, travelMode: "teleport" }).success).toBe(
      false,
    );
  });
});

describe("planJourneyInputSchema", () => {
  it("bounds the number of segments", () => {
    const seg = { from, to, travelMode: "walking" as const };
    expect(planJourneyInputSchema.safeParse({ segments: [] }).success).toBe(false);
    expect(planJourneyInputSchema.safeParse({ segments: Array(11).fill(seg) }).success).toBe(false);
    expect(planJourneyInputSchema.safeParse({ segments: [seg, seg] }).success).toBe(true);
  });
});

describe("journeyControlInputSchema", () => {
  const journeyId = "6f1f8a4e-5b8e-4c39-9a2f-1d1f3a9a7c11";
  it("accepts known actions", () => {
    expect(
      journeyControlInputSchema.parse({ journeyId, action: { type: "set_rate", rate: 2 } }).action,
    ).toEqual({
      type: "set_rate",
      rate: 2,
    });
  });
  it("rejects unknown actions, bad rates and bad ids", () => {
    expect(
      journeyControlInputSchema.safeParse({ journeyId, action: { type: "teleport" } }).success,
    ).toBe(false);
    expect(
      journeyControlInputSchema.safeParse({ journeyId, action: { type: "set_rate", rate: 50 } })
        .success,
    ).toBe(false);
    expect(
      journeyControlInputSchema.safeParse({ journeyId: "1", action: { type: "pause" } }).success,
    ).toBe(false);
  });
});

describe("createShareLinkInputSchema", () => {
  it("defaults and bounds the TTL", () => {
    const journeyId = "6f1f8a4e-5b8e-4c39-9a2f-1d1f3a9a7c11";
    expect(createShareLinkInputSchema.parse({ journeyId }).ttlHours).toBe(24);
    expect(createShareLinkInputSchema.safeParse({ journeyId, ttlHours: 24 * 31 }).success).toBe(
      false,
    );
  });
});
