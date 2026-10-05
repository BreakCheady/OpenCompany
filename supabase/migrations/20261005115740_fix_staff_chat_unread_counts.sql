create or replace function public.get_chat_unread_counts(p_company_id uuid)
returns table(target_type text,target_id uuid,unread_count bigint)
language sql stable security invoker set search_path=''
as $$
  with owned as (
    select id from public.companies where id=p_company_id and owner_user_id=(select auth.uid())
  ), incoming as (
    select 'contact'::text target_type,m.sender_company_id target_id,m.read_sequence
    from public.chat_messages m join owned o on o.id=m.recipient_company_id
    where m.room_id is null and m.deleted_at is null and m.sender_company_id<>o.id
    union all
    select 'room'::text,m.room_id,m.read_sequence
    from public.chat_messages m
    join public.chat_rooms r on r.id=m.room_id and r.is_active
      and (r.access_level='public' or public.is_staff())
    cross join owned o
    where m.deleted_at is null and m.sender_company_id<>o.id
  )
  select i.target_type,i.target_id,count(*)
  from incoming i
  left join public.company_chat_reads r on r.company_id=p_company_id
    and r.target_type=i.target_type and r.target_id=i.target_id
  where i.read_sequence>coalesce(r.last_read_sequence,0)
  group by i.target_type,i.target_id
$$;
