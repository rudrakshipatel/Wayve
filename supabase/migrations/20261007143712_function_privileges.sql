-- Function privileges: nothing in public is callable by clients unless granted here.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.owns_journey(uuid) to authenticated;
grant execute on function public.can_receive_topic(text) to anon, authenticated;
grant execute on function public.revoke_share_link(uuid) to authenticated;
grant execute on function public.revoke_all_share_links(uuid) to authenticated;
grant execute on function public.duplicate_journey(uuid, text) to authenticated;

grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
