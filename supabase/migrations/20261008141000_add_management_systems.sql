-- OpenCompany 0.10.271: management systems
-- Budgets, managers, goals, management KPIs, weekly reports, monthly closings,
-- data-driven management decisions and cost/profit centers.

create table if not exists public.management_budgets (
  company_id uuid not null references public.companies(id) on delete cascade,
  department text not null check (department in ('production','purchasing','sales','research','logistics','finance')),
  weekly_budget numeric(18,2) not null default 0 check (weekly_budget >= 0),
  updated_at timestamptz not null default now(),
  primary key(company_id,department)
);

create table if not exists public.company_managers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('production','purchasing','sales','finance','research','logistics')),
  manager_name text not null,
  source text not null check (source in ('internal','agency','elite')),
  age integer not null check (age between 18 and 90),
  competence integer not null check (competence between 0 and 100),
  experience integer not null check (experience between 0 and 100),
  motivation integer not null check (motivation between 0 and 100),
  weekly_salary numeric(18,2) not null check (weekly_salary >= 0),
  status text not null default 'active' check (status in ('active','training','retired')),
  hired_at timestamptz not null default now(),
  training_started_at timestamptz,
  training_ends_at timestamptz,
  last_daily_progress_date date,
  age_day_counter integer not null default 0,
  retired_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists company_managers_one_active_role
  on public.company_managers(company_id,role)
  where status in ('active','training');

create table if not exists public.manager_recruitments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('production','purchasing','sales','finance','research','logistics')),
  source text not null check (source in ('internal','agency','elite')),
  status text not null default 'searching' check (status in ('searching','ready','accepted','rejected')),
  started_at timestamptz not null default now(),
  completes_at timestamptz not null,
  candidate_name text,
  candidate_age integer,
  candidate_competence integer,
  candidate_experience integer,
  candidate_motivation integer,
  candidate_salary numeric(18,2),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists manager_recruitments_one_open_role
  on public.manager_recruitments(company_id,role)
  where status in ('searching','ready');

