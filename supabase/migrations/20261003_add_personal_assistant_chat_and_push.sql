alter table public.push_preferences
  add column if not exists chat_enabled boolean not null default true;

alter table public.push_notification_queue
  drop constraint if exists push_notification_queue_event_type_check;

alter table public.push_notification_queue
  add constraint push_notification_queue_event_type_check
  check (
    event_type = any (
      array[
        'production_completed'::text,
        'retail_completed'::text,
        'market_sale'::text,
        'contract_received'::text,
        'contract_accepted'::text,
        'contract_rejected'::text,
        'chat_message'::text
      ]
    )
    or event_type ~ '^building_completed_level_[0-9]+$'::text
  );

insert into public.companies (
  id, owner_user_id, name, status, brand_reputation, company_level,
  cash_balance, company_value, company_type, company_code,
  experience_points, ocb_balance
)
values (
  '00000000-0000-4000-8000-000000000001'::uuid,
  null,
  'Personal Assistent',
  'active',
  50,
  1,
  0,
  0,
  'npc',
  'U00000',
  0,
  0
)
on conflict (id) do update
set name='Personal Assistent',
    status='active',
    company_type='npc',
    owner_user_id=null,
    cash_balance=0,
    company_value=0;

drop policy if exists "company owners can send chat messages" on public.chat_messages;
create policy "company owners can send chat messages"
on public.chat_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.companies sender
    where sender.id = chat_messages.sender_company_id
      and sender.owner_user_id = (select auth.uid())
      and sender.status = 'active'
      and sender.company_type = 'player'
  )
  and (
    (
      room_id is not null
      and recipient_company_id is null
      and exists (
        select 1 from public.chat_rooms r
        where r.id = chat_messages.room_id
          and r.is_active = true
      )
    )
    or
    (
      room_id is null
      and recipient_company_id is not null
      and exists (
        select 1
        from public.companies recipient
        where recipient.id = chat_messages.recipient_company_id
          and recipient.status = 'active'
          and recipient.company_type = 'player'
      )
    )
  )
);

create or replace function private.enqueue_chat_message_push()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_recipient_user_id uuid;
  v_sender_name text;
  v_sender_is_assistant boolean;
  v_chat_enabled boolean;
begin
  if new.recipient_company_id is null then
    return new;
  end if;

  select c.owner_user_id
    into v_recipient_user_id
  from public.companies c
  where c.id = new.recipient_company_id
    and c.company_type = 'player'
    and c.status = 'active';

  if v_recipient_user_id is null then
    return new;
  end if;

  select c.name,
         c.id = '00000000-0000-4000-8000-000000000001'::uuid
    into v_sender_name, v_sender_is_assistant
  from public.companies c
  where c.id = new.sender_company_id;

  select coalesce(pref.chat_enabled, true)
    into v_chat_enabled
  from public.push_preferences pref
  where pref.user_id = v_recipient_user_id;

  v_chat_enabled := coalesce(v_chat_enabled, true);

  if v_chat_enabled
     and exists (
       select 1
       from public.push_subscriptions s
       where s.user_id = v_recipient_user_id
         and s.enabled
     ) then
    insert into public.push_notification_queue(
      user_id,event_type,reference_id,title,body,url
    )
    values(
      v_recipient_user_id,
      'chat_message',
      new.id,
      case
        when v_sender_is_assistant then 'Personal Assistent'
        else 'Neue Nachricht von ' || coalesce(v_sender_name,'Unternehmen')
      end,
      left(new.body, 240),
      '/#chat/contact/' || new.sender_company_id::text
    )
    on conflict (user_id,event_type,reference_id) do nothing;
  end if;

  return new;
end
$function$;

revoke all on function private.enqueue_chat_message_push() from public, anon, authenticated;

drop trigger if exists trg_chat_message_push on public.chat_messages;
create trigger trg_chat_message_push
after insert on public.chat_messages
for each row
execute function private.enqueue_chat_message_push();

create or replace function private.run_economy_phase_if_due()
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_state public.game_economy_state%rowtype;
  v_roll numeric;
  v_next_phase text;
  v_effect numeric;
  v_message text;
begin
  select * into v_state
  from public.game_economy_state
  where id=1
  for update;

  if v_state.id is null then
    return 'neutral';
  end if;

  if now() < v_state.next_change_at then
    return v_state.phase;
  end if;

  v_roll := random();
  v_effect := coalesce(v_state.effect_rate,0.15);

  if v_state.phase='recession' then
    v_next_phase := case
      when v_roll < 0.50 then 'recession'
      when v_roll < 0.95 then 'neutral'
      else 'boom'
    end;
  elsif v_state.phase='boom' then
    v_next_phase := case
      when v_roll < 0.50 then 'boom'
      when v_roll < 0.95 then 'neutral'
      else 'recession'
    end;
  else
    v_next_phase := case
      when v_roll < 0.50 then 'neutral'
      when v_roll < 0.75 then 'recession'
      else 'boom'
    end;
  end if;

  update public.game_economy_state
  set phase=v_next_phase,
      production_cost_factor=case v_next_phase when 'recession' then 1-v_effect when 'boom' then 1+v_effect else 1 end,
      production_output_factor=case v_next_phase when 'recession' then 1+v_effect when 'boom' then 1-v_effect else 1 end,
      retail_price_factor=case v_next_phase when 'recession' then 1-v_effect when 'boom' then 1+v_effect else 1 end,
      phase_started_at=case when v_next_phase is distinct from v_state.phase then now() else v_state.phase_started_at end,
      next_change_at=private.next_economy_change_at(now()+interval '1 minute'),
      updated_at=now()
  where id=1;

  if v_next_phase is distinct from v_state.phase then
    v_message := case v_next_phase
      when 'recession' then
        'Boss, die Wirtschaft schwächt sich ab. OpenCompany befindet sich jetzt in einer Rezession. Die Produktionskosten sinken, gleichzeitig kann mehr produziert werden. Im Einzelhandel sinken die Verkaufspreise.'
      when 'boom' then
        'Boss, die Wirtschaft zieht an. OpenCompany befindet sich jetzt in einem Boom. Die Produktionskosten steigen, gleichzeitig kann weniger produziert werden. Im Einzelhandel steigen die Verkaufspreise.'
      else
        'Boss, die Wirtschaft hat sich stabilisiert. OpenCompany befindet sich jetzt in der neutralen Wirtschaftsphase. Produktionskosten, Produktionsmenge und Einzelhandelspreise sind wieder auf Normalniveau.'
    end;

    insert into public.chat_messages(
      sender_company_id, recipient_company_id, body
    )
    select
      '00000000-0000-4000-8000-000000000001'::uuid,
      c.id,
      v_message
    from public.companies c
    where c.company_type='player'
      and c.status='active'
      and c.owner_user_id is not null;
  end if;

  return v_next_phase;
end
$function$;

revoke all on function private.run_economy_phase_if_due() from public, anon, authenticated;
