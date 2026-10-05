import { serve } from "../_shared/deno/runtime.ts";
import { createShareLink } from "../_shared/handlers/share-link.ts";

serve(createShareLink);
