import { router } from "expo-router";
import { ChevronLeft, Waves } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWaveColors } from "@/lib/theme";
import { Text } from "./ui";

export function BrandChip() {
  return (
    <View className="flex-row items-center gap-2 self-start rounded-full border border-line bg-surface px-3 py-2">
      <View className="h-6 w-6 items-center justify-center rounded-full bg-tide">
        <Waves size={14} color="#fff" strokeWidth={2.5} />
      </View>
      <Text variant="heading" className="text-[15px]">
        Wave
      </Text>
    </View>
  );
}

/** Floating top bar over a map. */
export function MapTopBar({ left, right }: { left?: React.ReactNode; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="absolute inset-x-0 top-0 flex-row items-center justify-between px-4"
      style={{ paddingTop: insets.top + 8 }}
      pointerEvents="box-none"
    >
      {left ?? <BackButton />}
      {right ?? <View />}
    </View>
  );
}

export function BackButton({ onPress }: { onPress?: () => void }) {
  const colors = useWaveColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={
        onPress ??
        (() => {
          if (router.canGoBack()) router.back();
          else router.replace("/");
        })
      }
      className="h-11 w-11 items-center justify-center rounded-full border border-line bg-surface active:opacity-70"
    >
      <ChevronLeft size={22} color={colors.text} />
    </Pressable>
  );
}

/** Header for non-map screens. */
export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className="px-5 pb-3" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center justify-between">
        <BackButton />
        {right}
      </View>
      <Text variant="hero" className="mt-5">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="caption" className="mt-1">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
