-- OpenCompany: paid interest counts toward the fixed 105% total repayment target.
-- The effective remaining debt is target_received - total_received.

create or replace function private.bond_remaining_debt(p_company_id uuid)
returns numeric
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(sum(
    greatest(0,round(original_principal*1.05,2)-coalesce(total_received,0))
  ),0)::numeric
  from public.bond_investments
  where borrower_company_id=p_company_id
    and status='active';
$function$;

create or replace function private.company_total_loan_debt(p_company_id uuid)
returns numeric
language sql
stable
security definer
set search_path to ''
as $function$
  select (
    coalesce((
      select sum(l.outstanding_balance)
      from public.company_loans l
      where l.company_id=p_company_id
        and l.status='active'
        and l.outstanding_balance>0
    ),0)
    + private.bond_remaining_debt(p_company_id)
  )::numeric;
$function$;

create or replace function private.repay_bond_investment_impl(
  p_company_id uuid,
  p_investment_id uuid,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v public.bond_investments%rowtype;
  v_cash numeric;
  v_pay numeric;
  v_new_outstanding numeric;
  v_new_received numeric;
  v_target numeric;
  v_remaining_due numeric;
  v_status text;
begin
  perform private.assert_company_owner(p_company_id);
  if p_amount is null or p_amount<=0 then raise exception 'Tilgungsbetrag muss größer als 0 sein'; end if;
  if round(p_amount,2)<>p_amount then raise exception 'Maximal zwei Nachkommastellen sind erlaubt'; end if;

  select * into v
  from public.bond_investments
  where id=p_investment_id and borrower_company_id=p_company_id
  for update;

  if v.id is null or v.status<>'active' then raise exception 'Kreditanteil ist nicht tilgbar'; end if;
  if now()<v.matures_at then
    raise exception 'Dieser Kreditanteil kann erst ab % zurückgezahlt werden',
      to_char(v.matures_at at time zone 'Europe/Berlin','DD.MM.YYYY HH24:MI');
  end if;

  v_target:=round(v.original_principal*1.05,2);
  v_remaining_due:=greatest(0,v_target-coalesce(v.total_received,0));

  if v_remaining_due<=0 then
    update public.bond_investments
    set outstanding_principal=0,status='auto_repaid',
        closed_at=coalesce(closed_at,now()),updated_at=now()
    where id=v.id;
    return jsonb_build_object('paid',0,'outstanding_principal',0,'remaining_debt',0,'status','auto_repaid');
  end if;

  v_pay:=least(p_amount,v_remaining_due);

  select cash_balance into v_cash
  from public.companies
  where id=p_company_id
  for update;

  if coalesce(v_cash,0)<v_pay or v_cash-v_pay<0 then
    raise exception 'Tilgung darf den Kontostand nicht unter 0 OC$ bringen';
  end if;

  update public.companies set cash_balance=cash_balance-v_pay,updated_at=now() where id=p_company_id;
  update public.companies set cash_balance=cash_balance+v_pay,updated_at=now() where id=v.lender_company_id;

  v_new_received:=v.total_received+v_pay;
  v_new_outstanding:=greatest(0,v.outstanding_principal-v_pay);
  v_status:=case
    when v_new_received>=v_target then 'repaid'
    when v_new_outstanding<=0 then 'repaid'
    else 'active'
  end;
  if v_status<>'active' then v_new_outstanding:=0; end if;

  update public.bond_investments
  set outstanding_principal=v_new_outstanding,
      principal_repaid=principal_repaid+v_pay,
      total_received=v_new_received,
      status=v_status,
      closed_at=case when v_status<>'active' then now() else closed_at end,
      updated_at=now()
  where id=v.id;

  insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id) values
    (p_company_id,'bond_repayment',-v_pay,'Anleihe getilgt','bond_investment',v.id),
    (v.lender_company_id,'bond_principal_income',v_pay,'Tilgung aus Anleihe','bond_investment',v.id);

  return jsonb_build_object(
    'paid',v_pay,
    'outstanding_principal',v_new_outstanding,
    'remaining_debt',greatest(0,v_target-v_new_received),
    'status',v_status
  );
