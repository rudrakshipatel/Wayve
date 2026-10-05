-- Tell live viewers immediately when a journey (and therefore its share links) is deleted,
-- including when the owner deletes their account.
create function public.broadcast_journey_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  for v_key in
    select l.channel_key from public.share_links l
    where l.journey_id = old.id and l.revoked_at is null and l.expires_at > now()
  loop
    perform realtime.send(jsonb_build_object('reason', 'deleted'), 'revoked', 'share:' || v_key, true);
  end loop;
  return old;
end;
$$;

create trigger journeys_broadcast_deleted
  before delete on public.journeys
  for each row execute function public.broadcast_journey_deleted();

revoke execute on function public.broadcast_journey_deleted() from public, anon, authenticated;
