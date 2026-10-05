insert into public.chat_rooms(slug,name,icon,sort_order,is_active,access_level)
select 'moderation-log','Log-Chat','📋',901,true,'staff'
where not exists(select 1 from public.chat_rooms where slug='moderation-log');

update public.chat_rooms
set name='Log-Chat',icon='📋',sort_order=901,is_active=true,access_level='staff'
where slug='moderation-log';

drop policy if exists "company owners can send chat messages" on public.chat_messages;
create policy "company owners can send chat messages" on public.chat_messages
for insert to authenticated
with check(
  not public.is_current_user_blocked()
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
          and r.slug<>'moderation-log'
          and (r.access_level='public' or public.is_staff())
      )
    )
    or
    (
      room_id is null and recipient_company_id is not null
      and exists(
        select 1 from public.companies recipient
        where recipient.id=chat_messages.recipient_company_id
          and recipient.status='active' and recipient.company_type='player'
      )
    )
  )
);

create or replace function private.write_moderation_log_message()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_room_id uuid;
  v_actor text;
  v_target text;
  v_action text;
  v_body text;
  v_reason text;
begin
  select id into v_room_id
  from public.chat_rooms
  where slug='moderation-log' and is_active=true
  limit 1;

  if v_room_id is null then
    return new;
  end if;

  select coalesce(c.name || ' (' || ap.account_code || ')', ap.account_code, 'System')
  into v_actor
  from auth.users u
  left join public.account_profiles ap on ap.user_id=u.id
  left join public.companies c on c.owner_user_id=u.id and c.company_type='player'
  where u.id=new.actor_user_id
  limit 1;

  if v_actor is null then v_actor:='System'; end if;

  if new.target_user_id is not null then
    select coalesce(c.name || ' (' || ap.account_code || ')', ap.account_code)
    into v_target
    from public.account_profiles ap
    left join public.companies c on c.owner_user_id=ap.user_id and c.company_type='player'
    where ap.user_id=new.target_user_id
    limit 1;
  end if;

  if v_target is null and new.target_company_id is not null then
    select coalesce(c.name || ' (' || c.company_code || ')',c.name,c.company_code)
    into v_target
    from public.companies c
    where c.id=new.target_company_id
    limit 1;
  end if;

  v_action:=case new.action_type
    when 'message_delete' then 'Nachricht gelöscht'
    when 'timeout' then 'Timeout gesetzt'
    when 'timeout_clear' then 'Timeout aufgehoben'
    when 'ban' then 'Account gebannt'
    when 'unban' then 'Account entbannt'
    when 'moderator_add' then 'Moderator hinzugefügt'
    when 'moderator_remove' then 'Moderator entfernt'
    when 'company_delete' then 'Unternehmen gelöscht'
    when 'account_delete' then 'Account gelöscht'
    else replace(new.action_type,'_',' ')
  end;

  v_body:='🛡️ ' || v_actor || ' · ' || v_action;

  if v_target is not null then
    v_body:=v_body || ' · Ziel: ' || v_target;
  end if;

  if new.action_type='timeout' and new.details ? 'minutes' then
    v_body:=v_body || ' · Dauer: ' || coalesce(new.details->>'minutes','?') || ' Min.';
  end if;

  v_reason:=nullif(trim(coalesce(new.reason,'')),'');
  if v_reason is not null then
    v_body:=v_body || ' · Grund: ' || v_reason;
  end if;

  if new.target_message_id is not null then
    v_body:=v_body || ' · Nachricht: ' || new.target_message_id::text;
  end if;

  insert into public.chat_messages(room_id,sender_company_id,body)
  values(
    v_room_id,
    '00000000-0000-4000-8000-000000000001'::uuid,
    left(v_body,1000)
  );

  return new;
end $$;

drop trigger if exists trg_moderation_action_chat_log on public.moderation_actions;
create trigger trg_moderation_action_chat_log
after insert on public.moderation_actions
for each row execute function private.write_moderation_log_message();
