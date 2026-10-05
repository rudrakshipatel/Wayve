-- Row Level Security, sharing, realtime authorisation, scheduling and rate limiting.
-- Runs as a superuser and switches roles with SET ROLE to emulate Supabase clients.

\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema tests;
create function tests.assert(p_ok boolean, p_message text) returns void
language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;
grant usage on schema tests to anon, authenticated, service_role;
grant execute on function tests.assert(boolean, text) to anon, authenticated, service_role;

-- Fixed identities ----------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@example.com', '{"full_name": "Asha"}'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@example.com', '{}');

select tests.assert((select count(*) from public.profiles) = 2, 'profiles created for new users');
select tests.assert(
  (select display_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'Asha',
  'display name copied from metadata');
select tests.assert(
  (select array_agg(name order by sort_order) from public.location_folders
   where owner_id = 'aaaaaaaa-0000-4000-8000-000000000001')
  = array['Home', 'Work', 'College', 'Favorites', 'Travel'],
  'default folders created');

-- Saved locations -------------------------------------------------------------
select set_config('tests.a_folder', id::text, false) from public.location_folders
where owner_id = 'aaaaaaaa-0000-4000-8000-000000000001' and kind = 'home';

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

insert into public.saved_locations (name, latitude, longitude, address, folder_id)
select 'Office', 23.0225, 72.5714, 'Ahmedabad', id
from public.location_folders where kind = 'work';

select tests.assert((select count(*) from public.saved_locations) = 1, 'A sees own location');
select tests.assert((select count(*) from public.location_folders) = 5, 'A sees only own folders');

do $$
begin
  insert into public.saved_locations (name, latitude, longitude) values ('Bad', 95, 0);
  raise exception 'latitude check not enforced';
exception when check_violation then null;
end;
$$;

set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select tests.assert((select count(*) from public.saved_locations) = 0, 'B cannot see A''s locations');

do $$
declare v_rows integer;
begin
  update public.saved_locations set name = 'pwned';
  get diagnostics v_rows = row_count;
  perform tests.assert(v_rows = 0, 'B cannot update A''s locations');
  delete from public.saved_locations;
  get diagnostics v_rows = row_count;
  perform tests.assert(v_rows = 0, 'B cannot delete A''s locations');
end;
$$;

do $$
begin
  insert into public.saved_locations (owner_id, name, latitude, longitude)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'Forged', 1, 1);
  raise exception 'B inserted a row owned by A';
exception when insufficient_privilege then null;
end;
$$;

do $$
begin
  -- A folder id that belongs to A cannot be used by B (composite FK on owner).
  insert into public.saved_locations (name, latitude, longitude, folder_id)
  values ('Sneaky', 1, 1, current_setting('tests.a_folder')::uuid);
  raise exception 'B referenced A''s folder';
exception when foreign_key_violation then null;
end;
$$;

-- Deleting a folder keeps the location and clears folder_id.
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
delete from public.location_folders where kind = 'work';
select tests.assert(
  (select folder_id is null from public.saved_locations where name = 'Office'),
  'folder delete sets folder_id null');

reset role;

-- Journeys (created server-side, as the plan-journey edge function would) -------
insert into public.journeys (id, owner_id, title, travel_modes, total_distance_m, total_duration_ms)
values ('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
        'Ahmedabad → Gandhinagar', '{driving}', 25000, 1800000);
insert into public.journey_segments
  (journey_id, position, from_name, from_latitude, from_longitude, to_name, to_latitude, to_longitude,
   travel_mode, target_speed_kmh)
values ('11111111-0000-4000-8000-000000000001', 0, 'Ahmedabad', 23.0225, 72.5714,
        'Gandhinagar', 23.2156, 72.6369, 'driving', 50);
insert into public.journey_routes (journey_id, engine_version, segments, distance_m, duration_ms)
values ('11111111-0000-4000-8000-000000000001', '0.1.0',
        '[{"coordinates": [[72.5714, 23.0225], [72.6369, 23.2156]], "distanceM": 25000}]', 25000, 1800000);
insert into public.journey_sessions (journey_id) values ('11111111-0000-4000-8000-000000000001');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select tests.assert((select count(*) from public.journeys) = 1, 'A sees own journey');
select tests.assert((select count(*) from public.journey_segments) = 1, 'A sees own segments');
select tests.assert((select count(*) from public.journey_routes) = 1, 'A sees own route');
select tests.assert((select count(*) from public.journey_sessions) = 1, 'A sees own session');

