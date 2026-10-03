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
      || ' OC$ deines gewährten Kredits zurückgezahlt. '
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
      || ' OC$ deines gewährten Kredits zurückgezahlt. '
      || 'Offener Betrag dieses Kreditanteils: '
      || v_remaining_text || ' OC$.';
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
