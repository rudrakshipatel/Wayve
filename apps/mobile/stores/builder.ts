import { create } from "zustand";
import {
  planJourneyInputSchema,
  TRAVEL_MODE_SPEED_LIMITS_KMH,
  type Place,
  type PlanJourneyInput,
  type RouteOptionResult,
  type TravelMode,
} from "@wave/types";

export const BUILDER_STEPS = [
  "start",
  "destination",
  "waypoints",
  "route",
  "mode",
  "timing",
  "preview",
] as const;
export type BuilderStep = (typeof BUILDER_STEPS)[number];

export const STEP_TITLES: Record<BuilderStep, string> = {
  start: "Where does it start?",
  destination: "Where is it going?",
  waypoints: "Any stops on the way?",
  route: "Pick a route",
  mode: "How does it travel?",
  timing: "Speed and timing",
  preview: "Preview",
};

export const MAX_WAYPOINTS = 8;

export interface LegConfig {
  readonly travelMode: TravelMode;
  readonly pacing: "speed" | "duration";
  readonly targetSpeedKmh: number;
  readonly durationMin: number;
  /** Pause at the end of this leg (the following waypoint). */
  readonly pauseAfterS: number;
  readonly routeChoice: number;
}

export type Schedule =
  { readonly mode: "now" } | { readonly mode: "later"; readonly startAtMs: number };

export interface BuilderData {
  readonly stepIndex: number;
  /** Start, waypoints…, destination. `null` until chosen. */
  readonly stops: readonly (Place | null)[];
  readonly legs: readonly LegConfig[];
  readonly schedule: Schedule;
  readonly title: string;
}

export const defaultLeg = (travelMode: TravelMode = "driving"): LegConfig => ({
  travelMode,
  pacing: "speed",
  targetSpeedKmh: TRAVEL_MODE_SPEED_LIMITS_KMH[travelMode].default,
  durationMin: 20,
  pauseAfterS: 0,
  routeChoice: 0,
});

export const initialBuilder = (): BuilderData => ({
  stepIndex: 0,
  stops: [null, null],
  legs: [defaultLeg()],
  schedule: { mode: "now" },
  title: "",
});

/** Keeps one leg per pair of consecutive stops, preserving existing settings. */
function syncLegs(stops: readonly unknown[], legs: readonly LegConfig[]): LegConfig[] {
  const needed = Math.max(1, stops.length - 1);
  const template = legs[legs.length - 1] ?? defaultLeg();
  return Array.from(
    { length: needed },
    (_, i) => legs[i] ?? { ...template, pauseAfterS: 0, routeChoice: 0 },
  );
}

export const currentStep = (d: BuilderData): BuilderStep => BUILDER_STEPS[d.stepIndex] ?? "start";

/** Why the user cannot advance from the current step, or null. */
export function stepBlocker(d: BuilderData): string | null {
  switch (currentStep(d)) {
    case "start":
      return d.stops[0] ? null : "Choose a starting point";
    case "destination":
      return d.stops[d.stops.length - 1] ? null : "Choose a destination";
    case "waypoints":
      return d.stops.every(Boolean) ? null : "Choose a place for each stop, or remove it";
    case "timing": {
      for (const [i, leg] of d.legs.entries()) {
        const { min, max } = TRAVEL_MODE_SPEED_LIMITS_KMH[leg.travelMode];
        if (leg.pacing === "speed" && (leg.targetSpeedKmh < min || leg.targetSpeedKmh > max)) {
          return `Leg ${i + 1}: speed must be ${min}–${max} km/h`;
        }
        if (leg.pacing === "duration" && !(leg.durationMin >= 1))
          return `Leg ${i + 1}: duration must be at least 1 minute`;
      }
      if (d.schedule.mode === "later" && d.schedule.startAtMs <= Date.now())
        return "Pick a start time in the future";
      return null;
    }
    default:
      return null;
  }
}