create table if not exists public.company_goals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  goal_type text not null check (goal_type in ('revenue','profit','company_value_growth','debt_max','storage_max','large_orders','research_patents')),
  target_value numeric(18,4) not null check (target_value >= 0),
  period_type text not null check (period_type in ('week','month','30d')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  baseline_value numeric(18,4) not null default 0,
  status text not null default 'active' check (status in ('active','completed','expired','cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.management_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  decision_type text not null check (decision_type in ('storage_pressure','high_debt','production_bottleneck','liquidity_risk')),
  title text not null,
  description text not null,
  primary_label text not null,
  primary_view text not null,
  secondary_label text,
  secondary_view text,
  status text not null default 'open' check (status in ('open','resolved','snoozed')),
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists management_decisions_company_status_idx
  on public.management_decisions(company_id,status,created_at desc);

create table if not exists public.management_monthly_closings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  month_start date not null,
  metrics jsonb not null default '{}'::jsonb,
  grades jsonb not null default '{}'::jsonb,
  overall_grade text not null,
  created_at timestamptz not null default now(),
  unique(company_id,month_start)
);

create table if not exists private.management_budget_alerts (
  company_id uuid not null references public.companies(id) on delete cascade,
  week_start date not null,
  department text not null,
  created_at timestamptz not null default now(),
  primary key(company_id,week_start,department)
);

create table if not exists private.management_weekly_report_runs (
  company_id uuid not null references public.companies(id) on delete cascade,
  week_start date not null,
  created_at timestamptz not null default now(),
  primary key(company_id,week_start)
);

create table if not exists private.management_salary_runs (
  company_id uuid not null references public.companies(id) on delete cascade,
  week_start date not null,
  created_at timestamptz not null default now(),
  primary key(company_id,week_start)
);

alter table public.financial_transactions
  add column if not exists cost_center text;

-- RLS: management data is readable only by the owning authenticated user.
alter table public.management_budgets enable row level security;
alter table public.company_managers enable row level security;
alter table public.manager_recruitments enable row level security;
alter table public.company_goals enable row level security;
alter table public.management_decisions enable row level security;
alter table public.management_monthly_closings enable row level security;

drop policy if exists management_budgets_read_own on public.management_budgets;
create policy management_budgets_read_own on public.management_budgets
for select to authenticated using (
  exists(select 1 from public.companies c where c.id=management_budgets.company_id and c.owner_user_id=(select auth.uid()))
);
drop policy if exists company_managers_read_own on public.company_managers;
create policy company_managers_read_own on public.company_managers
for select to authenticated using (
  exists(select 1 from public.companies c where c.id=company_managers.company_id and c.owner_user_id=(select auth.uid()))
);
drop policy if exists manager_recruitments_read_own on public.manager_recruitments;
create policy manager_recruitments_read_own on public.manager_recruitments
for select to authenticated using (
  exists(select 1 from public.companies c where c.id=manager_recruitments.company_id and c.owner_user_id=(select auth.uid()))
);
drop policy if exists company_goals_read_own on public.company_goals;
create policy company_goals_read_own on public.company_goals
for select to authenticated using (
  exists(select 1 from public.companies c where c.id=company_goals.company_id and c.owner_user_id=(select auth.uid()))
);
drop policy if exists management_decisions_read_own on public.management_decisions;
create policy management_decisions_read_own on public.management_decisions
for select to authenticated using (
  exists(select 1 from public.companies c where c.id=management_decisions.company_id and c.owner_user_id=(select auth.uid()))
);
drop policy if exists management_monthly_closings_read_own on public.management_monthly_closings;
create policy management_monthly_closings_read_own on public.management_monthly_closings
for select to authenticated using (
  exists(select 1 from public.companies c where c.id=management_monthly_closings.company_id and c.owner_user_id=(select auth.uid()))
);

grant select on public.management_budgets,public.company_managers,public.manager_recruitments,
  public.company_goals,public.management_decisions,public.management_monthly_closings to authenticated;

create or replace function private.management_cost_center(
  p_type text,
  p_reference_type text default null,
  p_description text default null
)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when p_type in ('market_sale','market_buy','market_fee') then 'market'
    when p_type in ('retail_sale','retail_cancel_fee','retail_cancel_refund','manager_revenue_bonus') then 'retail'
    when p_type in ('contract_sale','contract_buy','contract_penalty','contract_penalty_income') then 'contracts'
    when p_type='large_customer_order' then 'large_orders'
    when p_type in ('production','production_refund') then 'production'
    when p_type='operating_cost' and p_reference_type='production_job' then 'production'
    when p_type in ('research','research_investment','manager_patent_gain') then 'research'
    when p_type='operating_cost' and p_reference_type='product' then 'research'
    when p_type in ('construction','building_refund','building_maintenance') then 'buildings'
    when p_type in ('storage_fee','storage_overflow_fee','storage_forced_auction','freight_cost') then 'storage_logistics'
    when p_type like 'bond_%' or p_type='founding_capital' then 'financing'
    when p_type='manager_salary' then 'management'
    else 'other'
  end
$$;

update public.financial_transactions
set cost_center=private.management_cost_center(transaction_type,reference_type,description)
where cost_center is null;

create or replace function private.set_financial_transaction_cost_center()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.cost_center is null then
    new.cost_center:=private.management_cost_center(new.transaction_type,new.reference_type,new.description);
  end if;
  return new;
end
$$;

drop trigger if exists trg_set_financial_transaction_cost_center on public.financial_transactions;
create trigger trg_set_financial_transaction_cost_center
before insert or update of transaction_type,reference_type,description,cost_center
on public.financial_transactions
for each row execute function private.set_financial_transaction_cost_center();

create or replace function private.manager_effect(
  p_company_id uuid,
  p_role text,
  p_perk text
)
returns numeric
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_avg numeric;
  v_cap numeric:=0;
begin
  select (competence+experience+motivation)::numeric/3.0
  into v_avg
  from public.company_managers
  where company_id=p_company_id and role=p_role and status='active'
  limit 1;

  if v_avg is null then return 0; end if;

  v_cap:=case
    when p_role='production' and p_perk in ('cost','output') then 0.10
    when p_role='purchasing' and p_perk='purchase_cost' then 0.10
    when p_role='purchasing' and p_perk='market_fee' then 0.05
    when p_role='sales' and p_perk='revenue' then 0.10
    when p_role='sales' and p_perk='sales_rate' then 0.05
    when p_role='finance' and p_perk in ('maintenance','personnel') then 0.10
    when p_role='research' and p_perk in ('patent_gain','research_cost') then 0.10
    when p_role='logistics' and p_perk in ('freight','storage') then 0.10
    else 0
  end;

  return round(least(v_cap,greatest(0,v_avg/100.0*v_cap)),4);
end
$$;

create or replace function private.manager_multiplier(
  p_company_id uuid,
  p_role text,
  p_perk text
)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  select 1+private.manager_effect(p_company_id,p_role,p_perk)
$$;

create or replace function private.management_transaction_department(
  p_type text,
  p_cost_center text,
  p_reference_type text default null
)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when p_cost_center='production' then 'production'
    when p_cost_center='research' then 'research'
    when p_cost_center='storage_logistics' then 'logistics'
    when p_cost_center='retail' then 'sales'
    when p_cost_center='large_orders' then 'sales'
    when p_cost_center='contracts' and p_type in ('contract_sale','contract_penalty_income') then 'sales'
    when p_cost_center='contracts' then 'purchasing'
    when p_cost_center='market' and p_type='market_sale' then 'sales'
    when p_cost_center='market' then 'purchasing'
    when p_cost_center in ('buildings','financing','management') then 'finance'
    else 'finance'
  end
$$;

create or replace function private.management_week_start(p_at timestamptz default now())
returns date
language sql
stable
set search_path=''
as $$
  select date_trunc('week',p_at at time zone 'Europe/Berlin')::date
$$;

create or replace function private.management_budget_used(
  p_company_id uuid,
  p_department text,
  p_week_start date default private.management_week_start(now())
)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  select greatest(0,-coalesce(sum(
    case
      when ft.amount<0 then ft.amount
      when ft.transaction_type='manager_saving' then ft.amount
      else 0
    end
  ),0))
  from public.financial_transactions ft
  where ft.company_id=p_company_id
    and ft.created_at >= (p_week_start::timestamp at time zone 'Europe/Berlin')
    and ft.created_at < ((p_week_start+7)::timestamp at time zone 'Europe/Berlin')
    and private.management_transaction_department(ft.transaction_type,coalesce(ft.cost_center,'other'),ft.reference_type)=p_department
$$;

create or replace function private.management_send_pa(p_company_id uuid,p_body text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.chat_messages(sender_company_id,recipient_company_id,body)
  select '00000000-0000-4000-8000-000000000001'::uuid,c.id,p_body
  from public.companies c
  where c.id=p_company_id and c.company_type='player' and c.owner_user_id is not null;
end
$$;

create or replace function private.apply_manager_transaction_effects()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rate numeric:=0;
  v_bonus numeric:=0;
  v_label text;
  v_center text:=coalesce(new.cost_center,private.management_cost_center(new.transaction_type,new.reference_type,new.description));
  v_department text;
  v_budget numeric;
  v_used numeric;
  v_week date:=private.management_week_start(new.created_at);
  v_dept_label text;
begin
  if new.transaction_type not in ('manager_saving','manager_revenue_bonus','manager_patent_gain','manager_salary') then
    if new.amount<0 then
      if new.transaction_type='production'
         or (new.transaction_type='operating_cost' and new.reference_type='production_job') then
        v_rate:=private.manager_effect(new.company_id,'production','cost');
        v_label:='Produktionsleitung';
      elsif new.transaction_type='market_buy' then
        v_rate:=private.manager_effect(new.company_id,'purchasing','purchase_cost');
        v_label:='Einkaufsleitung';
      elsif new.transaction_type='market_fee' then
        v_rate:=private.manager_effect(new.company_id,'purchasing','market_fee');
        v_label:='Einkaufsleitung';
      elsif new.transaction_type='building_maintenance'
        and coalesce(new.description,'') not ilike '%Lager%' then
        v_rate:=private.manager_effect(new.company_id,'finance','maintenance');
        v_label:='Verwaltungs- und Finanzleitung';
      elsif new.transaction_type='operating_cost' and new.reference_type='product' then
        v_rate:=private.manager_effect(new.company_id,'research','research_cost');
        v_label:='Forschungsleitung';
      elsif new.transaction_type='freight_cost' then
        v_rate:=private.manager_effect(new.company_id,'logistics','freight');
        v_label:='Logistikleitung';
      elsif new.transaction_type='storage_fee' then
        v_rate:=private.manager_effect(new.company_id,'logistics','storage');
        v_label:='Logistikleitung';
      end if;

      if v_rate>0 then
        v_bonus:=round(abs(new.amount)*v_rate,2);
        if v_bonus>0 then
          update public.companies
          set cash_balance=cash_balance+v_bonus,updated_at=now()
          where id=new.company_id;

          insert into public.financial_transactions(
            company_id,transaction_type,amount,description,reference_type,reference_id,cost_center
          ) values(
            new.company_id,'manager_saving',v_bonus,
            'Management-Einsparung ('||v_label||')',
            new.transaction_type,new.reference_id,v_center
          );
        end if;
      end if;
    elsif new.transaction_type='retail_sale' and new.amount>0 then
      v_rate:=private.manager_effect(new.company_id,'sales','revenue');
      v_bonus:=round(new.amount*v_rate,2);
      if v_bonus>0 then
        update public.companies set cash_balance=cash_balance+v_bonus,updated_at=now() where id=new.company_id;
        insert into public.financial_transactions(
          company_id,transaction_type,amount,description,reference_type,reference_id,cost_center
        ) values(
          new.company_id,'manager_revenue_bonus',v_bonus,
          'Mehrerlös durch Vertriebsleitung','retail_sale',new.reference_id,'retail'
        );
      end if;
    elsif new.transaction_type='research_investment' and new.amount>0 then
      v_rate:=private.manager_effect(new.company_id,'research','patent_gain');
      v_bonus:=round(new.amount*v_rate,2);
      if v_bonus>0 then
        update public.companies
        set patent_value=round(coalesce(patent_value,0)+v_bonus,2),updated_at=now()
        where id=new.company_id;
        insert into public.financial_transactions(
          company_id,transaction_type,amount,description,reference_type,reference_id,cost_center
        ) values(
          new.company_id,'manager_patent_gain',v_bonus,
          'Zusätzlicher Patentwert durch Forschungsleitung','research_investment',new.reference_id,'research'
        );
      end if;
    end if;
  end if;

  if new.amount<0 then
    v_department:=private.management_transaction_department(new.transaction_type,v_center,new.reference_type);
    select weekly_budget into v_budget
    from public.management_budgets
    where company_id=new.company_id and department=v_department;

    if coalesce(v_budget,0)>0 then
      v_used:=private.management_budget_used(new.company_id,v_department,v_week);
      if v_used>v_budget then
        insert into private.management_budget_alerts(company_id,week_start,department)
        values(new.company_id,v_week,v_department)
        on conflict do nothing;
        if found then
          v_dept_label:=case v_department
            when 'production' then 'Produktionsbudget'
            when 'purchasing' then 'Einkaufsbudget'
            when 'sales' then 'Vertriebsbudget'
            when 'research' then 'Forschungsbudget'
            when 'logistics' then 'Logistikbudget'
            else 'Finanzbudget'
          end;
          perform private.management_send_pa(
            new.company_id,
            'Boss, das '||v_dept_label||' für diese Woche wurde überschritten. Aktuell liegen wir '
            ||replace(trim(to_char(round(v_used-v_budget,2),'FM999999999999990.00')),'.',',')
            ||' $ über Plan.'
          );
        end if;
      end if;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_apply_manager_transaction_effects on public.financial_transactions;
create trigger trg_apply_manager_transaction_effects
after insert on public.financial_transactions
for each row execute function private.apply_manager_transaction_effects();

-- Production and retail throughput manager effects are applied before quantities are fixed.
do $patch$
declare
  v_def text;
begin
  select pg_get_functiondef('private.start_production_on_building_v2_impl(uuid,uuid,uuid,numeric,text,jsonb)'::regprocedure)
  into v_def;
  if position('manager_multiplier(p_company_id,''production'',''output'')' in v_def)=0 then
    v_def:=replace(
      v_def,
      '*private.specialization_factor(p_company_id,''production_output'',v_product.category));',
      '*private.specialization_factor(p_company_id,''production_output'',v_product.category)*private.manager_multiplier(p_company_id,''production'',''output''));'
    );
    execute v_def;
  end if;

  select pg_get_functiondef('private.start_retail_sale_on_building_v2_impl(uuid,uuid,uuid,integer,numeric,numeric,text,jsonb)'::regprocedure)
  into v_def;
  if position('manager_multiplier(p_company_id,''sales'',''sales_rate'')' in v_def)=0 then
    v_def:=replace(
      v_def,
      '*private.specialization_factor(p_company_id,''retail_rate'',v_product.category))',
      '*private.specialization_factor(p_company_id,''retail_rate'',v_product.category)*private.manager_multiplier(p_company_id,''sales'',''sales_rate''))'
    );
    execute v_def;
  end if;
end
$patch$;

create or replace function private.complete_due_manager_states(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.manager_recruitments%rowtype;
  m public.company_managers%rowtype;
  v_first text[];
  v_last text[];
  v_name text;
  v_comp integer;
  v_exp integer;
  v_mot integer;
  v_age integer;
  v_salary numeric;
begin
  v_first:=array['Anna','Laura','Sophie','Marie','Lena','Julia','Lea','Nina','Johanna','Clara','Max','Felix','Lukas','Jonas','Leon','Paul','David','Simon','Daniel','Moritz'];
  v_last:=array['Weber','Schmidt','Meyer','Fischer','Wagner','Becker','Hoffmann','Schäfer','Koch','Bauer','Richter','Klein','Wolf','Schröder','Neumann','Schwarz','Zimmermann','Braun','Krüger','Hartmann'];

  for r in
    select * from public.manager_recruitments
    where company_id=p_company_id and status='searching' and completes_at<=now()
    for update
  loop
    v_name:=v_first[1+floor(random()*array_length(v_first,1))::int]||' '||
            v_last[1+floor(random()*array_length(v_last,1))::int];

    if r.source='internal' then
      v_age:=20+floor(random()*6)::int;
      v_comp:=20+floor(random()*21)::int;
      v_exp:=10+floor(random()*21)::int;
      v_mot:=60+floor(random()*26)::int;
      v_salary:=2500+250*floor(random()*9);
    elsif r.source='agency' then
      v_age:=24+floor(random()*5)::int;
      v_comp:=45+floor(random()*21)::int;
      v_exp:=35+floor(random()*21)::int;
      v_mot:=60+floor(random()*31)::int;
      v_salary:=5000+250*floor(random()*13);
    else
      v_age:=26+floor(random()*4)::int;
      v_comp:=70+floor(random()*21)::int;
      v_exp:=60+floor(random()*26)::int;
      v_mot:=70+floor(random()*26)::int;
      v_salary:=9000+500*floor(random()*11);
    end if;

    update public.manager_recruitments
    set status='ready',
        candidate_name=v_name,
        candidate_age=v_age,
        candidate_competence=v_comp,
        candidate_experience=v_exp,
        candidate_motivation=v_mot,
        candidate_salary=v_salary,
        updated_at=now()
    where id=r.id;
  end loop;

  for m in
    select * from public.company_managers
    where company_id=p_company_id and status='training' and training_ends_at<=now()
    for update
  loop
    update public.company_managers
    set competence=least(100,competence+case when random()<0.40 then 1+floor(random()*2)::int else 0 end),
        status='active',
        training_started_at=null,
        training_ends_at=null,
        updated_at=now()
    where id=m.id;
  end loop;
end
$$;

create or replace function public.set_management_budget(
  p_company_id uuid,
  p_department text,
  p_weekly_budget numeric
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.assert_company_owner(p_company_id);
  if p_department not in ('production','purchasing','sales','research','logistics','finance') then
    raise exception 'Ungültige Abteilung';
  end if;
  if p_weekly_budget is null or p_weekly_budget<0 then raise exception 'Budget darf nicht negativ sein'; end if;

  insert into public.management_budgets(company_id,department,weekly_budget,updated_at)
  values(p_company_id,p_department,round(p_weekly_budget,2),now())
  on conflict(company_id,department) do update
  set weekly_budget=excluded.weekly_budget,updated_at=now();
end
$$;

create or replace function public.start_manager_recruitment(
  p_company_id uuid,
  p_role text,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_hours integer;
begin
  perform private.assert_company_owner(p_company_id);
  perform private.complete_due_manager_states(p_company_id);

  if p_role not in ('production','purchasing','sales','finance','research','logistics') then
    raise exception 'Ungültige Managerposition';
  end if;
  if p_source not in ('internal','agency','elite') then raise exception 'Ungültige Rekrutierungsart'; end if;
  if exists(select 1 from public.company_managers where company_id=p_company_id and role=p_role and status in ('active','training')) then
    raise exception 'Diese Position ist bereits besetzt';
  end if;
  if exists(select 1 from public.manager_recruitments where company_id=p_company_id and role=p_role and status in ('searching','ready')) then
    raise exception 'Für diese Position läuft bereits eine Rekrutierung';
  end if;

  v_hours:=case p_source when 'internal' then 6 when 'agency' then 8 else 10 end;
  insert into public.manager_recruitments(company_id,role,source,completes_at)
  values(p_company_id,p_role,p_source,now()+make_interval(hours=>v_hours))
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.accept_manager_candidate(p_company_id uuid,p_recruitment_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.manager_recruitments%rowtype;
  v_id uuid;
begin
  perform private.assert_company_owner(p_company_id);
  perform private.complete_due_manager_states(p_company_id);

  select * into r from public.manager_recruitments
  where id=p_recruitment_id and company_id=p_company_id
  for update;

  if r.id is null or r.status<>'ready' then raise exception 'Kein fertiger Kandidat verfügbar'; end if;
  if exists(select 1 from public.company_managers where company_id=p_company_id and role=r.role and status in ('active','training')) then
    raise exception 'Diese Position ist bereits besetzt';
  end if;

  insert into public.company_managers(
    company_id,role,manager_name,source,age,competence,experience,motivation,weekly_salary
  ) values(
    p_company_id,r.role,r.candidate_name,r.source,r.candidate_age,
    r.candidate_competence,r.candidate_experience,r.candidate_motivation,r.candidate_salary
  ) returning id into v_id;

  update public.manager_recruitments set status='accepted',resolved_at=now(),updated_at=now() where id=r.id;
  return v_id;
end
$$;

create or replace function public.reject_manager_candidate(p_company_id uuid,p_recruitment_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.assert_company_owner(p_company_id);
  perform private.complete_due_manager_states(p_company_id);
  update public.manager_recruitments
  set status='rejected',resolved_at=now(),updated_at=now()
  where id=p_recruitment_id and company_id=p_company_id and status='ready';
  if not found then raise exception 'Kein fertiger Kandidat verfügbar'; end if;
end
$$;

create or replace function public.start_manager_training(p_company_id uuid,p_manager_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare
  v_end timestamptz:=now()+interval '8 hours';
begin
  perform private.assert_company_owner(p_company_id);
  perform private.complete_due_manager_states(p_company_id);

  update public.company_managers
  set status='training',training_started_at=now(),training_ends_at=v_end,updated_at=now()
  where id=p_manager_id and company_id=p_company_id and status='active';
  if not found then raise exception 'Manager ist nicht für ein Training verfügbar'; end if;
  return v_end;
end
$$;

create or replace function private.goal_current_value(p_goal public.company_goals)
returns numeric
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v numeric:=0;
begin
  if p_goal.goal_type='revenue' then
    select coalesce(sum(case
      when transaction_type='market_sale' then amount
      when transaction_type='market_fee' then abs(amount)
      when transaction_type in ('retail_sale','manager_revenue_bonus','contract_sale','large_customer_order','storage_forced_auction','production_refund','retail_cancel_refund') then greatest(amount,0)
      else 0 end),0)
    into v
    from public.financial_transactions
    where company_id=p_goal.company_id and created_at>=p_goal.starts_at and created_at<p_goal.ends_at;
  elsif p_goal.goal_type='profit' then
    select coalesce(sum(case
      when transaction_type in ('bond_investment','bond_proceeds','bond_repayment','bond_principal_income','founding_capital') then 0
      when transaction_type='market_fee' then amount
      else amount end),0)
    into v
    from public.financial_transactions
    where company_id=p_goal.company_id and created_at>=p_goal.starts_at and created_at<p_goal.ends_at;
  elsif p_goal.goal_type='company_value_growth' then
    select case when p_goal.baseline_value>0
      then ((company_value-p_goal.baseline_value)/p_goal.baseline_value)*100 else 0 end
    into v from public.companies where id=p_goal.company_id;
  elsif p_goal.goal_type='debt_max' then
    v:=coalesce(private.bond_remaining_debt(p_goal.company_id),0);
  elsif p_goal.goal_type='storage_max' then
    v:=case when private.storage_capacity(p_goal.company_id)>0
      then private.storage_total_quantity(p_goal.company_id)/private.storage_capacity(p_goal.company_id)*100
      else 0 end;
  elsif p_goal.goal_type='large_orders' then
    select count(*)::numeric into v from public.large_customer_orders
    where awarded_company_id=p_goal.company_id and status='completed'
      and completed_at>=p_goal.starts_at and completed_at<p_goal.ends_at;
  elsif p_goal.goal_type='research_patents' then
    select count(*)::numeric into v
    from public.financial_transactions
    where company_id=p_goal.company_id and transaction_type='research_investment'
      and created_at>=p_goal.starts_at and created_at<p_goal.ends_at
      and description ilike '%Qualität Q%';
  end if;
  return coalesce(v,0);
end
$$;

create or replace function private.goal_is_complete(p_goal public.company_goals,p_current numeric)
returns boolean
language sql
immutable
set search_path=''
as $$
  select case
    when p_goal.goal_type in ('debt_max','storage_max') then p_current<=p_goal.target_value
    else p_current>=p_goal.target_value
  end
$$;

create or replace function private.evaluate_company_goals(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  g public.company_goals%rowtype;
  v_current numeric;
  v_label text;
begin
  for g in
    select * from public.company_goals
    where company_id=p_company_id and status='active'
    for update
  loop
    v_current:=private.goal_current_value(g);
    if private.goal_is_complete(g,v_current) then
      update public.company_goals set status='completed',completed_at=now(),updated_at=now() where id=g.id;
      v_label:=case g.goal_type
        when 'revenue' then 'Umsatzziel'
        when 'profit' then 'Gewinnziel'
        when 'company_value_growth' then 'Unternehmenswert-Ziel'
        when 'debt_max' then 'Verschuldungsziel'
        when 'storage_max' then 'Lagerziel'
        when 'large_orders' then 'Großauftragsziel'
        else 'Forschungsziel'
      end;
      perform private.management_send_pa(p_company_id,'Boss, das '||v_label||' wurde erreicht.');
    elsif now()>=g.ends_at then
      update public.company_goals set status='expired',updated_at=now() where id=g.id;
    end if;
  end loop;
end
$$;

create or replace function public.create_company_goal(
  p_company_id uuid,
  p_goal_type text,
  p_target_value numeric,
  p_period_type text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_baseline numeric:=0;
  v_local timestamp:=now() at time zone 'Europe/Berlin';
begin
  perform private.assert_company_owner(p_company_id);
  perform private.evaluate_company_goals(p_company_id);

  if p_goal_type not in ('revenue','profit','company_value_growth','debt_max','storage_max','large_orders','research_patents') then
    raise exception 'Ungültiges Unternehmensziel';
  end if;
  if p_period_type not in ('week','month','30d') then raise exception 'Ungültiger Zielzeitraum'; end if;
  if p_target_value is null or p_target_value<0 then raise exception 'Zielwert darf nicht negativ sein'; end if;
  if (select count(*) from public.company_goals where company_id=p_company_id and status='active')>=3 then
    raise exception 'Es können maximal 3 Unternehmensziele gleichzeitig aktiv sein';
  end if;

  if p_period_type='week' then
    v_start:=(date_trunc('week',v_local) at time zone 'Europe/Berlin');
    v_end:=((date_trunc('week',v_local)+interval '7 days') at time zone 'Europe/Berlin');
  elsif p_period_type='month' then
    v_start:=(date_trunc('month',v_local) at time zone 'Europe/Berlin');
    v_end:=((date_trunc('month',v_local)+interval '1 month') at time zone 'Europe/Berlin');
  else
    v_start:=now();
    v_end:=now()+interval '30 days';
  end if;

  if p_goal_type='company_value_growth' then
    select company_value into v_baseline from public.companies where id=p_company_id;
  end if;

  insert into public.company_goals(company_id,goal_type,target_value,period_type,starts_at,ends_at,baseline_value)
  values(p_company_id,p_goal_type,p_target_value,p_period_type,v_start,v_end,coalesce(v_baseline,0))
  returning id into v_id;

  perform private.evaluate_company_goals(p_company_id);
  return v_id;
end
$$;

create or replace function public.cancel_company_goal(p_company_id uuid,p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.assert_company_owner(p_company_id);
  update public.company_goals set status='cancelled',updated_at=now()
  where id=p_goal_id and company_id=p_company_id and status='active';
  if not found then raise exception 'Aktives Ziel nicht gefunden'; end if;
end
$$;

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
  v_expenses numeric:=0;
  v_interest numeric:=0;
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
      'retail_sale','manager_revenue_bonus','contract_sale','large_customer_order',
      'storage_forced_auction','production_refund','retail_cancel_refund',
      'research_investment','manager_patent_gain','bond_interest_income','bond_interest_state'
    ) and amount>0 then amount else 0 end),0),
    abs(coalesce(sum(case when transaction_type in ('market_buy','contract_buy') and amount<0 then amount else 0 end),0)),
    abs(coalesce(sum(case
      when amount<0 and transaction_type not in ('market_buy','contract_buy','construction','bond_investment','bond_repayment')
      then amount else 0 end),0)),
    abs(coalesce(sum(case when transaction_type='bond_interest_paid' and amount<0 then amount else 0 end),0)),
    coalesce(sum(case
      when transaction_type in ('bond_investment','bond_proceeds','bond_repayment','bond_principal_income','founding_capital') then 0
      when transaction_type='market_sale' then amount+0
      when transaction_type='market_fee' then 0
      else amount end),0)
  into v_revenue,v_procurement,v_expenses,v_interest,v_profit
  from public.financial_transactions
  where company_id=p_company_id and created_at>=p_start and created_at<p_end;

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
    'operating_costs',round(v_expenses,2),
    'interest_expense',round(v_interest,2),
    'profit',round(v_profit,2),
    'cashflow',round(v_cashflow,2),
    'large_orders_completed',v_large_orders
  );
end
$$;

create or replace function private.management_grade_from_score(p_score numeric)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when p_score<=1.20 then 'A'
    when p_score<=1.50 then 'A−'
    when p_score<=1.85 then 'B+'
    when p_score<=2.20 then 'B'
    when p_score<=2.55 then 'B−'
    when p_score<=2.90 then 'C+'
    when p_score<=3.30 then 'C'
    when p_score<=3.70 then 'C−'
    when p_score<=4.30 then 'D'
    else 'E'
  end
$$;

create or replace function private.create_monthly_closing(p_company_id uuid,p_month date)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_start timestamptz:=(p_month::timestamp at time zone 'Europe/Berlin');
  v_end timestamptz:=((p_month+interval '1 month')::timestamp at time zone 'Europe/Berlin');
  v_metrics jsonb;
  v_revenue numeric;
  v_profit numeric;
  v_margin numeric;
  v_start_value numeric;
  v_end_value numeric;
  v_growth numeric:=0;
  v_cash numeric;
  v_debt numeric;
  v_company_value numeric;
  v_debt_ratio numeric:=0;
  v_month_cost numeric;
  v_liquidity numeric:=0;
  v_budget_count integer:=0;
  v_budget_ok integer:=0;
  v_goal_count integer:=0;
  v_goal_ok integer:=0;
  s_profit numeric;
  s_liquidity numeric;
  s_growth numeric;
  s_debt numeric;
  s_budget numeric;
  s_goals numeric;
  v_avg numeric;
  v_grades jsonb;
begin
  if exists(select 1 from public.management_monthly_closings where company_id=p_company_id and month_start=p_month) then
    return;
  end if;

  v_metrics:=private.management_period_metrics(p_company_id,v_start,v_end);
  v_revenue:=coalesce((v_metrics->>'revenue')::numeric,0);
  v_profit:=coalesce((v_metrics->>'profit')::numeric,0);
  v_margin:=case when v_revenue>0 then v_profit/v_revenue*100 else 0 end;

  select company_value into v_start_value
  from public.company_valuation_history
  where company_id=p_company_id and valuation_date>=p_month
  order by valuation_date asc limit 1;
  select company_value into v_end_value
  from public.company_valuation_history
  where company_id=p_company_id and valuation_date<(p_month+interval '1 month')::date
  order by valuation_date desc limit 1;
  if coalesce(v_start_value,0)>0 and v_end_value is not null then
    v_growth:=(v_end_value-v_start_value)/v_start_value*100;
  end if;

  select cash_balance,company_value into v_cash,v_company_value from public.companies where id=p_company_id;
  v_debt:=coalesce(private.bond_remaining_debt(p_company_id),0);
  v_debt_ratio:=case when coalesce(v_company_value,0)>0 then v_debt/v_company_value*100 else 0 end;
  v_month_cost:=coalesce((v_metrics->>'operating_costs')::numeric,0)+coalesce((v_metrics->>'procurement')::numeric,0);
  v_liquidity:=case when v_month_cost>0 then greatest(0,v_cash)/(v_month_cost/30.0) else 30 end;

  select count(*),
         count(*) filter(where private.management_budget_used(company_id,department,date_trunc('week',(v_end-interval '1 day') at time zone 'Europe/Berlin')::date)<=weekly_budget)
  into v_budget_count,v_budget_ok
  from public.management_budgets
  where company_id=p_company_id and weekly_budget>0;

  select count(*),count(*) filter(where status='completed')
  into v_goal_count,v_goal_ok
  from public.company_goals
  where company_id=p_company_id and created_at<v_end and ends_at>=v_start;

  s_profit:=case when v_margin>=20 then 1 when v_margin>=10 then 2 when v_margin>=0 then 3 when v_margin>=-10 then 4 else 5 end;
  s_liquidity:=case when v_liquidity>=30 then 1 when v_liquidity>=14 then 2 when v_liquidity>=7 then 3 when v_liquidity>=3 then 4 else 5 end;
  s_growth:=case when v_growth>=10 then 1 when v_growth>=3 then 2 when v_growth>=0 then 3 when v_growth>=-5 then 4 else 5 end;
  s_debt:=case when v_debt_ratio<=10 then 1 when v_debt_ratio<=25 then 2 when v_debt_ratio<=40 then 3 when v_debt_ratio<=60 then 4 else 5 end;
  s_budget:=case when v_budget_count=0 then 3 when v_budget_ok::numeric/v_budget_count>=1 then 1 when v_budget_ok::numeric/v_budget_count>=0.8 then 2 when v_budget_ok::numeric/v_budget_count>=0.6 then 3 when v_budget_ok::numeric/v_budget_count>=0.4 then 4 else 5 end;
  s_goals:=case when v_goal_count=0 then 3 when v_goal_ok::numeric/v_goal_count>=1 then 1 when v_goal_ok::numeric/v_goal_count>=0.67 then 2 when v_goal_ok::numeric/v_goal_count>=0.34 then 3 when v_goal_ok>0 then 4 else 5 end;

  v_avg:=(s_profit+s_liquidity+s_growth+s_debt+s_budget+s_goals)/6.0;
  v_grades:=jsonb_build_object(
    'profitability',private.management_grade_from_score(s_profit),
    'liquidity',private.management_grade_from_score(s_liquidity),
    'growth',private.management_grade_from_score(s_growth),
    'debt',private.management_grade_from_score(s_debt),
    'budget',private.management_grade_from_score(s_budget),
    'goals',private.management_grade_from_score(s_goals)
  );
  v_metrics:=v_metrics||jsonb_build_object(
    'company_value_start',coalesce(v_start_value,0),
    'company_value_end',coalesce(v_end_value,v_company_value,0),
    'company_value_change_percent',round(v_growth,2),
    'profit_margin',round(v_margin,2)
  );

  insert into public.management_monthly_closings(company_id,month_start,metrics,grades,overall_grade)
  values(p_company_id,p_month,v_metrics,v_grades,private.management_grade_from_score(v_avg))
  on conflict(company_id,month_start) do nothing;
end
$$;

create or replace function private.refresh_management_decisions(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_capacity numeric:=private.storage_capacity(p_company_id);
  v_total numeric:=private.storage_total_quantity(p_company_id);
  v_storage_pct numeric:=0;
  v_debt numeric:=coalesce(private.bond_remaining_debt(p_company_id),0);
  v_value numeric:=0;
  v_debt_pct numeric:=0;
  v_cash numeric:=0;
  v_cost7 numeric:=0;
  v_runway numeric:=999;
  v_prod_buildings integer:=0;
  v_prod_hours numeric:=0;
  v_prod_util numeric:=0;
begin
  update public.management_decisions
  set status='open'
  where company_id=p_company_id and status='snoozed' and snoozed_until<=now();

  v_storage_pct:=case when v_capacity>0 then v_total/v_capacity*100 else 0 end;
  select company_value,cash_balance into v_value,v_cash from public.companies where id=p_company_id;
  v_debt_pct:=case when coalesce(v_value,0)>0 then v_debt/v_value*100 else 0 end;

  select abs(coalesce(sum(amount),0)) into v_cost7
  from public.financial_transactions
  where company_id=p_company_id and amount<0 and created_at>=now()-interval '7 days'
    and transaction_type not in ('bond_investment','bond_repayment','construction');
  v_runway:=case when v_cost7>0 then greatest(0,v_cash)/(v_cost7/7.0) else 999 end;

  select count(*) into v_prod_buildings
  from public.company_buildings cb
  join public.building_types bt on bt.id=cb.building_type_id
  where cb.company_id=p_company_id and cb.status='active' and bt.building_category='production';

  if v_prod_buildings>0 then
    select coalesce(sum(extract(epoch from (
      least(coalesce(completed_at,now()),now())-greatest(started_at,now()-interval '7 days')
    ))/3600.0),0)
    into v_prod_hours
    from public.production_jobs
    where company_id=p_company_id and started_at<now() and coalesce(completed_at,finishes_at)>now()-interval '7 days'
      and status<>'cancelled';
    v_prod_util:=least(100,v_prod_hours/(v_prod_buildings*168.0)*100);
  end if;

  if v_storage_pct>90 and not exists(
    select 1 from public.management_decisions
    where company_id=p_company_id and decision_type='storage_pressure'
      and (status in ('open','snoozed') or created_at>now()-interval '3 days')
  ) then
    insert into public.management_decisions(
      company_id,decision_type,title,description,primary_label,primary_view,secondary_label,secondary_view
    ) values(
      p_company_id,'storage_pressure','Hohe Lagerauslastung',
      'Deine Lagerauslastung liegt aktuell bei '||round(v_storage_pct,1)||' %. Prüfe Kapazität und Bestände, bevor weitere Lagerkosten entstehen.',
      'Lager erweitern','production','Bestände reduzieren','market'
    );
  end if;

  if v_debt_pct>48 and not exists(
    select 1 from public.management_decisions
    where company_id=p_company_id and decision_type='high_debt'
      and (status in ('open','snoozed') or created_at>now()-interval '3 days')
  ) then
    insert into public.management_decisions(
      company_id,decision_type,title,description,primary_label,primary_view,secondary_label,secondary_view
    ) values(
      p_company_id,'high_debt','Hohe Verschuldung',
      'Deine Schulden entsprechen aktuell '||round(v_debt_pct,1)||' % des Unternehmenswerts.',
      'Finanzierung prüfen','finance','Tilgungen planen','finance'
    );
  end if;

  if v_prod_util>97 and not exists(
    select 1 from public.management_decisions
    where company_id=p_company_id and decision_type='production_bottleneck'
      and (status in ('open','snoozed') or created_at>now()-interval '3 days')
  ) then
    insert into public.management_decisions(
      company_id,decision_type,title,description,primary_label,primary_view,secondary_label,secondary_view
    ) values(
      p_company_id,'production_bottleneck','Produktionsengpass',
      'Deine Produktionsgebäude waren in den letzten sieben Tagen zu rund '||round(v_prod_util,1)||' % ausgelastet.',
      'Gebäude prüfen','production','Produktion prüfen','production'
    );
  end if;

  if v_runway<3 and not exists(
    select 1 from public.management_decisions
    where company_id=p_company_id and decision_type='liquidity_risk'
      and (status in ('open','snoozed') or created_at>now()-interval '3 days')
  ) then
    insert into public.management_decisions(
      company_id,decision_type,title,description,primary_label,primary_view,secondary_label,secondary_view
    ) values(
      p_company_id,'liquidity_risk','Liquiditätsproblem',
      'Die liquiden Mittel reichen bei deinem Kostenstand der letzten sieben Tage nur noch für rund '||round(v_runway,1)||' Tage.',
      'Finanzen prüfen','finance','Bestände verkaufen','market'
    );
  end if;
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
begin
  perform private.assert_company_owner(p_company_id);
  if p_action='observe' then
    update public.management_decisions
    set status='snoozed',snoozed_until=now()+interval '3 days'
    where id=p_decision_id and company_id=p_company_id and status='open';
  else
    update public.management_decisions
    set status='resolved',resolved_at=now()
    where id=p_decision_id and company_id=p_company_id and status='open';
  end if;
  if not found then raise exception 'Entscheidung nicht gefunden'; end if;
end
$$;

create or replace function private.process_management_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.company_managers%rowtype;
  v_local_date date:=(now() at time zone 'Europe/Berlin')::date;
  v_retire_chance numeric;
begin
  perform private.complete_due_manager_states(p_company_id);

  for m in
    select * from public.company_managers
    where company_id=p_company_id and status in ('active','training')
      and coalesce(last_daily_progress_date,date '1900-01-01')<v_local_date
    for update
  loop
    update public.company_managers
    set last_daily_progress_date=v_local_date,
        age_day_counter=age_day_counter+1,
        updated_at=now()
    where id=m.id;

    if m.status='active' and random()<0.35 then
      update public.company_managers
      set experience=least(100,experience+1+floor(random()*2)::int),
          motivation=least(100,greatest(0,motivation+
            case when random()<0.5 then -1 else 1 end*(1+floor(random()*2)::int))),
          competence=least(100,greatest(0,competence+
            case when random()<0.35 then case when random()<0.5 then -1 else 1 end*(1+floor(random()*2)::int) else 0 end)),
          updated_at=now()
      where id=m.id;
    end if;

    if (m.age_day_counter+1)>=2 then
      update public.company_managers set age=age+1,age_day_counter=0,updated_at=now() where id=m.id;
      m.age:=m.age+1;
    end if;

    v_retire_chance:=case
      when m.age>=67 then 0.70
      when m.age=66 then 0.60
      when m.age=65 then 0.40
      when m.age in (63,64) then 0.20
      else 0
    end;
    if v_retire_chance>0 and random()<v_retire_chance then
      update public.company_managers
      set status='retired',retired_at=now(),training_started_at=null,training_ends_at=null,updated_at=now()
      where id=m.id;
      perform private.management_send_pa(
        p_company_id,
        'Boss, '||m.manager_name||' ist mit '||m.age||' Jahren in den Ruhestand gegangen. Die Position ist ab sofort neu zu besetzen.'
      );
    end if;
  end loop;

  perform private.evaluate_company_goals(p_company_id);
  perform private.refresh_management_decisions(p_company_id);
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
  insert into private.management_salary_runs(company_id,week_start)
  values(p_company_id,v_week)
  on conflict do nothing;
  if not found then return; end if;

  select coalesce(sum(weekly_salary),0) into v_gross
  from public.company_managers
  where company_id=p_company_id and status in ('active','training');

  if v_gross<=0 then return; end if;
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

create or replace function private.create_weekly_management_report(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_week date:=private.management_week_start(now());
  v_cur jsonb;
  v_prev jsonb;
  v_revenue numeric;
  v_prev_revenue numeric;
  v_change numeric:=0;
  v_profit numeric;
  v_value_now numeric;
  v_value_prev numeric;
  v_value_change numeric:=0;
  v_storage numeric:=0;
  v_large integer:=0;
  v_top_income text:='–';
  v_top_cost text:='–';
  v_note text:='';
  v_storage_cost numeric:=0;
  v_storage_prev numeric:=0;
  v_prod_cost numeric:=0;
  v_prod_prev numeric:=0;
  v_body text;
begin
  insert into private.management_weekly_report_runs(company_id,week_start)
  values(p_company_id,v_week)
  on conflict do nothing;
  if not found then return; end if;

  v_cur:=private.management_period_metrics(p_company_id,now()-interval '7 days',now());
  v_prev:=private.management_period_metrics(p_company_id,now()-interval '14 days',now()-interval '7 days');
  v_revenue:=coalesce((v_cur->>'revenue')::numeric,0);
  v_prev_revenue:=coalesce((v_prev->>'revenue')::numeric,0);
  v_profit:=coalesce((v_cur->>'profit')::numeric,0);
  v_large:=coalesce((v_cur->>'large_orders_completed')::integer,0);
  v_change:=case when v_prev_revenue<>0 then (v_revenue-v_prev_revenue)/abs(v_prev_revenue)*100 else 0 end;
  v_storage:=case when private.storage_capacity(p_company_id)>0
    then private.storage_total_quantity(p_company_id)/private.storage_capacity(p_company_id)*100 else 0 end;

  select company_value into v_value_now from public.companies where id=p_company_id;
  select company_value into v_value_prev
  from public.company_valuation_history
  where company_id=p_company_id and valuation_date<=((now() at time zone 'Europe/Berlin')::date-7)
  order by valuation_date desc limit 1;
  v_value_change:=case when coalesce(v_value_prev,0)>0 then (v_value_now-v_value_prev)/v_value_prev*100 else 0 end;

  select cost_center into v_top_income
  from public.financial_transactions
  where company_id=p_company_id and created_at>=now()-interval '7 days' and amount>0
    and transaction_type not in ('bond_proceeds','bond_principal_income','founding_capital','manager_saving')
  group by cost_center order by sum(amount) desc limit 1;

  select cost_center into v_top_cost
  from public.financial_transactions
  where company_id=p_company_id and created_at>=now()-interval '7 days' and amount<0
    and transaction_type not in ('bond_investment','bond_repayment')
  group by cost_center order by sum(abs(amount)) desc limit 1;

  select abs(coalesce(sum(amount),0)) into v_storage_cost
  from public.financial_transactions where company_id=p_company_id and created_at>=now()-interval '7 days'
    and transaction_type='storage_fee';
  select abs(coalesce(sum(amount),0)) into v_storage_prev
  from public.financial_transactions where company_id=p_company_id
    and created_at>=now()-interval '14 days' and created_at<now()-interval '7 days'
    and transaction_type='storage_fee';
  select abs(coalesce(sum(amount),0)) into v_prod_cost
  from public.financial_transactions where company_id=p_company_id and created_at>=now()-interval '7 days'
    and cost_center='production' and amount<0;
  select abs(coalesce(sum(amount),0)) into v_prod_prev
  from public.financial_transactions where company_id=p_company_id
    and created_at>=now()-interval '14 days' and created_at<now()-interval '7 days'
    and cost_center='production' and amount<0;

  if v_storage_prev>0 and v_storage_cost>v_storage_prev*1.20 then
    v_note:='Auffällig: Die Lagerkosten sind gegenüber der Vorwoche um '
      ||round((v_storage_cost-v_storage_prev)/v_storage_prev*100,1)||' % gestiegen.';
  elsif v_prod_prev>0 and v_prev_revenue>0
    and (v_prod_cost-v_prod_prev)/v_prod_prev > (v_revenue-v_prev_revenue)/abs(v_prev_revenue) then
    v_note:='Auffällig: Die Produktionskosten sind diese Woche stärker gestiegen als der Umsatz.';
  end if;

  v_body:='Boss, hier ist der Wochenbericht.'||E'\n\n'
    ||'Umsatz: '||replace(trim(to_char(round(v_revenue,2),'FM999999999999990.00')),'.',',')||' $'||E'\n'
    ||'Vorwoche: '||replace(trim(to_char(round(v_prev_revenue,2),'FM999999999999990.00')),'.',',')||' $'||E'\n'
    ||'Veränderung: '||case when v_change>=0 then '+' else '' end||round(v_change,1)||' %'||E'\n'
    ||'Betriebsergebnis: '||replace(trim(to_char(round(v_profit,2),'FM999999999999990.00')),'.',',')||' $'||E'\n'
    ||'Größte Einnahmequelle: '||coalesce(v_top_income,'–')||E'\n'
    ||'Größter Kostenblock: '||coalesce(v_top_cost,'–')||E'\n'
    ||'Unternehmenswert: '||case when v_value_change>=0 then '+' else '' end||round(v_value_change,1)||' %'||E'\n'
    ||'Lagerauslastung: '||round(v_storage,1)||' %'||E'\n'
    ||v_large||' Großaufträge wurden erfolgreich abgeschlossen.'
    ||case when v_note<>'' then E'\n\n'||v_note else '' end;

  perform private.management_send_pa(p_company_id,v_body);
end
$$;

create or replace function private.run_management_cycle_if_due()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  c record;
  v_local timestamp:=now() at time zone 'Europe/Berlin';
  v_month date;
  v_count integer:=0;
begin
  for c in
    select id from public.companies
    where company_type='player' and status='active' and owner_user_id is not null
  loop
    perform private.process_management_company(c.id);
    perform private.run_management_weekly_salary(c.id);

    if extract(dow from v_local)=0 and v_local::time>=time '20:00' then
      perform private.create_weekly_management_report(c.id);
    end if;

    if extract(day from v_local)=1 then
      v_month:=(date_trunc('month',v_local)-interval '1 month')::date;
      perform private.create_monthly_closing(c.id,v_month);
    end if;

    v_count:=v_count+1;
  end loop;
  return v_count;
end
$$;

create or replace function public.get_management_overview(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_local timestamp:=now() at time zone 'Europe/Berlin';
  v_week_start date:=date_trunc('week',v_local)::date;
  v_metrics jsonb;
  v_prev jsonb;
  v_revenue numeric:=0;
  v_prev_revenue numeric:=0;
  v_profit numeric:=0;
  v_margin numeric:=0;
  v_cashflow numeric:=0;
  v_debt numeric:=0;
  v_debt_ratio numeric:=0;
  v_storage numeric:=0;
  v_prod_buildings integer:=0;
  v_prod_hours numeric:=0;
  v_prod_util numeric:=0;
  v_active_large integer:=0;
  v_budgets jsonb;
  v_managers jsonb;
  v_recruitments jsonb;
  v_goals jsonb;
  v_decisions jsonb;
  v_closings jsonb;
  v_centers jsonb;
begin
  perform private.assert_company_owner(p_company_id);
  perform private.process_management_company(p_company_id);

  insert into public.management_budgets(company_id,department,weekly_budget)
  select p_company_id,d,0
  from unnest(array['production','purchasing','sales','research','logistics','finance']) d
  on conflict do nothing;

  v_metrics:=private.management_period_metrics(p_company_id,now()-interval '7 days',now());
  v_prev:=private.management_period_metrics(p_company_id,now()-interval '14 days',now()-interval '7 days');
  v_revenue:=coalesce((v_metrics->>'revenue')::numeric,0);
  v_prev_revenue:=coalesce((v_prev->>'revenue')::numeric,0);
  v_profit:=coalesce((v_metrics->>'profit')::numeric,0);
  v_margin:=case when v_revenue>0 then v_profit/v_revenue*100 else 0 end;
  v_cashflow:=coalesce((v_metrics->>'cashflow')::numeric,0);
  v_debt:=coalesce(private.bond_remaining_debt(p_company_id),0);

  select case when company_value>0 then v_debt/company_value*100 else 0 end
  into v_debt_ratio from public.companies where id=p_company_id;

  v_storage:=case when private.storage_capacity(p_company_id)>0
    then private.storage_total_quantity(p_company_id)/private.storage_capacity(p_company_id)*100 else 0 end;

  select count(*) into v_prod_buildings
  from public.company_buildings cb join public.building_types bt on bt.id=cb.building_type_id
  where cb.company_id=p_company_id and cb.status='active' and bt.building_category='production';

  if v_prod_buildings>0 then
    select coalesce(sum(extract(epoch from (
      least(coalesce(completed_at,now()),now())-greatest(started_at,now()-interval '7 days')
    ))/3600.0),0)
    into v_prod_hours
    from public.production_jobs
    where company_id=p_company_id and started_at<now() and coalesce(completed_at,finishes_at)>now()-interval '7 days'
      and status<>'cancelled';
    v_prod_util:=least(100,v_prod_hours/(v_prod_buildings*168.0)*100);
  end if;

  select count(*) into v_active_large
  from public.large_customer_orders
  where awarded_company_id=p_company_id and status='awarded';

  select coalesce(jsonb_agg(jsonb_build_object(
    'department',b.department,
    'weekly_budget',b.weekly_budget,
    'used',private.management_budget_used(b.company_id,b.department,v_week_start),
    'remaining',b.weekly_budget-private.management_budget_used(b.company_id,b.department,v_week_start),
    'utilization',case when b.weekly_budget>0 then round(private.management_budget_used(b.company_id,b.department,v_week_start)/b.weekly_budget*100,1) else 0 end
  ) order by array_position(array['production','purchasing','sales','research','logistics','finance'],b.department)),'[]'::jsonb)
  into v_budgets
  from public.management_budgets b where b.company_id=p_company_id;

  select coalesce(jsonb_agg(to_jsonb(m) order by array_position(array['production','purchasing','sales','finance','research','logistics'],m.role)),'[]'::jsonb)
  into v_managers
  from public.company_managers m where m.company_id=p_company_id and m.status in ('active','training');

  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc),'[]'::jsonb)
  into v_recruitments
  from public.manager_recruitments r where r.company_id=p_company_id and r.status in ('searching','ready');

  select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object(
    'current_value',private.goal_current_value(g),
    'progress_percent',case
      when g.goal_type in ('debt_max','storage_max') then
        case when private.goal_current_value(g)<=g.target_value then 100
             when private.goal_current_value(g)>0 then least(100,round(g.target_value/private.goal_current_value(g)*100,1)) else 100 end
      when g.target_value>0 then least(100,round(private.goal_current_value(g)/g.target_value*100,1))
      else 100 end,
    'remaining',case
      when g.goal_type in ('debt_max','storage_max') then greatest(0,private.goal_current_value(g)-g.target_value)
      else greatest(0,g.target_value-private.goal_current_value(g)) end
  ) order by g.created_at desc),'[]'::jsonb)
  into v_goals
  from public.company_goals g
  where g.company_id=p_company_id and g.status in ('active','completed')
    and (g.status='active' or g.completed_at>now()-interval '7 days');

  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc),'[]'::jsonb)
  into v_decisions
  from public.management_decisions d
  where d.company_id=p_company_id and d.status='open';

  select coalesce(jsonb_agg(to_jsonb(mc) order by mc.month_start desc),'[]'::jsonb)
  into v_closings
  from (
    select * from public.management_monthly_closings
    where company_id=p_company_id
    order by month_start desc limit 12
  ) mc;

  select coalesce(jsonb_agg(jsonb_build_object(
    'cost_center',x.cost_center,
    'income',round(x.income,2),
    'costs',round(x.costs,2),
    'result',round(x.income-x.costs,2),
    'center_type',case when x.cost_center in ('market','retail','contracts','large_orders') then 'profit' else 'cost' end
  ) order by x.cost_center),'[]'::jsonb)
  into v_centers
  from (
    select coalesce(cost_center,'other') cost_center,
      sum(case when amount>0 then amount else 0 end) income,
      sum(case when amount<0 then abs(amount) else 0 end) costs
    from public.financial_transactions
    where company_id=p_company_id
      and created_at >= (date_trunc('month',v_local) at time zone 'Europe/Berlin')
      and transaction_type not in ('bond_proceeds','bond_investment','bond_repayment','bond_principal_income','founding_capital')
    group by coalesce(cost_center,'other')
  ) x;

  return jsonb_build_object(
    'metrics',jsonb_build_object(
      'revenue',round(v_revenue,2),
      'revenue_change_percent',case when v_prev_revenue<>0 then round((v_revenue-v_prev_revenue)/abs(v_prev_revenue)*100,1) else 0 end,
      'operating_result',round(v_profit,2),
      'profit_margin',round(v_margin,1),
      'cashflow',round(v_cashflow,2),
      'debt_ratio',round(v_debt_ratio,1),
      'storage_utilization',round(v_storage,1),
      'production_utilization',round(v_prod_util,1),
      'active_large_orders',v_active_large
    ),
    'budgets',v_budgets,
    'managers',v_managers,
    'recruitments',v_recruitments,
    'goals',v_goals,
    'decisions',v_decisions,
    'monthly_closings',v_closings,
    'cost_centers',v_centers
  );
end
$$;

grant execute on function public.set_management_budget(uuid,text,numeric) to authenticated;
grant execute on function public.start_manager_recruitment(uuid,text,text) to authenticated;
grant execute on function public.accept_manager_candidate(uuid,uuid) to authenticated;
grant execute on function public.reject_manager_candidate(uuid,uuid) to authenticated;
grant execute on function public.start_manager_training(uuid,uuid) to authenticated;
grant execute on function public.create_company_goal(uuid,text,numeric,text) to authenticated;
grant execute on function public.cancel_company_goal(uuid,uuid) to authenticated;
grant execute on function public.resolve_management_decision(uuid,uuid,text) to authenticated;
grant execute on function public.get_management_overview(uuid) to authenticated;

-- Process manager timers, goals, decisions, salaries, weekly reports and monthly closes hourly.
select cron.schedule(
  'opencompany-management-cycle',
  '35 * * * *',
  'select private.run_management_cycle_if_due();'
)
where not exists(select 1 from cron.job where jobname='opencompany-management-cycle');
