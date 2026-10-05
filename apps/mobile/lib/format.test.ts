import { describe, expect, it } from "vitest";
import { formatDay, STATUS_LABEL } from "./format";

describe("format", () => {
  it("formats relative days", () => {
    const now = new Date(2026, 9, 5, 18);
    expect(formatDay(new Date(2026, 9, 5, 9).toISOString(), now)).toBe("Today");
    expect(formatDay(new Date(2026, 9, 4, 23).toISOString(), now)).toBe("Yesterday");
    expect(formatDay(new Date(2026, 8, 1).toISOString(), now)).not.toMatch(/Today|Yesterday/);
  });
  it("labels every status", () => {
    expect(STATUS_LABEL.active).toBe("Live");
    expect(STATUS_LABEL.cancelled).toBe("Stopped");
  });
});
