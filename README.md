# Wave

Wave is a location simulation and virtual-journey platform. Create a simulated static
location or a multi-segment journey, control how it moves along a route, and share a
live, view-only map with anyone through a link — no app or account needed to watch.

Wave simulates positions **inside Wave only**. It never alters a device's real location,
and never feeds simulated coordinates to other apps or services.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Repository layout

```
apps/
  mobile/              Expo + React Native app            (Phase 4+)
  web/                 Next.js share viewer               (Phase 9)
packages/
  types/               @wave/types — domain types, zod schemas, share tokens
  map-utils/           @wave/map-utils — geodesy, polylines, formatting
  simulation-engine/   @wave/simulation-engine — deterministic journeys, session clock
  ui/                  @wave/ui — design tokens, Tailwind/NativeWind preset
supabase/
  migrations/          schema, RLS, realtime authorisation, scheduler, rate limits
  functions/           edge functions                     (Phase 3+)
  tests/               SQL tests run against PostgreSQL
```

## Getting started

Requirements: Node 22+, pnpm 10, PostgreSQL 15+ (for database tests) or the Supabase CLI.

```sh
pnpm install
pnpm check          # typecheck + lint + unit tests for every package
pnpm format:check
```

### Database tests

`supabase/tests/run.sh` creates a scratch database, applies small stand-ins for the
Supabase-managed `auth`/`realtime` schemas, runs every migration, then the SQL tests.

```sh
PSQL="psql -h localhost -U postgres" pnpm db:test
# or with a local cluster using peer auth:
PSQL="runuser -u postgres -- psql" pnpm db:test
```

### Environment

Copy `.env.example` and fill in values. Only `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` values
reach clients; the Supabase service-role key and Mapbox secret token are edge-function
secrets only.

## Status

| Phase | Scope                                                                | State   |
| ----- | -------------------------------------------------------------------- | ------- |
| 1     | Monorepo + shared packages (incl. simulation engine core)            | ✅      |
| 2     | Supabase schema, RLS, realtime authorisation, scheduler, rate limits | ✅      |
| 3     | Mapbox geocoding/directions + `plan-journey`                         | next    |
| 4–12  | Mobile, web viewer, realtime, history/replay, auth, deployment       | planned |
