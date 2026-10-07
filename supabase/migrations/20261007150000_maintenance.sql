-- Housekeeping and the scheduler. Idempotent, so it is safe to run by hand in the SQL
-- editor before `supabase db push` records it.
create or replace function public.purge_stale_rows()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rate_limits where updated_at < now() - interval '1 day';
  delete from public.share_links where expires_at < now() - interval '30 days';
$$;

revoke execute on function public.purge_stale_rows() from public, anon, authenticated;
grant execute on function public.purge_stale_rows() to service_role;

-- pg_cron is available on Supabase; skipped where it is not installed. cron.schedule
-- replaces a job with the same name.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('wave-advance-sessions', '* * * * *', 'select public.advance_journey_sessions()');
    perform cron.schedule('wave-purge-stale', '17 3 * * *', 'select public.purge_stale_rows()');
  end if;
end;
$$;
