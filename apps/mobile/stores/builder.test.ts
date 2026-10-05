import { beforeEach, describe, expect, it } from "vitest";
import { currentStep, stepBlocker, toPlanRequest, useBuilder } from "./builder";

const home = { name: "Home", latitude: 23.03, longitude: 72.58 };
const college = { name: "College", latitude: 23.04, longitude: 72.55 };
const cafe = { name: "Cafe", latitude: 23.05, longitude: 72.53 };
const airport = { name: "Airport", latitude: 23.07, longitude: 72.63 };

describe("journey builder", () => {
  beforeEach(() => {
    useBuilder.getState().reset();
  });

  it("walks through the steps and blocks until each is complete", () => {
    const b = useBuilder.getState;
    expect(currentStep(b())).toBe("start");
    b().next();
    expect(currentStep(b())).toBe("start");
    expect(stepBlocker(b())).toBe("Choose a starting point");
    b().setStop(0, home);
    b().next();
    expect(currentStep(b())).toBe("destination");
    b().setStop(1, airport);
    b().next();
    b().next();
    expect(currentStep(b())).toBe("route");
    b().back();
    expect(currentStep(b())).toBe("waypoints");
  });

  it("builds a multi-segment journey with per-leg modes, speeds and pauses", () => {
    const b = useBuilder.getState;
    b().setStop(0, home);
    b().setStop(1, airport);
    b().addWaypoint();
    b().addWaypoint();
    expect(b().stops).toHaveLength(4);
    expect(b().legs).toHaveLength(3);
    b().setStop(1, college);
    b().setStop(2, cafe);

    b().setLeg(0, { travelMode: "driving", targetSpeedKmh: 45, pauseAfterS: 120 });
    b().setLeg(1, { travelMode: "walking", targetSpeedKmh: 5, pauseAfterS: 600 });
    b().setLeg(2, { travelMode: "driving", targetSpeedKmh: 50, routeChoice: 1 });

    const plan = toPlanRequest(b());
    expect(
      plan.segments.map((s) => [s.from.name, s.to.name, s.travelMode, s.targetSpeedKmh]),
    ).toEqual([
      ["Home", "College", "driving", 45],
      ["College", "Cafe", "walking", 5],
      ["Cafe", "Airport", "driving", 50],
    ]);
    expect(plan.segments.map((s) => s.pauseAfterS)).toEqual([120, 600, 0]);
    expect(plan.routeChoice).toEqual([0, 0, 1]);
  });

  it("supports duration-based pacing", () => {
    const b = useBuilder.getState;
    b().setStop(0, home);
    b().setStop(1, airport);
    b().setLeg(0, { pacing: "duration", durationMin: 25 });
    const plan = toPlanRequest(b());
    expect(plan.segments[0]).toMatchObject({ durationS: 1500 });
    expect(plan.segments[0]?.targetSpeedKmh).toBeUndefined();
  });

  it("resets speed to the new mode's default and validates limits", () => {
    const b = useBuilder.getState;
    b().setLeg(0, { travelMode: "walking" });
    expect(b().legs[0]?.targetSpeedKmh).toBe(5);
    b().setLeg(0, { targetSpeedKmh: 40 });
    useBuilder.setState({ stepIndex: 5 });
    expect(stepBlocker(b())).toMatch(/1–12 km\/h/);
  });

  it("removes waypoints but never the start or destination", () => {
    const b = useBuilder.getState;
    b().addWaypoint();
    b().removeStop(0);
    b().removeStop(2);
    expect(b().stops).toHaveLength(3);
    b().removeStop(1);
    expect(b().stops).toHaveLength(2);
    expect(b().legs).toHaveLength(1);
  });

  it("rejects schedules in the past", () => {
    const b = useBuilder.getState;
    b().setSchedule({ mode: "later", startAtMs: Date.now() - 1000 });
    useBuilder.setState({ stepIndex: 5 });
    expect(stepBlocker(b())).toBe("Pick a start time in the future");
  });
});
