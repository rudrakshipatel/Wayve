import PostHog from "posthog-react-native";
import { env } from "./env";

/** Product analytics without location data, journey content or share tokens. */
export const posthog = env.posthogKey
  ? new PostHog(env.posthogKey, { host: env.posthogHost, captureAppLifecycleEvents: true })
  : null;

type EventName =
  | "journey_planned"
  | "journey_started"
  | "journey_controlled"
  | "share_link_created"
  | "share_target_opened"
  | "location_saved"
  | "replay_started"
  | "signed_in";

export function track(
  event: EventName,
  properties?: Record<string, string | number | boolean>,
): void {
  posthog?.capture(event, properties);
}
