import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Button, Text } from "@/components/ui";
import { track } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { parseAuthCallback } from "@/lib/auth-callback";
import { isBackendConfigured } from "@/lib/env";

/**
 * Deep-link target for wave://auth-callback: the "Sign in" link in Wave's emails and the
 * Google OAuth redirect both land here with a one-time code to exchange for a session.
 */
export default function AuthCallback() {
  const params = useLocalSearchParams();
  const ready = useAuth((s) => s.ready);
  const completeCallback = useAuth((s) => s.completeCallback);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (!ready || handled.current) return;
    handled.current = true;
    const callback = parseAuthCallback(params);
    const goHome = () => {
      if (router.canDismiss()) router.dismissAll();
      router.replace("/");
    };
    // OAuth redirects are completed inside lib/auth; nothing left to do here.
    if (callback.kind === "none" || !isBackendConfigured()) {
      goHome();
      return;
    }
    completeCallback(callback)
      .then(() => {
        track("signed_in");
        goHome();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "This sign-in link didn't work");
      });
  }, [ready, params, completeCallback]);

  return (
    <View className="flex-1 items-center justify-center bg-bg px-8">
      {error ? (
        <>
          <Text variant="title" className="text-center">
            Couldn't sign you in
          </Text>
          <Text variant="caption" className="mt-2 text-center">
            {error}. Links work once and expire after an hour — request a new one from Account.
          </Text>
          <Button
            className="mt-6"
            label="Back to Wave"
            onPress={() => {
              router.replace("/");
            }}
          />
        </>
      ) : (
        <>
          <ActivityIndicator />
          <Text variant="caption" className="mt-3">
            Signing you in…
          </Text>
        </>
      )}
    </View>
  );
}
