-- Exclude investments and principal transfers from weekly financial operating budgets.
-- Ledger entries, cash balances, and company valuation remain unchanged.
create or replace function private.management_budget_spending_class(
  p_type text,p_cost_center text,p_reference_type text default null
)
returns text language sql immutable set search_path='' as $$
 select case
   when p_type in ('construction','bond_investment') then 'investment'
   when p_type in ('bond_repayment','bond_principal_income','bond_proceeds','founding_capital') then 'capital'
   when p_type='building_refund' then 'investment'
   when p_type='bond_interest_income' then 'financial_income'
   when p_type='manager_saving' then 'operating_saving'
   when p_type in ('building_maintenance','bond_interest_paid','manager_salary','management_decision_cost','operating_cost')
     then 'operating'
   when p_cost_center in ('buildings','financing') then 'other_finance'
   else 'operating'
 end
$$;

create or replace function private.management_budget_used(
 p_company_id uuid,
 p_department text,
 p_week_start date default private.management_week_start(now())
)
returns numeric language sql stable security definer set search_path='' as $$
 select greatest(0,-coalesce(sum(
   case
    when ft.transaction_type='manager_saving' then ft.amount
    when ft.amount<0 then ft.amount
    else 0
   end
 ),0))
 from public.financial_transactions ft
 where ft.company_id=p_company_id
  and ft.created_at >= (p_week_start::timestamp at time zone 'Europe/Berlin')
  and ft.created_at < ((p_week_start+7)::timestamp at time zone 'Europe/Berlin')
  and private.management_transaction_department(ft.transaction_type,coalesce(ft.cost_center,'other'),ft.reference_type)=p_department
  and (
    p_department<>'finance'
    or private.management_budget_spending_class(ft.transaction_type,coalesce(ft.cost_center,'other'),ft.reference_type)
       not in ('investment','capital','financial_income')
  )
$$;

-- Finance overview supports separately reported cash flows without changing budget spending.
create or replace function private.management_finance_budget_breakdown(
 p_company_id uuid,p_week_start date default private.management_week_start(now())
)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'operating_budget_used', private.management_budget_used(p_company_id,'finance',p_week_start),
  'investment_outflows', coalesce(sum(-least(ft.amount,0)) filter(where private.management_budget_spending_class(ft.transaction_type,coalesce(ft.cost_center,'other'),ft.reference_type)='investment'),0),
  'capital_outflows', coalesce(sum(-least(ft.amount,0)) filter(where private.management_budget_spending_class(ft.transaction_type,coalesce(ft.cost_center,'other'),ft.reference_type)='capital'),0),
  'capital_inflows', coalesce(sum(greatest(ft.amount,0)) filter(where private.management_budget_spending_class(ft.transaction_type,coalesce(ft.cost_center,'other'),ft.reference_type)='capital'),0),
  'financial_income', coalesce(sum(greatest(ft.amount,0)) filter(where private.management_budget_spending_class(ft.transaction_type,coalesce(ft.cost_center,'other'),ft.reference_type)='financial_income'),0)
 )
 from public.financial_transactions ft
 where ft.company_id=p_company_id
   and ft.created_at >= (p_week_start::timestamp at time zone 'Europe/Berlin')
   and ft.created_at < ((p_week_start+7)::timestamp at time zone 'Europe/Berlin')
   and private.management_transaction_department(ft.transaction_type,coalesce(ft.cost_center,'other'),ft.reference_type)='finance'
$$;
