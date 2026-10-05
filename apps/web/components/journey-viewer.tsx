"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Waves } from "lucide-react";
import type { LiveJourneyState } from "@wave/client";
import type { LngLat } from "@wave/types";
import { useLiveJourney } from "@/lib/use-live-journey";
import { useSharedJourney } from "@/lib/use-shared-journey";
import { JourneyMap, type JourneyMapHandle, type MapStop } from "./map/journey-map";
import type { MapInsets } from "./map/types";
import { JourneyPanel } from "./journey-panel";
import { Button } from "./ui/button";

type Ready = Extract<ReturnType<typeof useSharedJourney>, { kind: "ready" }>;

export function JourneyViewer({
  token,
  demoState,
}: {
  readonly token: string;
  readonly demoState: string | null;
}) {
  const state = useSharedJourney(token, demoState);

  if (state.kind === "loading")
    return (
      <Shell>
        <Message title="Opening journey…" pulse />
      </Shell>
    );
  if (state.kind === "unavailable") {
    return (
      <Shell>
        <Message
          title="This journey isn't available"
          body="The link may have expired or been turned off by the person who shared it."
        />
      </Shell>
    );
  }
  if (state.kind === "error") {
    return (
      <Shell>
        <Message title="Something went wrong" body={state.message}>
          <Button className="mt-6" onClick={state.retry}>
            Try again
          </Button>
        </Message>
      </Shell>
    );
  }
  return <LiveView state={state} />;
}

function LiveView({ state }: { readonly state: Ready }) {
  const { view, timeline, follower } = state;
  const mapRef = useRef<JourneyMapHandle>(null);
  const onFrame = useCallback((live: LiveJourneyState) => mapRef.current?.update(live), []);
  const { live, connection } = useLiveJourney(timeline, follower, onFrame);
  const panelRef = useRef<HTMLDivElement>(null);
  const insets = usePanelInsets(panelRef);

  const route = useMemo(() => {
    const out: LngLat[] = [];
    for (const seg of timeline.segments) {
      const coords = seg.line.coordinates;
      out.push(...(out.length > 0 ? coords.slice(1) : coords));
    }
    return out;
  }, [timeline]);

  const stops = useMemo<MapStop[]>(() => {
    const first = view.segments[0]!;
    const list: MapStop[] = [{ kind: "start", name: first.fromName, point: timeline.start }];
    timeline.waypoints.forEach((w, i) => {
      list.push({ kind: "waypoint", name: view.segments[i]?.toName ?? "Stop", point: w.point });
    });
    list.push({
      kind: "destination",
      name: view.segments[view.segments.length - 1]!.toName,
      point: timeline.end,
    });
    return list;
  }, [view, timeline]);

  return (
    <main className="fixed inset-0 overflow-hidden">
      <JourneyMap
        ref={mapRef}
        route={route}
        stops={stops}
        insets={insets}
        isStatic={view.kind === "static"}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(env(safe-area-inset-top),16px)] md:p-6">
        <Brand />
      </div>

      {connection.revoked && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-bg/80 p-6 backdrop-blur-md">
          <Message
            title="Sharing has ended"
            body="The person who shared this journey turned off the link."
          />
        </div>
      )}

      <div
        ref={panelRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 md:inset-x-auto md:bottom-auto md:left-6 md:top-24 md:w-[400px]"
      >
        <JourneyPanel
          view={view}
          timeline={timeline}
          live={live}
          connection={connection.connection}
          onRecenter={() => mapRef.current?.recenter()}
        />
      </div>
    </main>
  );
}

/** Space the panel and brand chip cover, so the map frames the route in what's left. */
function usePanelInsets(panel: React.RefObject<HTMLDivElement | null>): MapInsets {
  const [insets, setInsets] = useState<MapInsets>({ top: 72, right: 0, bottom: 0, left: 0 });
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const desktop = window.matchMedia("(min-width: 768px)").matches;
      setInsets(
        desktop
          ? { top: 24, right: 24, bottom: 24, left: rect.right + 8 }
          : { top: 72, right: 0, bottom: window.innerHeight - rect.top, left: 0 },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [panel]);
  return insets;
}

function Brand() {
  return (
    <a
      href="/"
      className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 shadow-panel backdrop-blur-xl"
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-tide to-surf text-white">
        <Waves className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
      <span className="font-display text-[15px] font-semibold tracking-tight text-ink">Wave</span>
    </a>
  );
}

function Shell({ children }: { readonly children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden p-6">
      <div
        aria-hidden
        className="absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 10%, color-mix(in oklab, var(--wave-tide) 18%, transparent), transparent), radial-gradient(50% 40% at 90% 90%, color-mix(in oklab, var(--wave-surf) 16%, transparent), transparent)",
        }}
      />
      <div className="absolute top-0 left-0 p-4 md:p-6">
        <Brand />
      </div>
      <div className="relative">{children}</div>
    </main>
  );
}

function Message({
  title,
  body,
  pulse,
  children,
}: {
  readonly title: string;
  readonly body?: string;
  readonly pulse?: boolean;
  readonly children?: React.ReactNode;
}) {
  return (
    <div className="animate-rise max-w-sm text-center">
      <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-tide to-surf text-white shadow-panel">
        <Waves className={pulse ? "h-6 w-6 animate-pulse" : "h-6 w-6"} />
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      {body && <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>}
      {children}
    </div>
  );
}
