# Deploying Wave

Wave has three deployables: the **Supabase** backend (database, edge functions, realtime,
cron), the **web share viewer** on Vercel, and the **mobile app** built with EAS. This guide
goes in that order. Nothing here requires secrets in the repository.

## 0. Accounts and keys you need

| Service            | What to create                                                               | Where it goes                                        |
| ------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| Supabase           | A project (region close to your users)                                       | Project ref + DB password → GitHub secrets           |
| Mapbox             | **Public token A** restricted to your web domain(s)                          | `NEXT_PUBLIC_MAPBOX_TOKEN` (Vercel)                  |
| Mapbox             | **Public token B** restricted to the iOS bundle id / Android package         | `EXPO_PUBLIC_MAPBOX_TOKEN` (EAS)                     |
| Mapbox             | **Secret token** with `styles:read` + directions access, no URL restriction  | `MAPBOX_SECRET_TOKEN` (Supabase function secret)     |
| Google Cloud       | OAuth client (Web application) — see [Sign-in providers](#sign-in-providers) | Supabase → Auth → Providers → Google                 |
| Apple Developer    | App ID with Sign in with Apple — see [Sign-in providers](#sign-in-providers) | Supabase → Auth → Providers → Apple                  |
| PostHog (optional) | Project API key                                                              | `NEXT_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_KEY` |
| Vercel             | Project linked to this repo                                                  | —                                                    |
| Expo               | EAS project                                                                  | `EAS_PROJECT_ID`                                     |

## 1. Supabase

```sh
supabase login
supabase link --project-ref <project-ref>
supabase db push                       # applies supabase/migrations
pnpm functions:vendor                  # copies shared packages into supabase/functions/_vendor
supabase functions deploy              # one function, wave-api, serving /wave-api/<route>
supabase secrets set \
  MAPBOX_SECRET_TOKEN=<secret token> \
  WAVE_SHARE_BASE_URL=https://<your web domain> \
  WAVE_ALLOWED_ORIGINS=https://<your web domain>
```

No custom domain yet? Use the Vercel URL (`https://<project>.vercel.app`) for both values
and update them when the domain is added — links already shared keep their old host.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.
All three secrets are optional to get started: without `MAPBOX_SECRET_TOKEN` journeys follow
a straight great-circle path instead of roads, without `WAVE_SHARE_BASE_URL` the app builds
share links from its own `EXPO_PUBLIC_SHARE_BASE_URL`, and without `WAVE_ALLOWED_ORIGINS`
any origin may call the API (it authenticates with bearer tokens, not cookies).

Dashboard settings:

1. **Scheduler:** `supabase db push` enables `pg_cron` and schedules the jobs (migration
   `…_maintenance.sql`, safe to paste into the SQL editor by hand) so scheduled journeys
   activate and finished ones complete with every client closed.
2. **Realtime → Settings:** turn **off** "Allow public access" so only private,
   RLS-authorised channels are accepted.
3. **Authentication → Sign In / Providers:** enable Email (OTP), Google, Apple and
   **Anonymous sign-ins** (guests explore first, then link an identity).
4. **Authentication → URL configuration:** site URL = your web URL; add redirect URLs
   `wave://auth-callback` and `https://<your web domain>/auth/callback`.
5. **Authentication → Emails → Templates:** nothing to change; the default emails' link
   signs in — see [Email templates](#email-templates).
6. **Authentication → Rate limits:** keep the defaults or tighten for OTP emails.

The `Deploy Supabase` GitHub workflow repeats steps above on every push to `main` once
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` secrets exist.

## 2. Web share viewer (Vercel)

1. Import the repository in Vercel and set **Root Directory** to `apps/web`
   (framework: Next.js; Vercel detects pnpm workspaces automatically).
2. Environment variables (Production + Preview):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`,
   `NEXT_PUBLIC_SITE_URL`, optionally `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`.
3. Until you add a domain, the production URL `https://<project>.vercel.app` is your share
   host: use it for `NEXT_PUBLIC_SITE_URL`, `WAVE_SHARE_BASE_URL` and `WAVE_ALLOWED_ORIGINS`.
   When you add a domain later, update those three values.

Check: `https://<domain>/journey/demo` shows the demo journey; a real link shows the live map.

## 3. Mobile app (EAS)

```sh
cd apps/mobile
npx eas init                                   # sets EAS_PROJECT_ID
npx eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value <url>
npx eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key>
npx eas env:create --name EXPO_PUBLIC_MAPBOX_TOKEN --value <public token B>
npx eas env:create --name EXPO_PUBLIC_SHARE_BASE_URL --value https://<your web domain>
npx eas build --profile development --platform ios   # dev client (Mapbox needs native code)
npx eas build --profile production --platform all
npx eas submit --platform all
```

Set `WAVE_IOS_BUNDLE_ID` / `WAVE_ANDROID_PACKAGE` to your own identifiers. To build and
run locally in Xcode instead, see [IOS.md](IOS.md).
Expo Go cannot load the native Mapbox SDK; use the development build. Without a Mapbox
token the app falls back to the schematic map, and without Supabase settings it runs in
on-device preview mode.

## Sign-in providers

The app signs in with Google through the browser (OAuth), and with Apple natively on iOS.
Supabase shows the exact **Callback URL** to use on each provider's page under
**Authentication → Sign In / Providers** — it looks like
`https://<project-ref>.supabase.co/auth/v1/callback`.

### Google (client ID + client secret)

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create (or pick) a
   project.
2. **Google Auth Platform → Branding** (older consoles: _APIs & Services → OAuth consent
   screen_): app name "Wave", support email, logo. Under **Authorized domains** add
   `supabase.co` and, later, your own domain.
3. **Audience:** user type **External**. While in _Testing_, add your Google account as a
   test user; choose **Publish app** before launch.
4. **Data access:** the default `openid`, `email` and `profile` scopes are all Wave needs.
5. **Clients → Create client** (older consoles: _Credentials → Create credentials → OAuth
   client ID_): application type **Web application**.
   - Authorized JavaScript origins: `https://<project>.vercel.app` (optional)
   - Authorized redirect URIs: the Supabase callback URL from above
6. Copy the **Client ID** and **Client secret** into Supabase → Authentication → Sign In /
   Providers → **Google**, enable it and save.

One Web client is enough: the mobile app opens Google in a secure browser sheet and
returns via `wave://auth-callback`.

### Apple (client ID = your bundle ID)

Requires the paid [Apple Developer Program](https://developer.apple.com/programs/).

1. [Certificates, Identifiers & Profiles → Identifiers](https://developer.apple.com/account/resources/identifiers/list)
   → **+** → **App IDs** → App. Bundle ID: the same value as `WAVE_IOS_BUNDLE_ID`
   (e.g. `com.yourname.wave`). Tick **Sign In with Apple** and register.
2. In Supabase → Authentication → Sign In / Providers → **Apple**: enable it and put your
   bundle ID in **Client IDs**. That is all native iOS sign-in needs — no secret key.
3. Optional, only for Sign in with Apple on the web or Android: create a **Services ID**
   (e.g. `com.yourname.wave.web`) with Sign In with Apple, return URL = the Supabase
   callback URL; create a **Key** with Sign In with Apple and download the `.p8`; then add
   the Services ID to Client IDs and generate the secret in Supabase's Apple provider form
   (Apple secrets expire every 6 months).

## Email templates

**Nothing to change to get started.** Supabase's default emails contain a **Sign in**
link; Wave sends it with `wave://auth-callback` as the destination, so tapping it on the
iPhone opens Wave and signs in. Only make sure `wave://auth-callback` is listed under
**Authentication → URL Configuration → Redirect URLs**.

On the free plan the templates can only be edited after setting up **custom SMTP**
(Authentication → Emails → "Set up SMTP"), which needs a sender on your own verified
domain (e.g. with Resend, Postmark or SES). Once you have that, you can optionally switch
to 6-digit codes — useful when people read email on another device — by adding
`{{ .Token }}` to these templates:

**Confirm signup** — first sign-in of a new email

- Subject: `Your Wave code`
- Body:

  ```html
  <h2>Welcome to Wave</h2>
  <p>Your sign-in code is:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
  <p>It expires in 1 hour. If you didn't request it, ignore this email.</p>
  ```

**Magic link** — signing in again

- Subject: `Your Wave code`
- Body:

  ```html
  <h2>Sign in to Wave</h2>
  <p>Your sign-in code is:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
  <p>It expires in 1 hour. If you didn't request it, ignore this email.</p>
  ```

**Change email address** — a guest saving their journeys with an email

- Subject: `Confirm your email for Wave`
- Body:

  ```html
  <h2>Keep your Wave journeys</h2>
  <p>Enter this code in the app to add {{ .NewEmail }} to your account:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
  <p>If you didn't request this, ignore this email.</p>
  ```

Optional: **Authentication → Providers → Email → Email OTP Expiration** sets how long codes
last (default 3600 seconds). Before launch, configure **custom SMTP** (Authentication →
Emails → SMTP Settings); the built-in sender only allows a few emails per hour.

## 4. Production checklist

- [ ] RLS tests pass against the real project: `supabase test db` (or `pnpm db:test` locally)
- [ ] Realtime public access disabled; `pg_cron` jobs `wave-advance-sessions` and
      `wave-purge-stale` visible in `cron.job`
- [ ] Mapbox public tokens are URL / bundle restricted; the secret token exists only as a
      Supabase secret
- [ ] `WAVE_ALLOWED_ORIGINS` lists only your web origins
- [ ] App Store: account deletion is in Settings → Delete account (required by Apple);
      location permission copy explains it is only used to centre the map
- [ ] Privacy policy states that shared pages show simulated positions only
