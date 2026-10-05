-- OpenCompany 0.10.227: administration, moderation and private staff chat.

create table if not exists public.staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','moderator')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);
alter table public.staff_roles enable row level security;
revoke all on public.staff_roles from public,anon,authenticated;

create table if not exists public.account_moderation (
  user_id uuid primary key references auth.users(id) on delete cascade,
  banned_at timestamptz,
  timeout_until timestamptz,
  reason text,
  actioned_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.account_moderation enable row level security;
revoke all on public.account_moderation from public,anon,authenticated;

create table if not exists public.moderation_actions (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_company_id uuid references public.companies(id) on delete set null,
  target_message_id uuid,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.moderation_actions enable row level security;
revoke all on public.moderation_actions from public,anon,authenticated;

insert into public.staff_roles(user_id,role,granted_by)
select ap.user_id,'admin',ap.user_id
from public.account_profiles ap
where ap.account_code='A69773'
on conflict(user_id) do update set role='admin';

create or replace function private.current_staff_role()
returns text language sql stable security definer set search_path=''
as $$ select sr.role from public.staff_roles sr where sr.user_id=(select auth.uid()) $$;
revoke all on function private.current_staff_role() from public,anon,authenticated;

create or replace function private.assert_staff(p_admin_only boolean default false)
returns text language plpgsql stable security definer set search_path=''
as $$
declare v_role text;
begin
  if (select auth.uid()) is null then raise exception 'Nicht angemeldet'; end if;
  select sr.role into v_role from public.staff_roles sr where sr.user_id=(select auth.uid());
  if v_role is null then raise exception 'Keine Moderationsberechtigung' using errcode='42501'; end if;
  if p_admin_only and v_role<>'admin' then raise exception 'Diese Aktion ist nur für Admins erlaubt' using errcode='42501'; end if;
  return v_role;
end $$;
revoke all on function private.assert_staff(boolean) from public,anon,authenticated;

create or replace function private.user_is_blocked(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.account_moderation am
    where am.user_id=p_user_id
      and (am.banned_at is not null or (am.timeout_until is not null and am.timeout_until>now()))
  )
$$;
revoke all on function private.user_is_blocked(uuid) from public,anon,authenticated;

create or replace function private.assert_company_owner(p_company_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Nicht angemeldet'; end if;
  if private.user_is_blocked(v_user) then raise exception 'Dieser Account ist derzeit gesperrt oder im Timeout'; end if;
  if not exists(select 1 from public.companies where id=p_company_id and owner_user_id=v_user) then
    raise exception 'Keine Berechtigung für dieses Unternehmen';
  end if;
end $$;

create or replace function public.get_my_moderation_state()
returns table(staff_role text,banned_at timestamptz,timeout_until timestamptz,reason text)
language sql stable security definer set search_path=''
as $$
  select sr.role,am.banned_at,am.timeout_until,am.reason
  from (select (select auth.uid()) user_id) me
  left join public.staff_roles sr on sr.user_id=me.user_id
  left join public.account_moderation am on am.user_id=me.user_id
$$;
revoke all on function public.get_my_moderation_state() from public,anon;
grant execute on function public.get_my_moderation_state() to authenticated;

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
  select ap.user_id,ap.account_code,u.email,c.id,c.company_code,c.name,sr.role,
         am.banned_at,am.timeout_until,am.reason
  from public.account_profiles ap
  join auth.users u on u.id=ap.user_id
  left join public.companies c on c.owner_user_id=ap.user_id and c.company_type='player'
  left join public.staff_roles sr on sr.user_id=ap.user_id
  left join public.account_moderation am on am.user_id=ap.user_id
  order by lower(coalesce(c.name,ap.account_code)),ap.account_code;
end $$;
revoke all on function public.get_moderation_overview() from public,anon;
grant execute on function public.get_moderation_overview() to authenticated;

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
  select m.id,m.sender_company_id,s.name,m.body,m.created_at,r.name,rc.name
  from public.chat_messages m
  join public.companies s on s.id=m.sender_company_id
  left join public.chat_rooms r on r.id=m.room_id
  left join public.companies rc on rc.id=m.recipient_company_id
  where m.deleted_at is null
  order by m.read_sequence desc
  limit least(greatest(coalesce(p_limit,150),1),300);
end $$;
revoke all on function public.get_moderation_messages(integer) from public,anon;
grant execute on function public.get_moderation_messages(integer) to authenticated;

create or replace function public.moderate_delete_message(p_message_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_sender uuid;
begin
  perform private.assert_staff(false);
  select sender_company_id into v_sender from public.chat_messages where id=p_message_id and deleted_at is null for update;
  if v_sender is null then raise exception 'Nachricht nicht gefunden'; end if;
  update public.chat_messages set deleted_at=now() where id=p_message_id;
  insert into public.moderation_actions(actor_user_id,action_type,target_company_id,target_message_id)
  values(v_actor,'message_delete',v_sender,p_message_id);
end $$;
revoke all on function public.moderate_delete_message(uuid) from public,anon;
grant execute on function public.moderate_delete_message(uuid) to authenticated;

create or replace function public.moderate_timeout_account(p_target_user_id uuid,p_minutes integer,p_reason text default null)
returns timestamptz language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_role text; v_target_role text; v_until timestamptz;
begin
  v_role:=private.assert_staff(false);
  if p_target_user_id is null or p_target_user_id=v_actor then raise exception 'Eigenen Account kannst du nicht time-outen'; end if;
  select role into v_target_role from public.staff_roles where user_id=p_target_user_id;
  if v_role='moderator' and v_target_role is not null then raise exception 'Moderatoren können keine Teammitglieder time-outen'; end if;
  if v_role='admin' and v_target_role='admin' then raise exception 'Admins können andere Admins nicht time-outen'; end if;
  if p_minutes is null or p_minutes<1 or p_minutes>43200 then raise exception 'Timeout muss zwischen 1 Minute und 30 Tagen liegen'; end if;
  v_until:=now()+make_interval(mins=>p_minutes);
  insert into public.account_moderation(user_id,timeout_until,reason,actioned_by,updated_at)
  values(p_target_user_id,v_until,nullif(trim(p_reason),''),v_actor,now())
  on conflict(user_id) do update set timeout_until=excluded.timeout_until,reason=excluded.reason,actioned_by=v_actor,updated_at=now();
  insert into public.moderation_actions(actor_user_id,action_type,target_user_id,reason,details)
  values(v_actor,'timeout',p_target_user_id,nullif(trim(p_reason),''),jsonb_build_object('minutes',p_minutes,'until',v_until));
  return v_until;
end $$;
revoke all on function public.moderate_timeout_account(uuid,integer,text) from public,anon;
grant execute on function public.moderate_timeout_account(uuid,integer,text) to authenticated;

create or replace function public.moderate_clear_timeout(p_target_user_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_role text; v_target_role text;
begin
  v_role:=private.assert_staff(false);
  select role into v_target_role from public.staff_roles where user_id=p_target_user_id;
  if v_role='moderator' and v_target_role is not null then raise exception 'Moderatoren können Teammitglieder nicht moderieren'; end if;
  update public.account_moderation set timeout_until=null,updated_at=now(),actioned_by=v_actor where user_id=p_target_user_id;
  insert into public.moderation_actions(actor_user_id,action_type,target_user_id) values(v_actor,'timeout_clear',p_target_user_id);
end $$;
revoke all on function public.moderate_clear_timeout(uuid) from public,anon;
grant execute on function public.moderate_clear_timeout(uuid) to authenticated;

create or replace function public.admin_ban_account(p_target_user_id uuid,p_reason text default null)
returns void language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_target_role text;
begin
  perform private.assert_staff(true);
  if p_target_user_id is null or p_target_user_id=v_actor then raise exception 'Eigenen Admin-Account kannst du nicht bannen'; end if;
  select role into v_target_role from public.staff_roles where user_id=p_target_user_id;
  if v_target_role='admin' then raise exception 'Andere Admins können nicht gebannt werden'; end if;
  insert into public.account_moderation(user_id,banned_at,timeout_until,reason,actioned_by,updated_at)
  values(p_target_user_id,now(),null,nullif(trim(p_reason),''),v_actor,now())
  on conflict(user_id) do update set banned_at=now(),timeout_until=null,reason=excluded.reason,actioned_by=v_actor,updated_at=now();
  insert into public.moderation_actions(actor_user_id,action_type,target_user_id,reason)
  values(v_actor,'ban',p_target_user_id,nullif(trim(p_reason),''));
end $$;
revoke all on function public.admin_ban_account(uuid,text) from public,anon;
grant execute on function public.admin_ban_account(uuid,text) to authenticated;

create or replace function public.admin_unban_account(p_target_user_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());
begin
  perform private.assert_staff(true);
  update public.account_moderation set banned_at=null,reason=null,updated_at=now(),actioned_by=v_actor where user_id=p_target_user_id;
  insert into public.moderation_actions(actor_user_id,action_type,target_user_id) values(v_actor,'unban',p_target_user_id);
end $$;
revoke all on function public.admin_unban_account(uuid) from public,anon;
grant execute on function public.admin_unban_account(uuid) to authenticated;

create or replace function public.admin_set_moderator(p_target_user_id uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_existing text;
begin
  perform private.assert_staff(true);
  if p_target_user_id is null or p_target_user_id=v_actor then raise exception 'Eigenen Admin-Status kannst du hier nicht ändern'; end if;
  select role into v_existing from public.staff_roles where user_id=p_target_user_id;
  if v_existing='admin' then raise exception 'Admin-Rollen können hier nicht geändert werden'; end if;
  if coalesce(p_enabled,false) then
    insert into public.staff_roles(user_id,role,granted_by,granted_at)
    values(p_target_user_id,'moderator',v_actor,now())
    on conflict(user_id) do update set role='moderator',granted_by=v_actor,granted_at=now();
    insert into public.moderation_actions(actor_user_id,action_type,target_user_id) values(v_actor,'moderator_add',p_target_user_id);
  else
    delete from public.staff_roles where user_id=p_target_user_id and role='moderator';
    insert into public.moderation_actions(actor_user_id,action_type,target_user_id) values(v_actor,'moderator_remove',p_target_user_id);
  end if;
end $$;
revoke all on function public.admin_set_moderator(uuid,boolean) from public,anon;
grant execute on function public.admin_set_moderator(uuid,boolean) to authenticated;

create or replace function public.admin_delete_company(p_company_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_owner uuid;
begin
  perform private.assert_staff(true);
  select owner_user_id into v_owner from public.companies where id=p_company_id and company_type='player' for update;
  if v_owner is null then raise exception 'Unternehmen nicht gefunden'; end if;
  if v_owner=v_actor then raise exception 'Eigenes Admin-Unternehmen kann hier nicht gelöscht werden'; end if;
  if exists(select 1 from public.staff_roles where user_id=v_owner and role='admin') then raise exception 'Unternehmen eines Admins kann nicht gelöscht werden'; end if;
  insert into public.moderation_actions(actor_user_id,action_type,target_user_id,target_company_id)
  values(v_actor,'company_delete',v_owner,p_company_id);
  delete from public.market_trades where buyer_company_id=p_company_id or seller_company_id=p_company_id;
  delete from public.companies where id=p_company_id;
end $$;
revoke all on function public.admin_delete_company(uuid) from public,anon;
grant execute on function public.admin_delete_company(uuid) to authenticated;

create or replace function public.admin_delete_account(p_target_user_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_code text; v_company uuid;
begin
  perform private.assert_staff(true);
  if p_target_user_id is null or p_target_user_id=v_actor then raise exception 'Eigenen Admin-Account kann hier nicht gelöscht werden'; end if;
  if exists(select 1 from public.staff_roles where user_id=p_target_user_id and role='admin') then raise exception 'Admin-Accounts können nicht gelöscht werden'; end if;
  select account_code into v_code from public.account_profiles where user_id=p_target_user_id;
  if v_code is null then raise exception 'Account nicht gefunden'; end if;
  for v_company in select id from public.companies where owner_user_id=p_target_user_id loop
    delete from public.market_trades where buyer_company_id=v_company or seller_company_id=v_company;
  end loop;
  insert into public.moderation_actions(actor_user_id,action_type,target_user_id,details)
  values(v_actor,'account_delete',p_target_user_id,jsonb_build_object('account_code',v_code));
  delete from auth.users where id=p_target_user_id;
end $$;
revoke all on function public.admin_delete_account(uuid) from public,anon;
grant execute on function public.admin_delete_account(uuid) to authenticated;

alter table public.chat_rooms add column if not exists access_level text not null default 'public'
  check(access_level in ('public','staff'));

insert into public.chat_rooms(slug,name,icon,sort_order,is_active,access_level)
select 'admin-moderator','Admin & Moderator','🛡️',900,true,'staff'
where not exists(select 1 from public.chat_rooms where slug='admin-moderator');
update public.chat_rooms set name='Admin & Moderator',icon='🛡️',access_level='staff',is_active=true
where slug='admin-moderator';

drop policy if exists "authenticated can read active chat rooms" on public.chat_rooms;
drop policy if exists chat_rooms_select_accessible on public.chat_rooms;
create policy chat_rooms_select_accessible on public.chat_rooms
for select to authenticated
using(
  is_active=true and (
    access_level='public'
    or exists(select 1 from public.staff_roles sr where sr.user_id=(select auth.uid()))
  )
);

drop policy if exists "authenticated can read permitted chat messages" on public.chat_messages;
create policy "authenticated can read permitted chat messages" on public.chat_messages
for select to authenticated
using(
  (
    room_id is not null
    and exists(
      select 1 from public.chat_rooms r
      where r.id=chat_messages.room_id and r.is_active=true
        and (r.access_level='public' or exists(select 1 from public.staff_roles sr where sr.user_id=(select auth.uid())))
    )
  )
  or (
    recipient_company_id is not null
    and exists(
      select 1 from public.companies self_company
      where self_company.owner_user_id=(select auth.uid())
        and self_company.id=any(array[chat_messages.sender_company_id,chat_messages.recipient_company_id])
    )
  )
);

drop policy if exists "company owners can send chat messages" on public.chat_messages;
create policy "company owners can send chat messages" on public.chat_messages
for insert to authenticated
with check(
  not private.user_is_blocked((select auth.uid()))
  and exists(
    select 1 from public.companies sender
    where sender.id=chat_messages.sender_company_id
      and sender.owner_user_id=(select auth.uid())
      and sender.status='active' and sender.company_type='player'
  )
  and (
    (
      room_id is not null and recipient_company_id is null
      and exists(
        select 1 from public.chat_rooms r
        where r.id=chat_messages.room_id and r.is_active=true
          and (r.access_level='public' or exists(select 1 from public.staff_roles sr where sr.user_id=(select auth.uid())))
      )
    )
    or (
      room_id is null and recipient_company_id is not null
      and exists(
        select 1 from public.companies recipient
        where recipient.id=chat_messages.recipient_company_id and recipient.status='active' and recipient.company_type='player'
      )
    )
  )
);

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
      and (r.access_level='public' or exists(select 1 from public.staff_roles sr where sr.user_id=(select auth.uid())))
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

create or replace function private.mark_chat_read(p_company_id uuid,p_target_type text,p_target_id uuid,p_message_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_sequence bigint;
begin
  if auth.uid() is null or not exists(select 1 from public.companies c where c.id=p_company_id and c.owner_user_id=auth.uid()) then
    raise exception 'Keine Berechtigung für diesen Chat' using errcode='42501';
  end if;
  select m.read_sequence into v_sequence
  from public.chat_messages m
  where m.id=p_message_id and (
    (
      p_target_type='room' and m.room_id=p_target_id
      and exists(
        select 1 from public.chat_rooms r
        where r.id=p_target_id and r.is_active
          and (r.access_level='public' or exists(select 1 from public.staff_roles sr where sr.user_id=auth.uid()))
      )
    )
    or (
      p_target_type='contact' and m.room_id is null and (
        m.sender_company_id=p_company_id and m.recipient_company_id=p_target_id
        or m.sender_company_id=p_target_id and m.recipient_company_id=p_company_id
      )
    )
  );
  if v_sequence is null then raise exception 'Nachricht gehört nicht zu diesem Chat' using errcode='42501'; end if;
  insert into public.company_chat_reads(company_id,target_type,target_id,last_read_sequence)
  values(p_company_id,p_target_type,p_target_id,v_sequence)
  on conflict(company_id,target_type,target_id) do update
    set last_read_sequence=greatest(company_chat_reads.last_read_sequence,excluded.last_read_sequence),updated_at=now()
    where company_chat_reads.last_read_sequence<excluded.last_read_sequence;
end $$;

grant execute on function public.get_chat_unread_counts(uuid) to authenticated;
grant execute on function private.mark_chat_read(uuid,text,uuid,uuid) to authenticated;
