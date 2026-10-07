-- Server-side session control, scheduled activation/completion and rate limiting.

-- Optimistic-concurrency write of a session clock computed by the journey-control edge
-- function with the shared @wave/simulation-engine state machine.
create function public.apply_session_clock(
  p_journey_id uuid,
  p_expected_revision bigint,
  p_status public.journey_status,
  p_anchor_wall_ms double precision,
  p_anchor_sim_ms double precision,
  p_rate double precision,
  p_revision bigint
)
returns public.journey_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.journey_sessions;
begin
  if p_revision <= p_expected_revision then
    raise exception 'revision_must_increase' using errcode = '22023';
  end if;

  update public.journey_sessions
  set
    status = p_status,
    anchor_wall_at = to_timestamp(p_anchor_wall_ms / 1000.0),
    anchor_sim_ms = p_anchor_sim_ms,
    rate = p_rate,
    revision = p_revision
  where journey_id = p_journey_id and revision = p_expected_revision
  returning * into v_row;

  if not found then
    raise exception 'revision_conflict' using errcode = '40001';
  end if;
  return v_row;
end;
$$;

-- Persists transitions implied by time: scheduled → active when the start time passes and
-- active → completed when the end is reached. Mirrors settle() in the simulation engine.
-- Runs every minute via pg_cron so status is correct with every client closed.
create function public.advance_journey_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select
      s.journey_id,
      s.status,
      s.anchor_wall_at,
      j.total_duration_ms,
      s.anchor_wall_at
        + make_interval(secs => greatest(0, j.total_duration_ms - s.anchor_sim_ms) / s.rate / 1000.0)
        as ends_at
    from public.journey_sessions s
    join public.journeys j on j.id = s.journey_id
    where s.status in ('scheduled', 'active')
    for update of s skip locked
  )
  update public.journey_sessions s
  set
    status = case when due.ends_at <= now() then 'completed'::public.journey_status else 'active' end,
    anchor_sim_ms = case when due.ends_at <= now() then due.total_duration_ms else s.anchor_sim_ms end,
    anchor_wall_at = case when due.ends_at <= now() then due.ends_at else s.anchor_wall_at end,
    revision = s.revision + 1
  from due
  where s.journey_id = due.journey_id
    and (due.ends_at <= now() or (due.status = 'scheduled' and due.anchor_wall_at <= now()));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Token bucket. Returns true when the request may proceed.
create function public.consume_rate_limit(
  p_scope text,
  p_key text,
  p_capacity integer,
  p_refill_per_second double precision,
  p_cost integer default 1
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_tokens double precision;
begin
  insert into public.rate_limits as r (scope, key, tokens, updated_at)
  values (p_scope, p_key, p_capacity, v_now)
  on conflict (scope, key) do update
  set
    tokens = least(
      p_capacity,
      r.tokens + greatest(0, extract(epoch from (v_now - r.updated_at))) * p_refill_per_second
    ),
    updated_at = v_now
  returning tokens into v_tokens;

  if v_tokens < p_cost then
    return false;
  end if;

  update public.rate_limits
  set tokens = tokens - p_cost
  where scope = p_scope and key = p_key;
  return true;
end;
$$;
