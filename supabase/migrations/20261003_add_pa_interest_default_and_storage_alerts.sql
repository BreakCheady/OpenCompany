create or replace function private.notify_lender_on_bond_interest_default()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_investment public.bond_investments%rowtype;
  v_lender public.companies%rowtype;
  v_borrower_name text;
  v_amount_text text;
  v_message text;
begin
  if new.transaction_type <> 'bond_interest_state'
     or new.reference_type <> 'bond_investment'
     or new.reference_id is null
     or coalesce(new.amount,0) <= 0 then
    return new;
  end if;

  select *
    into v_investment
  from public.bond_investments
  where id = new.reference_id;

  if v_investment.id is null
     or v_investment.lender_company_id <> new.company_id then
    return new;
  end if;

  select *
    into v_lender
  from public.companies
  where id = v_investment.lender_company_id;

  if v_lender.id is null
     or v_lender.company_type <> 'player'
     or v_lender.status <> 'active'
     or v_lender.owner_user_id is null then
    return new;
  end if;

  select c.name
    into v_borrower_name
  from public.companies c
  where c.id = v_investment.borrower_company_id;

  v_amount_text := replace(
    trim(to_char(round(new.amount,2), 'FM999999999999990.00')),
    '.',
    ','
  );

  v_message :=
    'Boss, ' || coalesce(v_borrower_name,'ein Unternehmen')
    || ' war heute nicht in der Lage, die fälligen Zinsen für deinen gewährten Kredit zu zahlen. '
    || 'Der Staat hat dir deshalb ' || v_amount_text || ' OC$ als Zinsersatz gutgeschrieben.';

  insert into public.chat_messages(
    sender_company_id,
    recipient_company_id,
    body
  )
  values(
    '00000000-0000-4000-8000-000000000001'::uuid,
    v_investment.lender_company_id,
    v_message
  );

  return new;
end
$function$;

revoke all on function private.notify_lender_on_bond_interest_default()
from public, anon, authenticated;

drop trigger if exists trg_bond_interest_default_personal_assistant
on public.financial_transactions;

create trigger trg_bond_interest_default_personal_assistant
after insert on public.financial_transactions
for each row
when (
  new.transaction_type = 'bond_interest_state'
  and new.reference_type = 'bond_investment'
  and new.reference_id is not null
  and new.amount > 0
)
execute function private.notify_lender_on_bond_interest_default();

create or replace function private.notify_storage_overflow_personal_assistant()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_company public.companies%rowtype;
  v_total numeric;
  v_capacity numeric;
  v_overflow numeric;
  v_fee_text text;
  v_overflow_text text;
  v_message text;
begin
  if new.transaction_type <> 'storage_overflow_fee'
     or new.reference_type <> 'storage'
     or coalesce(new.amount,0) >= 0 then
    return new;
  end if;

  select *
    into v_company
  from public.companies
  where id = new.company_id;

  if v_company.id is null
     or v_company.company_type <> 'player'
     or v_company.status <> 'active'
     or v_company.owner_user_id is null then
    return new;
  end if;

  v_total := private.storage_total_quantity(new.company_id);
  v_capacity := private.storage_capacity(new.company_id);
  v_overflow := greatest(v_total-v_capacity,0);

  if v_overflow <= 0 then
    return new;
  end if;

  v_fee_text := replace(
    trim(to_char(round(abs(new.amount),2), 'FM999999999999990.00')),
    '.',
    ','
  );

  v_overflow_text := replace(
    trim(to_char(round(v_overflow,2), 'FM999999999999990.##')),
    '.',
    ','
  );

  v_message :=
    'Boss, dein Lager ist über der regulären Kapazität. '
    || 'Aktueller Überbestand: ' || v_overflow_text || ' Einheiten. '
    || 'Für den Überbestand wurden heute ' || v_fee_text || ' OC$ berechnet. '
    || 'Reduziere den Bestand oder erweitere dein Lager, um weitere Maßnahmen zu vermeiden.';

  insert into public.chat_messages(
    sender_company_id,
    recipient_company_id,
    body
  )
  values(
    '00000000-0000-4000-8000-000000000001'::uuid,
    new.company_id,
    v_message
  );

  return new;
end
$function$;

revoke all on function private.notify_storage_overflow_personal_assistant()
from public, anon, authenticated;

drop trigger if exists trg_storage_overflow_personal_assistant
on public.financial_transactions;

create trigger trg_storage_overflow_personal_assistant
after insert on public.financial_transactions
for each row
when (
  new.transaction_type = 'storage_overflow_fee'
  and new.reference_type = 'storage'
  and new.amount < 0
)
execute function private.notify_storage_overflow_personal_assistant();

create or replace function private.notify_storage_auction_personal_assistant()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_company public.companies%rowtype;
  v_quantity_text text;
  v_net_text text;
  v_message text;
begin
  select *
    into v_company
  from public.companies
  where id = new.company_id;

  if v_company.id is null
     or v_company.company_type <> 'player'
     or v_company.status <> 'active'
     or v_company.owner_user_id is null then
    return new;
  end if;

  v_quantity_text := replace(
    trim(to_char(round(coalesce(new.quantity,0),2), 'FM999999999999990.##')),
    '.',
    ','
  );

  v_net_text := replace(
    trim(to_char(round(coalesce(new.net_proceeds,0),2), 'FM999999999999990.00')),
    '.',
    ','
  );

  if new.full_liquidation then
    v_message :=
      'Boss, dein Lager war vollständig überzogen. '
      || 'Es wurde deshalb eine Zwangsvollstreckung des gesamten Lagerbestands durchgeführt. '
      || 'Der Nettoerlös beträgt ' || v_net_text || ' OC$.';
  else
    v_message :=
      'Boss, dein Lagerüberzug hat eine Zwangsversteigerung ausgelöst. '
      || v_quantity_text || ' Einheiten wurden zwangsweise aus dem Lager entfernt und verkauft. '
      || 'Dies ist Verwarnung ' || coalesce(new.warning_number,1)::text || ' von 3. '
      || 'Der Nettoerlös beträgt ' || v_net_text || ' OC$.';
  end if;

  insert into public.chat_messages(
    sender_company_id,
    recipient_company_id,
    body
  )
  values(
    '00000000-0000-4000-8000-000000000001'::uuid,
    new.company_id,
    v_message
  );

  return new;
end
$function$;

revoke all on function private.notify_storage_auction_personal_assistant()
from public, anon, authenticated;

drop trigger if exists trg_storage_auction_personal_assistant
on private.storage_auction_history;

create trigger trg_storage_auction_personal_assistant
after insert on private.storage_auction_history
for each row
execute function private.notify_storage_auction_personal_assistant();
