# Deploying Wave

Wave has three deployables: the **Supabase** backend (database, edge functions, realtime,
cron), the **web share viewer** on Vercel, and the **mobile app** built with EAS. This guide
goes in that order. Nothing here requires secrets in the repository.

## 0. Accounts and keys you need

| Service            | What to create                                                              | Where it goes                                        |
| ------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------- |
| Supabase           | A project (region close to your users)                                      | Project ref + DB password → GitHub secrets           |
| Mapbox             | **Public token A** restricted to your web domain(s)                         | `NEXT_PUBLIC_MAPBOX_TOKEN` (Vercel)                  |
| Mapbox             | **Public token B** restricted to the iOS bundle id / Android package        | `EXPO_PUBLIC_MAPBOX_TOKEN` (EAS)                     |
| Mapbox             | **Secret token** with `styles:read` + directions access, no URL restriction | `MAPBOX_SECRET_TOKEN` (Supabase function secret)     |
| Mapbox             | **Downloads token** (`DOWNLOADS:READ`) for the native SDK                   | `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (EAS secret)          |
| Google Cloud       | OAuth client (Web) for Supabase Auth                                        | Supabase → Auth → Providers → Google                 |
| Apple Developer    | Services ID + key for Sign in with Apple                                    | Supabase → Auth → Providers → Apple                  |
| PostHog (optional) | Project API key                                                             | `NEXT_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_KEY` |
| Vercel             | Project linked to this repo                                                 | —                                                    |
| Expo               | EAS project                                                                 | `EAS_PROJECT_ID`                                     |

## 1. Supabase

```sh
supabase login
supabase link --project-ref <project-ref>
supabase db push                       # applies supabase/migrations
pnpm functions:vendor                  # copies shared packages into supabase/functions/_vendor
supabase functions deploy              # plan-journey, route-options, journey-control,
                                       # share-link, resolve-share, delete-account
supabase secrets set \
  MAPBOX_SECRET_TOKEN=<secret token> \
  WAVE_SHARE_BASE_URL=https://<your web domain> \
  WAVE_ALLOWED_ORIGINS=https://<your web domain>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.

Dashboard settings:

1. **Database → Extensions:** enable `pg_cron`, then re-run
   `supabase db push` (or run the `do $$ … cron.schedule … $$` block from migration 5) so
   scheduled journeys activate and finished ones complete with every client closed.
2. **Realtime → Settings:** turn **off** "Allow public access" so only private,
   RLS-authorised channels are accepted.
3. **Authentication → Sign In / Providers:** enable Email (OTP), Google, Apple and
   **Anonymous sign-ins** (guests explore first, then link an identity).
4. **Authentication → URL configuration:** site URL = your web domain; add redirect URLs
   `wave://auth-callback` and `https://<your web domain>/auth/callback`.
5. **Authentication → Rate limits:** keep the defaults or tighten for OTP emails.

The `Deploy Supabase` GitHub workflow repeats steps above on every push to `main` once
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` secrets exist.

## 2. Web share viewer (Vercel)

1. Import the repository in Vercel and set **Root Directory** to `apps/web`
   (framework: Next.js; Vercel detects pnpm workspaces automatically).
2. Environment variables (Production + Preview):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`,
   `NEXT_PUBLIC_SITE_URL`, optionally `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`.
3. Add your domain (e.g. `wave.app`) and make sure it matches `WAVE_SHARE_BASE_URL`.

Check: `https://<domain>/journey/demo` shows the demo journey; a real link shows the live map.

## 3. Mobile app (EAS)

```sh
cd apps/mobile
npx eas init                                   # sets EAS_PROJECT_ID
npx eas secret:create --name RNMAPBOX_MAPS_DOWNLOAD_TOKEN --value <downloads token>
npx eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value <url>
npx eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key>
npx eas env:create --name EXPO_PUBLIC_MAPBOX_TOKEN --value <public token B>
npx eas env:create --name EXPO_PUBLIC_SHARE_BASE_URL --value https://<your web domain>
npx eas build --profile development --platform ios   # dev client (Mapbox needs native code)
npx eas build --profile production --platform all
npx eas submit --platform all
```

Set `WAVE_IOS_BUNDLE_ID` / `WAVE_ANDROID_PACKAGE` if you don't use `app.wave.mobile`.
Expo Go cannot load the native Mapbox SDK; use the development build. Without a Mapbox
token the app falls back to the schematic map, and without Supabase settings it runs in
on-device preview mode.

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