end
$function$;

create or replace function public.get_bond_dashboard(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_limit numeric;
  v_building numeric;
  v_outstanding_principal numeric;
  v_remaining_debt numeric;
  v_reserved numeric;
  v_default_days integer;
  v_result jsonb;
begin
  perform private.assert_company_owner(p_company_id);
  v_building:=private.company_building_value(p_company_id);
  v_limit:=private.bond_collateral_limit(p_company_id);
  v_outstanding_principal:=private.bond_outstanding_principal(p_company_id);
  v_remaining_debt:=private.bond_remaining_debt(p_company_id);
  v_reserved:=private.bond_reserved_request_amount(p_company_id);

  select coalesce(consecutive_missed_days,0)
    into v_default_days
  from public.bond_borrower_state
  where company_id=p_company_id;

  select jsonb_build_object(
    'building_value',v_building,
    'credit_limit',v_limit,
    'outstanding_principal',v_remaining_debt,
    'reserved_requests',v_reserved,
    'available_credit',greatest(0,v_limit-v_outstanding_principal-v_reserved),
    'default_days',coalesce(v_default_days,0),

    'open_requests',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'borrower_company_id',r.borrower_company_id,'borrower_name',c.name,
        'borrower_type',c.company_type,'requested_amount',r.requested_amount,
        'funded_amount',r.funded_amount,'remaining_amount',greatest(0,r.requested_amount-r.funded_amount),
        'daily_interest_rate',r.daily_interest_rate,'created_at',r.created_at
      ) order by r.created_at desc)
      from public.bond_requests r
      join public.companies c on c.id=r.borrower_company_id
      where r.status='open' and r.borrower_company_id<>p_company_id
        and c.status='active' and c.company_type in ('player','npc')
    ),'[]'::jsonb),

    'my_requests',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'requested_amount',r.requested_amount,'funded_amount',r.funded_amount,
        'remaining_amount',greatest(0,r.requested_amount-r.funded_amount),
        'daily_interest_rate',r.daily_interest_rate,'status',r.status,'created_at',r.created_at
      ) order by r.created_at desc)
      from public.bond_requests r
      where r.borrower_company_id=p_company_id and r.status='open'
    ),'[]'::jsonb),

    'my_borrowed_positions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'request_id',i.request_id,'lender_name',c.name,'lender_type',c.company_type,
        'original_principal',i.original_principal,'outstanding_principal',i.outstanding_principal,
        'remaining_debt',greatest(0,round(i.original_principal*1.05,2)-coalesce(i.total_received,0)),
        'daily_interest_rate',i.daily_interest_rate,'interest_received',i.interest_received,
        'total_received',i.total_received,'target_received',round(i.original_principal*1.05,2),
        'status',i.status,'funded_at',i.funded_at,'matures_at',i.matures_at,'closed_at',i.closed_at
      ) order by i.funded_at desc)
      from public.bond_investments i
      join public.companies c on c.id=i.lender_company_id
      where i.borrower_company_id=p_company_id
    ),'[]'::jsonb),

    'my_investments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'request_id',i.request_id,'borrower_name',c.name,'borrower_type',c.company_type,
        'original_principal',i.original_principal,'outstanding_principal',i.outstanding_principal,
        'remaining_debt',greatest(0,round(i.original_principal*1.05,2)-coalesce(i.total_received,0)),
        'daily_interest_rate',i.daily_interest_rate,'interest_received',i.interest_received,
        'state_interest_received',i.state_interest_received,'principal_repaid',i.principal_repaid,
        'total_received',i.total_received,'target_received',round(i.original_principal*1.05,2),
        'status',i.status,'funded_at',i.funded_at,'matures_at',i.matures_at,'closed_at',i.closed_at
      ) order by i.funded_at desc)
      from public.bond_investments i
      join public.companies c on c.id=i.borrower_company_id
      where i.lender_company_id=p_company_id
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end
$function$;
