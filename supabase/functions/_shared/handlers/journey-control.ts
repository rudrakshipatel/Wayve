import { effectiveStatus, transition } from "@wave/simulation-engine";
import {
  journeyControlInputSchema,
  type JourneyControlResult,
  type SessionAction,
} from "@wave/types";
import { ApiError, conflict, fromZod, notFound } from "../errors.ts";
import { enforceRateLimit, RATE_LIMITS, requireUser, type Handler } from "../context.ts";
import { RevisionConflictError } from "../repository.ts";

const MAX_ATTEMPTS = 3;

/**
 * Start / schedule / pause / resume / stop / restart / change rate / seek / skip to waypoint.
 * Runs the shared state machine with server time and writes with optimistic concurrency.
 */
export const journeyControl: Handler<JourneyControlResult> = async (ctx, body) => {
  const userId = requireUser(ctx);
  const parsed = journeyControlInputSchema.safeParse(body);
  if (!parsed.success) throw fromZod(parsed.error);
  await enforceRateLimit(ctx, RATE_LIMITS.control, userId);
  const { journeyId, action: requested } = parsed.data;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const state = await ctx.repo.getJourneyControlState(journeyId, userId);
    if (!state) throw notFound("Journey not found");

    let action: SessionAction;
    if (requested.type === "skip_to_waypoint") {
      const arrival = state.waypointArrivalsMs[requested.index];
      if (arrival === undefined)
        throw new ApiError(400, "invalid_waypoint", "This journey has no such waypoint");
      action = { type: "seek", simMs: arrival };
    } else {
      action = requested;
    }

    const now = ctx.now();
    const result = transition(state.clock, action, now, state.totalDurationMs);
    if (!result.ok) {
      const { error } = result;
      const message =
        error.code === "invalid_transition"
          ? `Cannot ${error.action.replace("_", " ")} a journey that is ${error.from}`
          : error.code.replaceAll("_", " ");
      throw conflict(error.code, message);
    }

    try {
      const clock = await ctx.repo.applySessionClock(journeyId, state.clock.revision, result.clock);
      return {
        clock,
        status: effectiveStatus(clock, now, state.totalDurationMs),
        serverTimeMs: now,
      };
    } catch (error) {
      if (error instanceof RevisionConflictError) continue;
      throw error;
    }
  }
  throw conflict("revision_conflict", "The journey changed at the same time; please retry");
};
