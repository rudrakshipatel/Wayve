import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("lets later colour classes win", () => {
    expect(cn("text-ink", "text-bg")).toBe("text-bg");
    expect(cn("bg-surface", "bg-ink")).toBe("bg-ink");
    expect(cn("text-[16px] text-ink", "text-tide")).toBe("text-[16px] text-tide");
  });
  it("keeps font-size and colour independent", () => {
    expect(cn("text-ink", "text-[13px]")).toBe("text-ink text-[13px]");
  });
});
