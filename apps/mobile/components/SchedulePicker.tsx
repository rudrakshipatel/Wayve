import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Platform, View } from "react-native";
import { formatTime } from "@/lib/format";
import { Button, Text } from "./ui";

/** Picks a start time today (or tomorrow if the time has passed). */
export function SchedulePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (ms: number) => void;
}) {
  const commit = (date: Date) => {
    const next = new Date(date);
    next.setSeconds(0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    onChange(next.getTime());
  };

  if (Platform.OS === "android") {
    return (
      <View className="flex-row items-center justify-between">
        <Text variant="stat">{formatTime(value)}</Text>
        <Button
          size="sm"
          variant="secondary"
          label="Change time"
          onPress={() => {
            DateTimePickerAndroid.open({
              value: new Date(value),
              mode: "time",
              onValueChange: (_event, date) => {
                commit(date);
              },
            });
          }}
        />
      </View>
    );
  }

  return (
    <View className="flex-row items-center justify-between">
      <Text variant="caption">Start time</Text>
      <DateTimePicker
        value={new Date(value)}
        mode="time"
        display="compact"
        onValueChange={(_event, date) => {
          commit(date);
        }}
      />
    </View>
  );
}
