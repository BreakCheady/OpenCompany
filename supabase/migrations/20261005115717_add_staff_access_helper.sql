create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.staff_roles sr where sr.user_id=(select auth.uid())) $$;
revoke all on function public.is_staff() from public,anon;
grant execute on function public.is_staff() to authenticated;
