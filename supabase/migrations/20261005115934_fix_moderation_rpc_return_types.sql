create or replace function public.get_moderation_overview()
returns table(
  user_id uuid,account_code text,email text,company_id uuid,company_code text,company_name text,
  staff_role text,banned_at timestamptz,timeout_until timestamptz,moderation_reason text
)
language plpgsql stable security definer set search_path=''
as $$
begin
  perform private.assert_staff(false);
  return query
  select ap.user_id,ap.account_code::text,u.email::text,c.id,c.company_code::text,c.name::text,sr.role::text,
         am.banned_at,am.timeout_until,am.reason::text
  from public.account_profiles ap
  join auth.users u on u.id=ap.user_id
  left join public.companies c on c.owner_user_id=ap.user_id and c.company_type='player'
  left join public.staff_roles sr on sr.user_id=ap.user_id
  left join public.account_moderation am on am.user_id=ap.user_id
  order by lower(coalesce(c.name,ap.account_code)),ap.account_code;
end $$;

create or replace function public.get_moderation_messages(p_limit integer default 150)
returns table(
  id uuid,sender_company_id uuid,sender_company_name text,body text,created_at timestamptz,
  room_name text,recipient_company_name text
)
language plpgsql stable security definer set search_path=''
as $$
begin
  perform private.assert_staff(false);
  return query
  select m.id,m.sender_company_id,s.name::text,m.body::text,m.created_at,r.name::text,rc.name::text
  from public.chat_messages m
  join public.companies s on s.id=m.sender_company_id
  left join public.chat_rooms r on r.id=m.room_id
  left join public.companies rc on rc.id=m.recipient_company_id
  where m.deleted_at is null
  order by m.read_sequence desc
  limit least(greatest(coalesce(p_limit,150),1),300);
end $$;
