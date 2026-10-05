import { Redirect } from "expo-router";

/** OAuth redirect target (wave://auth-callback); the session is handled in lib/auth. */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
