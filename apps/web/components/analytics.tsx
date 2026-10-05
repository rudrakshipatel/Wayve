"use client";

import { useEffect } from "react";
import { publicEnv } from "@/lib/env";

/**
 * PostHog, only when configured. No autocapture, no session recording, and share tokens
 * are stripped from captured URLs.
 */
export function Analytics() {
  useEffect(() => {
    if (!publicEnv.posthogKey) return;
    void import("posthog-js").then(({ default: posthog }) => {
      posthog.init(publicEnv.posthogKey, {
        api_host: publicEnv.posthogHost,
        autocapture: false,
        disable_session_recording: true,
        persistence: "memory",
        capture_pageview: false,
      });
      const path = window.location.pathname.replace(/\/journey\/[^/]+/, "/journey/:token");
      posthog.capture("$pageview", { $current_url: `${window.location.origin}${path}` });
    });
  }, []);
  return null;
}
