\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values ('cccccccc-0000-4000-8000-000000000003', 'c@example.com');
insert into public.journeys (id, owner_id, title) values
  ('33333333-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000003', 'Gone soon');
insert into public.share_links (journey_id, owner_id, token_hash, token_prefix, channel_key, expires_at)
values ('33333333-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000003',
        repeat('a', 64), 'aaaaaa', 'chan_DELETEDJOURNEY0', now() + interval '1 day');
insert into public.saved_locations (owner_id, name, latitude, longitude)
values ('cccccccc-0000-4000-8000-000000000003', 'Somewhere', 1, 1);
delete from realtime.messages;

-- Deleting the auth user (account deletion) removes all of their data…
delete from auth.users where id = 'cccccccc-0000-4000-8000-000000000003';
select tests.assert(
  not exists (select 1 from public.profiles where id = 'cccccccc-0000-4000-8000-000000000003')
  and not exists (select 1 from public.journeys where owner_id = 'cccccccc-0000-4000-8000-000000000003')
  and not exists (select 1 from public.saved_locations where owner_id = 'cccccccc-0000-4000-8000-000000000003')
  and not exists (select 1 from public.share_links where channel_key = 'chan_DELETEDJOURNEY0'),
  'account deletion cascades to every owned row');
-- …and live viewers are told the journey is gone.
select tests.assert(
  exists (select 1 from realtime.messages where topic = 'share:chan_DELETEDJOURNEY0' and event = 'revoked'),
  'viewers notified on deletion');

select 'ok' as account_lifecycle;
