import {
  buildShareUrl,
  createShareLinkInputSchema,
  generateChannelKey,
  generateShareToken,
  hashShareToken,
  shareTokenPrefix,
  type CreateShareLinkResult,
} from "@wave/types";
import { ApiError, fromZod, notFound, RpcError } from "../errors.ts";
import { enforceRateLimit, RATE_LIMITS, requireUser, type Handler } from "../context.ts";

/**
 * Creates a view-only share link. The raw token is returned exactly once; only its
 * SHA-256 is stored. Revocation is an owner RPC (public.revoke_share_link).
 */
export const createShareLink: Handler<CreateShareLinkResult> = async (ctx, body) => {
  const userId = requireUser(ctx);
  const parsed = createShareLinkInputSchema.safeParse(body);
  if (!parsed.success) throw fromZod(parsed.error);
  await enforceRateLimit(ctx, RATE_LIMITS.share, userId);

  const token = generateShareToken();
  try {
    const link = await ctx.repo.createShareLink({
      ownerId: userId,
      journeyId: parsed.data.journeyId,
      tokenHash: await hashShareToken(token),
      tokenPrefix: shareTokenPrefix(token),
      channelKey: generateChannelKey(),
      ttlHours: parsed.data.ttlHours,
    });
    return {
      id: link.id,
      url: buildShareUrl(ctx.config.shareBaseUrl, token),
      token,
      expiresAt: link.expiresAt,
    };
  } catch (error) {
    if (error instanceof RpcError) {
      if (error.code === "P0002") throw notFound("Journey not found");
      if (error.message.includes("share_link_limit")) {
        throw new ApiError(
          429,
          "share_link_limit",
          "This journey already has the maximum number of live links",
        );
      }
    }
    throw error;
  }
};
