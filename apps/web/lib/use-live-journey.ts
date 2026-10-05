"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { liveJourneyState, type JourneyFollower, type LiveJourneyState } from "@wave/client";
import type { Timeline } from "@wave/simulation-engine";

/**
 * Samples the journey every animation frame. `onFrame` receives every frame (for the
 * marker); the returned state refreshes a few times per second (for text).
 */
export function useLiveJourney(
  timeline: Timeline,
  follower: JourneyFollower,
  onFrame: (state: LiveJourneyState) => void,
  textIntervalMs = 250,
): { live: LiveJourneyState; connection: ReturnType<JourneyFollower["getSnapshot"]> } {
  const snapshot = useSyncExternalStore(
    follower.subscribe,
    follower.getSnapshot,
    follower.getSnapshot,
  );
  const compute = () =>
    liveJourneyState(timeline, snapshot.clock, follower.serverNow(), Date.now());
  const [live, setLive] = useState<LiveJourneyState>(compute);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    let raf = 0;
    let lastText = 0;
    const tick = () => {
      const state = liveJourneyState(timeline, snapshot.clock, follower.serverNow(), Date.now());
      onFrameRef.current(state);
      const now = performance.now();
      if (now - lastText >= textIntervalMs) {
        lastText = now;
        setLive(state);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [timeline, follower, snapshot.clock, textIntervalMs]);

  return { live, connection: snapshot };
}
