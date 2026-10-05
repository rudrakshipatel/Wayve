import { z } from "zod";
import { badRequest } from "../errors.ts";
import { enforceRateLimit, RATE_LIMITS, requireUser, type Handler } from "../context.ts";

const inputSchema = z.object({ confirm: z.literal("DELETE") });

/**
 * Permanently deletes the caller's account and, via cascades, every journey, route,
 * session, share link and saved location they own. Live viewers are notified.
 */
export function createDeleteAccount(
  deleteUser: (userId: string) => Promise<void>,
): Handler<{ deleted: true }> {
  return async (ctx, body) => {
    const userId = requireUser(ctx);
    if (!inputSchema.safeParse(body).success)
      throw badRequest('Send {"confirm":"DELETE"} to delete your account');
    await enforceRateLimit(ctx, RATE_LIMITS.control, userId);
    await deleteUser(userId);
    return { deleted: true };
  };
}
