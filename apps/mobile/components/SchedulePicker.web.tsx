import { View } from "react-native";
import { formatTime } from "@/lib/format";
import { Stepper, Text } from "./ui";

/** Web fallback: adjust the start time in 5-minute steps. */
export function SchedulePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (ms: number) => void;
}) {
  const minutesFromNow = Math.max(5, Math.round((value - Date.now()) / 60_000));
  return (
    <View className="gap-2">
      <Text variant="caption">Starts at {formatTime(value)}</Text>
      <Stepper
        label="Minutes from now"
        value={minutesFromNow}
        min={5}
        max={24 * 60}
        step={5}
        format={(m) => `in ${m} min`}
        onChange={(m) => {
          onChange(Date.now() + m * 60_000);
        }}
      />
    </View>
  );
}