update public.journeys set title = 'Evening drive';
select tests.assert((select title from public.journeys) = 'Evening drive', 'A can rename');

do $$
begin
  update public.journeys set status = 'completed';
  raise exception 'client changed journey status';
exception when insufficient_privilege then null;
end;
$$;

do $$
begin
  update public.journey_sessions set anchor_sim_ms = 99;
  raise exception 'client changed session clock';
exception when insufficient_privilege then null;
end;
$$;

do $$
begin
  insert into public.journeys (title) values ('Self-made');
  raise exception 'client inserted a journey';
exception when insufficient_privilege then null;
end;
$$;

do $$
begin
  perform public.apply_session_clock('11111111-0000-4000-8000-000000000001', 0, 'active', 0, 0, 1, 1);
  raise exception 'client called apply_session_clock';
exception when insufficient_privilege then null;
end;
$$;

set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select tests.assert((select count(*) from public.journeys) = 0, 'B cannot see A''s journey');
select tests.assert((select count(*) from public.journey_routes) = 0, 'B cannot see A''s route');
select tests.assert((select count(*) from public.journey_sessions) = 0, 'B cannot see A''s session');

reset role;
reset request.jwt.claim.sub;
set role anon;
do $$
begin
  perform count(*) from public.journeys;
  raise exception 'anon read journeys';
exception when insufficient_privilege then null;
end;
$$;
reset role;

-- Session control (service role, as journey-control would) ---------------------
delete from realtime.messages;
set role service_role;
select public.apply_session_clock(
  '11111111-0000-4000-8000-000000000001', 0, 'active',
  floor(extract(epoch from now()) * 1000), 0, 1, 1);
reset role;

select tests.assert(
  (select status = 'active' and started_at is not null and ended_at is null
   from public.journeys where id = '11111111-0000-4000-8000-000000000001'),
  'journey mirrors active session');
select tests.assert(
  (select count(*) from realtime.messages
   where topic = 'journey:11111111-0000-4000-8000-000000000001' and event = 'session'
     and payload -> 'clock' ->> 'status' = 'active'
     and (payload -> 'clock' ->> 'revision')::int = 1) = 1,
  'session change broadcast to owner topic');
select tests.assert(
  (select not (payload::text ~* 'latitude|longitude|coordinates') from realtime.messages limit 1),
  'broadcast carries no coordinates');

set role service_role;
do $$
begin
  perform public.apply_session_clock('11111111-0000-4000-8000-000000000001', 0, 'paused', 0, 0, 1, 2);
  raise exception 'stale revision accepted';
exception when serialization_failure then null;
end;
$$;
reset role;

-- Share links ------------------------------------------------------------------
-- Token: 43 base64url chars; only its SHA-256 is stored.
insert into public.share_links (id, journey_id, owner_id, token_hash, token_prefix, channel_key, expires_at)
values (
  '22222222-0000-4000-8000-000000000001',
  '11111111-0000-4000-8000-000000000001',
  'aaaaaaaa-0000-4000-8000-000000000001',
  encode(sha256(convert_to('AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE', 'UTF8')), 'hex'),
  'AbCdEf',
  'chan_ABCDEFGHIJKLMNOP',
  now() + interval '1 day'
);

set role service_role;
do $$
declare v jsonb := public.get_shared_journey('AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE');
begin
  perform tests.assert(v is not null, 'valid token resolves');
  perform tests.assert(v ->> 'title' = 'Evening drive', 'title exposed');
  perform tests.assert(v ->> 'realtimeTopic' = 'share:chan_ABCDEFGHIJKLMNOP', 'topic exposed');
  perform tests.assert(jsonb_array_length(v -> 'segments') = 1, 'segments exposed');
  perform tests.assert(v -> 'segments' -> 0 -> 'coordinates' -> 0 ->> 0 = '72.5714', 'route geometry exposed');
  perform tests.assert(v -> 'clock' ->> 'status' = 'active', 'clock exposed');
  perform tests.assert(
    v::text !~ '(aaaaaaaa|11111111|22222222|example\.com|owner|token_hash)',
    'no private identifiers in public view');
  perform tests.assert(public.get_shared_journey('AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdF') is null,
    'unknown token resolves to null');
  perform tests.assert(public.get_shared_journey('short') is null, 'malformed token resolves to null');
  perform tests.assert(public.get_shared_journey(null) is null, 'null token resolves to null');
end;
$$;
reset role;

