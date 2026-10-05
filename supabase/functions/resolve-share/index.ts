import { serve } from "../_shared/deno/runtime.ts";
import { resolveShare } from "../_shared/handlers/resolve-share.ts";

// Public: viewers have no account. Rate limited per client IP inside the handler.
serve(resolveShare, {
  methods: ["GET", "POST"],
  extraHeaders: { "x-robots-tag": "noindex", "referrer-policy": "no-referrer" },
});
