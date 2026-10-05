import { Minus, Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useWaveColors } from "@/lib/theme";
import { Text } from "./Text";

export function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  format,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  step: number;
  min: number;
  max: number;
  format: (value: number) => string;
  label: string;
}) {
  const colors = useWaveColors();
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <View
      className="flex-row items-center justify-between rounded-full bg-sunken p-1"
      accessibilityLabel={label}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        onPress={() => {
          onChange(clamp(value - step));
        }}
        className="h-10 w-10 items-center justify-center rounded-full bg-surface active:opacity-70"
      >
        <Minus size={18} color={colors.text} />
      </Pressable>
      <Text variant="stat" accessibilityLiveRegion="polite">
        {format(value)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        onPress={() => {
          onChange(clamp(value + step));
        }}
        className="h-10 w-10 items-center justify-center rounded-full bg-surface active:opacity-70"
      >
        <Plus size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}