select tests.assert(
  (select view_count = 1 from public.share_links where id = '22222222-0000-4000-8000-000000000001'),
  'views are counted');

reset request.jwt.claim.sub;
set role anon;
do $$
begin
  perform public.get_shared_journey('AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE');
  raise exception 'anon called get_shared_journey directly';
exception when insufficient_privilege then null;
end;
$$;
reset role;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select tests.assert(
  (select count(*) from (select id, token_prefix, expires_at from public.share_links) s) = 1,
  'owner lists share links');
do $$
begin
  perform token_hash from public.share_links;
  raise exception 'token hash readable by client';
exception when insufficient_privilege then null;
end;
$$;
reset role;

-- Session changes now also reach the share topic.
delete from realtime.messages;
set role service_role;
select public.apply_session_clock(
  '11111111-0000-4000-8000-000000000001', 1, 'paused',
  floor(extract(epoch from now()) * 1000), 60000, 1, 2);
reset role;
select tests.assert(
  (select count(*) from realtime.messages where topic = 'share:chan_ABCDEFGHIJKLMNOP' and event = 'session') = 1,
  'session change broadcast to share topic');

-- Realtime authorisation ------------------------------------------------------
reset request.jwt.claim.sub;
set role anon;
set realtime.topic = 'share:chan_ABCDEFGHIJKLMNOP';
select tests.assert((select count(*) from realtime.messages) >= 1, 'anon receives on valid share topic');
set realtime.topic = 'share:chan_WRONGWRONGWRONG';
select tests.assert((select count(*) from realtime.messages) = 0, 'anon denied on unknown share topic');
set realtime.topic = 'journey:11111111-0000-4000-8000-000000000001';
select tests.assert((select count(*) from realtime.messages) = 0, 'anon denied on owner topic');
set realtime.topic = 'share:chan_ABCDEFGHIJKLMNOP';
do $$
begin
  insert into realtime.messages (topic, extension, payload, event)
  values ('share:chan_ABCDEFGHIJKLMNOP', 'broadcast', '{"clock": {}}', 'session');
  raise exception 'anon sent a broadcast';
exception when insufficient_privilege then null;
end;
$$;
reset role;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
set realtime.topic = 'journey:11111111-0000-4000-8000-000000000001';
select tests.assert((select count(*) from realtime.messages) >= 0, 'owner topic readable');
select tests.assert(public.can_receive_topic('journey:11111111-0000-4000-8000-000000000001'), 'owner authorised');
select tests.assert(not public.can_receive_topic('journey:not-a-uuid'), 'malformed topic rejected');
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select tests.assert(not public.can_receive_topic('journey:11111111-0000-4000-8000-000000000001'), 'B not authorised');
select tests.assert(not public.can_receive_topic('something:else'), 'unknown topic kinds rejected');

-- Revocation -------------------------------------------------------------------
select tests.assert(not public.revoke_share_link('22222222-0000-4000-8000-000000000001'), 'B cannot revoke A''s link');
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select tests.assert(public.revoke_share_link('22222222-0000-4000-8000-000000000001'), 'A revokes link');
select tests.assert(not public.revoke_share_link('22222222-0000-4000-8000-000000000001'), 'revocation is idempotent');
reset role;

select tests.assert(
  (select count(*) from realtime.messages where topic = 'share:chan_ABCDEFGHIJKLMNOP' and event = 'revoked') = 1,
  'viewers told about revocation');
select tests.assert(not public.can_receive_topic('share:chan_ABCDEFGHIJKLMNOP'), 'revoked topic no longer authorised');
set role service_role;
select tests.assert(
  public.get_shared_journey('AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE') is null,
  'revoked token no longer resolves');
reset role;

-- Expiry --------------------------------------------------------------------------
insert into public.share_links (journey_id, owner_id, token_hash, token_prefix, channel_key, created_at, expires_at)
values (
  '11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
  encode(sha256(convert_to('ExpiredTokenExpiredTokenExpiredTokenExpired', 'UTF8')), 'hex'),
  'Expire', 'chan_EXPIREDEXPIRED00', now() - interval '2 days', now() - interval '1 day');
set role service_role;
select tests.assert(
  public.get_shared_journey('ExpiredTokenExpiredTokenExpiredTokenExpired') is null, 'expired token rejected');
reset role;
select tests.assert(not public.can_receive_topic('share:chan_EXPIREDEXPIRED00'), 'expired topic rejected');

