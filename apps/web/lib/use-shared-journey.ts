"use client";

import { useEffect, useState } from "react";
import {
  JourneyFollower,
  createWaveApi,
  isWaveApiError,
  supabaseChannelFactory,
  type ChannelFactory,
} from "@wave/client";
import {
  buildTimeline,
  ENGINE_VERSION,
  planFromStoredSegments,
  type Timeline,
} from "@wave/simulation-engine";
import type { PublicJourneyView, SessionClock } from "@wave/types";
import { demoJourney } from "./demo";
import { getSupabase } from "./supabase";

export type SharedJourneyState =
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "error"; readonly message: string; readonly retry: () => void }
  | {
      readonly kind: "ready";
      readonly view: PublicJourneyView;
      readonly timeline: Timeline;
      readonly follower: JourneyFollower;
      readonly demo: boolean;
    };

const silentChannel: ChannelFactory = () => ({
  onBroadcast: () => undefined,
  subscribe: (cb) => {
    cb("SUBSCRIBED");
  },
  unsubscribe: () => undefined,
});

function prepare(
  view: PublicJourneyView,
  demo: boolean,
  follower: JourneyFollower,
): SharedJourneyState {
  const timeline = buildTimeline(planFromStoredSegments(view.seed, view.segments));
  return { kind: "ready", view, timeline, follower, demo };
}

/** Resolves a share token and keeps its session clock live. */
export function useSharedJourney(token: string, demoState: string | null): SharedJourneyState {
  const [state, setState] = useState<SharedJourneyState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let follower: JourneyFollower | null = null;

    if (token === "demo") {
      const view = demoJourney(demoState, Date.now());
      follower = new JourneyFollower({
        topic: view.realtimeTopic,
        initialClock: view.clock,
        serverTimeMs: view.serverTimeMs,
        channelFactory: silentChannel,
      });
      follower.start();
      setState(prepare(view, true, follower));
      return () => {
        follower?.stop();
      };
    }

    const supabase = getSupabase();
    if (!supabase) {
      setState({
        kind: "error",
        message: "Wave isn't configured on this site yet.",
        retry: () => undefined,
      });
      return;
    }
    const api = createWaveApi(supabase);

    const load = async () => {
      const sentAt = Date.now();
      const view = await api.resolveShare(token);
      return { view, sentAt, receivedAt: Date.now() };
    };

    load()
      .then(({ view, sentAt, receivedAt }) => {
        if (cancelled) return;
        if (view.engineVersion !== ENGINE_VERSION) {
          // eslint-disable-next-line no-console -- surfaced for debugging version skew
          console.warn(
            `Journey compiled with engine ${view.engineVersion}, viewer runs ${ENGINE_VERSION}`,
          );
        }
        follower = new JourneyFollower({
          topic: view.realtimeTopic,
          initialClock: view.clock,
          serverTimeMs: view.serverTimeMs,
          receivedAtMs: receivedAt,
          roundTripMs: receivedAt - sentAt,
          channelFactory: supabaseChannelFactory(supabase),
          refresh: async (): Promise<{ clock: SessionClock; serverTimeMs: number } | null> => {
            try {
              const fresh = await api.resolveShare(token);
              return { clock: fresh.clock, serverTimeMs: fresh.serverTimeMs };
            } catch {
              return null;
            }
          },
        });
        follower.start();
        setState(prepare(view, false, follower));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isWaveApiError(error) && error.status === 404) {
          setState({ kind: "unavailable" });
        } else {
          setState({
            kind: "error",
            message:
              isWaveApiError(error) && error.status === 429
                ? "Too many requests. Please wait a moment."
                : "We couldn't load this journey.",
            retry: () => {
              setAttempt((a) => a + 1);
            },
          });
        }
      });

    return () => {
      cancelled = true;
      follower?.stop();
    };
  }, [token, demoState, attempt]);

  // Catch up after the tab was in the background (events may have been missed).
  useEffect(() => {
    if (state.kind !== "ready") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void state.follower.resync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [state]);

  return state;
}