/** Converts the draft into the plan-journey request, validated with the shared schema. */
export function toPlanRequest(d: BuilderData): PlanJourneyInput {
  const places = d.stops.filter((s): s is Place => s !== null);
  if (places.length !== d.stops.length || places.length < 2)
    throw new Error("Every stop needs a place");
  const request = {
    kind: "journey" as const,
    ...(d.title.trim() ? { title: d.title.trim() } : {}),
    segments: d.legs.map((leg, i) => ({
      from: places[i]!,
      to: places[i + 1]!,
      travelMode: leg.travelMode,
      ...(leg.pacing === "speed"
        ? { targetSpeedKmh: leg.targetSpeedKmh }
        : { durationS: Math.round(leg.durationMin * 60) }),
      pauseAfterS: i < d.legs.length - 1 ? leg.pauseAfterS : 0,
    })),
    routeChoice: d.legs.map((leg) => leg.routeChoice),
  };
  return planJourneyInputSchema.parse(request);
}

interface BuilderStore extends BuilderData {
  readonly routeOptions: Readonly<Record<number, readonly RouteOptionResult[]>>;
  readonly setStop: (index: number, place: Place) => void;
  readonly addWaypoint: () => void;
  readonly removeStop: (index: number) => void;
  readonly setLeg: (index: number, patch: Partial<LegConfig>) => void;
  readonly setAllLegs: (patch: Partial<LegConfig>) => void;
  readonly setRouteOptions: (index: number, options: readonly RouteOptionResult[]) => void;
  readonly setSchedule: (schedule: Schedule) => void;
  readonly setTitle: (title: string) => void;
  readonly next: () => void;
  readonly back: () => void;
  readonly goTo: (step: BuilderStep) => void;
  readonly reset: () => void;
}

export const useBuilder = create<BuilderStore>((set, get) => ({
  ...initialBuilder(),
  routeOptions: {},

  setStop(index, place) {
    const stops = [...get().stops];
    stops[index] = place;
    // Changing a stop invalidates routes for the legs touching it.
    const routeOptions = Object.fromEntries(
      Object.entries(get().routeOptions).filter(
        ([k]) => Number(k) !== index - 1 && Number(k) !== index,
      ),
    );
    const legs = get().legs.map((leg, i) =>
      i === index - 1 || i === index ? { ...leg, routeChoice: 0 } : leg,
    );
    set({ stops, routeOptions, legs });
  },

  addWaypoint() {
    const { stops, legs } = get();
    if (stops.length - 2 >= MAX_WAYPOINTS) return;
    const next = [...stops.slice(0, -1), null, stops[stops.length - 1]!];
    set({ stops: next, legs: syncLegs(next, legs), routeOptions: {} });
  },

  removeStop(index) {
    const { stops, legs } = get();
    if (index <= 0 || index >= stops.length - 1) return;
    const next = stops.filter((_, i) => i !== index);
    const nextLegs = legs.filter((_, i) => i !== index);
    set({ stops: next, legs: syncLegs(next, nextLegs), routeOptions: {} });
  },

  setLeg(index, patch) {
    set({
      legs: get().legs.map((leg, i) => {
        if (i !== index) return leg;
        const merged = { ...leg, ...patch };
        // A new mode starts from that mode's typical speed.
        if (
          patch.travelMode &&
          patch.travelMode !== leg.travelMode &&
          patch.targetSpeedKmh === undefined
        ) {
          return {
            ...merged,
            targetSpeedKmh: TRAVEL_MODE_SPEED_LIMITS_KMH[patch.travelMode].default,
            routeChoice: 0,
          };
        }
        return merged;
      }),
      ...(patch.travelMode ? { routeOptions: { ...get().routeOptions, [index]: [] } } : {}),
    });
  },

  setAllLegs(patch) {
    get().legs.forEach((_, i) => {
      get().setLeg(i, patch);
    });
  },

  setRouteOptions(index, options) {
    set({ routeOptions: { ...get().routeOptions, [index]: options } });
  },

  setSchedule(schedule) {
    set({ schedule });
  },

  setTitle(title) {
    set({ title });
  },

  next() {
    const state = get();
    if (stepBlocker(state)) return;
    set({ stepIndex: Math.min(BUILDER_STEPS.length - 1, state.stepIndex + 1) });
  },

  back() {
    set({ stepIndex: Math.max(0, get().stepIndex - 1) });
  },

  goTo(step) {
    set({ stepIndex: BUILDER_STEPS.indexOf(step) });
  },

  reset() {
    set({ ...initialBuilder(), routeOptions: {} });
  },
}));
