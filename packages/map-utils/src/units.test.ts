import { describe, expect, it } from "vitest";
import {
  formatClockTime,
  formatDistance,
  formatDuration,
  formatSpeed,
  kmhToMps,
  mpsToKmh,
} from "./units.ts";

describe("units", () => {
  it("converts speeds", () => {
    expect(kmhToMps(36)).toBe(10);
    expect(mpsToKmh(10)).toBe(36);
  });
  it("formats distances", () => {
    expect(formatDistance(742.4)).toBe("742 m");
    expect(formatDistance(18_400)).toBe("18.4 km");
    expect(formatDistance(250_000)).toBe("250 km");
    expect(formatDistance(-1)).toBe("—");
  });
  it("formats durations", () => {
    expect(formatDuration(42_000)).toBe("42 s");
    expect(formatDuration(25 * 60_000)).toBe("25 min");
    expect(formatDuration(120 * 60_000)).toBe("2 h");
    expect(formatDuration(135 * 60_000)).toBe("2 h 15 min");
  });
  it("formats speed and clock time", () => {
    expect(formatSpeed(13.9)).toBe("50 km/h");
    expect(formatClockTime(Date.UTC(2026, 0, 1, 14, 12), "en-US", "Asia/Kolkata")).toBe("7:42 PM");
  });
});
