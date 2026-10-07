import type { EmailOtpType } from "@supabase/supabase-js";

export type AuthCallback =
  | { readonly kind: "code"; readonly code: string }
  | { readonly kind: "token_hash"; readonly tokenHash: string; readonly type: EmailOtpType }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "none" };

type Params = Readonly<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

/**
 * Reads the parameters Supabase appends to wave://auth-callback after a Google sign-in or
 * after tapping the link in a sign-in / email-change email.
 */
export function parseAuthCallback(params: Params): AuthCallback {
  const error = first(params["error_description"]) ?? first(params["error"]);
  if (error) return { kind: "error", message: error.replace(/\+/g, " ") };
  const code = first(params["code"]);
  if (code) return { kind: "code", code };
  const tokenHash = first(params["token_hash"]);
  const rawType = first(params["type"]);
  const type = OTP_TYPES.find((t) => t === rawType);
  if (tokenHash && type) return { kind: "token_hash", tokenHash, type };
  return { kind: "none" };
}
