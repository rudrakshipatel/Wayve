import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline.ts";
import { sampleTimeline } from "./sample.ts";
import { AHMEDABAD, lRoute, straightRoute } from "./test-fixtures.ts";

/** Generous budgets (≈10× headroom on a laptop) so CI noise never flakes them. */
describe("performance budgets", () => {
  const long = buildTimeline({
    seed: "perf",
    segments: [
      { coordinates: straightRoute(AHMEDABAD, 20, 150_000, 30), travelMode: "driving" },
      { coordinates: lRoute(AHMEDABAD, 40_000, 25), travelMode: "bus", pauseAfterS: 120 },
    ],
  });

  it("samples a long journey far faster than one animation frame", () => {
    const n = 20_000;
    const start = performance.now();
    for (let i = 0; i < n; i++) sampleTimeline(long, (i / n) * long.totalDurationMs);
    const perSampleMs = (performance.now() - start) / n;
    expect(perSampleMs).toBeLessThan(0.25);
  });

  it("compiles a 230 km, multi-mode journey quickly", () => {
    const start = performance.now();
    const t = buildTimeline({
      seed: "perf-build",
      segments: [
        {
          coordinates: straightRoute(AHMEDABAD, 20, 150_000, 30),
          travelMode: "driving",
          durationS: 7200,
        },
        { coordinates: lRoute(AHMEDABAD, 40_000, 25), travelMode: "train" },
      ],
    });
    expect(performance.now() - start).toBeLessThan(1500);
    expect(t.distances.length).toBeLessThan(80_000);
  });
});
