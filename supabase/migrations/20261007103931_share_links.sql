-- Share links: resolution for anonymous viewers, revocation, and per-journey limits.

create function public.enforce_share_link_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*) from public.share_links l
    where l.journey_id = new.journey_id and l.revoked_at is null and l.expires_at > now()
  ) >= 20 then
    raise exception 'share_link_limit' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.journeys j where j.id = new.journey_id and j.owner_id = new.owner_id
  ) then
    raise exception 'share_link_owner_mismatch' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger share_links_limit
  before insert on public.share_links
  for each row execute function public.enforce_share_link_limit();

-- Resolves a raw share token to the minimal public view of a journey (PublicJourneyView in
-- @wave/types). Returns NULL for unknown, revoked or expired tokens — callers must not
-- distinguish these cases to viewers. Contains no user, journey or link identifiers.
-- Executable by the service role only: the resolve-share edge function rate-limits callers.
create function public.get_shared_journey(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.share_links%rowtype;
  v_result jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return null;
  end if;

  select * into v_link
  from public.share_links l
  where l.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and l.revoked_at is null
    and l.expires_at > now();
  if not found then
    return null;
  end if;

  update public.share_links
  set view_count = view_count + 1, last_viewed_at = now()
  where id = v_link.id;

  select jsonb_build_object(
    'title', j.title,
    'kind', j.kind,
    'status', s.status,
    'seed', j.seed,
    'engineVersion', r.engine_version,
    'planVersion', r.plan_version,
    'segments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'fromName', seg.from_name,
          'toName', seg.to_name,
          'travelMode', seg.travel_mode,
          'targetSpeedKmh', seg.target_speed_kmh,
          'durationS', seg.duration_s,
          'pauseAfterS', seg.pause_after_s,
          'coordinates', coalesce(r.segments -> seg.position::int -> 'coordinates', '[]'::jsonb)
        )
        order by seg.position
      )
      from public.journey_segments seg
      where seg.journey_id = j.id
    ), '[]'::jsonb),
    'totalDistanceM', j.total_distance_m,
    'totalDurationMs', j.total_duration_ms,
    'scheduledStartAt', j.scheduled_start_at,
    'startedAt', j.started_at,
    'endedAt', j.ended_at,
    'clock', jsonb_build_object(
      'status', s.status,
      'anchorWallMs', floor(extract(epoch from s.anchor_wall_at) * 1000),
      'anchorSimMs', s.anchor_sim_ms,
      'rate', s.rate,
      'revision', s.revision
    ),
    'realtimeTopic', 'share:' || v_link.channel_key,
    'expiresAt', v_link.expires_at,
    'serverTimeMs', floor(extract(epoch from clock_timestamp()) * 1000)
  )
  into v_result
  from public.journeys j
  join public.journey_sessions s on s.journey_id = j.id
  join public.journey_routes r on r.journey_id = j.id
  where j.id = v_link.journey_id;

  return v_result;
end;
$$;

-- Owner revokes a link. Live viewers are told immediately; the realtime policy also stops
-- authorising the topic.
create function public.revoke_share_link(p_share_link_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  update public.share_links
  set revoked_at = now()
  where id = p_share_link_id
    and owner_id = (select auth.uid())
    and revoked_at is null
  returning channel_key into v_key;

  if v_key is null then
    return false;
  end if;

  perform realtime.send(jsonb_build_object('reason', 'revoked'), 'revoked', 'share:' || v_key, true);
  return true;
end;
$$;

-- Revoke every live link of a journey (used when a journey is deleted or the owner asks).
create function public.revoke_all_share_links(p_journey_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_count integer := 0;
begin
  for v_key in
    update public.share_links
    set revoked_at = now()
    where journey_id = p_journey_id
      and owner_id = (select auth.uid())
      and revoked_at is null
    returning channel_key
  loop
    perform realtime.send(jsonb_build_object('reason', 'revoked'), 'revoked', 'share:' || v_key, true);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
