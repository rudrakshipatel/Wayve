import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { track } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { isBackendConfigured } from "@/lib/env";
import { useWaveColors } from "@/lib/theme";

export default function SignIn() {
  const colors = useWaveColors();
  const insets = useSafeAreaInsets();
  const { isGuest, sendEmailCode, verifyEmailCode, signInWithGoogle, signInWithApple } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const run = async (key: string, fn: () => Promise<void>, after?: () => void) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      after?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sign-in failed";
      if (!/cancel/i.test(message)) setError(message);
    } finally {
      setBusy(null);
    }
  };

  const done = () => {
    track("signed_in");
    router.back();
  };

  return (
    <View
      className="flex-1 bg-bg px-6"
      style={{ paddingTop: Platform.OS === "android" ? insets.top + 12 : 20 }}
    >
      <View className="flex-row justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => {
            router.back();
          }}
          className="h-10 w-10 items-center justify-center rounded-full bg-sunken"
        >
          <X size={18} color={colors.text} />
        </Pressable>
      </View>
      <Text variant="hero" className="mt-6">
        {isGuest ? "Keep your journeys" : "Sign in to Wave"}
      </Text>
      <Text variant="body" className="mt-2 text-muted">
        {isGuest
          ? "Create an account and everything you've made so far stays with you."
          : "Sync journeys and saved places across devices."}
      </Text>

      {!isBackendConfigured() ? (
        <Text variant="caption" className="mt-8">
          Accounts are available once Wave is connected to its backend.
        </Text>
      ) : (
        <View className="mt-8 gap-3">
          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                colors.scheme === "dark"
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={999}
              style={{ height: 52 }}
              onPress={() => void run("apple", signInWithApple, done)}
            />
          )}
          <Button
            size="lg"
            variant="secondary"
            label="Continue with Google"
            loading={busy === "google"}
            onPress={() => void run("google", signInWithGoogle, done)}
          />

          <View className="my-3 flex-row items-center gap-3">
            <View className="h-px flex-1 bg-line" />
            <Text variant="caption">or with email</Text>
            <View className="h-px flex-1 bg-line" />
          </View>

          {stage === "email" ? (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                accessibilityLabel="Email address"
                className="h-12 rounded-full bg-sunken px-4 font-sans text-[16px] text-ink"
              />
              <Button
                size="lg"
                label="Email me a code"
                disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}
                loading={busy === "email"}
                onPress={() =>
                  void run(
                    "email",
                    () => sendEmailCode(email),
                    () => {
                      setStage("code");
                    },
                  )
                }
              />
            </>
          ) : (
            <>
              <Text variant="caption">Enter the 6-digit code sent to {email.trim()}.</Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={6}
                accessibilityLabel="Verification code"
                className="h-12 rounded-full bg-sunken px-4 font-mono text-[18px] tracking-[6px] text-ink"
              />
              <Button
                size="lg"
                label="Verify"
                disabled={code.trim().length < 6}
                loading={busy === "code"}
                onPress={() => void run("code", () => verifyEmailCode(email, code), done)}
              />
              <Button
                variant="ghost"
                label="Use a different email"
                onPress={() => {
                  setStage("email");
                  setCode("");
                }}
              />
            </>
          )}
          {error ? (
            <Text variant="caption" className="text-coral">
              {error}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
