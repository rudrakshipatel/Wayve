-- RPCs used by the edge functions (service role) and a few owner-callable helpers.
-- Every multi-row write happens inside one function call, so it is atomic.

-- Persists a journey planned by the plan-journey function: journey, segments, route and a
-- draft session. p_plan matches PlannedJourneyRecord in supabase/functions/_shared.
create function public.create_planned_journey(p_owner_id uuid, p_plan jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey_id uuid;
  v_segments jsonb := p_plan -> 'segments';
  v_routes jsonb := p_plan -> 'routeSegments';
  v_count integer;
begin
  if jsonb_typeof(v_segments) <> 'array' or jsonb_typeof(v_routes) <> 'array' then
    raise exception 'invalid_plan' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(v_segments);
  if v_count < 1 or v_count > 10 or v_count <> jsonb_array_length(v_routes) then
    raise exception 'invalid_plan' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_owner_id) then
    raise exception 'unknown_owner' using errcode = '22023';
  end if;

  insert into public.journeys (
    owner_id, kind, title, seed, travel_modes, total_distance_m, total_duration_ms
  )
  values (
    p_owner_id,
    coalesce((p_plan ->> 'kind')::public.journey_kind, 'journey'),
    p_plan ->> 'title',
    p_plan ->> 'seed',
    -- Distinct modes in order of first use.
    array(
      select m.mode from (
        select (e.s ->> 'travelMode')::public.travel_mode as mode, min(e.ordinality) as first_seen
        from jsonb_array_elements(v_segments) with ordinality as e(s, ordinality)
        group by 1
      ) m
      order by m.first_seen
    ),
    (p_plan ->> 'totalDistanceM')::double precision,
    (p_plan ->> 'totalDurationMs')::double precision
  )
  returning id into v_journey_id;

  insert into public.journey_segments (
    journey_id, position,
    from_name, from_latitude, from_longitude,
    to_name, to_latitude, to_longitude,
    travel_mode, target_speed_kmh, duration_s, pause_after_s
  )
  select
    v_journey_id,
    (e.ordinality - 1)::smallint,
    e.s -> 'from' ->> 'name',
    (e.s -> 'from' ->> 'latitude')::double precision,
    (e.s -> 'from' ->> 'longitude')::double precision,
    e.s -> 'to' ->> 'name',
    (e.s -> 'to' ->> 'latitude')::double precision,
    (e.s -> 'to' ->> 'longitude')::double precision,
    (e.s ->> 'travelMode')::public.travel_mode,
    (e.s ->> 'targetSpeedKmh')::double precision,
    (e.s ->> 'durationS')::double precision,
    coalesce((e.s ->> 'pauseAfterS')::double precision, 0)
  from jsonb_array_elements(v_segments) with ordinality as e(s, ordinality);

  insert into public.journey_routes (
    journey_id, engine_version, segments, distance_m, duration_ms, waypoint_arrivals_ms
  )
  values (
    v_journey_id,
    p_plan ->> 'engineVersion',
    v_routes,
    (p_plan ->> 'totalDistanceM')::double precision,
    (p_plan ->> 'totalDurationMs')::double precision,
    coalesce(
      array(select (x)::double precision from jsonb_array_elements_text(p_plan -> 'waypointArrivalsMs') x),
      '{}'
    )
  );

  insert into public.journey_sessions (journey_id) values (v_journey_id);
  return v_journey_id;
end;
$$;

-- Current clock and timing data for an owner's journey, or NULL when the journey does not
-- exist or belongs to someone else (callers return 404 either way).
create function public.get_journey_control_state(p_journey_id uuid, p_owner_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', j.kind,
    'clock', jsonb_build_object(
      'status', s.status,
      'anchorWallMs', floor(extract(epoch from s.anchor_wall_at) * 1000),
      'anchorSimMs', s.anchor_sim_ms,
      'rate', s.rate,
      'revision', s.revision
    ),
    'totalDurationMs', j.total_duration_ms,
    'waypointArrivalsMs', to_jsonb(r.waypoint_arrivals_ms)
  )
  from public.journeys j
  join public.journey_sessions s on s.journey_id = j.id
  join public.journey_routes r on r.journey_id = j.id
  where j.id = p_journey_id and j.owner_id = p_owner_id;
$$;

-- Stores a new share link (token generated and hashed by the share-link function).
create function public.create_share_link(
  p_owner_id uuid,
  p_journey_id uuid,
  p_token_hash text,
  p_token_prefix text,
  p_channel_key text,
  p_ttl_hours integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.share_links;
begin
  if p_ttl_hours < 1 or p_ttl_hours > 720 then
    raise exception 'invalid_ttl' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.journeys where id = p_journey_id and owner_id = p_owner_id
  ) then
    raise exception 'journey_not_found' using errcode = 'P0002';
  end if;

  insert into public.share_links (journey_id, owner_id, token_hash, token_prefix, channel_key, expires_at)
  values (p_journey_id, p_owner_id, p_token_hash, p_token_prefix, p_channel_key,
          now() + make_interval(hours => p_ttl_hours))
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'expiresAt', v_row.expires_at);
end;
$$;

-- Owner duplicates a journey into a new draft with the same plan (and seed, so the copy
-- moves identically). Used by "Duplicate" in history.
create function public.duplicate_journey(p_journey_id uuid, p_title text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.journeys;
  v_id uuid;
begin
  select * into v_source from public.journeys
  where id = p_journey_id and owner_id = (select auth.uid());
  if not found then
    raise exception 'journey_not_found' using errcode = 'P0002';
  end if;

  insert into public.journeys (
    owner_id, kind, title, seed, travel_modes, total_distance_m, total_duration_ms, source_journey_id
  )
  values (
    v_source.owner_id, v_source.kind,
    coalesce(nullif(btrim(p_title), ''), left(v_source.title || ' (copy)', 120)),
    v_source.seed, v_source.travel_modes, v_source.total_distance_m, v_source.total_duration_ms,
    v_source.id
  )
  returning id into v_id;

  insert into public.journey_segments (
    journey_id, position, from_name, from_latitude, from_longitude, to_name, to_latitude,
    to_longitude, travel_mode, target_speed_kmh, duration_s, pause_after_s
  )
  select v_id, position, from_name, from_latitude, from_longitude, to_name, to_latitude,
         to_longitude, travel_mode, target_speed_kmh, duration_s, pause_after_s
  from public.journey_segments where journey_id = v_source.id;

  insert into public.journey_routes (
    journey_id, plan_version, engine_version, segments, distance_m, duration_ms, waypoint_arrivals_ms
  )
  select v_id, plan_version, engine_version, segments, distance_m, duration_ms, waypoint_arrivals_ms
  from public.journey_routes where journey_id = v_source.id;

  insert into public.journey_sessions (journey_id) values (v_id);
  return v_id;
end;
$$;

revoke execute on function public.create_planned_journey(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.get_journey_control_state(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.create_share_link(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.duplicate_journey(uuid, text) from public, anon;

grant execute on function public.create_planned_journey(uuid, jsonb) to service_role;
grant execute on function public.get_journey_control_state(uuid, uuid) to service_role;
grant execute on function public.create_share_link(uuid, uuid, text, text, text, integer) to service_role;
grant execute on function public.duplicate_journey(uuid, text) to authenticated;
