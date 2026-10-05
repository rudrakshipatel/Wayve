import { router } from "expo-router";
import { ShieldCheck } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { ScreenHeader } from "@/components/Chrome";
import { Button, Card, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { isBackendConfigured } from "@/lib/env";
import { useWaveColors } from "@/lib/theme";

export default function Settings() {
  const colors = useWaveColors();
  const { session, isGuest, signOut } = useAuth();
  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader title="Account" />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Card>
          <Text variant="overline">Signed in as</Text>
          <Text variant="heading" className="mt-1">
            {!isBackendConfigured()
              ? "Preview mode"
              : isGuest
                ? "Guest"
                : (session?.user.email ?? "Wave user")}
          </Text>
          <Text variant="caption" className="mt-1">
            {isGuest
              ? "You're exploring without an account. Sign in to keep your journeys on every device."
              : "Your journeys and saved places sync securely."}
          </Text>
          <View className="mt-4">
            {isGuest || !isBackendConfigured() ? (
              <Button
                label="Sign in or create account"
                onPress={() => {
                  router.push("/sign-in");
                }}
              />
            ) : (
              <Button variant="secondary" label="Sign out" onPress={() => void signOut()} />
            )}
          </View>
        </Card>
        <Card className="flex-row gap-3">
          <ShieldCheck size={20} color={colors.accent} />
          <View className="flex-1">
            <Text variant="label">Simulation only</Text>
            <Text variant="caption" className="mt-1">
              Wave simulates positions inside Wave and its share pages. It never changes your
              device's real location or sends simulated coordinates to other apps. Shared links are
              view-only and can be turned off at any time.
            </Text>
          </View>
        </Card>
        <Button
          variant="secondary"
          label="Journey history"
          onPress={() => {
            router.push("/history");
          }}
        />
        <Button
          variant="secondary"
          label="Saved locations"
          onPress={() => {
            router.push("/locations");
          }}
        />
      </ScrollView>
    </View>
  );
}
