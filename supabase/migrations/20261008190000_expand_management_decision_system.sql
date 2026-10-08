-- OpenCompany 0.10.279: full management decision engine
-- Decisions are data-driven, time-limited (max. 24h), consequential and can create follow-up situations.

alter table public.management_decisions
  add column if not exists template_key text,
  add column if not exists decision_level text not null default 'operational',
  add column if not exists severity text not null default 'normal',
  add column if not exists expires_at timestamptz,
  add column if not exists options jsonb not null default '[]'::jsonb,
  add column if not exists context jsonb not null default '{}'::jsonb,
  add column if not exists manager_advice jsonb not null default '[]'::jsonb,
  add column if not exists default_option_key text,
  add column if not exists chosen_option_key text,
  add column if not exists outcome jsonb,
  add column if not exists auto_resolved boolean not null default false,
  add column if not exists parent_decision_id uuid references public.management_decisions(id) on delete set null;

update public.management_decisions
set status='resolved',
    resolved_at=coalesce(resolved_at,now()),
    outcome=coalesce(outcome,jsonb_build_object('legacy_closed',true,'reason','Durch neues Entscheidungssystem ersetzt'))
where status in ('open','snoozed') and (options is null or jsonb_array_length(options)=0);

create table if not exists private.management_decision_templates(
  template_key text primary key,
  decision_level text not null check(decision_level in ('operational','tactical','strategic')),
  severity text not null check(severity in ('normal','important','critical')),
  title text not null,
  description text not null,
  conditions jsonb not null default '[]'::jsonb,
  context_keys text[] not null default '{}',
  options jsonb not null,
  manager_prompts jsonb not null default '{}'::jsonb,
  default_option_key text not null,
  cooldown_hours integer not null default 96 check(cooldown_hours>=0),
  expires_hours integer not null default 24 check(expires_hours between 1 and 24),
  weight numeric not null default 1 check(weight>0),
  trigger_enabled boolean not null default true,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.management_decision_effects(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  decision_id uuid references public.management_decisions(id) on delete set null,
  effect_key text not null,
  effect_value numeric not null,
  description text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check(ends_at>starts_at)
);

create index if not exists management_decision_effects_company_active_idx
on public.management_decision_effects(company_id,effect_key,ends_at);

create table if not exists public.management_profiles(
  company_id uuid primary key references public.companies(id) on delete cascade,
  reputation numeric not null default 50,
  risk_orientation numeric not null default 50,
  growth_orientation numeric not null default 50,
  people_orientation numeric not null default 50,
  discipline_orientation numeric not null default 50,
  cost_orientation numeric not null default 50,
  updated_at timestamptz not null default now()
);

create table if not exists private.management_decision_followups(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_decision_id uuid references public.management_decisions(id) on delete cascade,
  template_key text not null,
  due_at timestamptz not null,
  status text not null default 'pending' check(status in ('pending','created','cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists management_decision_followups_due_idx
on private.management_decision_followups(company_id,status,due_at);

alter table public.management_decision_effects enable row level security;
alter table public.management_profiles enable row level security;

revoke all on public.management_decision_effects from anon,authenticated;
revoke all on public.management_profiles from anon,authenticated;

create or replace function private.management_active_effect(p_company_id uuid,p_effect_key text)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  select greatest(-0.50,least(0.50,coalesce(sum(effect_value),0)))
  from public.management_decision_effects
  where company_id=p_company_id
    and effect_key=p_effect_key
    and starts_at<=now()
    and ends_at>now()
$$;

create or replace function private.management_decision_metrics(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_now timestamptz:=now();
  v_cur jsonb;
  v_prev jsonb;
  v_revenue numeric:=0;
  v_prev_revenue numeric:=0;
  v_cost numeric:=0;
  v_prev_cost numeric:=0;
  v_cost_change numeric:=0;
  v_profit numeric:=0;
  v_margin numeric:=0;
  v_cashflow numeric:=0;
  v_cash numeric:=0;
  v_value numeric:=0;
  v_debt numeric:=0;
  v_debt_pct numeric:=0;
  v_cash_ratio numeric:=0;
  v_capacity numeric:=0;
  v_total numeric:=0;
  v_storage_pct numeric:=0;
  v_cost7 numeric:=0;
  v_runway numeric:=999;
  v_prod_buildings integer:=0;
  v_prod_hours numeric:=0;
  v_prod_util numeric:=0;
  v_active_large integer:=0;
  v_large_due integer:=0;
  v_manager_count integer:=0;
  v_min_motivation numeric:=100;
  v_vacant integer:=6;
  v_week date:=private.management_week_start(v_now);
  v_production_budget numeric:=0;
  v_purchasing_budget numeric:=0;
  v_sales_budget numeric:=0;
  v_research_budget numeric:=0;
  v_logistics_budget numeric:=0;
  v_finance_budget numeric:=0;
  v_max_budget numeric:=0;
  v_top_revenue numeric:=0;
  v_total_revenue numeric:=0;
  v_top_share numeric:=0;
  v_old_value numeric:=0;
  v_value_growth numeric:=0;
begin
  v_cur:=private.management_period_metrics(p_company_id,v_now-interval '7 days',v_now);
  v_prev:=private.management_period_metrics(p_company_id,v_now-interval '14 days',v_now-interval '7 days');
  v_revenue:=coalesce((v_cur->>'revenue')::numeric,0);
  v_prev_revenue:=coalesce((v_prev->>'revenue')::numeric,0);
  v_profit:=coalesce((v_cur->>'operating_result')::numeric,0);
  v_margin:=case when v_revenue>0 then v_profit/v_revenue*100 else 0 end;
  v_cashflow:=coalesce((v_cur->>'cashflow')::numeric,0);

  select company_value,cash_balance into v_value,v_cash
  from public.companies where id=p_company_id;

  v_debt:=coalesce(private.bond_remaining_debt(p_company_id),0);
  v_debt_pct:=case when coalesce(v_value,0)>0 then v_debt/v_value*100 else 0 end;
  v_cash_ratio:=case when coalesce(v_value,0)>0 then greatest(0,v_cash)/v_value*100 else 0 end;

  v_capacity:=private.storage_capacity(p_company_id);
  v_total:=private.storage_total_quantity(p_company_id);
  v_storage_pct:=case when v_capacity>0 then v_total/v_capacity*100 else 0 end;

  select abs(coalesce(sum(amount),0)) into v_cost7
  from public.financial_transactions
  where company_id=p_company_id and amount<0
    and created_at>=v_now-interval '7 days'
    and transaction_type not in ('bond_investment','bond_repayment','construction');
  v_runway:=case when v_cost7>0 then greatest(0,v_cash)/(v_cost7/7.0) else 999 end;

  select abs(coalesce(sum(amount),0)) into v_cost
  from public.financial_transactions
  where company_id=p_company_id and amount<0
    and created_at>=v_now-interval '7 days'
    and transaction_type not in ('bond_investment','bond_repayment','construction');
  select abs(coalesce(sum(amount),0)) into v_prev_cost
  from public.financial_transactions
  where company_id=p_company_id and amount<0
    and created_at>=v_now-interval '14 days' and created_at<v_now-interval '7 days'
    and transaction_type not in ('bond_investment','bond_repayment','construction');
  v_cost_change:=case when v_prev_cost>0 then (v_cost-v_prev_cost)/v_prev_cost*100 else 0 end;

  select count(*) into v_prod_buildings
  from public.company_buildings cb
  join public.building_types bt on bt.id=cb.building_type_id
  where cb.company_id=p_company_id and cb.status='active' and bt.building_category='production';

  if v_prod_buildings>0 then
    select coalesce(sum(extract(epoch from (
      least(coalesce(completed_at,v_now),v_now)-greatest(started_at,v_now-interval '7 days')
    ))/3600.0),0)
    into v_prod_hours
    from public.production_jobs
    where company_id=p_company_id and started_at<v_now
      and coalesce(completed_at,finishes_at)>v_now-interval '7 days'
      and status<>'cancelled';
    v_prod_util:=least(100,v_prod_hours/(v_prod_buildings*168.0)*100);
  end if;

  select count(*) into v_active_large
  from public.large_customer_orders
  where awarded_company_id=p_company_id and status='awarded';

  select count(*) into v_large_due
  from public.large_customer_orders
  where awarded_company_id=p_company_id and status='awarded'
    and delivery_deadline is not null
    and delivery_deadline<=v_now+interval '24 hours';

  select count(*),coalesce(min(motivation),100)
  into v_manager_count,v_min_motivation
  from public.company_managers
  where company_id=p_company_id and status='active';
  v_vacant:=greatest(0,6-v_manager_count);

  select case when weekly_budget>0 then private.management_budget_used(company_id,department,v_week)/weekly_budget*100 else 0 end
    into v_production_budget from public.management_budgets where company_id=p_company_id and department='production';
  select case when weekly_budget>0 then private.management_budget_used(company_id,department,v_week)/weekly_budget*100 else 0 end
    into v_purchasing_budget from public.management_budgets where company_id=p_company_id and department='purchasing';
  select case when weekly_budget>0 then private.management_budget_used(company_id,department,v_week)/weekly_budget*100 else 0 end
    into v_sales_budget from public.management_budgets where company_id=p_company_id and department='sales';
  select case when weekly_budget>0 then private.management_budget_used(company_id,department,v_week)/weekly_budget*100 else 0 end
    into v_research_budget from public.management_budgets where company_id=p_company_id and department='research';
  select case when weekly_budget>0 then private.management_budget_used(company_id,department,v_week)/weekly_budget*100 else 0 end
    into v_logistics_budget from public.management_budgets where company_id=p_company_id and department='logistics';
  select case when weekly_budget>0 then private.management_budget_used(company_id,department,v_week)/weekly_budget*100 else 0 end
    into v_finance_budget from public.management_budgets where company_id=p_company_id and department='finance';

  v_production_budget:=coalesce(v_production_budget,0);
  v_purchasing_budget:=coalesce(v_purchasing_budget,0);
  v_sales_budget:=coalesce(v_sales_budget,0);
  v_research_budget:=coalesce(v_research_budget,0);
  v_logistics_budget:=coalesce(v_logistics_budget,0);
  v_finance_budget:=coalesce(v_finance_budget,0);
  v_max_budget:=greatest(v_production_budget,v_purchasing_budget,v_sales_budget,v_research_budget,v_logistics_budget,v_finance_budget);

  with revenue_by_center as (
    select coalesce(cost_center,'other') center,sum(greatest(amount,0)) revenue
    from public.financial_transactions
    where company_id=p_company_id
      and created_at>=v_now-interval '30 days'
      and amount>0
      and transaction_type not in ('bond_proceeds','bond_principal_income','founding_capital','manager_saving','management_decision_adjustment')
    group by coalesce(cost_center,'other')
  )
  select coalesce(max(revenue),0),coalesce(sum(revenue),0)
  into v_top_revenue,v_total_revenue
  from revenue_by_center;
  v_top_share:=case when v_total_revenue>0 then v_top_revenue/v_total_revenue*100 else 0 end;

  select company_value into v_old_value
  from public.company_valuation_history
  where company_id=p_company_id
    and valuation_date<=((v_now at time zone 'Europe/Berlin')::date-7)
  order by valuation_date desc limit 1;
  v_value_growth:=case when coalesce(v_old_value,0)>0 then (v_value-v_old_value)/v_old_value*100 else 0 end;

  return jsonb_build_object(
    'revenue',round(v_revenue,2),
    'revenue_change',case when v_prev_revenue<>0 then round((v_revenue-v_prev_revenue)/abs(v_prev_revenue)*100,1) else 0 end,
    'profit_margin',round(v_margin,1),
    'cashflow',round(v_cashflow,2),
    'cash_balance',round(v_cash,2),
    'company_value',round(v_value,2),
    'debt_amount',round(v_debt,2),
    'debt_pct',round(v_debt_pct,1),
    'cash_ratio',round(v_cash_ratio,1),
    'storage_pct',round(v_storage_pct,1),
    'cash_runway',round(v_runway,1),
    'prod_util',round(v_prod_util,1),
    'active_large_orders',v_active_large,
    'large_order_due_24h',v_large_due,
    'manager_count',v_manager_count,
    'min_manager_motivation',round(v_min_motivation,1),
    'vacant_manager_count',v_vacant,
    'cost_change',round(v_cost_change,1),
    'production_budget_util',round(v_production_budget,1),
    'purchasing_budget_util',round(v_purchasing_budget,1),
    'sales_budget_util',round(v_sales_budget,1),
    'research_budget_util',round(v_research_budget,1),
    'logistics_budget_util',round(v_logistics_budget,1),
    'finance_budget_util',round(v_finance_budget,1),
    'max_budget_util',round(v_max_budget,1),
    'top_revenue_share',round(v_top_share,1),
    'company_value_growth_7d',round(v_value_growth,1)
  );
end
$$;

create or replace function private.management_conditions_match(p_metrics jsonb,p_conditions jsonb)
returns boolean
language plpgsql
immutable
set search_path=''
as $$
declare
  c jsonb;
  v numeric;
  t numeric;
  lo numeric;
  hi numeric;
  op text;
begin
  if p_conditions is null or jsonb_array_length(p_conditions)=0 then return true; end if;
  for c in select value from jsonb_array_elements(p_conditions)
  loop
    v:=coalesce((p_metrics->>(c->>'metric'))::numeric,0);
    op:=coalesce(c->>'op','>=');
    t:=coalesce((c->>'value')::numeric,0);
    lo:=coalesce((c->>'min')::numeric,t);
    hi:=coalesce((c->>'max')::numeric,t);
    if op='>' and not (v>t) then return false; end if;
    if op='>=' and not (v>=t) then return false; end if;
    if op='<' and not (v<t) then return false; end if;
    if op='<=' and not (v<=t) then return false; end if;
    if op='=' and not (v=t) then return false; end if;
    if op='between' and not (v between lo and hi) then return false; end if;
  end loop;
  return true;
end
$$;

create or replace function private.management_role_label(p_role text)
returns text
language sql
immutable
set search_path=''
as $$
select case p_role
  when 'production' then 'Produktionsleitung'
  when 'purchasing' then 'Einkaufsleitung'
  when 'sales' then 'Vertriebsleitung'
  when 'finance' then 'Finanzleitung'
  when 'research' then 'Forschungsleitung'
  when 'logistics' then 'Logistikleitung'
  else p_role end
$$;

create or replace function private.create_management_decision(
  p_company_id uuid,
  p_template_key text,
  p_parent_decision_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  t private.management_decision_templates%rowtype;
  v_metrics jsonb;
  v_context jsonb:='{}'::jsonb;
  v_key text;
  v_advice jsonb:='[]'::jsonb;
  v_prompt record;
  v_manager public.company_managers%rowtype;
  v_score numeric;
  v_conf text;
  v_first jsonb;
  v_second jsonb;
  v_id uuid;
begin
  select * into t from private.management_decision_templates
  where template_key=p_template_key and enabled=true;
  if t.template_key is null then return null; end if;

  if exists(select 1 from public.management_decisions
            where company_id=p_company_id and template_key=p_template_key and status='open') then
    return null;
  end if;

  v_metrics:=private.management_decision_metrics(p_company_id);
  foreach v_key in array t.context_keys loop
    v_context:=v_context||jsonb_build_object(v_key,v_metrics->v_key);
  end loop;

  for v_prompt in select key,value from jsonb_each_text(t.manager_prompts)
  loop
    select * into v_manager
    from public.company_managers
    where company_id=p_company_id and role=v_prompt.key and status='active'
    limit 1;
    if v_manager.id is not null then
      v_score:=(v_manager.competence+v_manager.experience+v_manager.motivation)::numeric/3.0;
      v_conf:=case when v_score>=75 then 'hoch' when v_score>=50 then 'mittel' else 'niedrig' end;
      v_advice:=v_advice||jsonb_build_array(jsonb_build_object(
        'role',v_prompt.key,
        'role_label',private.management_role_label(v_prompt.key),
        'manager_name',v_manager.manager_name,
        'score',round(v_score,1),
        'confidence',v_conf,
        'opinion',v_prompt.value
      ));
    end if;
  end loop;

  v_first:=t.options->0;
  v_second:=t.options->1;

  insert into public.management_decisions(
    company_id,decision_type,title,description,
    primary_label,primary_view,secondary_label,secondary_view,
    template_key,decision_level,severity,expires_at,options,context,manager_advice,
    default_option_key,parent_decision_id,status
  ) values(
    p_company_id,t.template_key,t.title,t.description,
    coalesce(v_first->>'label','Entscheiden'),coalesce(v_first->>'view','management'),
    v_second->>'label',v_second->>'view',
    t.template_key,t.decision_level,t.severity,
    now()+(least(24,t.expires_hours)*interval '1 hour'),
    t.options,v_context,v_advice,t.default_option_key,p_parent_decision_id,'open'
  ) returning id into v_id;

  perform private.management_send_pa(
    p_company_id,
    'Boss, eine neue Managemententscheidung wartet: „'||t.title||'“. Die Entscheidung muss spätestens innerhalb von '
    ||least(24,t.expires_hours)||' Stunden getroffen werden.'
  );

  return v_id;
end
$$;

create or replace function private.apply_management_option(
  p_company_id uuid,
  p_decision_id uuid,
  p_option_key text,
  p_auto boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  d public.management_decisions%rowtype;
  o jsonb;
  e jsonb;
  m jsonb;
  v_value numeric:=0;
  v_company_value numeric:=0;
  v_cash_delta numeric:=0;
  v_min numeric:=0;
  v_max numeric:=0;
  v_rate numeric:=0;
  v_hours numeric:=0;
  v_temp jsonb:='[]'::jsonb;
  v_risk numeric:=0;
  v_rep numeric:=50;
  v_effective_risk numeric:=0;
  v_followup text;
  v_followup_due numeric:=24;
  v_risk_triggered boolean:=false;
  v_style jsonb;
  v_outcome jsonb;
begin
  select * into d from public.management_decisions
  where id=p_decision_id and company_id=p_company_id
  for update;
  if d.id is null or d.status<>'open' then raise exception 'Entscheidung nicht gefunden oder bereits abgeschlossen'; end if;

  select value into o from jsonb_array_elements(d.options)
  where value->>'key'=p_option_key
  limit 1;
  if o is null then raise exception 'Ungültige Entscheidungsoption'; end if;

  insert into public.management_profiles(company_id) values(p_company_id)
  on conflict(company_id) do nothing;

  select company_value into v_company_value from public.companies where id=p_company_id for update;

  v_min:=coalesce((o#>>'{effects,cash_min}')::numeric,0);
  v_max:=coalesce((o#>>'{effects,cash_max}')::numeric,v_min);
  if v_max<v_min then v_max:=v_min; end if;
  v_cash_delta:=case when v_max=v_min then v_min else v_min+random()*(v_max-v_min) end;
  v_cash_delta:=v_cash_delta + coalesce((o#>>'{effects,cash_pct_value}')::numeric,0)*coalesce(v_company_value,0);
  v_cash_delta:=round(v_cash_delta,2);

  if v_cash_delta<>0 then
    update public.companies set cash_balance=cash_balance+v_cash_delta,updated_at=now() where id=p_company_id;
    insert into public.financial_transactions(
      company_id,transaction_type,amount,description,reference_type,reference_id,cost_center
    ) values(
      p_company_id,'management_decision',v_cash_delta,
      'Managemententscheidung: '||d.title||' – '||(o->>'label'),
      'management_decision',d.id,'management'
    );
  end if;

  for e in select value from jsonb_array_elements(coalesce(o#>'{effects,temporary}','[]'::jsonb))
  loop
    v_min:=coalesce((e->>'min')::numeric,0);
    v_max:=coalesce((e->>'max')::numeric,v_min);
    if v_max<v_min then v_max:=v_min; end if;
    v_rate:=case when v_max=v_min then v_min else v_min+random()*(v_max-v_min) end;
    v_rate:=round(v_rate,4);
    v_hours:=greatest(1,coalesce((e->>'hours')::numeric,24));
    insert into public.management_decision_effects(
      company_id,decision_id,effect_key,effect_value,description,ends_at
    ) values(
      p_company_id,d.id,e->>'key',v_rate,d.title||' – '||(o->>'label'),
      now()+(v_hours*interval '1 hour')
    );
    v_temp:=v_temp||jsonb_build_array(jsonb_build_object('key',e->>'key','value',v_rate,'hours',v_hours));
  end loop;

  for m in select value from jsonb_array_elements(coalesce(o#>'{effects,motivation}','[]'::jsonb))
  loop
    update public.company_managers
    set motivation=least(100,greatest(0,motivation+coalesce((m->>'delta')::int,0))),
        updated_at=now()
    where company_id=p_company_id and status='active'
      and ((m->>'role')='all' or role=(m->>'role'));
  end loop;

  v_style:=coalesce(o->'style','{}'::jsonb);
  update public.management_profiles
  set reputation=least(100,greatest(0,reputation+coalesce((o#>>'{effects,reputation_delta}')::numeric,0))),
      risk_orientation=least(100,greatest(0,risk_orientation+coalesce((v_style->>'risk')::numeric,0))),
      growth_orientation=least(100,greatest(0,growth_orientation+coalesce((v_style->>'growth')::numeric,0))),
      people_orientation=least(100,greatest(0,people_orientation+coalesce((v_style->>'people')::numeric,0))),
      discipline_orientation=least(100,greatest(0,discipline_orientation+coalesce((v_style->>'discipline')::numeric,0))),
      cost_orientation=least(100,greatest(0,cost_orientation+coalesce((v_style->>'cost')::numeric,0))),
      updated_at=now()
  where company_id=p_company_id;

  v_risk:=greatest(0,least(1,coalesce((o->>'risk_chance')::numeric,0)));
  v_followup:=nullif(o->>'followup','');
  v_followup_due:=greatest(1,coalesce((o->>'delay_hours')::numeric,24));
  select reputation into v_rep from public.management_profiles where company_id=p_company_id;
  v_effective_risk:=least(1,v_risk*greatest(0.65,1.20-coalesce(v_rep,50)/200.0));

  if v_followup is not null and random()<v_effective_risk then
    v_risk_triggered:=true;
    insert into private.management_decision_followups(company_id,parent_decision_id,template_key,due_at)
    values(p_company_id,d.id,v_followup,now()+(v_followup_due*interval '1 hour'));
  end if;

  v_outcome:=jsonb_build_object(
    'option_key',p_option_key,
    'option_label',o->>'label',
    'summary',o->>'summary',
    'impact_text',o->>'impact',
    'cash_delta',v_cash_delta,
    'temporary_effects',v_temp,
    'risk_triggered',v_risk_triggered,
    'resolved_at',now()
  );

  update public.management_decisions
  set status='resolved',resolved_at=now(),chosen_option_key=p_option_key,
      outcome=v_outcome,auto_resolved=p_auto,snoozed_until=null
  where id=d.id;

  perform private.handle_insolvency_if_needed(p_company_id);
  return v_outcome;
end
$$;

create or replace function private.expire_management_decisions(p_company_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  d public.management_decisions%rowtype;
  v_key text;
  v_count integer:=0;
begin
  for d in
    select * from public.management_decisions
    where company_id=p_company_id and status='open' and expires_at is not null and expires_at<=now()
    order by expires_at
    for update skip locked
  loop
    v_key:=coalesce(d.default_option_key,(d.options->0->>'key'));
    perform private.apply_management_option(p_company_id,d.id,v_key,true);
    perform private.management_send_pa(
      p_company_id,
      'Boss, die Entscheidungsfrist für „'||d.title||'“ ist abgelaufen. Die Standardoption wurde automatisch umgesetzt.'
    );
    v_count:=v_count+1;
  end loop;
  return v_count;
end
$$;

create or replace function public.resolve_management_decision(
  p_company_id uuid,
  p_decision_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  d public.management_decisions%rowtype;
begin
  perform private.assert_company_owner(p_company_id);
  perform private.expire_management_decisions(p_company_id);

  select * into d from public.management_decisions
  where id=p_decision_id and company_id=p_company_id;
  if d.id is null or d.status<>'open' then
    raise exception 'Entscheidung nicht gefunden oder Frist bereits abgelaufen';
  end if;
  if d.expires_at is not null and d.expires_at<=now() then
    perform private.expire_management_decisions(p_company_id);
    raise exception 'Die Entscheidungsfrist ist abgelaufen';
  end if;

  perform private.apply_management_option(p_company_id,p_decision_id,p_action,false);
end
$$;

create or replace function private.refresh_management_decisions(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_metrics jsonb;
  v_open integer:=0;
  t private.management_decision_templates%rowtype;
  f private.management_decision_followups%rowtype;
  v_id uuid;
begin
  insert into public.management_profiles(company_id) values(p_company_id)
  on conflict(company_id) do nothing;

  perform private.expire_management_decisions(p_company_id);

  select count(*) into v_open from public.management_decisions
  where company_id=p_company_id and status='open';

  if v_open<2 then
    for f in
      select * from private.management_decision_followups
      where company_id=p_company_id and status='pending' and due_at<=now()
      order by due_at
      for update skip locked
    loop
      exit when v_open>=2;
      v_id:=private.create_management_decision(p_company_id,f.template_key,f.parent_decision_id);
      if v_id is not null then
        update private.management_decision_followups set status='created' where id=f.id;
        v_open:=v_open+1;
      end if;
    end loop;
  end if;

  if v_open>=2 then return; end if;

  v_metrics:=private.management_decision_metrics(p_company_id);

  select x.* into t
  from private.management_decision_templates x
  where x.enabled=true and x.trigger_enabled=true
    and private.management_conditions_match(v_metrics,x.conditions)
    and not exists(
      select 1 from public.management_decisions d
      where d.company_id=p_company_id and d.template_key=x.template_key
        and d.created_at>now()-(x.cooldown_hours*interval '1 hour')
    )
  order by (-ln(greatest(random(),0.000001))/greatest(x.weight,0.01))
  limit 1;

  if t.template_key is not null then
    perform private.create_management_decision(p_company_id,t.template_key,null);
  end if;
end
$$;

create or replace function private.manager_multiplier(p_company_id uuid,p_role text,p_perk text)
returns numeric
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_key text;
  v_decision numeric:=0;
begin
  v_key:=case
    when p_role='production' and p_perk='output' then 'production_output'
    when p_role='sales' and p_perk='sales_rate' then 'retail_rate'
    else null end;
  if v_key is not null then
    v_decision:=private.management_active_effect(p_company_id,v_key);
  end if;
  return greatest(0.25,(1+private.manager_effect(p_company_id,p_role,p_perk))*(1+v_decision));
end
$$;

create or replace function private.apply_management_decision_transaction_effects()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_key text;
  v_rate numeric:=0;
  v_adjust numeric:=0;
  v_center text:=coalesce(new.cost_center,private.management_cost_center(new.transaction_type,new.reference_type,new.description));
begin
  if new.transaction_type in ('management_decision','management_decision_adjustment','management_decision_patent_adjustment',
                              'manager_saving','manager_revenue_bonus','manager_patent_gain','manager_salary') then
    return new;
  end if;

  if new.amount<0 then
    v_key:=case
      when new.transaction_type='production'
        or (new.transaction_type='operating_cost' and new.reference_type='production_job') then 'production_cost'
      when new.transaction_type='market_buy' then 'purchase_cost'
      when new.transaction_type='market_fee' then 'market_fee'
      when new.transaction_type='building_maintenance' then 'maintenance_cost'
      when new.transaction_type='operating_cost' and new.reference_type='product' then 'research_cost'
      when new.transaction_type='freight_cost' then 'freight_cost'
      when new.transaction_type='storage_fee' then 'storage_cost'
      else null end;

    if v_key is not null then
      v_rate:=private.management_active_effect(new.company_id,v_key);
      v_adjust:=round(abs(new.amount)*(-v_rate),2);
    end if;
  elsif new.amount>0 and new.transaction_type='retail_sale' then
    v_key:='retail_revenue';
    v_rate:=private.management_active_effect(new.company_id,v_key);
    v_adjust:=round(new.amount*v_rate,2);
  elsif new.amount>0 and new.transaction_type='research_investment' then
    v_key:='patent_gain';
    v_rate:=private.management_active_effect(new.company_id,v_key);
    v_adjust:=round(new.amount*v_rate,2);
    if v_adjust<>0 then
      update public.companies
      set patent_value=greatest(0,coalesce(patent_value,0)+v_adjust),updated_at=now()
      where id=new.company_id;
      insert into public.financial_transactions(
        company_id,transaction_type,amount,description,reference_type,reference_id,cost_center
      ) values(
        new.company_id,'management_decision_patent_adjustment',v_adjust,
        'Entscheidungseffekt auf Patentwert','research_investment',new.reference_id,'research'
      );
    end if;
    return new;
  end if;

  if v_adjust<>0 then
    update public.companies
    set cash_balance=cash_balance+v_adjust,updated_at=now()
    where id=new.company_id;

    insert into public.financial_transactions(
      company_id,transaction_type,amount,description,reference_type,reference_id,cost_center
    ) values(
      new.company_id,'management_decision_adjustment',v_adjust,
      'Temporärer Managemententscheidungseffekt ('||v_key||')',
      new.transaction_type,new.reference_id,v_center
    );
  end if;

  return new;
end
$$;

drop trigger if exists trg_management_decision_transaction_effects on public.financial_transactions;
create trigger trg_management_decision_transaction_effects
after insert on public.financial_transactions
for each row execute function private.apply_management_decision_transaction_effects();

create or replace function public.get_management_decision_center(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile jsonb;
  v_history jsonb;
  v_effects jsonb;
begin
  perform private.assert_company_owner(p_company_id);
  perform private.process_management_company(p_company_id);

  insert into public.management_profiles(company_id) values(p_company_id)
  on conflict(company_id) do nothing;

  select to_jsonb(p) into v_profile
  from public.management_profiles p where p.company_id=p_company_id;

  select coalesce(jsonb_agg(to_jsonb(d) order by d.resolved_at desc),'[]'::jsonb)
  into v_history
  from (
    select * from public.management_decisions
    where company_id=p_company_id and status='resolved'
    order by resolved_at desc nulls last
    limit 25
  ) d;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'effect_key',e.effect_key,'effect_value',e.effect_value,
    'description',e.description,'starts_at',e.starts_at,'ends_at',e.ends_at
  ) order by e.ends_at),'[]'::jsonb)
  into v_effects
  from public.management_decision_effects e
  where e.company_id=p_company_id and e.starts_at<=now() and e.ends_at>now();

  return jsonb_build_object(
    'profile',coalesce(v_profile,'{}'::jsonb),
    'history',v_history,
    'effects',v_effects,
    'metrics',private.management_decision_metrics(p_company_id)
  );
end
$$;

grant execute on function public.get_management_decision_center(uuid) to authenticated;
grant execute on function public.resolve_management_decision(uuid,uuid,text) to authenticated;
