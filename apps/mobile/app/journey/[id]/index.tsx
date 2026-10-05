import { router, useLocalSearchParams } from "expo-router";
import { Copy, Pause, Play, RotateCcw, Share2, SkipForward, Square } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Alert, Platform, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LiveJourneyState } from "@wave/client";
import type { Timeline } from "@wave/simulation-engine";
import { TRAVEL_MODE_LABELS } from "@wave/types";
import { MapTopBar } from "@/components/Chrome";
import { WaveMap } from "@/components/map/WaveMap";
import type { WaveMapHandle } from "@/components/map/types";
import { fullRoute, stopsFor } from "@/lib/journey-geometry";
import { Button, Chip, ModeIcon, Panel, Stat, Text, WaveProgress, cn } from "@/components/ui";
import { useJourneySession, useLive, type SessionState } from "@/hooks/useJourneySession";
import { formatDistance, formatDuration, formatTime, STATUS_LABEL } from "@/lib/format";
import { useWaveColors } from "@/lib/theme";
import { useLibrary } from "@/stores/library";

const RATES = [0.5, 1, 2, 5] as const;

export default function ActiveJourney() {
  const { id, justStarted } = useLocalSearchParams<{ id: string; justStarted?: string }>();
  const { state, control, pending, error } = useJourneySession(id);

  // Right after starting, offer to share — the core Wave flow.
  const prompted = useRef(false);
  useEffect(() => {
    if (justStarted && state.kind === "ready" && !prompted.current) {
      prompted.current = true;
      router.push({ pathname: "/journey/[id]/share", params: { id } });
    }
  }, [justStarted, state.kind, id]);

  if (state.kind !== "ready") {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-8">
        <MapTopBar />
        <Text variant="heading">
          {state.kind === "loading" ? "Loading journey…" : "Couldn't open this journey"}
        </Text>
        {state.kind === "error" && (
          <Text variant="caption" className="mt-2 text-center">
            {state.message}
          </Text>
        )}
      </View>
    );
  }
  return <Live state={state} control={control} pending={pending} error={error} />;
}

