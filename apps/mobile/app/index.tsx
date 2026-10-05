import { router, useFocusEffect } from "expo-router";
import { History, MapPin, Plus, Route, UserRound } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandChip, MapTopBar } from "@/components/Chrome";
import { JourneyRow } from "@/components/JourneyRow";
import { WaveMap } from "@/components/map/WaveMap";
import type { MapStop } from "@/components/map/types";
import { Card, Panel, Text } from "@/components/ui";
import { useDeviceCenter } from "@/hooks/useDeviceCenter";
import { useAuth } from "@/lib/auth";
import { isBackendConfigured } from "@/lib/env";
import { useWaveColors } from "@/lib/theme";
import { useLibrary } from "@/stores/library";

export default function Home() {
  const colors = useWaveColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const center = useDeviceCenter();
  const { journeys, locations, refresh, loading, error } = useLibrary();
  const isGuest = useAuth((s) => s.isGuest);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const live = journeys.filter((j) => j.status === "active" || j.status === "paused");
  const scheduled = journeys.filter((j) => j.status === "scheduled");
  const recent = journeys.filter((j) => !live.includes(j) && !scheduled.includes(j)).slice(0, 4);
  const pins = useMemo<MapStop[]>(
    () =>
      locations
        .slice(0, 30)
        .map((l) => ({ kind: "waypoint", name: l.name, point: [l.longitude, l.latitude] })),
    [locations],
  );
  const panelHeight = Math.round(height * 0.5);

  return (
    <View className="flex-1 bg-bg">
      <WaveMap
        center={center}
        stops={pins}
        insets={{ top: insets.top + 56, bottom: panelHeight }}
      />
      <MapTopBar
        left={<BrandChip />}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isGuest ? "Sign in" : "Account"}
            onPress={() => {
              router.push("/settings");
            }}
            className="h-11 w-11 items-center justify-center rounded-full border border-line bg-surface"
          >
            <UserRound size={20} color={colors.text} />
          </Pressable>
        }
      />

      <View className="absolute inset-x-0 bottom-0" style={{ height: panelHeight }}>
        <Panel className="h-full">
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          >
            <View className="flex-row gap-3">
              <ActionCard
                title="Static location"
                subtitle="Pin a place"
                icon={<MapPin size={20} color="#fff" />}
                tone="bg-surf"
                onPress={() => {
                  router.push("/location/new");
                }}
              />
              <ActionCard
                title="New journey"
                subtitle="Plan a route"
                icon={<Route size={20} color="#fff" />}
                tone="bg-tide"
                onPress={() => {
                  router.push("/journey/new");
                }}
              />
            </View>

            {!isBackendConfigured() && (
              <Card className="mt-4 bg-sunken">
                <Text variant="label">Preview mode</Text>
                <Text variant="caption" className="mt-1">
                  Wave isn't connected to a backend yet, so journeys stay on this device and links
                  can't be opened by others.
                </Text>
              </Card>
            )}
            {error ? (
              <Text variant="caption" className="mt-4 text-coral">
                {error}
              </Text>
            ) : null}

            {live.length > 0 && (
              <Section title="Live now">
                {live.map((j) => (
                  <JourneyRow key={j.id} journey={j} />
                ))}
              </Section>
            )}
            {scheduled.length > 0 && (
              <Section title="Scheduled">
                {scheduled.map((j) => (
                  <JourneyRow key={j.id} journey={j} />
                ))}
              </Section>
            )}

            <Section
              title="Recent journeys"
              action={{
                label: "History",
                icon: <History size={14} color={colors.textMuted} />,
                onPress: () => {
                  router.push("/history");
                },
              }}
            >
              {recent.length === 0 ? (
                <Text variant="caption">
                  {loading ? "Loading…" : "Your journeys will appear here."}
                </Text>
              ) : (
                recent.map((j) => <JourneyRow key={j.id} journey={j} />)
              )}
            </Section>

            <Section
              title="Saved locations"
              action={{
                label: "All",
                onPress: () => {
                  router.push("/locations");
                },
              }}
            >
              {locations.length === 0 ? (
                <Text variant="caption">
                  Save places like Home or Work to reuse them in journeys.
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {locations.slice(0, 10).map((l) => (
                    <Pressable
                      key={l.id}
                      accessibilityRole="button"
                      onPress={() => {
                        router.push({ pathname: "/locations", params: { focus: l.id } });
                      }}
                      className="flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2.5"
                    >
                      <MapPin size={14} color={colors.accent} />
                      <Text variant="label" className="text-[14px]">
                        {l.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </Section>
          </ScrollView>
        </Panel>
      </View>
    </View>
  );
}

function ActionCard({
  title,
  subtitle,
  icon,
  tone,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: string;
  onPress: () => void;
}) {
  const colors = useWaveColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="flex-1 rounded-card border border-line bg-surface p-4 active:opacity-80"
    >
      <View className="flex-row items-start justify-between">
        <View className={`h-10 w-10 items-center justify-center rounded-2xl ${tone}`}>{icon}</View>
        <View className="h-7 w-7 items-center justify-center rounded-full bg-sunken">
          <Plus size={15} color={colors.text} />
        </View>
      </View>
      <Text variant="heading" className="mt-4 text-[16px]" numberOfLines={1}>
        {title}
      </Text>
      <Text variant="caption">{subtitle}</Text>
    </Pressable>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void; icon?: React.ReactNode };
  children: React.ReactNode;
}) {
  return (
    <View className="mt-6">
      <View className="mb-3 flex-row items-center justify-between">
        <Text variant="overline">{title}</Text>
        {action && (
          <Pressable
            accessibilityRole="button"
            onPress={action.onPress}
            className="flex-row items-center gap-1"
          >
            {action.icon}
            <Text variant="caption">{action.label}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}
