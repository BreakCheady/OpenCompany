-- OpenCompany 0.10.259: direct push when another company funds a bond request

alter table public.push_preferences
  add column if not exists bond_enabled boolean not null default true;

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
        'chat_message'::text,
        'bond_investment_received'::text
      ]
    )
    or event_type ~ '^building_completed_level_[0-9]+$'::text
  );

create or replace function private.enqueue_bond_investment_received_push()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_lender_name text;
  v_amount_text text;
begin
  select c.owner_user_id
    into v_user_id
  from public.companies c
  where c.id = new.borrower_company_id
    and c.company_type='player'
    and c.status='active';

  if v_user_id is null then
    return new;
  end if;

  select c.name
    into v_lender_name
  from public.companies c
  where c.id = new.lender_company_id;

  if not exists (
    select 1
    from public.push_preferences p
    where p.user_id = v_user_id
      and p.bond_enabled
  ) or not exists (
    select 1
    from public.push_subscriptions s
    where s.user_id = v_user_id
      and s.enabled
  ) then
    return new;
  end if;

  v_amount_text := replace(
    trim(to_char(round(coalesce(new.original_principal,0),2),'FM999999999999990.00')),
    '.',
    ','
  );

  insert into public.push_notification_queue(
    user_id,event_type,reference_id,title,body,url
  )
  values(
    v_user_id,
    'bond_investment_received',
    new.id,
    'Anleihe finanziert',
    coalesce(v_lender_name,'Ein Unternehmen')
      || ' hat ' || v_amount_text
      || ' $ in deine Anleihe investiert.',
    '/#finance'
  )
  on conflict(user_id,event_type,reference_id) do nothing;

  return new;
end
$function$;

revoke all on function private.enqueue_bond_investment_received_push() from public,anon,authenticated;

drop trigger if exists trg_bond_investment_received_push on public.bond_investments;

create trigger trg_bond_investment_received_push
after insert on public.bond_investments
for each row
execute function private.enqueue_bond_investment_received_push();
