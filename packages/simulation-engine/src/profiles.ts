import type { TravelMode } from "@wave/types";

export interface TurnSlowdown {
  /** Heading change (degrees) over `windowM` below which no slowdown applies. */
  readonly minAngleDeg: number;
  /** Speed at a 180° turn. */
  readonly minSpeedKmh: number;
  /** Distance before/after a point used to measure the heading change. */
  readonly windowM: number;
}

export type StopPattern =
  | {
      /** Unscheduled stops (traffic lights, junctions) placed randomly. */
      readonly kind: "random";
      readonly perKm: number;
      readonly minSpacingM: number;
      readonly minDwellS: number;
      readonly maxDwellS: number;
    }
  | {
      /** Regular stops (bus stops, stations) at roughly fixed spacing. */
      readonly kind: "interval";
      readonly spacingM: number;
      readonly jitterM: number;
      readonly minDwellS: number;
      readonly maxDwellS: number;
    };

export interface MovementProfile {
  readonly defaultSpeedKmh: number;
  /** Speed bounds applied when solving a requested duration. */
  readonly minSpeedKmh: number;
  readonly maxSpeedKmh: number;
  readonly accelerationMps2: number;
  readonly decelerationMps2: number;
  /** Relative cruise speed variation (0.1 = ±10 %). */
  readonly speedVariation: number;
  /** Distance over which one variation sample applies. */
  readonly variationChunkM: number;
  readonly turnSlowdown: TurnSlowdown | null;
  readonly stops: StopPattern | null;
  /** Keep generated stops at least this far from segment ends. */
  readonly stopEndClearanceM: number;
  /** Chord half-length used to compute a smooth heading. */
  readonly headingWindowM: number;
}

export const DEFAULT_PROFILES: Readonly<Record<TravelMode, MovementProfile>> = {
  walking: {
    defaultSpeedKmh: 5,
    minSpeedKmh: 1,
    maxSpeedKmh: 12,
    accelerationMps2: 0.5,
    decelerationMps2: 0.8,
    speedVariation: 0.08,
    variationChunkM: 60,
    turnSlowdown: { minAngleDeg: 70, minSpeedKmh: 3.5, windowM: 5 },
    stops: null,
    stopEndClearanceM: 30,
    headingWindowM: 4,
  },
  cycling: {
    defaultSpeedKmh: 18,
    minSpeedKmh: 3,
    maxSpeedKmh: 60,
    accelerationMps2: 0.8,
    decelerationMps2: 1.5,
    speedVariation: 0.15,
    variationChunkM: 150,
    turnSlowdown: { minAngleDeg: 40, minSpeedKmh: 10, windowM: 12 },
    stops: { kind: "random", perKm: 0.15, minSpacingM: 400, minDwellS: 5, maxDwellS: 20 },
    stopEndClearanceM: 80,
    headingWindowM: 8,
  },
  driving: {
    defaultSpeedKmh: 50,
    minSpeedKmh: 5,
    maxSpeedKmh: 200,
    accelerationMps2: 1.8,
    decelerationMps2: 2.5,
    speedVariation: 0.2,
    variationChunkM: 400,
    turnSlowdown: { minAngleDeg: 30, minSpeedKmh: 18, windowM: 25 },
    stops: { kind: "random", perKm: 0.4, minSpacingM: 300, minDwellS: 8, maxDwellS: 45 },
    stopEndClearanceM: 120,
    headingWindowM: 12,
  },
  bus: {
    defaultSpeedKmh: 30,
    minSpeedKmh: 5,
    maxSpeedKmh: 120,
    accelerationMps2: 1.0,
    decelerationMps2: 1.3,
    speedVariation: 0.2,
    variationChunkM: 300,
    turnSlowdown: { minAngleDeg: 30, minSpeedKmh: 15, windowM: 25 },
    stops: { kind: "interval", spacingM: 450, jitterM: 150, minDwellS: 12, maxDwellS: 35 },
    stopEndClearanceM: 120,
    headingWindowM: 14,
  },
  train: {
    defaultSpeedKmh: 90,
    minSpeedKmh: 10,
    maxSpeedKmh: 350,
    accelerationMps2: 0.6,
    decelerationMps2: 0.8,
    speedVariation: 0.05,
    variationChunkM: 2000,
    turnSlowdown: { minAngleDeg: 45, minSpeedKmh: 50, windowM: 80 },
    stops: { kind: "interval", spacingM: 8000, jitterM: 2000, minDwellS: 30, maxDwellS: 90 },
    stopEndClearanceM: 1500,
    headingWindowM: 30,
  },
};

export type MovementProfileOverrides = {
  readonly [K in keyof MovementProfile]?: MovementProfile[K];
};

export function resolveProfile(
  mode: TravelMode,
  overrides?: MovementProfileOverrides,
): MovementProfile {
  const base = DEFAULT_PROFILES[mode];
  if (!overrides) return base;
  const merged: MovementProfile = { ...base, ...stripUndefined(overrides) };
  validateProfile(merged);
  return merged;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function validateProfile(p: MovementProfile): void {
  const positive: (keyof MovementProfile)[] = [
    "defaultSpeedKmh",
    "minSpeedKmh",
    "maxSpeedKmh",
    "accelerationMps2",
    "decelerationMps2",
    "variationChunkM",
    "headingWindowM",
  ];
  for (const key of positive) {
    const v = p[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      throw new RangeError(`Movement profile "${key}" must be a positive number`);
    }
  }
  if (p.minSpeedKmh > p.maxSpeedKmh) throw new RangeError("minSpeedKmh exceeds maxSpeedKmh");
  if (p.speedVariation < 0 || p.speedVariation >= 1) {
    throw new RangeError("speedVariation must be in [0, 1)");
  }
}
