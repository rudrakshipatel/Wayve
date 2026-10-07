#!/usr/bin/env bash
# One-step Mac setup for Wave: checks tools, writes apps/mobile/.env, installs dependencies,
# generates the iOS project, opens it in Xcode and starts the Metro dev server.
#
#   cd ~/Downloads/Wayve && bash scripts/mac-setup.sh
#
# Safe to run again: it only fills in what's missing and regenerates the Xcode project.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
ENV_FILE="$MOBILE/.env"

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok() { printf '  ✓ %s\n' "$1"; }
fail() { printf '\n  ✗ %s\n\n' "$1" >&2; exit 1; }

[[ "$(uname)" == "Darwin" ]] || fail "This script is for macOS."

bold "1/5  Checking tools"

if ! xcode-select -p >/dev/null 2>&1 || [[ ! -d "/Applications/Xcode.app" ]]; then
  fail "Install Xcode from the Mac App Store, open it once to finish setup, then run this script again."
fi
ok "Xcode $(xcodebuild -version 2>/dev/null | head -1 | awk '{print $2}')"

if ! command -v brew >/dev/null 2>&1; then
  echo "  Homebrew is needed to install Node and CocoaPods."
  read -r -p "  Install Homebrew now? [Y/n] " answer
  [[ "${answer:-Y}" =~ ^[Nn] ]] && fail "Install Homebrew from https://brew.sh and run this script again."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv)"
fi
ok "Homebrew"

node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [[ "$(node_major)" -lt 22 ]]; then
  echo "  Installing Node 22…"
  brew install node@22
  brew link --overwrite --force node@22
fi
ok "Node $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "  Installing pnpm…"
  corepack enable pnpm 2>/dev/null || brew install pnpm
fi
ok "pnpm $(pnpm -v)"

if ! command -v pod >/dev/null 2>&1; then
  echo "  Installing CocoaPods…"
  brew install cocoapods
fi
ok "CocoaPods $(pod --version)"

bold "2/5  App configuration (apps/mobile/.env)"

get_env() { [[ -f "$ENV_FILE" ]] && grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true; }
set_env() {
  touch "$ENV_FILE"
  if grep -qE "^$1=" "$ENV_FILE"; then
    sed -i '' "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"
  fi
}
ask() {
  local key="$1" prompt="$2" current
  current="$(get_env "$key")"
  if [[ -n "$current" ]]; then
    ok "$key already set"
    return
  fi
  read -r -p "  $prompt: " value
  set_env "$key" "$value"
}

echo "  Leave a value empty to skip it (the app then runs in on-device preview mode)."
ask EXPO_PUBLIC_SUPABASE_URL "Supabase Project URL (https://xxxx.supabase.co)"
ask EXPO_PUBLIC_SUPABASE_ANON_KEY "Supabase publishable / anon key"
ask EXPO_PUBLIC_SHARE_BASE_URL "Your Vercel URL (https://your-project.vercel.app)"
ask WAVE_IOS_BUNDLE_ID "iOS bundle ID registered with Apple (e.g. com.yourname.wave)"
ask EXPO_PUBLIC_MAPBOX_TOKEN "Mapbox public token (optional)"
ok "Saved to apps/mobile/.env (never committed)"

bold "3/5  Installing dependencies"
cd "$ROOT"
pnpm install
ok "Dependencies installed"

bold "4/5  Generating the Xcode project"
cd "$MOBILE"
EXPO_NO_GIT_STATUS=1 pnpm exec expo prebuild --platform ios
ok "ios/Wave.xcworkspace ready"
open ios/Wave.xcworkspace

bold "5/5  Starting the dev server"
cat <<'EOF'
  Xcode is opening. In Xcode:
    1. Click "Wave" in the left sidebar → target "Wave" → "Signing & Capabilities".
    2. Pick your Team (your Apple Developer account).
    3. Choose an iPhone simulator (or your plugged-in iPhone) at the top, then press ⌘R.

  Keep this window open — it serves the app's JavaScript to the debug build.
  Press Ctrl+C to stop it. Next time, just run:  cd ~/Downloads/Wayve/apps/mobile && pnpm start
EOF
exec pnpm start
