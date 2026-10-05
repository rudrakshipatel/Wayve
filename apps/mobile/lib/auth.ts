import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { create } from "zustand";
import { isBackendConfigured } from "./env";
import { getApi, getSupabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

interface AuthState {
  readonly session: Session | null;
  readonly ready: boolean;
  /** True for the anonymous "explore first" session. */
  readonly isGuest: boolean;
  readonly init: () => Promise<void>;
  readonly sendEmailCode: (email: string) => Promise<void>;
  readonly verifyEmailCode: (email: string, code: string) => Promise<void>;
  readonly signInWithGoogle: () => Promise<void>;
  readonly signInWithApple: () => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly deleteAccount: () => Promise<void>;
}

const isGuest = (s: Session | null): boolean => Boolean(s?.user.is_anonymous);

/**
 * Anonymous-first auth: people explore and build journeys immediately with an anonymous
 * account, then keep everything by linking email, Google or Apple to the same user.
 */
export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  ready: false,
  isGuest: false,

  async init() {
    if (!isBackendConfigured()) {
      set({ ready: true });
      return;
    }
    const supabase = getSupabase();
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, isGuest: isGuest(session) });
    });
    const { data } = await supabase.auth.getSession();
    let session = data.session;
    if (!session) {
      const anon = await supabase.auth.signInAnonymously();
      session = anon.data.session;
    }
    set({ session, isGuest: isGuest(session), ready: true });
  },

  async sendEmailCode(email) {
    const supabase = getSupabase();
    const trimmed = email.trim().toLowerCase();
    // Guests attach the email to their existing account so their journeys are kept.
    const { error } = get().isGuest
      ? await supabase.auth.updateUser({ email: trimmed })
      : await supabase.auth.signInWithOtp({ email: trimmed, options: { shouldCreateUser: true } });
    if (error) throw error;
  },

  async verifyEmailCode(email, code) {
    const { error } = await getSupabase().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: get().isGuest ? "email_change" : "email",
    });
    if (error) throw error;
  },

  async signInWithGoogle() {
    const supabase = getSupabase();
    const redirectTo = Linking.createURL("auth-callback");
    const { data, error } = get().isGuest
      ? await supabase.auth.linkIdentity({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: true },
        })
      : await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: true },
        });
    if (error) throw error;
    if (Platform.OS === "web") {
      window.location.assign(data.url);
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return;
    const code = new URL(result.url).searchParams.get("code");
    if (code) {
      const exchanged = await supabase.auth.exchangeCodeForSession(code);
      if (exchanged.error) throw exchanged.error;
    }
  },

  async signInWithApple() {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) throw new Error("Apple did not return an identity token");
    const supabase = getSupabase();
    const params = { provider: "apple" as const, token: credential.identityToken, nonce: rawNonce };
    const { error } = get().isGuest
      ? await supabase.auth.linkIdentity(params)
      : await supabase.auth.signInWithIdToken(params);
    if (error) throw error;
  },

  async deleteAccount() {
    await getApi().deleteAccount();
    if (!isBackendConfigured()) return;
    await get().signOut();
  },

  async signOut() {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    const anon = await supabase.auth.signInAnonymously();
    set({ session: anon.data.session, isGuest: true });
  },
}));
