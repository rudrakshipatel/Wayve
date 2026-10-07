# Wave — Architecture

Wave is a location simulation and virtual-journey platform. A user designs a
static location or a multi-segment journey, runs it as a simulation, and shares
a view-only, browser-based live map with anyone through a link. Wave never
injects coordinates into the device's location services or into third-party
apps: a simulated position only exists inside Wave and its share pages.

This document covers the eight design topics that come before implementation:

1. [System architecture](#1-system-architecture)
2. [Database schema](#2-database-schema)
3. [Folder structure](#3-folder-structure)
4. [API & data flow](#4-api--data-flow)
5. [Realtime architecture](#5-realtime-architecture)
6. [Simulation engine](#6-simulation-engine)
7. [Security model](#7-security-model)
8. [Development roadmap](#8-development-roadmap)

---

## 1. System architecture

```
 ┌──────────────────────────┐        ┌───────────────────────────────┐
 │ apps/mobile (Expo / RN)  │        │ apps/web (Next.js on Vercel)  │
 │  journey builder         │        │  /journey/[token] viewer      │
 │  active journey + replay │        │  (no account, no install)     │
 └──────────┬───────────────┘        └───────────────┬───────────────┘
            │ supabase-js (user JWT)                 │ supabase-js (anon key)
            │                                        │
 ┌──────────▼────────────────────────────────────────▼───────────────┐
 │ Supabase                                                          │
 │  Auth (email, Google, Apple, anonymous)                           │
 │  Edge Function wave-api: plan-journey, route-options,             │
 │    journey-control, share-link, resolve-share, delete-account     │
 │  Postgres + RLS: profiles, saved_locations, journeys, …           │
 │  Realtime: private broadcast channels (state events, not coords)  │
 │  pg_cron: activate scheduled journeys / complete finished ones    │
 └──────────┬────────────────────────────────────────────────────────┘
            │ server-side token
 ┌──────────▼─────────┐
 │ Mapbox Directions  │   Mapbox GL / Geocoding are called from clients
 └────────────────────┘   with URL-restricted public tokens.
```

**Shared packages** (pure TypeScript, no React Native / Next.js / Deno
dependencies) are used by all three runtimes:

| Package                   | Responsibility                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `@wave/types`             | Domain types, zod schemas for every API input, share-token helpers                       |
| `@wave/map-utils`         | Geodesy (haversine, bearing, interpolation), polyline codec, formatting                  |
| `@wave/simulation-engine` | Deterministic timeline builder, sampler, session clock state machine, `LocationProvider` |
| `@wave/ui`                | Design tokens (colour, type, radius, motion) → Tailwind/NativeWind presets               |

The key architectural decision: **a journey is a deterministic function of
time.** The engine turns a route plan into a timeline once; any client can
then compute the exact simulated position for any instant from a few small,
server-owned numbers (the _session clock_). Nothing streams coordinates.

## 2. Database schema

All primary keys are UUIDs (`gen_random_uuid()`); every table has RLS enabled.

```
auth.users ─1:1─ profiles
profiles   ─1:n─ location_folders ─1:n─ saved_locations
profiles   ─1:n─ journeys ─1:n─ journey_segments (ordered, per-segment mode/speed/pause)
                         ─1:1─ journey_routes   (geometry + compiled plan, versioned)
                         ─1:1─ journey_sessions (authoritative clock + status)
                         ─1:n─ share_links      (hashed token, expiry, revocation)
rate_limits (service-only bucket table)
```

| Table              | Key columns                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`         | `id = auth.users.id`, `display_name`, `avatar_url`, `created_at`                                                                                                                                                |
| `location_folders` | `owner_id`, `name`, `kind` (`home`/`work`/`college`/`favorites`/`travel`/`custom`), `sort_order`                                                                                                                |
| `saved_locations`  | `owner_id`, `folder_id?`, `name`, `latitude`, `longitude`, `address`, `created_at`                                                                                                                              |
| `journeys`         | `owner_id`, `title`, `kind` (`journey`/`static`), `status`, `seed`, `scheduled_start_at?`, `started_at?`, `ended_at?`, `total_distance_m`, `total_duration_ms`, `source_journey_id?` (duplicate/replay lineage) |
| `journey_segments` | `journey_id`, `position`, `from_*`/`to_*` (name + lat/lng), `travel_mode`, `target_speed_kmh?`, `duration_s?`, `pause_after_s`                                                                                  |
| `journey_routes`   | `journey_id`, `plan_version`, `geometry` (GeoJSON LineString per segment), `distance_m`, `duration_ms`, `waypoint_offsets_ms`                                                                                   |
| `journey_sessions` | `journey_id`, `status`, `anchor_wall_at`, `anchor_sim_ms`, `rate`, `revision`                                                                                                                                   |
| `share_links`      | `journey_id`, `token_hash` (sha256), `token_prefix`, `channel_topic`, `expires_at`, `revoked_at`, `view_count`, `last_viewed_at`                                                                                |

Coordinates are **never** persisted per tick. Completed journeys are replayable
because the route + plan + seed fully reproduce the timeline.

## 3. Folder structure

```
/apps
  /mobile            Expo Router app (Phase 4+)
  /web               Next.js app — share viewer + marketing (Phase 9)
/packages
  /types             @wave/types
  /map-utils         @wave/map-utils
  /simulation-engine @wave/simulation-engine
  /ui                @wave/ui
/supabase
  /migrations        ordered SQL migrations (schema, RLS, realtime, cron)
  /functions         Deno edge functions (+ _shared/)
  /tests             SQL-level RLS/behaviour tests run against Postgres
/docs                architecture & runbooks
```

Packages ship TypeScript source with explicit `.ts` import specifiers, so the
same files are consumed by Metro (mobile), Next.js (`transpilePackages`),
Vitest and Deno edge functions without a build step.

## 4. API & data flow

| Operation                      | Path                                               | Notes                                                                                                                                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved locations / folders CRUD | supabase-js → Postgres (RLS)                       | owner-only                                                                                                                                                                                                                                                                  |
| Geocoding / place search       | client → Mapbox Geocoding                          | public, URL-restricted token                                                                                                                                                                                                                                                |
| `plan-journey`                 | Edge Function                                      | Validates segments (zod), fetches Mapbox Directions with the server token, compiles the timeline with the engine, writes `journeys`, `journey_segments`, `journey_routes`, `journey_sessions` in one transaction. Server is authoritative for route, distance and duration. |
| `journey-control`              | Edge Function                                      | `start` / `schedule` / `pause` / `resume` / `stop` / `restart` / `set_rate` / `seek_waypoint`. Runs the shared state machine, stamps server time, bumps `revision`. Owners have **no** direct UPDATE on sessions.                                                           |
| `share-link`                   | Edge Function                                      | create (returns raw token **once**), revoke, list. Stores only `sha256(token)`.                                                                                                                                                                                             |
| `resolve-share`                | Edge Function → `public.get_shared_journey(token)` | Anonymous; rate-limited per IP; returns the minimal public view + realtime topic + server time.                                                                                                                                                                             |

Journey creation flow (MVP):

```
builder (mobile) ──plan-journey──▶ route + plan stored, status=draft
preview (mobile) ◀── route geometry / distance / duration
START ──journey-control{start}──▶ session.status=active, anchor_wall_at=now()
SHARE ──share-link{create}──▶ https://wave.app/journey/<token>
recipient browser ──resolve-share──▶ public view + topic ──subscribe──▶ live updates
```

## 5. Realtime architecture

```
journey-control / pg_cron
        │ UPDATE journey_sessions
        ▼
trigger broadcast_session_change()  ──realtime.send()──▶  private topics
        │                                                 ├─ journey:<journey_id>   (owner devices)
        │                                                 └─ share:<channel_topic>  (one per live share link)
        ▼
clients: sample(timeline, simElapsed(clock, serverNow)) every animation frame
```

- **State, not coordinates.** Each event carries the session clock
  `{status, anchorWallMs, anchorSimMs, rate, revision, serverTimeMs}` — about
  150 bytes, sent only on transitions (start, pause, resume, rate change, seek,
  waypoint reached, completed, cancelled, revoked).
- **Smoothness.** Each client samples the deterministic timeline on every frame
  (`requestAnimationFrame` / Reanimated). Mobile and web render identical
  positions without network traffic between transitions.
- **Clock sync.** Every response and event includes `serverTimeMs`; clients keep
  a smoothed offset so device clock skew does not shift the marker.
- **Ordering & recovery.** `revision` is monotonic; clients drop stale events
  and refetch on reconnect / tab visibility change.
- **Authorization.** Channels are `private`; `realtime.messages` RLS lets an
  owner join `journey:<id>` and lets anyone join `share:<topic>` only while the
  link is valid. No client may send on these topics — only the database does.
- **Server authority without an open app.** Scheduled starts and completions
  are pure functions of the clock; `pg_cron` flips the persisted status every
  minute so history and notifications are right even when every client is
  closed. Viewers compute the transition locally to the millisecond.

## 6. Simulation engine

`packages/simulation-engine` has no platform dependencies.

**Input** (`JourneyPlanInput`): ordered segments, each with a route polyline,
`travelMode`, optional `targetSpeedKmh` **or** `durationS`, `pauseAfterS`, and
a journey `seed`. Profiles may be overridden per segment.

**Compilation** (`buildTimeline`) — once per plan version:

1. Resample each segment polyline onto a uniform distance grid (adaptive step,
   bounded point count).
2. Build a _speed-limit envelope_ along distance:
   - cruise speed from target speed or solved duration,
   - seeded speed variation in chunks (walking ±small, driving ±larger),
   - turn caps from heading change at vertices (smooth turns),
   - forced stops: traffic stops (driving), bus stops at intervals, train
     stations; `v = 0` with a dwell time,
   - segment boundaries / waypoints: `v = 0` with the waypoint pause.
3. Forward pass (acceleration limit) and backward pass (deceleration limit):
   `v[i+1] ≤ √(v[i]² + 2·a·Δs)` — a physically consistent profile.
4. Integrate time with constant acceleration per cell
   (`Δt = 2Δs / (v₀ + v₁)`), adding dwell times at stops.
5. If a segment specifies a duration, bisect the cruise speed until the
   compiled duration matches.

**Sampling** (`sampleTimeline(timeline, simMs)`) is O(log n): binary-search the
cell, solve `s = v₀τ + ½aτ²`, interpolate along the polyline, heading from a
look-ahead/look-behind chord (smooth turns, no jumps). Output:
`{timestamp, latitude, longitude, speed, heading, progress, distanceRemaining,
distanceTravelled, timeRemainingMs, segmentIndex, status}`.

**Session clock** (`SessionClock` + `transition()`): pure state machine

```
draft ──start──▶ active ──pause──▶ paused ──resume──▶ active
  │                 │  ▲                                 │
  └─schedule─▶ scheduled ──(time)──┘                     │
active/paused ──stop──▶ cancelled      active ──(end reached)──▶ completed
active/paused ──restart / seek / set_rate──▶ same status, new anchor
```

`simElapsed = anchorSimMs + (now − anchorWallMs) × rate` while active. Change
speed = change `rate`; skip to waypoint = seek to that waypoint's arrival time;
replay = a local clock with rate 1×/2×/5×/10×.

**Location providers** implement
`LocationProvider { start, stop, pause, resume, getStatus }`. Only
`SimulatedLocationProvider` exists; it emits samples from the timeline through
an injected ticker. Any future platform-specific provider lives behind this
interface in its own package and must use documented, public APIs only.

## 7. Security model

- **RLS everywhere.** Owners read/write their own rows; `journey_sessions`,
  `journey_routes`, `share_links` and `rate_limits` have no client write
  policies — writes go through edge functions using the service role
  server-side only.
- **Share tokens.** 32 random bytes from a CSPRNG, base64url (43 chars). Only
  `sha256(token)` is stored; the raw token is shown to the owner once. Links
  support expiry (default 24 h, max 30 days), manual revocation and automatic
  expiry; they are view-only by construction (no write path accepts them).
- **Minimal public view.** `get_shared_journey()` is `SECURITY DEFINER`, returns
  only title, segment labels/modes, route geometry, plan parameters, session
  clock and timestamps. No user ids, emails, journey ids or share ids.
- **Realtime.** Private channels with `realtime.messages` policies; topics are
  random, separate from the URL token, and invalid after revocation/expiry.
- **Rate limiting.** Token-bucket table keyed by `(scope, key)` checked in edge
  functions (share resolution per IP, planning/control per user).
- **Secrets.** Service-role key and the Mapbox secret token only exist as Edge
  Function secrets. Clients get the anon key and URL-restricted public Mapbox
  token via `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` env vars. Nothing is hardcoded.
- **Errors.** Edge functions return typed error codes; internals are logged,
  never echoed.
- **Product safety.** No mock-location injection, no background spoofing of
  device GPS, no integrations that feed simulated coordinates to third-party
  services. Shared pages are clearly labelled as a simulated journey.

## 8. Development roadmap

| Phase | Scope                                                               | Exit criteria                                   |
| ----- | ------------------------------------------------------------------- | ----------------------------------------------- |
| 1     | Monorepo, tooling, `types`, `map-utils`, `simulation-engine`, `ui`  | typecheck + lint + unit tests green             |
| 2     | Supabase migrations, RLS, realtime authorization, cron, SQL tests   | migrations apply on Postgres 16; RLS tests pass |
| 3     | Mapbox geocoding & directions clients, `plan-journey` function      | unit tests with recorded fixtures               |
| 4     | Mobile shell, auth-optional exploration, static locations + folders | screens render; CRUD under RLS                  |
| 5     | Journey builder (7 steps, multi-segment designer)                   | plans persisted via `plan-journey`              |
| 6     | Engine hardening: profiles tuning, duration solving, perf budgets   | property tests, 60 fps sampling budget          |
| 7     | `journey-control`, broadcast triggers, client realtime sync         | integration tests for every transition          |
| 8     | Mobile active journey screen                                        | smooth marker, controls                         |
| 9     | Web share page `/journey/[token]`                                   | Safari/Chrome/desktop verified                  |
| 10    | History, replay (1/2/5/10×), scheduling                             |                                                 |
| 11    | Auth providers (email/Google/Apple), rate limits, hardening         | security review                                 |
| 12    | E2E tests, performance, Vercel + Supabase deployment                |                                                 |

## 9. Implementation notes

- **Edge functions are thin.** Each `supabase/functions/<name>/index.ts` wires Deno
  (env, supabase-js, auth) to a pure handler in `_shared/handlers`. Handlers talk to a
  repository that only calls SQL functions, so integration tests run the same code
  against Postgres via `pg`. Shared packages are vendored into the functions folder at
  deploy time (`pnpm functions:vendor`).
- **Determinism contract.** Routes are rounded to 1e-6° before compilation and stored as
  is; viewers rebuild the timeline with `planFromStoredSegments(seed, segments)` and get
  bit-identical results (asserted in integration tests). `ENGINE_VERSION` is stored per
  route; bump it whenever compiled output changes.
- **Preview mode.** With no Supabase configuration the mobile app uses an on-device
  backend implementing the same `WaveApi`, so every screen works offline and can be
  exercised by the Playwright flow test.
- **Maps.** Mapbox GL (web) and `@rnmapbox/maps` (native) draw the route with a gradient
  "wake" behind the marker. Without a token, both fall back to a schematic SVG chart with
  the same per-frame API, framed in the area not covered by panels.
