-- OpenCompany 0.10.281: bookkeeping corrections for management decision effects

-- Direct positive cash from a decision is financing, not operating revenue.
do $patch$
declare
  v_def text;
begin
  select pg_get_functiondef('private.apply_management_option(uuid,uuid,text,boolean)'::regprocedure)
    into v_def;

  v_def:=replace(
    v_def,
    $$p_company_id,'management_decision',v_cash_delta,$$,
    $$p_company_id,case when v_cash_delta>0 then 'management_decision_financing' else 'management_decision_cost' end,v_cash_delta,$$
  );

  execute v_def;
end
$patch$;

-- Patent-value adjustments are non-cash. Keep the audit row, but never book it into cashflow.
do $patch$
declare
  v_def text;
begin
  select pg_get_functiondef('private.apply_management_decision_transaction_effects()'::regprocedure)
    into v_def;

  v_def:=replace(
    v_def,
    $$new.company_id,'management_decision_patent_adjustment',v_adjust,$$,
    $$new.company_id,'management_decision_patent_adjustment',0,$$
  );

  execute v_def;
end
$patch$;

update public.financial_transactions
set amount=0
where transaction_type='management_decision_patent_adjustment'
  and amount<>0;

create or replace function private.management_period_metrics(
  p_company_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_market_sales numeric:=0;
  v_market_fees numeric:=0;
  v_revenue numeric:=0;
  v_procurement numeric:=0;
  v_operating_costs numeric:=0;
  v_interest_expense numeric:=0;
  v_interest_income numeric:=0;
  v_investment_result numeric:=0;
  v_decision_adjustments numeric:=0;
  v_operating_result numeric:=0;
  v_profit numeric:=0;
  v_cashflow numeric:=0;
  v_large_orders integer:=0;
begin
  select
    coalesce(sum(case when transaction_type='market_sale' then amount else 0 end),0),
    abs(coalesce(sum(case when transaction_type='market_fee' then amount else 0 end),0))
  into v_market_sales,v_market_fees
  from public.financial_transactions
  where company_id=p_company_id and created_at>=p_start and created_at<p_end;

  select
    (v_market_sales+v_market_fees)
    +coalesce(sum(case when transaction_type in (
      'retail_sale','manager_revenue_bonus','contract_sale','contract_penalty_income','large_customer_order',
      'storage_forced_auction','production_refund','retail_cancel_refund',
      'research_investment','manager_patent_gain','manager_saving'
    ) and amount>0 then amount else 0 end),0),
    abs(coalesce(sum(case when transaction_type in ('market_buy','contract_buy') and amount<0 then amount else 0 end),0)),
    abs(coalesce(sum(case
      when amount<0 and transaction_type not in (
        'market_buy','contract_buy','construction','bond_investment','bond_repayment','bond_interest_paid',
        'management_decision_adjustment'
      ) then amount else 0 end),0)),
    abs(coalesce(sum(case when transaction_type='bond_interest_paid' and amount<0 then amount else 0 end),0)),
    coalesce(sum(case when transaction_type in ('bond_interest_income','bond_interest_state') and amount>0 then amount else 0 end),0),
    coalesce(sum(case when transaction_type='building_refund' then amount when transaction_type='construction' then amount else 0 end),0),
    coalesce(sum(case when transaction_type='management_decision_adjustment' then amount else 0 end),0)
  into v_revenue,v_procurement,v_operating_costs,v_interest_expense,v_interest_income,v_investment_result,v_decision_adjustments
  from public.financial_transactions
  where company_id=p_company_id and created_at>=p_start and created_at<p_end;

  v_operating_result:=v_revenue-v_procurement-v_operating_costs+v_decision_adjustments;
  v_profit:=v_operating_result+v_investment_result+v_interest_income-v_interest_expense;

  select coalesce(sum(case
    when transaction_type in ('research_investment','manager_patent_gain','market_fee','management_decision_patent_adjustment') then 0
    else amount end),0)
  into v_cashflow
  from public.financial_transactions
  where company_id=p_company_id and created_at>=p_start and created_at<p_end;

  select count(*) into v_large_orders
  from public.large_customer_orders
  where awarded_company_id=p_company_id and status='completed'
    and completed_at>=p_start and completed_at<p_end;

  return jsonb_build_object(
    'revenue',round(v_revenue,2),
    'procurement',round(v_procurement,2),
    'operating_costs',round(v_operating_costs,2),
    'decision_adjustments',round(v_decision_adjustments,2),
    'operating_result',round(v_operating_result,2),
    'interest_expense',round(v_interest_expense,2),
    'interest_income',round(v_interest_income,2),
    'investment_result',round(v_investment_result,2),
    'profit',round(v_profit,2),
    'cashflow',round(v_cashflow,2),
    'large_orders_completed',v_large_orders
  );
end
$function$;