function Live({
  state,
  control,
  pending,
  error,
}: {
  state: Extract<SessionState, { kind: "ready" }>;
  control: ReturnType<typeof useJourneySession>["control"];
  pending: string | null;
  error: string | null;
}) {
  const { detail, timeline, follower } = state;
  const colors = useWaveColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const map = useRef<WaveMapHandle>(null);
  const onFrame = useCallback((l: LiveJourneyState) => {
    map.current?.setLive(l);
  }, []);
  const { live } = useLive(timeline, follower, onFrame);
  const { sample, status } = live;
  const isStatic = detail.journey.kind === "static";
  const panelHeight = Math.round(height * (isStatic ? 0.38 : 0.52));

  const route = useMemo(() => fullRoute(timeline), [timeline]);
  const stops = useMemo(() => stopsFor(timeline, detail.segments), [timeline, detail.segments]);
  const segment = detail.segments[sample.segmentIndex] ?? detail.segments[0]!;
  const running = status === "active";
  const isDraft = status === "draft";
  const finished = status === "completed" || status === "cancelled";

  const confirmStop = () => {
    const doStop = () => void control({ type: "stop" });
    if (Platform.OS === "web") {
      doStop();
      return;
    }
    Alert.alert("Stop this journey?", "Viewers will see that it ended early.", [
      { text: "Keep going", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: doStop },
    ]);
  };

  const duplicate = async () => {
    const copyId = await useLibrary.getState().duplicateJourney(detail.journey.id);
    router.replace({ pathname: "/journey/[id]", params: { id: copyId } });
  };

  return (
    <View className="flex-1 bg-bg">
      <WaveMap
        ref={map}
        journeyRoute={isStatic ? undefined : route}
        stops={stops}
        pin={isStatic ? timeline.start : null}
        showLiveMarker={!isStatic}
        insets={{ top: insets.top + 56, bottom: panelHeight }}
      />
      <MapTopBar
        right={
          <View className="flex-row items-center gap-2 rounded-full border border-line bg-surface px-3 py-2">
            <View
              className={cn(
                "h-2 w-2 rounded-full",
                running ? "bg-surf" : status === "paused" ? "bg-amber" : "bg-muted",
              )}
            />
            <Text variant="label" className="text-[13px]">
              {isStatic ? "Static location" : STATUS_LABEL[status]}
            </Text>
          </View>
        }
      />

      <View className="absolute inset-x-0 bottom-0" style={{ height: panelHeight }}>
        <Panel className="h-full">
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          >
            <Text variant="title" numberOfLines={2}>
              {detail.journey.title}
            </Text>
            {!isStatic && (
              <View className="mt-1 flex-row items-center gap-1.5">
                <ModeIcon mode={segment.travelMode} size={15} color={colors.textMuted} />
                <Text variant="caption">
                  {TRAVEL_MODE_LABELS[segment.travelMode]}
                  {detail.segments.length > 1
                    ? ` · leg ${sample.segmentIndex + 1} of ${detail.segments.length}`
                    : ""}
                  {sample.status === "waypoint_pause" ? ` · paused at ${segment.toName}` : ""}
                </Text>
              </View>
            )}

            {isStatic ? (
              <View className="mt-4 flex-row gap-6">
                <Stat label="Latitude" value={sample.latitude.toFixed(5)} />
                <Stat label="Longitude" value={sample.longitude.toFixed(5)} />
              </View>
            ) : finished ? (
              <Summary timeline={timeline} detail={detail} status={status} />
            ) : (
              <>
                <View className="mt-4 flex-row items-end justify-between">
                  <View>
                    <Text variant="overline">
                      {status === "scheduled" ? "Starts" : isDraft ? "Takes" : "Arrives"}
                    </Text>
                    <Text variant="eta" className="mt-1">
                      {status === "scheduled"
                        ? formatTime(detail.clock.anchorWallMs)
                        : isDraft
                          ? formatDuration(timeline.totalDurationMs)
                          : live.etaLocalMs !== null
                            ? formatTime(live.etaLocalMs)
                            : "Paused"}
                    </Text>
                  </View>
                  <View className="items-end pb-1">
                    <Text variant="stat">{formatDistance(sample.distanceRemaining)}</Text>
                    <Text variant="caption">remaining</Text>
                  </View>
                </View>
                <View className="mt-3">
                  <WaveProgress progress={sample.progress} />
                </View>
                <View className="mt-3 flex-row justify-between">
                  <Stat label="Speed" value={`${running ? Math.round(sample.speedKmh) : 0} km/h`} />
                  <Stat
                    label="Time left"
                    value={formatDuration(sample.timeRemainingMs / live.rate)}
                  />
                  <Stat label="Progress" value={`${Math.round(sample.progress * 100)}%`} />
                </View>
              </>
            )}

            {error ? (
              <Text variant="caption" className="mt-3 text-coral">
                {error}
              </Text>
            ) : null}

            <View className="mt-5 flex-row gap-3">
              {isDraft && !isStatic && (
                <Button
                  className="flex-[2]"
                  variant="brand"
                  label="Start simulation"
                  icon={<Play size={18} color="#fff" />}
                  loading={pending === "start"}
                  onPress={() => void control({ type: "start" })}
                />
              )}
              {!finished && !isStatic && !isDraft && (
                <>
                  {status === "paused" ? (
                    <Button
                      className="flex-1"
                      variant="brand"
                      label="Resume"
                      icon={<Play size={18} color="#fff" />}
                      loading={pending === "resume"}
                      onPress={() => void control({ type: "resume" })}
                    />
                  ) : (
                    <Button
                      className="flex-1"
                      label="Pause"
                      icon={<Pause size={18} color={colors.background} />}
                      disabled={!running}
                      loading={pending === "pause"}
                      onPress={() => void control({ type: "pause" })}
                    />
                  )}
                  <Button
                    className="flex-1"
                    variant="danger"
                    label="Stop"
                    icon={<Square size={16} color={colors.danger} />}
                    loading={pending === "stop"}
                    onPress={confirmStop}
                  />
                </>
              )}
              {(isStatic || !finished) && (
                <Button
                  className="flex-1"
                  variant="secondary"
                  label="Share"
                  icon={<Share2 size={18} color={colors.text} />}
                  onPress={() => {
                    router.push({
                      pathname: "/journey/[id]/share",
                      params: { id: detail.journey.id },
                    });
                  }}
                />
              )}
              {finished && !isStatic && (
                <>
                  <Button
                    className="flex-1"
                    variant="brand"
                    label="Replay"
                    icon={<Play size={18} color="#fff" />}
                    onPress={() => {
                      router.push({
                        pathname: "/journey/[id]/replay",
                        params: { id: detail.journey.id },
                      });
                    }}
                  />
                  <Button
                    className="flex-1"
                    variant="secondary"
                    label="Duplicate"
                    icon={<Copy size={18} color={colors.text} />}
                    onPress={() => void duplicate()}
                  />
                </>
              )}
            </View>

            {!finished && !isStatic && !isDraft && (
              <>
                <Text variant="overline" className="mt-6 mb-2">
                  Playback speed
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {RATES.map((r) => (
                    <Chip
                      key={r}
                      label={`${r}×`}
                      selected={live.rate === r}
                      onPress={() => void control({ type: "set_rate", rate: r })}
                    />
                  ))}
                  <Chip
                    label="Restart"
                    icon={<RotateCcw size={14} color={colors.text} />}
                    onPress={() => void control({ type: "restart" })}
                  />
                </View>
                {timeline.waypoints.length > 0 && (
                  <>
                    <Text variant="overline" className="mt-5 mb-2">
                      Skip to waypoint
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {timeline.waypoints.map((w, i) => (
                        <Chip
                          key={i}
                          label={detail.segments[w.segmentIndex]?.toName ?? `Stop ${i + 1}`}
                          icon={<SkipForward size={14} color={colors.text} />}
                          onPress={() => void control({ type: "skip_to_waypoint", index: i })}
                        />
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
          </ScrollView>
        </Panel>
      </View>
    </View>
  );
}

function Summary({
  timeline,
  detail,
  status,
}: {
  timeline: Timeline;
  detail: Extract<SessionState, { kind: "ready" }>["detail"];
  status: string;
}) {
  const start = detail.journey.startedAt ? Date.parse(detail.journey.startedAt) : null;
  const end = detail.journey.endedAt
    ? Date.parse(detail.journey.endedAt)
    : detail.clock.anchorWallMs;
  return (
    <View className="mt-4">
      <Text variant="heading">
        {status === "completed" ? "Journey completed" : "Journey stopped"}
      </Text>
      <View className="mt-3 flex-row flex-wrap gap-y-3">
        <Stat className="w-1/2" label="Distance" value={formatDistance(timeline.totalDistanceM)} />
        <Stat
          className="w-1/2"
          label="Duration"
          value={start ? formatDuration(end - start) : "—"}
        />
        <Stat className="w-1/2" label="Started" value={start ? formatTime(start) : "—"} />
        <Stat className="w-1/2" label="Ended" value={formatTime(end)} />
      </View>
    </View>
  );
}
