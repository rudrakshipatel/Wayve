"use client";

import { LocateFixed, WifiOff } from "lucide-react";
import type { ConnectionState, LiveJourneyState } from "@wave/client";
import { formatClockTime, formatDistance, formatDuration } from "@wave/map-utils";
import type { Timeline } from "@wave/simulation-engine";
import { TRAVEL_MODE_LABELS, type JourneyStatus, type PublicJourneyView } from "@wave/types";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ModeIcon } from "./mode-icon";
import { WaveProgress } from "./wave-progress";

const STATUS_COPY: Record<JourneyStatus, { label: string; line: string; tone: string }> = {
  draft: { label: "Ready", line: "Waiting to start", tone: "bg-muted" },
  scheduled: { label: "Scheduled", line: "Starts soon", tone: "bg-tide" },
  active: { label: "Live journey", line: "Journey in progress", tone: "bg-surf" },
  paused: { label: "Paused", line: "Journey paused", tone: "bg-amber" },
  completed: { label: "Arrived", line: "Journey completed", tone: "bg-muted" },
  cancelled: { label: "Ended", line: "Journey ended early", tone: "bg-coral" },
};

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="tabular mt-1 truncate font-mono text-[15px] font-medium text-ink">
        {value}
      </div>
    </div>
  );
}

export interface JourneyPanelProps {
  readonly view: PublicJourneyView;
  readonly timeline: Timeline;
  readonly live: LiveJourneyState;
  readonly connection: ConnectionState;
  readonly onRecenter: () => void;
}

