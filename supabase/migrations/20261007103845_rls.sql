-- Row Level Security. Users only ever see their own rows. Route, session and share-link
-- writes go through edge functions (service role) or SECURITY DEFINER functions that
-- authorise explicitly.

alter table public.profiles enable row level security;
alter table public.location_folders enable row level security;
alter table public.saved_locations enable row level security;
alter table public.journeys enable row level security;
alter table public.journey_segments enable row level security;
alter table public.journey_routes enable row level security;
alter table public.journey_sessions enable row level security;
alter table public.share_links enable row level security;
alter table public.rate_limits enable row level security;

-- Defence in depth: anonymous (signed-out) clients get no table privileges at all.
revoke all on all tables in schema public from anon;
revoke all on public.rate_limits from authenticated;

-- Profiles ---------------------------------------------------------------------
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, delete on public.profiles from authenticated;

-- Folders & saved locations ----------------------------------------------------
create policy "folders: read own" on public.location_folders
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "folders: create own" on public.location_folders
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "folders: update own" on public.location_folders
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "folders: delete own" on public.location_folders
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "locations: read own" on public.saved_locations
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "locations: create own" on public.saved_locations
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "locations: update own" on public.saved_locations
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "locations: delete own" on public.saved_locations
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Journeys: read, rename and delete own. Creation and status changes are server-side.
create policy "journeys: read own" on public.journeys
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "journeys: rename own" on public.journeys
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "journeys: delete own" on public.journeys
  for delete to authenticated using (owner_id = (select auth.uid()));
revoke insert, update on public.journeys from authenticated;
grant update (title) on public.journeys to authenticated;

-- Children of journeys: read-only for the owner.
create function public.owns_journey(p_journey_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journeys j
    where j.id = p_journey_id and j.owner_id = (select auth.uid())
  );
$$;
revoke all on function public.owns_journey(uuid) from public;
grant execute on function public.owns_journey(uuid) to authenticated;

create policy "segments: read own" on public.journey_segments
  for select to authenticated using ((select public.owns_journey(journey_id)));
create policy "routes: read own" on public.journey_routes
  for select to authenticated using ((select public.owns_journey(journey_id)));
create policy "sessions: read own" on public.journey_sessions
  for select to authenticated using ((select public.owns_journey(journey_id)));
revoke insert, update, delete on public.journey_segments, public.journey_routes, public.journey_sessions
  from authenticated;

-- Share links: owners list and delete their links. Creation (token generation) happens in an
-- edge function; revocation through public.revoke_share_link().
create policy "share links: read own" on public.share_links
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "share links: delete own" on public.share_links
  for delete to authenticated using (owner_id = (select auth.uid()));
revoke insert, update on public.share_links from authenticated;
-- The hash is not secret-equivalent, but there is no reason to hand it to clients either.
revoke select on public.share_links from authenticated;
grant select (id, journey_id, token_prefix, expires_at, revoked_at, view_count, last_viewed_at, created_at)
  on public.share_links to authenticated;
