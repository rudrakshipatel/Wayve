import { Link } from "expo-router";
import { View } from "react-native";
import { Text } from "@/components/ui";

export default function NotFound() {
  return (
    <View className="flex-1 items-center justify-center bg-bg">
      <Text variant="heading">This screen doesn't exist</Text>
      <Link href="/" className="mt-4">
        <Text variant="label" className="text-tide">
          Go home
        </Text>
      </Link>
    </View>
  );
}
