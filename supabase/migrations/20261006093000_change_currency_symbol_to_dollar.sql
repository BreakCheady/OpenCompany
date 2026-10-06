-- OpenCompany 0.10.247: replace OC$ with $ in server-generated messages

-- Source refresh: supabase/migrations/20261003_add_pa_bond_repayment_messages.sql
create or replace function private.notify_lender_on_bond_repayment()
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
  v_remaining numeric;
  v_remaining_text text;
  v_message text;
begin
  if new.transaction_type <> 'bond_principal_income'
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

  v_remaining := greatest(
    0,
    round(v_investment.original_principal * 1.05, 2)
      - coalesce(v_investment.total_received,0)
  );

  if v_remaining <= 0 or v_investment.status <> 'active' then
    v_message :=
      'Boss, ' || coalesce(v_borrower_name,'ein Unternehmen')
      || ' hat ' || v_amount_text
      || ' $ deines gewährten Kredits zurückgezahlt. '
      || 'Dieser Kreditanteil ist damit vollständig getilgt.';
  else
    v_remaining_text := replace(
      trim(to_char(round(v_remaining,2), 'FM999999999999990.00')),
      '.',
      ','
    );

    v_message :=
      'Boss, ' || coalesce(v_borrower_name,'ein Unternehmen')
      || ' hat ' || v_amount_text
      || ' $ deines gewährten Kredits zurückgezahlt. '
      || 'Offener Betrag dieses Kreditanteils: '
      || v_remaining_text || ' $.';
  end if;

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

revoke all on function private.notify_lender_on_bond_repayment()
from public, anon, authenticated;

drop trigger if exists trg_bond_repayment_personal_assistant
on public.financial_transactions;

create trigger trg_bond_repayment_personal_assistant
after insert on public.financial_transactions
for each row
when (
  new.transaction_type = 'bond_principal_income'
  and new.reference_type = 'bond_investment'
  and new.reference_id is not null
  and new.amount > 0
)
execute function private.notify_lender_on_bond_repayment();


-- Source refresh: supabase/migrations/20261003_add_pa_interest_default_and_storage_alerts.sql
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
    || 'Der Staat hat dir deshalb ' || v_amount_text || ' $ als Zinsersatz gutgeschrieben.';

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
    || 'Für den Überbestand wurden heute ' || v_fee_text || ' $ berechnet. '
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
      || 'Der Nettoerlös beträgt ' || v_net_text || ' $.';
  else
    v_message :=
      'Boss, dein Lagerüberzug hat eine Zwangsversteigerung ausgelöst. '
      || v_quantity_text || ' Einheiten wurden zwangsweise aus dem Lager entfernt und verkauft. '
      || 'Dies ist Verwarnung ' || coalesce(new.warning_number,1)::text || ' von 3. '
      || 'Der Nettoerlös beträgt ' || v_net_text || ' $.';
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


-- Source refresh: supabase/migrations/20261006042711_notify_large_order_awards_via_personal_assistant.sql
create or replace function private.award_due_large_customer_orders()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  o public.large_customer_orders%rowtype;
  b public.large_customer_bids%rowtype;
  v_min_price numeric;
  v_fastest_hours integer;
  v_best uuid;
  v_best_score numeric;
  v_score numeric;
  v_count integer:=0;
  v_deadline_text text;
begin
  for o in
    select * from public.large_customer_orders
    where status='bidding' and bidding_ends_at<=now()
    order by bidding_ends_at
    for update skip locked
  loop
    select min(price_per_unit),min(delivery_hours)
      into v_min_price,v_fastest_hours
    from public.large_customer_bids
    where order_id=o.id and status='submitted';

    if v_min_price is null then
      update public.large_customer_orders set status='cancelled' where id=o.id;
      continue;
    end if;

    v_best:=null;
    v_best_score:=-1;

    for b in
      select * from public.large_customer_bids
      where order_id=o.id and status='submitted'
      order by created_at,id
    loop
      v_score:=50*(v_min_price/nullif(b.price_per_unit,0))
        +25*least(1,b.offered_quality::numeric/5)
        +25*least(1,v_fastest_hours::numeric/nullif(b.delivery_hours,0));

      update public.large_customer_bids set score=round(v_score,4) where id=b.id;

      if v_score>v_best_score then
        v_best_score:=v_score;
        v_best:=b.id;
      end if;
    end loop;

    select * into b from public.large_customer_bids where id=v_best;

    update public.large_customer_bids
    set status=case when id=v_best then 'won' else 'lost' end
    where order_id=o.id and status='submitted';

    update public.large_customer_orders
    set status='awarded',
        winning_bid_id=v_best,
        awarded_company_id=b.company_id,
        awarded_at=now(),
        delivery_deadline=now()+make_interval(hours=>b.delivery_hours)
    where id=o.id
    returning * into o;

    v_deadline_text:=to_char(o.delivery_deadline at time zone 'Europe/Berlin','DD.MM.YYYY HH24:MI');

    insert into public.chat_messages(sender_company_id,recipient_company_id,body)
    select '00000000-0000-4000-8000-000000000001'::uuid,c.id,
      'Boss, Glückwunsch: Du hast den Großauftrag "'||o.item_name||'" von '||o.customer_name||
      ' gewonnen. Auftragsmenge: '||trim(to_char(o.quantity,'FM999999999990.##'))||
      ' Einheiten. Zuschlag: '||trim(to_char(b.price_per_unit,'FM999999999990.00'))||
      ' $ je Einheit. Deadline: '||v_deadline_text||' Uhr.'
    from public.companies c
    where c.id=b.company_id
      and c.company_type='player'
      and c.owner_user_id is not null;

    insert into public.chat_messages(sender_company_id,recipient_company_id,body)
    select '00000000-0000-4000-8000-000000000001'::uuid,c.id,
      'Boss, der Großauftrag "'||o.item_name||'" von '||o.customer_name||
      ' wurde vergeben. Dein Gebot hat diesmal leider nicht den Zuschlag erhalten.'
    from public.large_customer_bids lb
    join public.companies c on c.id=lb.company_id
    where lb.order_id=o.id
      and lb.status='lost'
      and c.company_type='player'
      and c.owner_user_id is not null;

    v_count:=v_count+1;
  end loop;

  return v_count;
end
$$;

revoke all on function private.award_due_large_customer_orders() from public,anon,authenticated;


