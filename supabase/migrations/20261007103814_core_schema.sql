-- Wave core schema: profiles, saved locations, journeys and their plans/sessions/share links.
-- Coordinates of a running simulation are never stored per tick; a journey is reproduced
-- from its route + seed + session clock.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.travel_mode as enum ('walking', 'cycling', 'driving', 'bus', 'train');
create type public.journey_status as enum ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled');
create type public.journey_kind as enum ('journey', 'static');
create type public.folder_kind as enum ('home', 'work', 'college', 'favorites', 'travel', 'custom');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Saved locations
-- ---------------------------------------------------------------------------
create table public.location_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind public.folder_kind not null default 'custom',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (owner_id, name),
  -- Target for the composite FK that keeps a location in a folder of the same owner.
  unique (id, owner_id)
);

create table public.saved_locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  folder_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  address text check (address is null or char_length(address) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (folder_id, owner_id) references public.location_folders (id, owner_id)
    on delete set null (folder_id)
);

create index saved_locations_owner_idx on public.saved_locations (owner_id, created_at desc);
create index saved_locations_folder_idx on public.saved_locations (folder_id) where folder_id is not null;

create trigger saved_locations_set_updated_at before update on public.saved_locations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Journeys
-- ---------------------------------------------------------------------------
create table public.journeys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind public.journey_kind not null default 'journey',
  title text not null check (char_length(btrim(title)) between 1 and 120),
  -- Mirrors journey_sessions.status (see sync trigger). Not client-writable.
  status public.journey_status not null default 'draft',
  -- Seeds deterministic speed variation and stop placement in the simulation engine.
  seed text not null default replace(gen_random_uuid()::text, '-', ''),
  travel_modes public.travel_mode[] not null default '{}',
  total_distance_m double precision not null default 0 check (total_distance_m >= 0),
  total_duration_ms double precision not null default 0 check (total_duration_ms >= 0),
  scheduled_start_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  source_journey_id uuid references public.journeys (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index journeys_owner_created_idx on public.journeys (owner_id, created_at desc);
create index journeys_owner_status_idx on public.journeys (owner_id, status);

create trigger journeys_set_updated_at before update on public.journeys
  for each row execute function public.set_updated_at();

create table public.journey_segments (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys (id) on delete cascade,
  position smallint not null check (position between 0 and 9),
  from_name text not null check (char_length(from_name) between 1 and 120),
  from_latitude double precision not null check (from_latitude between -90 and 90),
  from_longitude double precision not null check (from_longitude between -180 and 180),
  to_name text not null check (char_length(to_name) between 1 and 120),
  to_latitude double precision not null check (to_latitude between -90 and 90),
  to_longitude double precision not null check (to_longitude between -180 and 180),
  travel_mode public.travel_mode not null,
  target_speed_kmh double precision check (target_speed_kmh is null or target_speed_kmh between 1 and 350),
  duration_s double precision check (duration_s is null or duration_s between 10 and 259200),
  pause_after_s double precision not null default 0 check (pause_after_s between 0 and 21600),
  unique (journey_id, position),
  check (target_speed_kmh is null or duration_s is null)
);

-- Server-computed route geometry and compiled plan summary (1:1 with journeys).
create table public.journey_routes (
  journey_id uuid primary key references public.journeys (id) on delete cascade,
  plan_version integer not null default 1 check (plan_version >= 1),
  engine_version text not null,
  -- [{ "coordinates": [[lng, lat], ...], "distanceM": number }, ...] ordered by segment position.
  segments jsonb not null check (jsonb_typeof(segments) = 'array'),
  distance_m double precision not null check (distance_m >= 0),
  duration_ms double precision not null check (duration_ms >= 0),
  waypoint_arrivals_ms double precision[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (octet_length(segments::text) <= 4000000)
);

create trigger journey_routes_set_updated_at before update on public.journey_routes
  for each row execute function public.set_updated_at();

-- The authoritative session clock (1:1 with journeys). Written only by the server.
create table public.journey_sessions (
  journey_id uuid primary key references public.journeys (id) on delete cascade,
  status public.journey_status not null default 'draft',
  anchor_wall_at timestamptz not null default now(),
  anchor_sim_ms double precision not null default 0 check (anchor_sim_ms >= 0),
  rate double precision not null default 1 check (rate between 0.25 and 10),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create index journey_sessions_due_idx on public.journey_sessions (status, anchor_wall_at)
  where status in ('scheduled', 'active');

-- ---------------------------------------------------------------------------
-- Share links: only a SHA-256 of the token is stored.
-- ---------------------------------------------------------------------------
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text not null check (token_prefix ~ '^[A-Za-z0-9_-]{6}$'),
  -- Random realtime topic suffix, independent of the token.
  channel_key text not null unique check (channel_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);

create index share_links_journey_idx on public.share_links (journey_id);
create index share_links_owner_idx on public.share_links (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Rate limiting buckets (service role only).
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  scope text not null,
  key text not null,
  tokens double precision not null,
  updated_at timestamptz not null default now(),
  primary key (scope, key)
);

-- ---------------------------------------------------------------------------
-- New users get a profile and the default folders.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80), '')
  );
  insert into public.location_folders (owner_id, name, kind, sort_order)
  values
    (new.id, 'Home', 'home', 0),
    (new.id, 'Work', 'work', 1),
    (new.id, 'College', 'college', 2),
    (new.id, 'Favorites', 'favorites', 3),
    (new.id, 'Travel', 'travel', 4);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
