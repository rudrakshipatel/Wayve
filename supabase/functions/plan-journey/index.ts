import { serve } from "../_shared/deno/runtime.ts";
import { planJourney } from "../_shared/handlers/plan-journey.ts";

serve(planJourney);
