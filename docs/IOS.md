# Running Wave in Xcode

## Quick start

1. Download `Wayve.zip` (or clone the repository) into **Downloads** and double-click it —
   you get `~/Downloads/Wayve`.
2. Open **Terminal** and run:

   ```sh
   cd ~/Downloads/Wayve && bash scripts/mac-setup.sh
   ```

   It checks Xcode, installs Homebrew, Node 22, pnpm and CocoaPods if missing, asks for your
   Supabase URL/key, Vercel URL and bundle ID, installs dependencies, generates the iOS
   project, opens it in Xcode and starts the dev server.

3. In Xcode: **Wave** target → **Signing & Capabilities** → choose your **Team**, pick a
   simulator or your iPhone, press **⌘R**.

The rest of this page explains each step.

The iOS project is generated from `apps/mobile/app.config.ts` by `expo prebuild`, so it
always matches the app's config (bundle ID, Sign in with Apple, URL scheme, permissions,
Mapbox). It is not committed; regenerate it whenever config or native dependencies change.

## Requirements

- macOS with Xcode 26+ and the iOS simulator runtime installed
- Node 22+, pnpm 10 (`corepack enable`), CocoaPods (`brew install cocoapods`)
- An Apple Developer account. A free account can run on the simulator and your own
  device, but **Sign in with Apple needs the paid Apple Developer Program**.

## 1. Configure

```sh
git clone <repo> && cd Wayve
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
```

Fill in `apps/mobile/.env`:

| Variable                        | Value                                                                     |
| ------------------------------- | ------------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`      | Supabase → Project Settings → API → Project URL                           |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → publishable (or legacy anon) key |
| `EXPO_PUBLIC_SHARE_BASE_URL`    | Your web URL, e.g. `https://<project>.vercel.app`                         |
| `WAVE_IOS_BUNDLE_ID`            | Your own reverse-DNS ID, e.g. `com.yourname.wave`                         |
| `EXPO_PUBLIC_MAPBOX_TOKEN`      | Optional — without it the app shows its schematic map                     |

Leave the Supabase values empty to run in on-device preview mode.

## 2. Generate and open the Xcode project

```sh
cd apps/mobile
pnpm xcode            # expo prebuild --platform ios (runs pod install) && opens ios/Wave.xcworkspace
```

Always open **`Wave.xcworkspace`**, not `Wave.xcodeproj`.

In Xcode: select the **Wave** target → **Signing & Capabilities** → choose your **Team**.
The bundle identifier comes from `WAVE_IOS_BUNDLE_ID`; Sign in with Apple is already
added as a capability.

## 3. Run

Debug builds load JavaScript from the Metro dev server:

```sh
cd apps/mobile
pnpm start            # keep this running
```

Then press **Run** (⌘R) in Xcode with a simulator or your iPhone selected. The development
client finds Metro automatically (on a device, use the same Wi-Fi network). Edits reload
instantly.

Shortcuts without opening Xcode:

```sh
pnpm ios:sim          # build + run on a simulator, starts Metro
pnpm ios:device       # build + run on a connected iPhone
```

For a standalone build that doesn't need Metro, choose **Product → Scheme → Edit Scheme →
Run → Build Configuration: Release**, or use EAS (`npx eas build --profile preview -p ios`).

## When to regenerate

Run `pnpm xcode` again (it is safe — `ios/` is regenerated from config) after changing
`app.config.ts`, `.env` values that affect config (`WAVE_IOS_BUNDLE_ID`), or adding a
package with native code. Plain JavaScript/TypeScript changes never need it.

Add `--clean` (`npx expo prebuild --platform ios --clean`) if the project gets into a bad
state. Don't hand-edit files in `ios/`; put changes in `app.config.ts` or a config plugin.

## Troubleshooting

- **"No bundle URL present"** — Metro isn't running; start `pnpm start` in `apps/mobile`.
- **Signing errors about Sign in with Apple** — the team must be on the paid program and the
  App ID must have the capability enabled (see DEPLOYMENT.md → Apple).
- **Pod install fails** — `cd ios && pod install --repo-update`.
- **Device can't reach Metro** — same network, or run `pnpm start --tunnel`.
