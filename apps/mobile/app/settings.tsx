import { router } from "expo-router";
import { ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { ScreenHeader } from "@/components/Chrome";
import { Button, Card, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { isBackendConfigured } from "@/lib/env";
import { useWaveColors } from "@/lib/theme";

export default function Settings() {
  const colors = useWaveColors();
  const { session, isGuest, signOut, deleteAccount } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        <Card className="mt-4">
          <Text variant="label">Delete account</Text>
          <Text variant="caption" className="mt-1">
            Permanently deletes your account, journeys, saved places and share links. Anyone
            watching a shared journey will see that it has ended. This can't be undone.
          </Text>
          {error ? (
            <Text variant="caption" className="mt-2 text-coral">
              {error}
            </Text>
          ) : null}
          <View className="mt-4 flex-row gap-3">
            {confirming ? (
              <>
                <Button
                  className="flex-1"
                  variant="secondary"
                  label="Cancel"
                  onPress={() => {
                    setConfirming(false);
                  }}
                />
                <Button
                  className="flex-1"
                  variant="danger"
                  label="Delete everything"
                  loading={deleting}
                  onPress={() => {
                    setDeleting(true);
                    setError(null);
                    deleteAccount()
                      .then(() => {
                        router.replace("/");
                      })
                      .catch((e: unknown) => {
                        setError(e instanceof Error ? e.message : "Couldn't delete your account");
                      })
                      .finally(() => {
                        setDeleting(false);
                        setConfirming(false);
                      });
                  }}
                />
              </>
            ) : (
              <Button
                className="flex-1"
                variant="danger"
                label="Delete account…"
                onPress={() => {
                  setConfirming(true);
                }}
              />
            )}
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
