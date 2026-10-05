import { useLocalSearchParams } from "expo-router";
import { Pause, Play, RotateCcw } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  JourneyFollower,
  type ChannelFactory,
  type JourneyDetail,
  type LiveJourneyState,
} from "@wave/client";
import {
  buildTimeline,
  initialClock,
  planFromStoredSegments,
  transition,
  type Timeline,
} from "@wave/simulation-engine";
import { REPLAY_RATES, type SessionAction } from "@wave/types";
import { MapTopBar } from "@/components/Chrome";
import { WaveMap } from "@/components/map/WaveMap";
import type { WaveMapHandle } from "@/components/map/types";
import { Button, Chip, Panel, Stat, Text } from "@/components/ui";
import { useLive } from "@/hooks/useJourneySession";
import { track } from "@/lib/analytics";
import { formatDistance, formatDuration } from "@/lib/format";
import { fullRoute, stopsFor } from "@/lib/journey-geometry";
import { getApi } from "@/lib/supabase";
import { useWaveColors } from "@/lib/theme";

const offline: ChannelFactory = () => ({
  onBroadcast: () => undefined,
  subscribe: () => undefined,
  unsubscribe: () => undefined,
});

/** Replays a journey locally at 1×, 2×, 5× or 10× along its original route. */
export default function Replay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loaded, setLoaded] = useState<{
    detail: JourneyDetail;
    timeline: Timeline;
    follower: JourneyFollower;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getApi()
      .getJourney(id)
      .then((detail) => {
        const timeline = buildTimeline(
          planFromStoredSegments(detail.journey.seed, detail.segments),
        );
        const follower = new JourneyFollower({
          topic: "replay",
          initialClock: initialClock(Date.now()),
          serverTimeMs: Date.now(),
          channelFactory: offline,
        });
        setLoaded({ detail, timeline, follower });
        track("replay_started");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Couldn't load journey");
      });
  }, [id]);

  if (!loaded) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <MapTopBar />
        <Text variant="heading">{error ?? "Loading replay…"}</Text>
      </View>
    );
  }
  return <ReplayView {...loaded} />;
}

function ReplayView({
  detail,
  timeline,
  follower,
}: {
  detail: JourneyDetail;
  timeline: Timeline;
  follower: JourneyFollower;
}) {
  const colors = useWaveColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const map = useRef<WaveMapHandle>(null);
  const onFrame = useCallback((l: LiveJourneyState) => {
    map.current?.setLive(l);
  }, []);
  const { live, snapshot } = useLive(timeline, follower, onFrame);
  const [barWidth, setBarWidth] = useState(1);
  const panelHeight = Math.round(height * 0.42);
  const route = useMemo(() => fullRoute(timeline), [timeline]);
  const stops = useMemo(() => stopsFor(timeline, detail.segments), [timeline, detail.segments]);

  const act = useCallback(
    (action: SessionAction) => {
      const result = transition(
        follower.getSnapshot().clock,
        action,
        Date.now(),
        timeline.totalDurationMs,
      );
      if (result.ok) follower.applyClock(result.clock);
    },
    [follower, timeline.totalDurationMs],
  );

  /** Restart playback from scratch (a completed clock accepts no further actions). */
  const replayFromStart = useCallback(() => {
    follower.applyClock({
      ...initialClock(Date.now()),
      revision: follower.getSnapshot().clock.revision + 1,
    });
    act({ type: "start" });
  }, [act, follower]);

  useEffect(() => {
    act({ type: "start" });
  }, [act]);

  const status = live.status;
  const rate = snapshot.clock.rate;

  return (
    <View className="flex-1 bg-bg">
      <WaveMap
        ref={map}
        journeyRoute={route}
        stops={stops}
        showLiveMarker
        insets={{ top: insets.top + 56, bottom: panelHeight }}
      />
      <MapTopBar
        right={
          <View className="rounded-full border border-line bg-surface px-3 py-2">
            <Text variant="label" className="text-[13px]">
              Replay · {rate}×
            </Text>
          </View>
        }
      />
      <View className="absolute inset-x-0 bottom-0" style={{ height: panelHeight }}>
        <Panel className="h-full" style={{ paddingBottom: insets.bottom + 12 }}>
          <Text variant="title" numberOfLines={1}>
            {detail.journey.title}
          </Text>
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="Replay position"
            onLayout={(e: LayoutChangeEvent) => {
              setBarWidth(e.nativeEvent.layout.width);
            }}
            onPress={(e) => {
              const fraction = Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth));
              if (status === "completed") replayFromStart();
              act({ type: "seek", simMs: fraction * timeline.totalDurationMs });
            }}
            className="mt-5 h-8 justify-center"
          >
            <View className="h-1.5 rounded-full bg-line">
              <View
                className="h-1.5 rounded-full bg-tide"
                style={{
                  width: `${(live.sample.elapsedMs / Math.max(1, timeline.totalDurationMs)) * 100}%`,
                }}
              />
            </View>
          </Pressable>
          <View className="flex-row justify-between">
            <Text variant="caption">{formatDuration(live.sample.elapsedMs)}</Text>
            <Text variant="caption">{formatDuration(timeline.totalDurationMs)}</Text>
          </View>
          <View className="mt-3 flex-row justify-between">
            <Stat
              label="Speed"
              value={`${status === "active" ? Math.round(live.sample.speedKmh) : 0} km/h`}
            />
            <Stat label="Remaining" value={formatDistance(live.sample.distanceRemaining)} />
            <Stat label="Progress" value={`${Math.round(live.sample.progress * 100)}%`} />
          </View>
          <View className="mt-5 flex-row items-center gap-3">
            {status === "completed" ? (
              <Button
                className="flex-1"
                variant="brand"
                label="Replay again"
                icon={<RotateCcw size={18} color="#fff" />}
                onPress={replayFromStart}
              />
            ) : status === "paused" ? (
              <Button
                className="flex-1"
                variant="brand"
                label="Play"
                icon={<Play size={18} color="#fff" />}
                onPress={() => {
                  act({ type: "resume" });
                }}
              />
            ) : (
              <Button
                className="flex-1"
                label="Pause"
                icon={<Pause size={18} color={colors.background} />}
                onPress={() => {
                  act({ type: "pause" });
                }}
              />
            )}
            <View className="flex-row gap-1.5">
              {REPLAY_RATES.map((r) => (
                <Chip
                  key={r}
                  label={`${r}×`}
                  selected={rate === r}
                  onPress={() => {
                    act({ type: "set_rate", rate: r });
                  }}
                />
              ))}
            </View>
          </View>
        </Panel>
      </View>
    </View>
  );
}
