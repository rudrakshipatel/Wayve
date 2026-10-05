import {
  isWellFormedShareToken,
  resolveShareInputSchema,
  type PublicJourneyView,
} from "@wave/types";
import { notFound } from "../errors.ts";
import { enforceRateLimit, RATE_LIMITS, type Handler } from "../context.ts";

/**
 * Anonymous: resolves a share token to the public journey view. Unknown, revoked, expired
 * and malformed tokens are indistinguishable (404).
 */
export const resolveShare: Handler<PublicJourneyView> = async (ctx, body) => {
  await enforceRateLimit(ctx, RATE_LIMITS.resolve, ctx.clientIp);
  const parsed = resolveShareInputSchema.safeParse(body);
  const token = parsed.success ? parsed.data.token : null;
  if (!token || !isWellFormedShareToken(token))
    throw notFound("This link is invalid or has expired");
  const view = await ctx.repo.getSharedJourney(token);
  if (!view) throw notFound("This link is invalid or has expired");
  return view;
};
