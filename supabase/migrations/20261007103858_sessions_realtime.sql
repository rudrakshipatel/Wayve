-- Session clock sync + realtime broadcast.
-- Every change to journey_sessions is mirrored onto journeys and broadcast as a small state
-- event (never coordinates) to the owner topic and every live share topic.

create function public.session_broadcast_payload(p_journey_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'clock', jsonb_build_object(
      'status', s.status,
      'anchorWallMs', floor(extract(epoch from s.anchor_wall_at) * 1000),
      'anchorSimMs', s.anchor_sim_ms,
      'rate', s.rate,
      'revision', s.revision
    ),
    'serverTimeMs', floor(extract(epoch from clock_timestamp()) * 1000),
    'startedAt', j.started_at,
    'endedAt', j.ended_at,
    'scheduledStartAt', j.scheduled_start_at
  )
  from public.journey_sessions s
  join public.journeys j on j.id = s.journey_id
  where s.journey_id = p_journey_id;
$$;
revoke all on function public.session_broadcast_payload(uuid) from public;

create function public.on_session_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();

  update public.journeys j
  set
    status = new.status,
    scheduled_start_at = case
      when new.status = 'scheduled' then new.anchor_wall_at
      when new.status = 'draft' then null
      else j.scheduled_start_at
    end,
    started_at = case
      when new.status in ('active', 'paused', 'completed') and j.started_at is null
        then least(new.anchor_wall_at, now())
      else j.started_at
    end,
    ended_at = case
      when new.status = 'completed' then new.anchor_wall_at
      when new.status = 'cancelled' then now()
      when new.status in ('active', 'paused', 'scheduled', 'draft') then null
      else j.ended_at
    end
  where j.id = new.journey_id;

  return new;
end;
$$;

create trigger journey_sessions_sync
  before insert or update on public.journey_sessions
  for each row execute function public.on_session_change();

create function public.broadcast_session_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := public.session_broadcast_payload(new.journey_id);
  v_key text;
begin
  perform realtime.send(v_payload, 'session', 'journey:' || new.journey_id::text, true);
  for v_key in
    select l.channel_key from public.share_links l
    where l.journey_id = new.journey_id and l.revoked_at is null and l.expires_at > now()
  loop
    perform realtime.send(v_payload, 'session', 'share:' || v_key, true);
  end loop;
  return null;
end;
$$;

create trigger journey_sessions_broadcast
  after insert or update on public.journey_sessions
  for each row execute function public.broadcast_session_change();

-- ---------------------------------------------------------------------------
-- Realtime authorisation (private channels).
--   journey:<uuid>  — the journey owner only
--   share:<key>     — anyone holding a live (unrevoked, unexpired) share link's topic
-- No policy allows INSERT, so clients can never send on these topics; only the database does.
-- ---------------------------------------------------------------------------
create function public.can_receive_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_suffix text;
begin
  if p_topic like 'journey:%' then
    v_suffix := substr(p_topic, 9);
    if v_suffix !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return false;
    end if;
    return exists (
      select 1 from public.journeys j
      where j.id = v_suffix::uuid and j.owner_id = (select auth.uid())
    );
  elsif p_topic like 'share:%' then
    v_suffix := substr(p_topic, 7);
    return exists (
      select 1 from public.share_links l
      where l.channel_key = v_suffix and l.revoked_at is null and l.expires_at > now()
    );
  end if;
  return false;
end;
$$;
revoke all on function public.can_receive_topic(text) from public;
grant execute on function public.can_receive_topic(text) to anon, authenticated;

create policy "wave: receive authorised broadcasts" on realtime.messages
  for select to anon, authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select public.can_receive_topic(realtime.topic()))
  );
