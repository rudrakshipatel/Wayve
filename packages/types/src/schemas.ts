import { z } from "zod";
import { LOCATION_FOLDER_KINDS } from "./location.ts";
import { MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE } from "./session.ts";
import { MAX_SHARE_TTL_HOURS, DEFAULT_SHARE_TTL_HOURS } from "./share.ts";
import { TRAVEL_MODES, TRAVEL_MODE_SPEED_LIMITS_KMH } from "./travel.ts";

export const MAX_SEGMENTS = 10;
export const MAX_ROUTE_POINTS = 20_000;
export const MIN_SEGMENT_DURATION_S = 10;
export const MAX_SEGMENT_DURATION_S = 72 * 3600;
export const MAX_PAUSE_S = 6 * 3600;

const trimmedName = z.string().trim().min(1).max(120);

export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);

export const coordinateSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

export const placeSchema = coordinateSchema.extend({
  name: trimmedName,
  address: z.string().trim().max(300).optional(),
});

export const lngLatSchema = z.tuple([longitudeSchema, latitudeSchema]);

export const travelModeSchema = z.enum(TRAVEL_MODES);

export const journeySegmentSchema = z
  .object({
    from: placeSchema,
    to: placeSchema,
    travelMode: travelModeSchema,
    targetSpeedKmh: z.number().positive().optional(),
    durationS: z
      .number()

      .min(MIN_SEGMENT_DURATION_S)
      .max(MAX_SEGMENT_DURATION_S)
      .optional(),
    pauseAfterS: z.number().min(0).max(MAX_PAUSE_S).default(0),
  })
  .superRefine((seg, ctx) => {
    if (seg.targetSpeedKmh !== undefined && seg.durationS !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Specify either targetSpeedKmh or durationS, not both",
        path: ["durationS"],
      });
    }
    if (seg.targetSpeedKmh !== undefined) {
      const { min, max } = TRAVEL_MODE_SPEED_LIMITS_KMH[seg.travelMode];
      if (seg.targetSpeedKmh < min || seg.targetSpeedKmh > max) {
        ctx.addIssue({
          code: "custom",
          message: `Speed for ${seg.travelMode} must be between ${min} and ${max} km/h`,
          path: ["targetSpeedKmh"],
        });
      }
    }
  });

export const planJourneyInputSchema = z.object({
  kind: z.literal("journey").default("journey"),
  title: trimmedName.optional(),
  segments: z.array(journeySegmentSchema).min(1).max(MAX_SEGMENTS),
  /** Optional alternative route index per segment as returned by the routing preview. */
  routeChoice: z.array(z.number().int().min(0).max(2)).max(MAX_SEGMENTS).optional(),
});
export type PlanJourneyInput = z.input<typeof planJourneyInputSchema>;

/** A static simulated location, shared like a journey that never moves. */
export const planStaticLocationInputSchema = z.object({
  kind: z.literal("static"),
  title: trimmedName.optional(),
  location: placeSchema,
});
export type PlanStaticLocationInput = z.input<typeof planStaticLocationInputSchema>;

export const planRequestSchema = z.union([planStaticLocationInputSchema, planJourneyInputSchema]);
export type PlanRequest = z.input<typeof planRequestSchema>;

export const routeOptionsInputSchema = z.object({
  from: coordinateSchema,
  to: coordinateSchema,
  travelMode: travelModeSchema,
});
export type RouteOptionsInput = z.input<typeof routeOptionsInputSchema>;

export const resolveShareInputSchema = z.object({ token: z.string().max(64) });

export const sessionActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("schedule"), startAtMs: z.number().int().positive() }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("stop") }),
  z.object({ type: z.literal("restart") }),
  z.object({
    type: z.literal("set_rate"),
    rate: z.number().min(MIN_PLAYBACK_RATE).max(MAX_PLAYBACK_RATE),
  }),
  z.object({ type: z.literal("seek"), simMs: z.number().min(0) }),
]);

/** Actions accepted by journey-control: session actions plus server-resolved conveniences. */
export const controlActionSchema = z.union([
  sessionActionSchema,
  z.object({
    type: z.literal("skip_to_waypoint"),
    index: z.number().int().min(0).max(MAX_SEGMENTS),
  }),
]);
export type ControlAction = z.infer<typeof controlActionSchema>;

export const journeyControlInputSchema = z.object({
  journeyId: z.uuid(),
  action: controlActionSchema,
});
export type JourneyControlInput = z.infer<typeof journeyControlInputSchema>;

export const createShareLinkInputSchema = z.object({
  journeyId: z.uuid(),
  ttlHours: z.number().int().min(1).max(MAX_SHARE_TTL_HOURS).default(DEFAULT_SHARE_TTL_HOURS),
});
export type CreateShareLinkInput = z.input<typeof createShareLinkInputSchema>;

export const savedLocationInputSchema = coordinateSchema.extend({
  name: trimmedName,
  address: z.string().trim().max(300).nullable().default(null),
  folderId: z.uuid().nullable().default(null),
});
export type SavedLocationInput = z.input<typeof savedLocationInputSchema>;

export const locationFolderInputSchema = z.object({
  name: trimmedName,
  kind: z.enum(LOCATION_FOLDER_KINDS).default("custom"),
});
