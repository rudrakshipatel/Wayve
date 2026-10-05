# Wave

Wave is a location simulation and virtual-journey platform. Create a simulated static
location or a multi-segment journey, control how it moves along a route, and share a
live, view-only map with anyone through a link — no app or account needed to watch.

Wave simulates positions **inside Wave only**. It never alters a device's real location
and never feeds simulated coordinates to other apps or services.

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — design, schema, realtime, engine, security
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Supabase, Vercel and EAS setup

## Repository layout

```
apps/
  mobile/              Expo app (iOS, Android, and web for previews/e2e)
  web/                 Next.js share viewer: /journey/[token], /journey/demo
packages/
  types/               @wave/types — domain types, zod schemas, share tokens, API contracts
  map-utils/           @wave/map-utils — geodesy, polylines, Mapbox clients, formatting
  simulation-engine/   @wave/simulation-engine — deterministic journeys, session clock
  client/              @wave/client — typed API + realtime JourneyFollower (web & mobile)
  ui/                  @wave/ui — design tokens, Tailwind/NativeWind preset
supabase/
  migrations/          schema, RLS, realtime authorisation, scheduler, rate limits, RPCs
  functions/           Deno edge functions + testable handlers
  tests/               SQL tests and Postgres harness
```

## Getting started

Requirements: Node 22+, pnpm 10. PostgreSQL 15+ for database tests.

```sh
pnpm install
pnpm check                       # typecheck + lint + unit tests, every package
pnpm format:check

# Web share viewer — open http://localhost:3000/journey/demo
pnpm --filter @wave/web dev

# Mobile app — runs in on-device preview mode until Supabase env vars are set
pnpm --filter @wave/mobile start          # dev client / simulator
pnpm --filter @wave/mobile web            # in the browser
```

Copy `.env.example` (root, `apps/web`, `apps/mobile`) and fill in values to connect a
backend. Only `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` values reach clients.

## Tests

| Command                                             | What it covers                                                                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                        | Unit tests: engine (interpolation, distance, ETA, profiles, progression, state machine, performance budgets), share tokens, schemas, Mapbox client, realtime follower, builder store, HTTP layer |
| `PSQL="psql -U postgres -h localhost" pnpm db:test` | Migrations + RLS, sharing, realtime authorisation, scheduler, rate limits, account deletion                                                                                                      |
| `pnpm test:integration`                             | Edge-function handlers against Postgres: create, start, pause, resume, stop, complete, schedule, share link, open share page, realtime sync                                                      |
| `pnpm --filter @wave/web test:e2e`                  | Share page on iPhone, Pixel and desktop profiles (after `build`)                                                                                                                                 |
| `pnpm --filter @wave/mobile test:e2e`               | Full MVP flow in the app's web build (after `build:web`)                                                                                                                                         |

Set `PW_CHROMIUM_PATH` to use a preinstalled Chromium for Playwright.

## Status

| Phase | Scope                                                   | State                                                      |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------- |
| 1     | Monorepo + shared packages                              | ✅                                                         |
| 2     | Supabase schema, RLS, realtime authorisation, scheduler | ✅                                                         |
| 3     | Mapbox clients + edge functions                         | ✅                                                         |
| 4     | Static locations + folders                              | ✅                                                         |
| 5     | Journey builder (multi-segment designer)                | ✅                                                         |
| 6     | Simulation engine                                       | ✅                                                         |
| 7     | Realtime sync (`@wave/client`)                          | ✅                                                         |
| 8     | Mobile active journey                                   | ✅                                                         |
| 9     | Shareable web journey                                   | ✅                                                         |
| 10    | History, replay, scheduling                             | ✅                                                         |
| 11    | Auth (anonymous-first, email, Google, Apple) + security | ✅                                                         |
| 12    | Tests, CI, deployment config                            | ✅ — production deploy needs the accounts in DEPLOYMENT.md |
