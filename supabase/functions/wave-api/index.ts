// Single entry point for Wave's server API: /functions/v1/wave-api/<route>.
// Each route authenticates callers itself (bearer token → supabase.auth.getUser), and
// resolve-share is public by design, so the gateway's JWT check is disabled.
import { deleteAuthUser, handlerServer, serveRoutes } from "../_shared/deno/runtime.ts";
import { createDeleteAccount } from "../_shared/handlers/delete-account.ts";
import { journeyControl } from "../_shared/handlers/journey-control.ts";
import { planJourney } from "../_shared/handlers/plan-journey.ts";
import { resolveShare } from "../_shared/handlers/resolve-share.ts";
import { routeOptions } from "../_shared/handlers/route-options.ts";
import { createShareLink } from "../_shared/handlers/share-link.ts";

serveRoutes({
  "plan-journey": handlerServer(planJourney),
  "route-options": handlerServer(routeOptions),
  "journey-control": handlerServer(journeyControl),
  "share-link": handlerServer(createShareLink),
  "resolve-share": handlerServer(resolveShare, {
    methods: ["GET", "POST"],
    extraHeaders: { "x-robots-tag": "noindex", "referrer-policy": "no-referrer" },
  }),
  "delete-account": handlerServer(createDeleteAccount(deleteAuthUser)),
});
