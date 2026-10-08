-- OpenCompany 0.10.271: management accounting and salary correctness fixes

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
as $$
declare
  v_market_sales numeric:=0;
  v_market_fees numeric:=0;
  v_revenue numeric:=0;
  v_procurement numeric:=0;
  v_operating_costs numeric:=0;
  v_interest_expense numeric:=0;
  v_interest_income numeric:=0;
  v_investment_result numeric:=0;
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
        'market_buy','contract_buy','construction','bond_investment','bond_repayment','bond_interest_paid'
      ) then amount else 0 end),0)),
    abs(coalesce(sum(case when transaction_type='bond_interest_paid' and amount<0 then amount else 0 end),0)),
    coalesce(sum(case when transaction_type in ('bond_interest_income','bond_interest_state') and amount>0 then amount else 0 end),0),
    coalesce(sum(case when transaction_type='building_refund' then amount when transaction_type='construction' then amount else 0 end),0)
  into v_revenue,v_procurement,v_operating_costs,v_interest_expense,v_interest_income,v_investment_result
  from public.financial_transactions
  where company_id=p_company_id and created_at>=p_start and created_at<p_end;

  v_operating_result:=v_revenue-v_procurement-v_operating_costs;
  v_profit:=v_operating_result+v_investment_result+v_interest_income-v_interest_expense;

  select coalesce(sum(case
    when transaction_type in ('research_investment','manager_patent_gain','market_fee') then 0
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
    'operating_result',round(v_operating_result,2),
    'interest_expense',round(v_interest_expense,2),
    'interest_income',round(v_interest_income,2),
    'investment_result',round(v_investment_result,2),
    'profit',round(v_profit,2),
    'cashflow',round(v_cashflow,2),
    'large_orders_completed',v_large_orders
  );
end
$$;

create or replace function private.run_management_weekly_salary(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_week date:=private.management_week_start(now());
  v_gross numeric:=0;
  v_rate numeric:=0;
  v_due numeric:=0;
begin
  select coalesce(sum(weekly_salary),0) into v_gross
  from public.company_managers
  where company_id=p_company_id and status in ('active','training');

  if v_gross<=0 then return; end if;

  insert into private.management_salary_runs(company_id,week_start)
  values(p_company_id,v_week)
  on conflict do nothing;
  if not found then return; end if;

  v_rate:=private.manager_effect(p_company_id,'finance','personnel');
  v_due:=round(v_gross*(1-v_rate),2);

  update public.companies set cash_balance=cash_balance-v_due,updated_at=now() where id=p_company_id;
  insert into public.financial_transactions(
    company_id,transaction_type,amount,description,reference_type,cost_center
  ) values(
    p_company_id,'manager_salary',-v_due,
    'Wöchentliche Managergehälter'||case when v_rate>0 then ' (inkl. Verwaltungseffizienz)' else '' end,
    'management','management'
  );
end
$$;

delete from private.management_salary_runs msr
where msr.week_start=private.management_week_start(now())
  and not exists(
    select 1 from public.financial_transactions ft
    where ft.company_id=msr.company_id
      and ft.transaction_type='manager_salary'
      and ft.created_at>=(msr.week_start::timestamp at time zone 'Europe/Berlin')
      and ft.created_at<((msr.week_start+7)::timestamp at time zone 'Europe/Berlin')
  );

do $patch$
declare
  v_def text;
begin
  select pg_get_functiondef('private.create_weekly_management_report(uuid)'::regprocedure) into v_def;
  v_def:=replace(v_def,
    'v_profit:=coalesce((v_cur->>''profit'')::numeric,0);',
    'v_profit:=coalesce((v_cur->>''operating_result'')::numeric,0);'
  );
  execute v_def;

  select pg_get_functiondef('public.get_management_overview(uuid)'::regprocedure) into v_def;
  v_def:=replace(v_def,
    'v_profit:=coalesce((v_metrics->>''profit'')::numeric,0);',
    'v_profit:=coalesce((v_metrics->>''operating_result'')::numeric,0);'
  );
  v_def:=replace(v_def,
    'sum(case when amount>0 then amount else 0 end) income,\n      sum(case when amount<0 then abs(amount) else 0 end) costs',
    'sum(case when amount>0 and transaction_type<>''manager_saving'' then amount else 0 end) + sum(case when transaction_type=''market_fee'' and amount<0 then abs(amount) else 0 end) income,\n      greatest(0,sum(case when amount<0 then abs(amount) else 0 end)-sum(case when transaction_type=''manager_saving'' and amount>0 then amount else 0 end)) costs'
  );
  execute v_def;
end
$patch$;