do $$
begin
  insert into public.share_links (journey_id, owner_id, token_hash, token_prefix, channel_key, expires_at)
  values ('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
          repeat('c', 64), 'cccccc', 'chan_TOOLONGTOOLONG0', now() + interval '31 days');
  raise exception 'share link longer than 30 days accepted';
exception when check_violation then null;
end;
$$;

do $$
begin
  insert into public.share_links (journey_id, owner_id, token_hash, token_prefix, channel_key, expires_at)
  values ('11111111-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002',
          repeat('d', 64), 'dddddd', 'chan_MISMATCHMISMAT', now() + interval '1 day');
  raise exception 'share link for someone else''s journey accepted';
exception when raise_exception then
  if sqlerrm <> 'share_link_owner_mismatch' then raise; end if;
end;
$$;

do $$
begin
  for i in 1..20 loop
    insert into public.share_links (journey_id, owner_id, token_hash, token_prefix, channel_key, expires_at)
    values ('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
            lpad(to_hex(i), 64, 'e'), 'eeeeee', 'chan_LIMIT' || lpad(i::text, 10, '0'), now() + interval '1 day');
  end loop;
  insert into public.share_links (journey_id, owner_id, token_hash, token_prefix, channel_key, expires_at)
  values ('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
          repeat('f', 64), 'ffffff', 'chan_LIMITOVERFLOW0', now() + interval '1 day');
  raise exception 'more than 20 live share links accepted';
exception when raise_exception then
  if sqlerrm <> 'share_link_limit' then raise; end if;
end;
$$;

-- Scheduling ------------------------------------------------------------------------
-- A scheduled journey whose start has passed becomes active.
update public.journey_sessions
set status = 'scheduled', anchor_wall_at = now() - interval '1 minute', anchor_sim_ms = 0, revision = 10
where journey_id = '11111111-0000-4000-8000-000000000001';
select tests.assert(
  (select scheduled_start_at is not null from public.journeys where id = '11111111-0000-4000-8000-000000000001'),
  'scheduled start mirrored');
set role service_role;
select tests.assert(public.advance_journey_sessions() = 1, 'one session advanced');
reset role;
select tests.assert(
  (select status = 'active' and revision = 11 from public.journey_sessions
   where journey_id = '11111111-0000-4000-8000-000000000001'),
  'scheduled session activated');

-- Not yet due: nothing happens.
set role service_role;
select tests.assert(public.advance_journey_sessions() = 0, 'running session left alone');
reset role;

-- An active journey past its end completes, anchored at its exact end time.
update public.journey_sessions
set anchor_wall_at = now() - interval '1 hour', anchor_sim_ms = 0, rate = 1
where journey_id = '11111111-0000-4000-8000-000000000001';
set role service_role;
select public.advance_journey_sessions();
reset role;
select tests.assert(
  (select s.status = 'completed' and s.anchor_sim_ms = 1800000
          and abs(extract(epoch from (s.anchor_wall_at - (now() - interval '30 minutes')))) < 1
   from public.journey_sessions s where journey_id = '11111111-0000-4000-8000-000000000001'),
  'finished session completed at its end time');
select tests.assert(
  (select status = 'completed' and ended_at is not null from public.journeys
   where id = '11111111-0000-4000-8000-000000000001'),
  'journey mirrors completion');

-- Rate limiting ------------------------------------------------------------------
set role service_role;
select tests.assert(public.consume_rate_limit('test', 'ip-1', 3, 0), 'rate limit 1/3');
select tests.assert(public.consume_rate_limit('test', 'ip-1', 3, 0), 'rate limit 2/3');
select tests.assert(public.consume_rate_limit('test', 'ip-1', 3, 0), 'rate limit 3/3');
select tests.assert(not public.consume_rate_limit('test', 'ip-1', 3, 0), 'rate limit exhausted');
select tests.assert(public.consume_rate_limit('test', 'ip-2', 3, 0), 'rate limit is per key');
reset role;

set role authenticated;
do $$
begin
  perform public.consume_rate_limit('test', 'x', 1, 1);
  raise exception 'client called consume_rate_limit';
exception when insufficient_privilege then null;
end;
$$;
reset role;

-- Cascades -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
delete from public.journeys where id = '11111111-0000-4000-8000-000000000001';
reset role;
select tests.assert(
  (select count(*) from public.journey_sessions) = 0
  and (select count(*) from public.journey_routes) = 0
  and (select count(*) from public.share_links) = 0,
  'journey delete cascades');

select 'ok' as rls_and_sharing;