export function JourneyPanel({ view, timeline, live, connection, onRecenter }: JourneyPanelProps) {
  const { sample, status, etaLocalMs } = live;
  const copy = STATUS_COPY[status];
  const segment = view.segments[sample.segmentIndex] ?? view.segments[0]!;
  const first = view.segments[0]!;
  const last = view.segments[view.segments.length - 1]!;
  const modes = [...new Set(view.segments.map((s) => s.travelMode))];
  const isStatic = view.kind === "static";

  return (
    <section
      aria-live="polite"
      className={cn(
        "grain animate-rise pointer-events-auto relative overflow-hidden border border-line bg-surface shadow-panel backdrop-blur-xl",
        "rounded-t-[var(--radius-panel)] px-5 pt-2.5 pb-[max(env(safe-area-inset-bottom),14px)]",
        "md:rounded-[var(--radius-panel)] md:px-7 md:pt-6 md:pb-7",
      )}
    >
      <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-line md:hidden" aria-hidden />

      <header className="flex items-center justify-between gap-3">
        <Badge className="bg-surface-solid/60 text-ink">
          <span className="relative flex h-2 w-2">
            {status === "active" && (
              <span
                className={cn(
                  "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                  copy.tone,
                )}
              />
            )}
            <span className={cn("relative inline-flex h-2 w-2 rounded-full", copy.tone)} />
          </span>
          {isStatic ? "Shared location" : copy.label}
        </Badge>
        <span className="text-[11px] font-medium tracking-wide text-muted">
          Simulated with Wave
        </span>
      </header>

      <h1 className="font-display mt-3 text-[22px] leading-[1.12] font-semibold tracking-[-0.02em] text-balance text-ink md:text-[30px]">
        {isStatic ? first.fromName : `${first.fromName} → ${last.toName}`}
      </h1>

      {!isStatic && (
        <div className="mt-1.5 flex items-center gap-2 text-sm text-muted md:mt-2">
          {modes.map((m) => (
            <span key={m} className="inline-flex items-center gap-1.5">
              <ModeIcon mode={m} className="h-4 w-4 text-ink" strokeWidth={2} />
              {TRAVEL_MODE_LABELS[m]}
            </span>
          ))}
          {view.segments.length > 1 && <span>· {view.segments.length} legs</span>}
        </div>
      )}

      {isStatic ? (
        <div className="mt-5 grid grid-cols-2 gap-4">
          <Stat label="Latitude" value={sample.latitude.toFixed(5)} />
          <Stat label="Longitude" value={sample.longitude.toFixed(5)} />
        </div>
      ) : status === "completed" ? (
        <CompletedSummary view={view} timeline={timeline} live={live} />
      ) : (
        <>
          <div className="mt-4 flex items-end justify-between gap-4 md:mt-5">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                {status === "scheduled" ? "Starts" : "Arrives"}
              </div>
              <div className="tabular font-display mt-1 text-[38px] leading-none md:text-[44px] font-semibold tracking-[-0.03em] text-ink">
                {status === "scheduled" ? (
                  formatClockTime(Date.now() + Math.max(0, startsInMs(view, live)))
                ) : etaLocalMs !== null ? (
                  formatClockTime(etaLocalMs)
                ) : (
                  <span className="text-muted">{status === "paused" ? "Paused" : "—"}</span>
                )}
              </div>
            </div>
            <div className="pb-1 text-right">
              <div className="tabular font-mono text-lg font-medium text-ink">
                {formatDistance(sample.distanceRemaining)}
              </div>
              <div className="text-xs text-muted">remaining</div>
            </div>
          </div>

          <div className="mt-3 md:mt-4">
            <WaveProgress progress={sample.progress} active={status === "active"} />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-4 md:mt-4">
            <Stat
              label="Speed"
              value={`${status === "active" ? Math.round(sample.speedKmh) : 0} km/h`}
            />
            <Stat
              label={status === "scheduled" ? "Starts in" : "Time left"}
              value={formatDuration(
                status === "scheduled"
                  ? startsInMs(view, live)
                  : sample.timeRemainingMs / Math.max(live.rate, 0.0001),
              )}
            />
            <Stat label="Progress" value={`${Math.round(sample.progress * 100)}%`} />
          </div>

          <p className="mt-3.5 flex items-center gap-2 text-sm text-ink md:mt-5">
            <ModeIcon mode={segment.travelMode} className="h-4 w-4 text-surf" />
            <span className="truncate">
              {sample.status === "waypoint_pause"
                ? `Stopped at ${segment.toName}`
                : status === "active" && view.segments.length > 1
                  ? `${copy.line} · next: ${segment.toName}`
                  : copy.line}
              {live.rate !== 1 && status === "active" ? ` · ${live.rate}× speed` : ""}
            </span>
          </p>
        </>
      )}

      <footer className="mt-3.5 flex items-center justify-between gap-3 border-t border-line pt-3 md:mt-5 md:pt-4">
        <span className="flex items-center gap-2 text-xs text-muted">
          {connection === "live" ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-surf" /> Updating live
            </>
          ) : connection === "connecting" ? (
            "Connecting…"
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5" /> Reconnecting…
            </>
          )}
        </span>
        <Button variant="ghost" size="sm" onClick={onRecenter} aria-label="Recenter map on marker">
          <LocateFixed className="h-4 w-4" /> Recenter
        </Button>
      </footer>
    </section>
  );
}

function startsInMs(view: PublicJourneyView, live: LiveJourneyState): number {
  if (view.clock.status !== "scheduled") return 0;
  // ETA minus the whole journey at the current rate = time until start.
  const eta = live.etaLocalMs;
  return eta === null ? 0 : eta - Date.now() - live.sample.timeRemainingMs / live.rate;
}

function CompletedSummary({
  view,
  timeline,
  live,
}: {
  readonly view: PublicJourneyView;
  readonly timeline: Timeline;
  readonly live: LiveJourneyState;
}) {
  const clock = view.clock;
  const endMs = clock.status === "completed" ? clock.anchorWallMs : live.sample.timestamp;
  const startMs = view.startedAt
    ? Date.parse(view.startedAt)
    : endMs - timeline.totalDurationMs / clock.rate;
  return (
    <div className="mt-5">
      <p className="font-display text-lg font-semibold text-ink">Journey completed</p>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
        <Stat label="Total distance" value={formatDistance(timeline.totalDistanceM)} />
        <Stat label="Duration" value={formatDuration(Math.max(0, endMs - startMs))} />
        <Stat label="Started" value={formatClockTime(startMs)} />
        <Stat label="Arrived" value={formatClockTime(endMs)} />
      </div>
      <div className="mt-4">
        <WaveProgress progress={1} active={false} />
      </div>
    </div>
  );
}
