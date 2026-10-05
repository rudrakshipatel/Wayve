import { View } from "react-native";
import { Text } from "./Text";

export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <View className={className}>
      <Text variant="overline">{label}</Text>
      <Text variant="stat" className="mt-1" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
