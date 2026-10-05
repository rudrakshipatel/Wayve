import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  JourneyFollower,
  liveJourneyState,
  supabaseChannelFactory,
  type ChannelFactory,
  type JourneyDetail,
  type LiveJourneyState,
} from "@wave/client";
import { buildTimeline, planFromStoredSegments, type Timeline } from "@wave/simulation-engine";
import { ownerTopic, type ControlAction } from "@wave/types";
import { track } from "@/lib/analytics";
import { isBackendConfigured } from "@/lib/env";
import { getApi, getSupabase } from "@/lib/supabase";

const silentChannel: ChannelFactory = () => ({
  onBroadcast: () => undefined,
  subscribe: (cb) => {
    cb("SUBSCRIBED");
  },
  unsubscribe: () => undefined,
});

export type SessionState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly detail: JourneyDetail;
      readonly timeline: Timeline;
      readonly follower: JourneyFollower;
    };

/** Loads a journey, compiles its timeline and follows its authoritative clock. */
export function useJourneySession(journeyId: string) {
  const [state, setState] = useState<SessionState>({ kind: "loading" });
  const [pending, setPending] = useState<ControlAction["type"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let follower: JourneyFollower | null = null;
    let cancelled = false;
    const api = getApi();
    api
      .getJourney(journeyId)
      .then((detail) => {
        if (cancelled) return;
        const timeline = buildTimeline(
          planFromStoredSegments(detail.journey.seed, detail.segments),
        );
        follower = new JourneyFollower({
          topic: ownerTopic(journeyId),
          initialClock: detail.clock,
          serverTimeMs: Date.now(),
          channelFactory: isBackendConfigured()
            ? supabaseChannelFactory(getSupabase())
            : silentChannel,
          refresh: async () => {
            const fresh = await api.getJourney(journeyId);
            return { clock: fresh.clock, serverTimeMs: Date.now() };
          },
        });
        follower.start();
        setState({ kind: "ready", detail, timeline, follower });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "Couldn't load journey",
          });
      });
    return () => {
      cancelled = true;
      follower?.stop();
    };
  }, [journeyId]);

  const control = useCallback(
    async (action: ControlAction) => {
      if (state.kind !== "ready") return;
      setPending(action.type);
      setError(null);
      try {
        const result = await getApi().control(journeyId, action);
        state.follower.applyClock(result.clock, result.serverTimeMs);
        track("journey_controlled", { action: action.type });
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't work");
      } finally {
        setPending(null);
      }
    },
    [journeyId, state],
  );

  return { state, control, pending, error };
}

/** Per-frame live state; `onFrame` gets every frame, the returned value refreshes ~4×/s. */
export function useLive(
  timeline: Timeline,
  follower: JourneyFollower,
  onFrame?: (live: LiveJourneyState) => void,
): { live: LiveJourneyState; snapshot: ReturnType<JourneyFollower["getSnapshot"]> } {
  const snapshot = useSyncExternalStore(follower.subscribe, follower.getSnapshot);
  const compute = useCallback(
    () => liveJourneyState(timeline, snapshot.clock, follower.serverNow(), Date.now()),
    [timeline, snapshot.clock, follower],
  );
  const [live, setLive] = useState(compute);
  const frameRef = useRef(onFrame);
  useEffect(() => {
    frameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = () => {
      const next = compute();
      frameRef.current?.(next);
      const now = Date.now();
      if (now - last > 250) {
        last = now;
        setLive(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [compute]);

  return useMemo(() => ({ live, snapshot }), [live, snapshot]);
}
