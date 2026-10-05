import { router } from "expo-router";
import { Ellipsis, MapPin } from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { JourneySummary } from "@wave/types";
import { formatDay, formatDistance, formatDuration, STATUS_LABEL } from "@/lib/format";
import { useWaveColors } from "@/lib/theme";
import { cn, ModeIcon, PressableCard, Text } from "./ui";

const STATUS_DOT: Record<JourneySummary["status"], string> = {
  draft: "bg-muted",
  scheduled: "bg-tide",
  active: "bg-surf",
  paused: "bg-amber",
  completed: "bg-muted",
  cancelled: "bg-coral",
};

export function JourneyRow({
  journey,
  onOptions,
}: {
  journey: JourneySummary & { kind?: "journey" | "static" };
  onOptions?: () => void;
}) {
  const colors = useWaveColors();
  const isStatic = journey.kind === "static";
  return (
    <PressableCard
      accessibilityLabel={`${journey.title}, ${STATUS_LABEL[journey.status]}`}
      onPress={() => {
        router.push(`/journey/${journey.id}`);
      }}
      className="mb-2.5 flex-row items-center gap-3"
    >
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-sunken">
        {isStatic ? (
          <MapPin size={18} color={colors.text} />
        ) : (
          <ModeIcon mode={journey.travelModes[0] ?? "driving"} color={colors.text} />
        )}
      </View>
      <View className="flex-1">
        <Text variant="label" numberOfLines={1}>
          {journey.title}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {formatDay(journey.scheduledStartAt ?? journey.startedAt ?? journey.createdAt)}
          {isStatic
            ? " · Static location"
            : ` · ${formatDistance(journey.totalDistanceM)} · ${formatDuration(journey.totalDurationMs)}`}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <View className={cn("h-2 w-2 rounded-full", STATUS_DOT[journey.status])} />
        <Text variant="caption">{STATUS_LABEL[journey.status]}</Text>
      </View>
      {onOptions && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Options for ${journey.title}`}
          hitSlop={10}
          onPress={onOptions}
          className="h-8 w-8 items-center justify-center rounded-full bg-sunken"
        >
          <Ellipsis size={16} color={colors.text} />
        </Pressable>
      )}
    </PressableCard>
  );
}
