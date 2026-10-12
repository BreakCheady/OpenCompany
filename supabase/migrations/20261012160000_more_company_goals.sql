-- Extend the goal library without changing existing player goals.
alter table public.company_goals drop constraint if exists company_goals_goal_type_check;
alter table public.company_goals add constraint company_goals_goal_type_check
  check (goal_type in ('revenue','profit','company_value_growth','debt_max','storage_max','large_orders','research_patents','production_quantity','retail_revenue','market_revenue','cash_min','profit_margin','production_utilization','large_order_revenue','production_cost_max','contract_revenue','research_spend','market_buy_max','cashflow'));

do $patch$
declare f text;
begin
 select pg_get_functiondef('public.create_company_goal(uuid,text,numeric,text)'::regprocedure) into f;
 f:=replace(f,
   '''debt_max'',''storage_max'',''large_orders'',''research_patents'')',
   '''debt_max'',''storage_max'',''large_orders'',''research_patents'',''production_quantity'',''retail_revenue'',''market_revenue'',''cash_min'',''profit_margin'',''production_utilization'',''large_order_revenue'',''production_cost_max'',''contract_revenue'',''research_spend'',''market_buy_max'',''cashflow'')');
 execute f;
end $patch$;

do $patch$
declare f text;
begin
 select pg_get_functiondef('private.goal_current_value(public.company_goals)'::regprocedure) into f;
 f:=replace(f, '  elsif p_goal.goal_type=''company_value_growth'' then',
$insert$  elsif p_goal.goal_type='production_quantity' then
    select coalesce(sum(output_quantity),0) into v from public.production_jobs
    where company_id=p_goal.company_id and status='completed'
      and completed_at>=p_goal.starts_at and completed_at<least(now(),p_goal.ends_at);
  elsif p_goal.goal_type='retail_revenue' then
    select coalesce(sum(greatest(amount,0)),0) into v from public.financial_transactions
    where company_id=p_goal.company_id and transaction_type='retail_sale'
      and created_at>=p_goal.starts_at and created_at<least(now(),p_goal.ends_at);
  elsif p_goal.goal_type='market_revenue' then
    select coalesce(sum(case when transaction_type='market_sale' then greatest(amount,0)
      when transaction_type='market_fee' then abs(amount) else 0 end),0) into v
    from public.financial_transactions where company_id=p_goal.company_id
      and transaction_type in ('market_sale','market_fee')
      and created_at>=p_goal.starts_at and created_at<least(now(),p_goal.ends_at);
  elsif p_goal.goal_type='cash_min' then
    select cash_balance into v from public.companies where id=p_goal.company_id;
  elsif p_goal.goal_type='profit_margin' then
    select case when (m->>'revenue')::numeric>0
      then (m->>'operating_result')::numeric/(m->>'revenue')::numeric*100 else 0 end into v
    from (select private.management_period_metrics(p_goal.company_id,p_goal.starts_at,least(now(),p_goal.ends_at)) m) x;
  elsif p_goal.goal_type='production_utilization' then
    select least(100,coalesce(sum(extract(epoch from
      least(coalesce(j.completed_at,now()),least(now(),p_goal.ends_at))
        - greatest(j.started_at,p_goal.starts_at))/3600.0),0)
        /greatest(1,coalesce((select count(*) from public.company_buildings cb
          join public.building_types bt on bt.id=cb.building_type_id
          where cb.company_id=p_goal.company_id and cb.status='active'
          and bt.building_category='production'),0))
        /greatest(1,extract(epoch from (least(now(),p_goal.ends_at)-p_goal.starts_at))/3600.0)*100)
    into v from public.production_jobs j where j.company_id=p_goal.company_id
      and j.status<>'cancelled' and j.started_at<least(now(),p_goal.ends_at)
      and coalesce(j.completed_at,j.finishes_at)>p_goal.starts_at;
  elsif p_goal.goal_type='large_order_revenue' then
    select coalesce(sum(greatest(amount,0)),0) into v from public.financial_transactions
    where company_id=p_goal.company_id and transaction_type='large_customer_order'
      and created_at>=p_goal.starts_at and created_at<least(now(),p_goal.ends_at);
  elsif p_goal.goal_type='production_cost_max' then
    select abs(coalesce(sum(least(amount,0)),0)) into v from public.financial_transactions
    where company_id=p_goal.company_id and transaction_type='production'
      and created_at>=p_goal.starts_at and created_at<least(now(),p_goal.ends_at);
  elsif p_goal.goal_type='contract_revenue' then
    select coalesce(sum(greatest(amount,0)),0) into v from public.financial_transactions
    where company_id=p_goal.company_id and transaction_type='contract_sale'
      and created_at>=p_goal.starts_at and created_at<least(now(),p_goal.ends_at);
  elsif p_goal.goal_type='research_spend' then
    select abs(coalesce(sum(least(amount,0)),0)) into v from public.financial_transactions
    where company_id=p_goal.company_id and cost_center='research'
      and created_at>=p_goal.starts_at and created_at<least(now(),p_goal.ends_at);
  elsif p_goal.goal_type='market_buy_max' then
    select abs(coalesce(sum(least(amount,0)),0)) into v from public.financial_transactions
    where company_id=p_goal.company_id and transaction_type='market_buy'
      and created_at>=p_goal.starts_at and created_at<least(now(),p_goal.ends_at);
  elsif p_goal.goal_type='cashflow' then
    select coalesce((private.management_period_metrics(p_goal.company_id,p_goal.starts_at,least(now(),p_goal.ends_at))->>'cashflow')::numeric,0) into v;
  elsif p_goal.goal_type='company_value_growth' then$insert$);
 execute f;
end $patch$;
