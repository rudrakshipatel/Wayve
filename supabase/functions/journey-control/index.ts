import { serve } from "../_shared/deno/runtime.ts";
import { journeyControl } from "../_shared/handlers/journey-control.ts";

serve(journeyControl);
