import { router } from "expo-router";
import { MapPin, Plus, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { decodePolyline } from "@wave/map-utils";
import { buildTimeline } from "@wave/simulation-engine";
import {
  TRAVEL_MODE_LABELS,
  TRAVEL_MODE_SPEED_LIMITS_KMH,
  TRAVEL_MODES,
  type LngLat,
  type Place,
  type TravelMode,
} from "@wave/types";
import { MapTopBar } from "@/components/Chrome";
import { PlaceSearch } from "@/components/PlaceSearch";
import { SchedulePicker } from "@/components/SchedulePicker";
import { WaveMap } from "@/components/map/WaveMap";
import type { MapLine, MapStop } from "@/components/map/types";
import { Button, Card, Chip, ModeIcon, Panel, Segmented, Stepper, Text, cn } from "@/components/ui";
import { useDeviceCenter } from "@/hooks/useDeviceCenter";
import { track } from "@/lib/analytics";
import { formatDistance, formatDuration, formatTime } from "@/lib/format";
import { getPlacesClient } from "@/lib/places";
import { getApi } from "@/lib/supabase";
import { useWaveColors } from "@/lib/theme";
import {
  BUILDER_STEPS,
  currentStep,
  STEP_TITLES,
  stepBlocker,
  toPlanRequest,
  useBuilder,
} from "@/stores/builder";
import { useLibrary } from "@/stores/library";

const stopLabel = (index: number, count: number): string =>
  index === 0 ? "Start" : index === count - 1 ? "Destination" : `Stop ${index}`;

export default function JourneyBuilder() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const colors = useWaveColors();
  const center = useDeviceCenter();
  const b = useBuilder();
  const step = currentStep(b);
  const [editing, setEditing] = useState<number | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const panelHeight = picking !== null ? 0 : Math.round(height * 0.6);

  useEffect(() => {
    useBuilder.getState().reset();
    void useLibrary.getState().refresh();
  }, []);

  const stops = useMemo<MapStop[]>(
    () =>
      b.stops.flatMap((s, i): MapStop[] =>
        s
          ? [
              {
                kind: i === 0 ? "start" : i === b.stops.length - 1 ? "destination" : "waypoint",
                name: s.name,
                point: [s.longitude, s.latitude],
              },
            ]
          : [],
      ),
    [b.stops],
  );

  const lines = useMemo<MapLine[]>(() => {
    const out: MapLine[] = [];
    b.legs.forEach((leg, i) => {
      (b.routeOptions[i] ?? []).forEach((o, k) => {
        if (step === "route" || k === leg.routeChoice) {
          out.push({
            key: `${i}-${k}`,
            coordinates: decodePolyline(o.polyline),
            muted: k !== leg.routeChoice,
          });
        }
      });
    });
    // Selected routes are drawn last, on top of alternatives.
    return out.sort((a, c) => Number(Boolean(c.muted)) - Number(Boolean(a.muted)));
  }, [b.legs, b.routeOptions, step]);

  const pickOnMap = async (point: LngLat) => {
    if (picking === null) return;
    const index = picking;
    setPicking(null);
    let place: Place = { name: "Dropped pin", latitude: point[1], longitude: point[0] };
    try {
      const found = await getPlacesClient()?.reverseGeocode(point);
      if (found)
        place = {
          ...place,
          name: found.name,
          ...(found.address ? { address: found.address } : {}),
        };
    } catch {
      // Keep the generic name.
    }
    b.setStop(index, place);
    if (editing !== null) setEditing(null);
    else if (step === "start" || step === "destination") b.next();
  };

  return (
    <View className="flex-1 bg-bg">
      <WaveMap
        center={center}
        stops={stops}
        lines={lines}
        {...(picking !== null ? { onPress: (p: LngLat) => void pickOnMap(p) } : {})}
        insets={{ top: insets.top + 56, bottom: panelHeight }}
      />
      <MapTopBar
        left={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close builder"
            onPress={() => {
              router.back();
            }}
            className="h-11 w-11 items-center justify-center rounded-full border border-line bg-surface"
          >
            <X size={20} color={colors.text} />
          </Pressable>
        }
      />

      {picking !== null ? (
        <View className="absolute inset-x-4 items-center" style={{ bottom: insets.bottom + 24 }}>
          <Card className="w-full flex-row items-center justify-between">
            <Text variant="label">
              Tap the map to place {stopLabel(picking, b.stops.length).toLowerCase()}
            </Text>
            <Button
              size="sm"
              variant="secondary"
              label="Cancel"
              onPress={() => {
                setPicking(null);
              }}
            />
          </Card>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="absolute inset-x-0 bottom-0"
          style={{ height: panelHeight }}
        >
          <Panel className="h-full">
            <View className="flex-row items-center gap-1.5">
              {BUILDER_STEPS.map((s, i) => (
                <View
                  key={s}
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    i <= b.stepIndex ? "bg-tide" : "bg-line",
                  )}
                />
              ))}
            </View>
            <Text variant="overline" className="mt-4">
              Step {b.stepIndex + 1} of {BUILDER_STEPS.length}
            </Text>
            <Text variant="title" className="mt-1">
              {editing !== null
                ? `Choose ${stopLabel(editing, b.stops.length).toLowerCase()}`
                : STEP_TITLES[step]}
            </Text>

            <ScrollView
              className="mt-4 flex-1"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {editing !== null || step === "start" || step === "destination" ? (
                <StopSearch
                  index={editing ?? (step === "start" ? 0 : b.stops.length - 1)}
                  onDone={() => {
                    if (editing !== null) setEditing(null);
                    else b.next();
                  }}
                  onPickOnMap={setPicking}
                  proximity={center}
                />
              ) : step === "waypoints" ? (
                <WaypointsStep onEdit={setEditing} />
              ) : step === "route" ? (
                <RouteStep />
              ) : step === "mode" ? (
                <ModeStep />
              ) : step === "timing" ? (
                <TimingStep />
              ) : (
                <PreviewStep />
              )}
            </ScrollView>

            {editing === null && <Footer bottomInset={insets.bottom} />}
          </Panel>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function StopSearch({
  index,
  onDone,
  onPickOnMap,
  proximity,
}: {
  index: number;
  onDone: () => void;
  onPickOnMap: (index: number) => void;
  proximity: LngLat;
}) {
  const b = useBuilder();
  const colors = useWaveColors();
  const saved = useLibrary((s) => s.locations);
  const current = b.stops[index];
  return (
    <View>
      {current && (
        <Card className="mb-3 flex-row items-center gap-3 bg-sunken">
          <MapPin size={18} color={colors.primary} />
          <View className="flex-1">
            <Text variant="label">{current.name}</Text>
            {current.address ? <Text variant="caption">{current.address}</Text> : null}
          </View>
        </Card>
      )}
      <PlaceSearch
        key={index}
        placeholder={index === 0 ? "Search a start address or place" : "Search an address or place"}
        saved={saved}
        proximity={proximity}
        onSelect={(place) => {
          b.setStop(index, place);
          onDone();
        }}
        onPickOnMap={() => {
          onPickOnMap(index);
        }}
      />
    </View>
  );
}

function WaypointsStep({ onEdit }: { onEdit: (index: number) => void }) {
  const b = useBuilder();
  const colors = useWaveColors();
  return (
    <View>
      {b.stops.map((s, i) => {
        const removable = i > 0 && i < b.stops.length - 1;
        return (
          <View key={i} className="flex-row items-center gap-3 py-1.5">
            <View
              className={cn(
                "h-3 w-3 rounded-full border-2",
                i === 0
                  ? "border-tide"
                  : i === b.stops.length - 1
                    ? "border-ink bg-ink"
                    : "border-muted",
              )}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onEdit(i);
              }}
              className="flex-1 rounded-2xl bg-sunken px-4 py-3"
            >
              <Text variant="caption">{stopLabel(i, b.stops.length)}</Text>
              <Text variant="label" className={cn(!s && "text-muted")}>
                {s?.name ?? "Choose a place"}
              </Text>
            </Pressable>
            {removable && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${stopLabel(i, b.stops.length)}`}
                onPress={() => {
                  b.removeStop(i);
                }}
                className="h-9 w-9 items-center justify-center rounded-full bg-sunken"
              >
                <X size={16} color={colors.text} />
              </Pressable>
            )}
          </View>
        );
      })}
      <Button
        className="mt-3"
        variant="secondary"
        label="Add a stop"
        icon={<Plus size={18} color={colors.text} />}
        onPress={() => {
          b.addWaypoint();
        }}
      />
      <Text variant="caption" className="mt-3">
        Each stop starts a new leg with its own travel mode, speed and pause.
      </Text>
    </View>
  );
}

function RouteStep() {
  const b = useBuilder();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const state = useBuilder.getState();
    const missing = state.legs.map((_, i) => i).filter((i) => !state.routeOptions[i]?.length);
    if (missing.length === 0) return;
    setLoading(true);
    setError(null);
    Promise.all(
      missing.map(async (i) => {
        const result = await getApi().routeOptions({
          from: state.stops[i]!,
          to: state.stops[i + 1]!,
          travelMode: state.legs[i]!.travelMode,
        });
        useBuilder.getState().setRouteOptions(i, result.options);
      }),
    )
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Couldn't load routes");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (error) {
    return (
      <Text variant="caption" className="text-coral">
        {error}
      </Text>
    );
  }
  return (
    <View className="gap-4">
      {loading && <Text variant="caption">Finding routes…</Text>}
      {b.legs.map((leg, i) => (
        <View key={i}>
          {b.legs.length > 1 && (
            <Text variant="overline" className="mb-2">
              {b.stops[i]?.name} → {b.stops[i + 1]?.name}
            </Text>
          )}
          <View className="gap-2">
            {(b.routeOptions[i] ?? []).map((o, k) => (
              <Pressable
                key={k}
                accessibilityRole="radio"
                accessibilityState={{ checked: leg.routeChoice === k }}
                onPress={() => {
                  b.setLeg(i, { routeChoice: k });
                }}
                className={cn(
                  "flex-row items-center justify-between rounded-2xl border px-4 py-3.5",
                  leg.routeChoice === k ? "border-tide bg-tide/5" : "border-line bg-surface",
                )}
              >
                <View>
                  <Text variant="label">{k === 0 ? "Suggested route" : `Alternative ${k}`}</Text>
                  <Text variant="caption">{formatDistance(o.distanceM)}</Text>
                </View>
                <Text variant="stat">{formatDuration(o.estimatedDurationMs)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function ModeGrid({ value, onPick }: { value: TravelMode; onPick: (m: TravelMode) => void }) {
  const colors = useWaveColors();
  return (
    <View className="flex-row flex-wrap gap-2">
      {TRAVEL_MODES.map((m) => (
        <Chip
          key={m}
          label={TRAVEL_MODE_LABELS[m]}
          selected={value === m}
          icon={
            <ModeIcon mode={m} size={16} color={value === m ? colors.background : colors.text} />
          }
          onPress={() => {
            onPick(m);
          }}
        />
      ))}
    </View>
  );
}

function ModeStep() {
  const b = useBuilder();
  const [perLeg, setPerLeg] = useState(new Set(b.legs.map((l) => l.travelMode)).size > 1);
  return (
    <View className="gap-4">
      {b.legs.length > 1 && (
        <Segmented
          options={[
            { value: "all", label: "Same for all" },
            { value: "each", label: "Per leg" },
          ]}
          value={perLeg ? "each" : "all"}
          onChange={(v) => {
            setPerLeg(v === "each");
          }}
        />
      )}
      {perLeg ? (
        b.legs.map((leg, i) => (
          <View key={i}>
            <Text variant="overline" className="mb-2">
              {b.stops[i]?.name} → {b.stops[i + 1]?.name}
            </Text>
            <ModeGrid
              value={leg.travelMode}
              onPick={(m) => {
                b.setLeg(i, { travelMode: m });
              }}
            />
          </View>
        ))
      ) : (
        <ModeGrid
          value={b.legs[0]!.travelMode}
          onPick={(m) => {
            b.setAllLegs({ travelMode: m });
          }}
        />
      )}
      <Text variant="caption">
        Each mode moves differently: buses stop often, trains glide between stations, cars slow down
        for turns.
      </Text>
    </View>
  );
}

function TimingStep() {
  const b = useBuilder();
  return (
    <View className="gap-5">
      {b.legs.map((leg, i) => {
        const limits = TRAVEL_MODE_SPEED_LIMITS_KMH[leg.travelMode];
        const isLast = i === b.legs.length - 1;
        return (
          <View key={i} className="gap-3">
            {b.legs.length > 1 && (
              <Text variant="overline">
                {b.stops[i]?.name} → {b.stops[i + 1]?.name} · {TRAVEL_MODE_LABELS[leg.travelMode]}
              </Text>
            )}
            <Segmented
              options={[
                { value: "speed", label: "Set speed" },
                { value: "duration", label: "Set duration" },
              ]}
              value={leg.pacing}
              onChange={(pacing) => {
                b.setLeg(i, { pacing });
              }}
            />
            {leg.pacing === "speed" ? (
              <Stepper
                label="Speed"
                value={leg.targetSpeedKmh}
                min={limits.min}
                max={limits.max}
                step={leg.travelMode === "walking" ? 0.5 : 5}
                format={(v) => `${v} km/h`}
                onChange={(v) => {
                  b.setLeg(i, { targetSpeedKmh: v });
                }}
              />
            ) : (
              <Stepper
                label="Duration"
                value={leg.durationMin}
                min={1}
                max={72 * 60}
                step={5}
                format={(v) => formatDuration(v * 60_000)}
                onChange={(v) => {
                  b.setLeg(i, { durationMin: v });
                }}
              />
            )}
            {!isLast && (
              <View className="gap-2">
                <Text variant="caption">Pause at {b.stops[i + 1]?.name}</Text>
                <Stepper
                  label="Pause"
                  value={leg.pauseAfterS / 60}
                  min={0}
                  max={360}
                  step={1}
                  format={(v) => (v === 0 ? "No pause" : formatDuration(v * 60_000))}
                  onChange={(v) => {
                    b.setLeg(i, { pauseAfterS: Math.round(v * 60) });
                  }}
                />
              </View>
            )}
          </View>
        );
      })}

      <View className="gap-3">
        <Text variant="overline">Start</Text>
        <Segmented
          options={[
            { value: "now", label: "Immediately" },
            { value: "later", label: "Schedule" },
          ]}
          value={b.schedule.mode}
          onChange={(mode) => {
            b.setSchedule(
              mode === "now" ? { mode } : { mode, startAtMs: Date.now() + 30 * 60_000 },
            );
          }}
        />
        {b.schedule.mode === "later" && (
          <SchedulePicker
            value={b.schedule.startAtMs}
            onChange={(startAtMs) => {
              b.setSchedule({ mode: "later", startAtMs });
            }}
          />
        )}
      </View>
    </View>
  );
}

function PreviewStep() {
  const b = useBuilder();
  const colors = useWaveColors();
  const estimate = useMemo(() => {
    try {
      const segments = b.legs.map((leg, i) => {
        const option = b.routeOptions[i]?.[leg.routeChoice];
        const from = b.stops[i]!;
        const to = b.stops[i + 1]!;
        const coordinates: LngLat[] = option
          ? decodePolyline(option.polyline)
          : [
              [from.longitude, from.latitude],
              [to.longitude, to.latitude],
            ];
        return {
          coordinates,
          travelMode: leg.travelMode,
          pauseAfterS: i < b.legs.length - 1 ? leg.pauseAfterS : 0,
          ...(leg.pacing === "speed"
            ? { targetSpeedKmh: leg.targetSpeedKmh }
            : { durationS: leg.durationMin * 60 }),
        };
      });
      return buildTimeline({ seed: "preview", segments });
    } catch {
      return null;
    }
  }, [b.legs, b.routeOptions, b.stops]);

  return (
    <View className="gap-4">
      <View className="flex-row gap-3">
        <Card className="flex-1">
          <Text variant="overline">Distance</Text>
          <Text variant="stat" className="mt-1">
            {estimate ? formatDistance(estimate.totalDistanceM) : "—"}
          </Text>
        </Card>
        <Card className="flex-1">
          <Text variant="overline">Est. duration</Text>
          <Text variant="stat" className="mt-1">
            {estimate ? formatDuration(estimate.totalDurationMs) : "—"}
          </Text>
        </Card>
      </View>
      <Card>
        {b.stops.map((s, i) => (
          <View key={i} className="flex-row items-center gap-3 py-1.5">
            <View
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                i === 0 ? "bg-tide" : i === b.stops.length - 1 ? "bg-ink" : "bg-muted",
              )}
            />
            <Text variant="label" className="flex-1" numberOfLines={1}>
              {s?.name}
            </Text>
            {i < b.legs.length && (
              <ModeIcon mode={b.legs[i]!.travelMode} size={16} color={colors.textMuted} />
            )}
          </View>
        ))}
      </Card>
      <View>
        <Text variant="overline" className="mb-2">
          Name (optional)
        </Text>
        <TextInput
          value={b.title}
          onChangeText={b.setTitle}
          placeholder={`${b.stops[0]?.name ?? ""} → ${b.stops[b.stops.length - 1]?.name ?? ""}`}
          placeholderTextColor={colors.textMuted}
          maxLength={120}
          accessibilityLabel="Journey name"
          className="h-12 rounded-full bg-sunken px-4 font-sans text-[16px] text-ink"
        />
      </View>
      <Text variant="caption">
        {b.schedule.mode === "later"
          ? `Starts automatically at ${formatTime(b.schedule.startAtMs)}, even if Wave is closed.`
          : "Starts as soon as you tap Start."}{" "}
        This is a simulation inside Wave — your device's real location is never changed.
      </Text>
    </View>
  );
}

function Footer({ bottomInset }: { bottomInset: number }) {
  const b = useBuilder();
  const step = currentStep(b);
  const blocker = stepBlocker(b);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const api = getApi();
      const plan = await api.planJourney(toPlanRequest(b));
      track("journey_planned", { legs: b.legs.length });
      await api.control(
        plan.journeyId,
        b.schedule.mode === "later"
          ? { type: "schedule", startAtMs: b.schedule.startAtMs }
          : { type: "start" },
      );
      track("journey_started", { scheduled: b.schedule.mode === "later" });
      router.replace({
        pathname: "/journey/[id]",
        params: { id: plan.journeyId, justStarted: "1" },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the journey");
    } finally {
      setSubmitting(false);
    }
  };

  const message = error ?? (step !== "start" && step !== "destination" ? blocker : null);
  return (
    <View
      className="border-t border-line pt-3"
      style={{ paddingBottom: Math.max(bottomInset, 12) }}
    >
      {message ? (
        <Text variant="caption" className="mb-2 text-coral">
          {message}
        </Text>
      ) : null}
      <View className="flex-row gap-3">
        {b.stepIndex > 0 && (
          <Button
            className="flex-1"
            variant="secondary"
            label="Back"
            onPress={() => {
              b.back();
            }}
          />
        )}
        {step === "preview" ? (
          <Button
            className="flex-[2]"
            variant="brand"
            label={b.schedule.mode === "later" ? "Schedule simulation" : "Start simulation"}
            loading={submitting}
            onPress={() => void start()}
          />
        ) : (
          <Button
            className="flex-[2]"
            label={
              step === "waypoints" && b.stops.length === 2 ? "No stops — continue" : "Continue"
            }
            disabled={Boolean(blocker)}
            onPress={() => {
              b.next();
            }}
          />
        )}
      </View>
    </View>
  );
}
