
-- OpenCompany 0.10.220: demand, market indices, specializations and large customer tenders

create table if not exists public.market_demand (
  category text primary key,
  label text not null,
  demand_index numeric(6,2) not null default 100 check (demand_index between 70 and 130),
  previous_index numeric(6,2) not null default 100,
  trend text not null default 'stable' check (trend in ('rising','stable','falling')),
  updated_at timestamptz not null default now()
);
alter table public.market_demand enable row level security;
drop policy if exists market_demand_read on public.market_demand;
create policy market_demand_read on public.market_demand for select to authenticated using (true);
grant select on public.market_demand to authenticated;

create table if not exists public.market_demand_history (
  id bigint generated always as identity primary key,
  category text not null references public.market_demand(category) on delete cascade,
  demand_date date not null,
  demand_index numeric(6,2) not null,
  created_at timestamptz not null default now(),
  unique(category,demand_date)
);
alter table public.market_demand_history enable row level security;
drop policy if exists market_demand_history_read on public.market_demand_history;
create policy market_demand_history_read on public.market_demand_history for select to authenticated using (true);
grant select on public.market_demand_history to authenticated;

insert into public.market_demand(category,label,demand_index,previous_index,trend)
values
 ('food','Lebensmittel',100,100,'stable'),
 ('textile','Textilien',100,100,'stable'),
 ('electronics','Elektronik',100,100,'stable'),
 ('automotive','Fahrzeuge',100,100,'stable'),
 ('machinery','Maschinen',100,100,'stable'),
 ('chemical','Chemie',100,100,'stable'),
 ('construction','Baustoffe',100,100,'stable'),
 ('energy','Energieprodukte',100,100,'stable'),
 ('component','Komponenten',100,100,'stable'),
 ('food_component','Lebensmittel-Vorprodukte',100,100,'stable'),
 ('logistics','Logistikprodukte',100,100,'stable')
on conflict(category) do nothing;

insert into public.market_demand_history(category,demand_date,demand_index)
select category,current_date,demand_index from public.market_demand
on conflict(category,demand_date) do nothing;

create or replace function private.demand_phase_delta(p_category text)
returns numeric
language sql
stable
set search_path to ''
as $$
  select case private.economy_phase()
    when 'recession' then case p_category
      when 'food' then -2
      when 'automotive' then -10
      else 0
    end
    when 'boom' then case p_category
      when 'food' then 3
      when 'automotive' then 10
      else 0
    end
    else 0
  end::numeric
$$;

create or replace function private.demand_event_delta(p_category text)
returns numeric
language sql
stable
set search_path to ''
as $$
  select coalesce(sum(
    case
      when e.event_type='construction_boom' and p_category='construction' then 20
      when e.event_type='technology_hype' and p_category='electronics' then 25
      when e.event_type='consumer_slump' and p_category in ('textile','automotive','electronics') then -15
      else coalesce((e.effects->'demand_points'->>p_category)::numeric,0)
    end
  ),0)
  from public.global_economic_events e
  where e.status='active' and e.ends_at>now()
$$;

create or replace function private.demand_index_for_category(p_category text)
returns numeric
language sql
stable
set search_path to ''
as $$
  select coalesce((select demand_index from public.market_demand where category=p_category),100)
$$;

create or replace function private.demand_retail_factor(p_category text)
returns numeric
language sql
stable
set search_path to ''
as $$
  select greatest(0.82,least(1.18,1 + (private.demand_index_for_category(p_category)-100)*0.006))
$$;

create or replace function private.run_daily_demand_update()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  r public.market_demand%rowtype;
  v_random numeric;
  v_reversion numeric;
  v_next numeric;
  v_count integer:=0;
begin
  if exists(select 1 from public.market_demand_history where demand_date=current_date) then
    return 0;
  end if;

  for r in select * from public.market_demand order by category
  loop
    v_random := floor(random()*13)-6;
    v_reversion := case
      when r.demand_index>102 then -1
      when r.demand_index<98 then 1
      else 0
    end;
    v_next := greatest(
      70,
      least(
        130,
        r.demand_index + v_random + v_reversion
        + private.demand_phase_delta(r.category)
        + private.demand_event_delta(r.category)
      )
    );

    update public.market_demand
    set previous_index=demand_index,
        demand_index=v_next,
        trend=case when v_next>r.demand_index+0.49 then 'rising'
                   when v_next<r.demand_index-0.49 then 'falling'
                   else 'stable' end,
        updated_at=now()
    where category=r.category;

    insert into public.market_demand_history(category,demand_date,demand_index)
    values(r.category,current_date,v_next)
    on conflict(category,demand_date) do update set demand_index=excluded.demand_index;

    v_count:=v_count+1;
  end loop;
  return v_count;
end
$$;
revoke all on function private.run_daily_demand_update() from public,anon,authenticated;

do $cron$
begin
  if not exists(select 1 from cron.job where jobname='opencompany-demand-daily') then
    perform cron.schedule('opencompany-demand-daily','5 0 * * *','select private.run_daily_demand_update();');
  end if;
end
$cron$;

-- demand-specific global events using the existing global event table
create table if not exists private.demand_event_state (
  id smallint primary key default 1 check(id=1),
  next_check_at timestamptz not null,
  updated_at timestamptz not null default now()
);
insert into private.demand_event_state(id,next_check_at)
values(1,now()+interval '5 days'+random()*interval '5 days')
on conflict(id) do nothing;

create or replace function private.run_demand_events_if_due()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_state private.demand_event_state%rowtype;
  v_pick integer;
  v_type text;
  v_name text;
  v_desc text;
  v_effects jsonb;
  v_days integer;
  v_created integer:=0;
begin
  select * into v_state from private.demand_event_state where id=1 for update;
  if v_state.next_check_at>now() then return 0; end if;

  if (select count(*) from public.global_economic_events where status='active' and ends_at>now())<2 and random()<0.65 then
    v_pick:=floor(random()*3)::integer;
    if v_pick=0 then
      v_type:='construction_boom';
      v_name:='Bauboom';
      v_desc:='Die Bautätigkeit zieht stark an. Die Baustoffnachfrage steigt.';
      v_effects:='{"demand_points":{"construction":20}}'::jsonb;
    elsif v_pick=1 then
      v_type:='technology_hype';
      v_name:='Technologiehype';
      v_desc:='Ein Technologietrend sorgt für deutlich höhere Elektroniknachfrage.';
      v_effects:='{"demand_points":{"electronics":25}}'::jsonb;
    else
      v_type:='consumer_slump';
      v_name:='Konsumflaute';
      v_desc:='Textilien, Fahrzeuge und Elektronik werden vorübergehend schwächer nachgefragt.';
      v_effects:='{"demand_points":{"textile":-15,"automotive":-15,"electronics":-15}}'::jsonb;
    end if;

    if not exists(select 1 from public.global_economic_events where status='active' and event_type=v_type and ends_at>now()) then
      v_days:=2+floor(random()*4)::integer;
      insert into public.global_economic_events(event_type,name,description,effects,ends_at)
      values(v_type,v_name,v_desc,v_effects,now()+make_interval(days=>v_days));
      v_created:=1;
    end if;
  end if;

  update private.demand_event_state
  set next_check_at=now()+interval '5 days'+random()*interval '5 days',updated_at=now()
  where id=1;

  return v_created;
end
$$;
revoke all on function private.run_demand_events_if_due() from public,anon,authenticated;

do $cron$
begin
  if not exists(select 1 from cron.job where jobname='opencompany-demand-events') then
    perform cron.schedule('opencompany-demand-events','20 * * * *','select private.run_demand_events_if_due();');
  end if;
end
$cron$;

-- demand-aware retail price helpers
create or replace function private.retail_average_price(p_unit_cost numeric,p_category text)
returns numeric
language sql
stable
set search_path to ''
as $$
  select round(
    greatest(coalesce(p_unit_cost,0),0)
    * 2.50
    * private.economy_retail_price_factor()
    * private.demand_retail_factor(p_category),
    2
  )
$$;

create or replace function private.retail_min_price(p_unit_cost numeric,p_category text)
returns numeric
language sql
stable
set search_path to ''
as $$ select round(private.retail_average_price(p_unit_cost,p_category)*0.75,2) $$;

create or replace function private.retail_max_price(p_unit_cost numeric,p_category text)
returns numeric
language sql
stable
set search_path to ''
as $$ select round(private.retail_average_price(p_unit_cost,p_category)*1.20,2) $$;

create or replace function private.retail_profit_factor(p_unit_cost numeric,p_unit_price numeric,p_category text)
returns numeric
language plpgsql
stable
set search_path to ''
as $$
declare
  v_avg numeric;
  v_min numeric;
  v_max numeric;
  v_peak_low numeric;
  v_peak_high numeric;
  v_factor numeric;
begin
  v_avg:=private.retail_average_price(p_unit_cost,p_category);
  v_min:=private.retail_min_price(p_unit_cost,p_category);
  v_max:=private.retail_max_price(p_unit_cost,p_category);
  v_peak_low:=round(v_avg*0.95,2);
  v_peak_high:=round(v_avg*1.05,2);
  if p_unit_price is null or v_avg<=0 then return 0; end if;
  if p_unit_price<=v_min or p_unit_price>=v_max then return 0;
  elsif p_unit_price<v_peak_low then v_factor:=(p_unit_price-v_min)/nullif(v_peak_low-v_min,0);
  elsif p_unit_price<=v_peak_high then v_factor:=1;
  else v_factor:=(v_max-p_unit_price)/nullif(v_max-v_peak_high,0);
  end if;
  return greatest(0,least(1,coalesce(v_factor,0)));
end
$$;

create or replace function private.retail_effective_unit_revenue(p_unit_cost numeric,p_unit_price numeric,p_category text)
returns numeric
language sql
stable
set search_path to ''
as $$
  select round(
    greatest(coalesce(p_unit_price,0),0)
    * private.retail_profit_factor(p_unit_cost,p_unit_price,p_category)
    * private.global_event_factor('retail_revenue_factor'),
    6
  )
$$;

-- Market-price index grouping
create table if not exists public.material_index_groups (
  material_id uuid primary key references public.materials(id) on delete cascade,
  index_code text not null check(index_code in ('metal','agri','chemical','energy')),
  index_label text not null
);
alter table public.material_index_groups enable row level security;
drop policy if exists material_index_groups_read on public.material_index_groups;
create policy material_index_groups_read on public.material_index_groups for select to authenticated using(true);
grant select on public.material_index_groups to authenticated;

insert into public.material_index_groups(material_id,index_code,index_label)
select id,
  case
    when name in ('Aluminium','Kupfer','Lithium','Silizium','Stahl') then 'metal'
    when name in ('Ammoniak','Aromastoff','Chemikalien','Kautschuk','Phosphat','Wirkstoff') then 'chemical'
    when name in ('Erdöl') then 'energy'
    else 'agri'
  end,
  case
    when name in ('Aluminium','Kupfer','Lithium','Silizium','Stahl') then 'Metallindex'
    when name in ('Ammoniak','Aromastoff','Chemikalien','Kautschuk','Phosphat','Wirkstoff') then 'Chemierohstoffindex'
    when name in ('Erdöl') then 'Energie-Rohstoffindex'
    else 'Agrarindex'
  end
from public.materials
on conflict(material_id) do update set index_code=excluded.index_code,index_label=excluded.index_label;

create table if not exists public.market_price_index_history (
  id bigint generated always as identity primary key,
  index_kind text not null check(index_kind in ('raw','product')),
  index_code text not null,
  index_label text not null,
  index_date date not null,
  index_value numeric(10,2),
  average_price numeric(14,4),
  trade_count integer not null default 0,
  weighted_units numeric(14,4) not null default 0,
  sufficient_data boolean not null default false,
  created_at timestamptz not null default now(),
  unique(index_kind,index_code,index_date)
);
alter table public.market_price_index_history enable row level security;
drop policy if exists market_price_index_history_read on public.market_price_index_history;
create policy market_price_index_history_read on public.market_price_index_history for select to authenticated using(true);
grant select on public.market_price_index_history to authenticated;

create or replace function public.get_market_price_indices()
returns table(
  index_kind text,index_code text,index_label text,index_value numeric,
  current_average numeric,previous_average numeric,change_percent numeric,
  trade_count integer,weighted_units numeric,sufficient_data boolean
)
language sql
stable
security invoker
set search_path to ''
as $$
with weighted as (
  select
    case when t.material_id is not null then 'raw' else 'product' end kind,
    case when t.material_id is not null then mig.index_code else p.category end code,
    case
      when t.material_id is not null then mig.index_label
      else case p.category
        when 'electronics' then 'Elektronikindex'
        when 'construction' then 'Bauproduktindex'
        when 'automotive' then 'Fahrzeugindex'
        when 'food' then 'Lebensmittelindex'
        when 'textile' then 'Textilindex'
        when 'machinery' then 'Maschinenindex'
        when 'chemical' then 'Chemieproduktindex'
        when 'energy' then 'Energieproduktindex'
        when 'component' then 'Komponentenindex'
        when 'food_component' then 'Lebensmittel-Vorproduktindex'
        when 'logistics' then 'Logistikproduktindex'
        else initcap(coalesce(p.category,'Sonstige'))||'index'
      end
    end label,
    t.executed_at,
    t.quantity,
    t.price_per_unit,
    case when c.company_type='npc' then 0.25 else 1.0 end weight
  from public.market_trades t
  join public.companies c on c.id=t.seller_company_id
  left join public.products p on p.id=t.product_id
  left join public.material_index_groups mig on mig.material_id=t.material_id
  where t.executed_at>=now()-interval '14 days'
),
agg as (
  select kind,code,max(label) label,
    count(*) filter(where executed_at>=now()-interval '7 days')::integer trades_now,
    coalesce(sum(quantity*weight) filter(where executed_at>=now()-interval '7 days'),0) units_now,
    sum(price_per_unit*quantity*weight) filter(where executed_at>=now()-interval '7 days')
      / nullif(sum(quantity*weight) filter(where executed_at>=now()-interval '7 days'),0) avg_now,
    count(*) filter(where executed_at<now()-interval '7 days')::integer trades_prev,
    coalesce(sum(quantity*weight) filter(where executed_at<now()-interval '7 days'),0) units_prev,
    sum(price_per_unit*quantity*weight) filter(where executed_at<now()-interval '7 days')
      / nullif(sum(quantity*weight) filter(where executed_at<now()-interval '7 days'),0) avg_prev
  from weighted
  where code is not null
  group by kind,code
)
select
  kind,code,label,
  case when trades_now>=5 and units_now>=100 and trades_prev>=5 and units_prev>=100 and avg_prev>0
       then round(100*avg_now/avg_prev,2) else null end,
  round(avg_now,4),round(avg_prev,4),
  case when trades_now>=5 and units_now>=100 and trades_prev>=5 and units_prev>=100 and avg_prev>0
       then round((avg_now/avg_prev-1)*100,2) else null end,
  trades_now,round(units_now,4),
  (trades_now>=5 and units_now>=100 and trades_prev>=5 and units_prev>=100)
from agg
order by kind,label
$$;
grant execute on function public.get_market_price_indices() to authenticated;

create or replace function private.snapshot_market_price_indices()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare r record; v_count integer:=0;
begin
  for r in select * from public.get_market_price_indices()
  loop
    insert into public.market_price_index_history(
      index_kind,index_code,index_label,index_date,index_value,average_price,
      trade_count,weighted_units,sufficient_data
    )
    values(r.index_kind,r.index_code,r.index_label,current_date,r.index_value,r.current_average,
      r.trade_count,r.weighted_units,r.sufficient_data)
    on conflict(index_kind,index_code,index_date) do update set
      index_label=excluded.index_label,index_value=excluded.index_value,
      average_price=excluded.average_price,trade_count=excluded.trade_count,
      weighted_units=excluded.weighted_units,sufficient_data=excluded.sufficient_data;
    v_count:=v_count+1;
  end loop;
  return v_count;
end
$$;
revoke all on function private.snapshot_market_price_indices() from public,anon,authenticated;

do $cron$
begin
  if not exists(select 1 from cron.job where jobname='opencompany-market-index-daily') then
    perform cron.schedule('opencompany-market-index-daily','15 0 * * *','select private.snapshot_market_price_indices();');
  end if;
end
$cron$;

-- Specializations
create table if not exists public.company_specializations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  slot_no smallint not null check(slot_no in (1,2)),
  specialization_code text not null check(specialization_code in (
    'production','retail','logistics','research','trading','contracts','industry_electronics'
  )),
  specialization_level smallint not null default 1 check(specialization_level between 1 and 3),
  activated_at timestamptz not null default now(),
  switch_available_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(company_id,slot_no)
);
alter table public.company_specializations enable row level security;
drop policy if exists company_specializations_read on public.company_specializations;
create policy company_specializations_read on public.company_specializations for select to authenticated using(true);
grant select on public.company_specializations to authenticated;

create or replace function private.specialization_factor(p_company_id uuid,p_key text,p_category text default null)
returns numeric
language sql
stable
set search_path to ''
as $$
  select coalesce(exp(sum(ln(factor))),1)
  from (
    select case
      when specialization_code='production' and p_key='production_output' then 1.05
      when specialization_code='production' and p_key='production_operating_cost' then 0.95
      when specialization_code='retail' and p_key='retail_rate' then 1.07
      when specialization_code='retail' and p_key='retail_price_effect' then 1.03
      when specialization_code='logistics' and p_key='transport_container_use' then 0.90
      when specialization_code='research' and p_key='research_operating_cost' then 0.92
      when specialization_code='research' and p_key='patent_gain' then 1.05
      when specialization_code='industry_electronics' and p_category='electronics' and p_key='production_output' then 1.05
      when specialization_code='industry_electronics' and p_category='electronics' and p_key='production_operating_cost' then 0.95
      when specialization_code='industry_electronics' and p_category='electronics' and p_key='retail_rate' then 1.05
      else 1 end factor
    from public.company_specializations
    where company_id=p_company_id
  ) s
$$;

create or replace function public.set_company_specialization(
  p_company_id uuid,p_slot_no smallint,p_specialization_code text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_level integer;
  v_existing public.company_specializations%rowtype;
  v_cash numeric;
  v_required integer;
begin
  perform private.assert_company_owner(p_company_id);
  if p_slot_no not in (1,2) then raise exception 'Ungültiger Spezialisierungsplatz'; end if;
  if p_specialization_code not in ('production','retail','logistics','research','trading','contracts','industry_electronics') then
    raise exception 'Ungültige Spezialisierung';
  end if;

  select company_level,cash_balance into v_level,v_cash from public.companies where id=p_company_id for update;
  v_required:=case when p_slot_no=1 then 8 else 15 end;
  if v_level<v_required then raise exception 'Spezialisierungsplatz wird auf Level % freigeschaltet',v_required; end if;

  select * into v_existing from public.company_specializations
  where company_id=p_company_id and slot_no=p_slot_no for update;

  if v_existing.id is not null and v_existing.specialization_code=p_specialization_code then
    return jsonb_build_object('status','unchanged');
  end if;

  if v_existing.id is not null then
    if v_existing.switch_available_at is not null and v_existing.switch_available_at>now() then
      raise exception 'Spezialisierung kann erst ab % gewechselt werden',v_existing.switch_available_at;
    end if;
    if v_cash<100000 then raise exception 'Für die Umstrukturierung werden 100.000 OC$ benötigt'; end if;
    update public.companies set cash_balance=cash_balance-100000,updated_at=now() where id=p_company_id;
    insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id)
    values(p_company_id,'specialization_change',-100000,'Umstrukturierung: Spezialisierung gewechselt','company_specialization',v_existing.id);
  end if;

  insert into public.company_specializations(company_id,slot_no,specialization_code,specialization_level,activated_at,switch_available_at,updated_at)
  values(p_company_id,p_slot_no,p_specialization_code,1,now(),now()+interval '14 days',now())
  on conflict(company_id,slot_no) do update set
    specialization_code=excluded.specialization_code,
    specialization_level=1,
    activated_at=now(),
    switch_available_at=now()+interval '14 days',
    updated_at=now();

  return jsonb_build_object('status','ok','switch_available_at',now()+interval '14 days');
end
$$;
revoke all on function public.set_company_specialization(uuid,smallint,text) from public,anon;
grant execute on function public.set_company_specialization(uuid,smallint,text) to authenticated;

-- Large customer tenders
create table if not exists public.large_customer_orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  order_type text not null check(order_type in ('raw_material','production','quality','rush')),
  item_kind text not null check(item_kind in ('material','product')),
  item_name text not null,
  product_category text,
  material_id uuid references public.materials(id) on delete set null,
  quantity numeric(14,2) not null check(quantity>0),
  minimum_quality integer not null default 1 check(minimum_quality between 1 and 5),
  published_at timestamptz not null default now(),
  bidding_ends_at timestamptz not null,
  delivery_hours integer not null default 48 check(delivery_hours>0),
  early_bonus_hours integer,
  early_bonus_rate numeric(6,4) not null default 0,
  status text not null default 'bidding' check(status in ('bidding','awarded','completed','failed','cancelled')),
  winning_bid_id uuid,
  awarded_company_id uuid references public.companies(id) on delete set null,
  awarded_at timestamptz,
  delivery_deadline timestamptz,
  delivered_quantity numeric(14,2) not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.large_customer_orders enable row level security;
drop policy if exists large_customer_orders_read on public.large_customer_orders;
create policy large_customer_orders_read on public.large_customer_orders for select to authenticated using(true);
grant select on public.large_customer_orders to authenticated;

create table if not exists public.large_customer_bids (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.large_customer_orders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  price_per_unit numeric(14,2) not null check(price_per_unit>0),
  offered_quality integer not null check(offered_quality between 1 and 5),
  delivery_hours integer not null check(delivery_hours>0),
  score numeric(12,4),
  status text not null default 'submitted' check(status in ('submitted','won','lost','withdrawn')),
  created_at timestamptz not null default now(),
  unique(order_id,company_id)
);
alter table public.large_customer_bids enable row level security;
drop policy if exists large_customer_bids_read on public.large_customer_bids;
create policy large_customer_bids_read on public.large_customer_bids
for select to authenticated using(
  company_id in (select id from public.companies where owner_user_id=(select auth.uid()))
  or order_id in (select id from public.large_customer_orders where status<>'bidding')
);
grant select on public.large_customer_bids to authenticated;

alter table public.large_customer_orders
  drop constraint if exists large_customer_orders_winning_bid_fkey;
alter table public.large_customer_orders
  add constraint large_customer_orders_winning_bid_fkey
  foreign key(winning_bid_id) references public.large_customer_bids(id) on delete set null;

create table if not exists public.large_customer_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.large_customer_orders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  quantity numeric(14,2) not null check(quantity>0),
  quality_level integer not null,
  delivered_at timestamptz not null default now()
);
alter table public.large_customer_deliveries enable row level security;
drop policy if exists large_customer_deliveries_read on public.large_customer_deliveries;
create policy large_customer_deliveries_read on public.large_customer_deliveries for select to authenticated using(true);
grant select on public.large_customer_deliveries to authenticated;

create or replace function public.submit_large_customer_bid(
  p_company_id uuid,p_order_id uuid,p_price_per_unit numeric,p_quality integer,p_delivery_hours integer
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v public.large_customer_orders%rowtype; v_id uuid;
begin
  perform private.assert_company_owner(p_company_id);
  select * into v from public.large_customer_orders where id=p_order_id for update;
  if v.id is null or v.status<>'bidding' or v.bidding_ends_at<=now() then raise exception 'Ausschreibung ist nicht mehr offen'; end if;
  if p_price_per_unit<=0 then raise exception 'Preis muss größer als 0 sein'; end if;
  if p_quality<v.minimum_quality or p_quality>5 then raise exception 'Mindestqualität Q% wird nicht erfüllt',v.minimum_quality; end if;
  if p_delivery_hours<=0 or p_delivery_hours>v.delivery_hours then raise exception 'Lieferzeit muss innerhalb der Frist liegen'; end if;

  insert into public.large_customer_bids(order_id,company_id,price_per_unit,offered_quality,delivery_hours)
  values(p_order_id,p_company_id,round(p_price_per_unit,2),p_quality,p_delivery_hours)
  on conflict(order_id,company_id) do update set
    price_per_unit=excluded.price_per_unit,offered_quality=excluded.offered_quality,
    delivery_hours=excluded.delivery_hours,created_at=now(),status='submitted'
  returning id into v_id;
  return v_id;
end
$$;
revoke all on function public.submit_large_customer_bid(uuid,uuid,numeric,integer,integer) from public,anon;
grant execute on function public.submit_large_customer_bid(uuid,uuid,numeric,integer,integer) to authenticated;

create or replace function private.award_due_large_customer_orders()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  o public.large_customer_orders%rowtype;
  b public.large_customer_bids%rowtype;
  v_min_price numeric;
  v_best uuid;
  v_best_score numeric;
  v_score numeric;
  v_count integer:=0;
begin
  for o in select * from public.large_customer_orders where status='bidding' and bidding_ends_at<=now() order by bidding_ends_at for update skip locked
  loop
    select min(price_per_unit) into v_min_price from public.large_customer_bids where order_id=o.id and status='submitted';

    if v_min_price is null then
      update public.large_customer_orders set status='cancelled' where id=o.id;
      continue;
    end if;

    v_best:=null; v_best_score:=-1;
    for b in select * from public.large_customer_bids where order_id=o.id and status='submitted'
    loop
      v_score :=
        50*(v_min_price/nullif(b.price_per_unit,0))
        +25*least(1,b.offered_quality::numeric/5)
        +25*least(1,o.delivery_hours::numeric/nullif(b.delivery_hours,0));
      update public.large_customer_bids set score=round(v_score,4) where id=b.id;
      if v_score>v_best_score then v_best_score:=v_score; v_best:=b.id; end if;
    end loop;

    select * into b from public.large_customer_bids where id=v_best;
    update public.large_customer_bids set status=case when id=v_best then 'won' else 'lost' end where order_id=o.id and status='submitted';
    update public.large_customer_orders set
      status='awarded',winning_bid_id=v_best,awarded_company_id=b.company_id,awarded_at=now(),
      delivery_deadline=now()+make_interval(hours=>b.delivery_hours)
    where id=o.id;

    v_count:=v_count+1;
  end loop;
  return v_count;
end
$$;
revoke all on function private.award_due_large_customer_orders() from public,anon,authenticated;

create or replace function public.deliver_large_customer_order(
  p_company_id uuid,p_order_id uuid,p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  o public.large_customer_orders%rowtype;
  b public.large_customer_bids%rowtype;
  v_remaining numeric;
  v_take numeric;
  v_inv record;
  v_product_id uuid;
  v_total numeric;
  v_bonus numeric:=0;
  v_reward numeric:=0;
  v_completed boolean:=false;
begin
  perform private.assert_company_owner(p_company_id);
  if p_quantity<=0 then raise exception 'Liefermenge muss größer als 0 sein'; end if;

  select * into o from public.large_customer_orders where id=p_order_id and awarded_company_id=p_company_id for update;
  if o.id is null or o.status<>'awarded' then raise exception 'Auftrag ist nicht lieferbar'; end if;
  if o.delivery_deadline<=now() then raise exception 'Lieferfrist ist abgelaufen'; end if;

  select * into b from public.large_customer_bids where id=o.winning_bid_id;
  v_remaining:=least(p_quantity,o.quantity-o.delivered_quantity);
  if v_remaining<=0 then raise exception 'Auftrag ist bereits vollständig geliefert'; end if;

  if o.item_kind='material' then
    for v_inv in
      select * from public.material_inventories
      where company_id=p_company_id and material_id=o.material_id and quality_level>=o.minimum_quality and quantity>0
      order by quality_level,average_unit_cost,id
      for update
    loop
      exit when v_remaining<=0;
      v_take:=least(v_remaining,v_inv.quantity);
      update public.material_inventories set quantity=quantity-v_take where id=v_inv.id;
      insert into public.large_customer_deliveries(order_id,company_id,quantity,quality_level)
      values(o.id,p_company_id,v_take,v_inv.quality_level);
      v_remaining:=v_remaining-v_take;
    end loop;
  else
    for v_inv in
      select i.*
      from public.inventories i
      join public.products p on p.id=i.product_id
      where i.company_id=p_company_id and p.name=o.item_name
        and (o.product_category is null or p.category=o.product_category)
        and i.quality_level>=o.minimum_quality and i.quantity>0
      order by i.quality_level,i.average_unit_cost,i.id
      for update of i
    loop
      exit when v_remaining<=0;
      v_take:=least(v_remaining,v_inv.quantity);
      update public.inventories set quantity=quantity-v_take where id=v_inv.id;
      insert into public.large_customer_deliveries(order_id,company_id,quantity,quality_level)
      values(o.id,p_company_id,v_take,v_inv.quality_level);
      v_remaining:=v_remaining-v_take;
    end loop;
  end if;

  if v_remaining>0 then raise exception 'Nicht genügend passender Bestand für die gewünschte Lieferung'; end if;

  update public.large_customer_orders
  set delivered_quantity=delivered_quantity+p_quantity
  where id=o.id
  returning * into o;

  if o.delivered_quantity>=o.quantity then
    v_total:=round(o.quantity*b.price_per_unit,2);
    if o.early_bonus_hours is not null and now()<=o.awarded_at+make_interval(hours=>o.early_bonus_hours) then
      v_bonus:=round(v_total*o.early_bonus_rate,2);
    end if;
    v_reward:=v_total+v_bonus;

    update public.companies set cash_balance=cash_balance+v_reward,updated_at=now() where id=p_company_id;
    update public.large_customer_orders set status='completed',completed_at=now() where id=o.id;
    insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id)
    values(p_company_id,'large_customer_order',v_reward,'Großkundenauftrag abgeschlossen: '||o.item_name,'large_customer_order',o.id);
    perform private.add_company_volume_xp(p_company_id,'large_customer_order',v_total,50,85,'Großkundenauftrag');
    v_completed:=true;
  end if;

  return jsonb_build_object('delivered',p_quantity,'total_delivered',o.delivered_quantity,'completed',v_completed,'reward',v_reward);
end
$$;
revoke all on function public.deliver_large_customer_order(uuid,uuid,numeric) from public,anon;
grant execute on function public.deliver_large_customer_order(uuid,uuid,numeric) to authenticated;

create or replace function private.fail_overdue_large_customer_orders()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare o public.large_customer_orders%rowtype; b public.large_customer_bids%rowtype; v_penalty numeric; v_count integer:=0;
begin
  for o in select * from public.large_customer_orders where status='awarded' and delivery_deadline<=now() order by delivery_deadline for update skip locked
  loop
    select * into b from public.large_customer_bids where id=o.winning_bid_id;
    v_penalty:=round(o.quantity*b.price_per_unit*0.30,2);
    update public.companies set cash_balance=cash_balance-v_penalty,updated_at=now() where id=o.awarded_company_id;
    insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id)
    values(o.awarded_company_id,'large_customer_penalty',-v_penalty,'Vertragsstrafe Großkundenauftrag: 30% des Vertragswertes','large_customer_order',o.id);
    update public.large_customer_orders set status='failed',completed_at=now() where id=o.id;
    perform private.handle_insolvency_if_needed(o.awarded_company_id);
    v_count:=v_count+1;
  end loop;
  return v_count;
end
$$;
revoke all on function private.fail_overdue_large_customer_orders() from public,anon,authenticated;

create or replace function private.generate_large_customer_order_if_due()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_today date:=(now() at time zone 'Europe/Berlin')::date;
  v_hour integer:=extract(hour from (now() at time zone 'Europe/Berlin'))::integer;
  v_last_date date;
  v_count integer;
  v_cat text;
  v_demand numeric;
  v_product record;
  v_material record;
  v_type text;
  v_qty numeric;
  v_quality integer;
  v_customer text;
  v_item_kind text;
begin
  create table if not exists private.large_customer_generation_state(
    id smallint primary key default 1 check(id=1),
    last_generation_date date
  );
  insert into private.large_customer_generation_state(id,last_generation_date) values(1,null) on conflict(id) do nothing;
  select last_generation_date into v_last_date from private.large_customer_generation_state where id=1 for update;
  if v_hour<6 or v_last_date=v_today then return 0; end if;

  select count(*) into v_count from public.large_customer_orders where status in ('bidding','awarded');
  if v_count>=3 then
    update private.large_customer_generation_state set last_generation_date=v_today where id=1;
    return 0;
  end if;

  select category,demand_index into v_cat,v_demand
  from public.market_demand
  where category not in ('research')
  order by demand_index desc,random()
  limit 1;

  v_type := (array['raw_material','production','quality','rush'])[1+floor(random()*4)::int];
  v_quality := case when v_type='quality' then 5 else 2+floor(random()*2)::int end;
  v_customer := (array['Nova Retail Group','Nordstern Industrie','Helios Handelsgruppe','Atlas Procurement','Vela Commerce'])[1+floor(random()*5)::int];

  if v_type='raw_material' then
    select * into v_material from public.materials where status='active' order by random() limit 1;
    v_item_kind:='material';
    v_qty:=500+100*floor(random()*16);
    insert into public.large_customer_orders(
      customer_name,order_type,item_kind,item_name,material_id,quantity,minimum_quality,
      bidding_ends_at,delivery_hours,early_bonus_hours,early_bonus_rate
    ) values(
      v_customer,v_type,v_item_kind,v_material.name,v_material.id,v_qty,v_quality,
      now()+interval '24 hours',48,24,0.10
    );
  else
    select name,category into v_product
    from public.products
    where status='active' and company_id=(select id from public.companies where company_type='player' order by created_at limit 1)
      and category=v_cat and category<>'research'
    order by random() limit 1;
    if v_product.name is null then
      select name,category into v_product
      from public.products
      where status='active' and company_id=(select id from public.companies where company_type='player' order by created_at limit 1)
        and category<>'research'
      order by random() limit 1;
    end if;
    v_item_kind:='product';
    v_qty:=case when v_type='rush' then 300+100*floor(random()*5) else 500+100*floor(random()*16) end;
    insert into public.large_customer_orders(
      customer_name,order_type,item_kind,item_name,product_category,quantity,minimum_quality,
      bidding_ends_at,delivery_hours,early_bonus_hours,early_bonus_rate
    ) values(
      v_customer,v_type,v_item_kind,v_product.name,v_product.category,v_qty,v_quality,
      now()+interval '24 hours',case when v_type='rush' then 12 else 48 end,
      case when v_type='rush' then null else 24 end,case when v_type='rush' then 0 else 0.10 end
    );
  end if;

  update private.large_customer_generation_state set last_generation_date=v_today where id=1;
  return 1;
end
$$;
revoke all on function private.generate_large_customer_order_if_due() from public,anon,authenticated;

do $cron$
begin
  if not exists(select 1 from cron.job where jobname='opencompany-large-customer-hourly') then
    perform cron.schedule(
      'opencompany-large-customer-hourly','0 * * * *',
      'select private.award_due_large_customer_orders(); select private.fail_overdue_large_customer_orders(); select private.generate_large_customer_order_if_due();'
    );
  end if;
end
$cron$;

-- Patch core production/research/retail with supported specialization and demand effects.
do $patch$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='start_production_on_building_v2_impl' limit 1;
  select pg_get_functiondef(v_oid) into v_def;
  if position('specialization_factor(p_company_id,''production_output''' in v_def)=0 then
    v_def:=replace(v_def,
      'v_units_per_hour:=greatest(0.01,floor(coalesce(v_product.base_production_rate,1)*v_multiplier)*private.economy_production_output_factor());',
      'v_units_per_hour:=greatest(0.01,floor(coalesce(v_product.base_production_rate,1)*v_multiplier)*private.economy_production_output_factor()*private.specialization_factor(p_company_id,''production_output'',v_product.category));'
    );
    v_def:=replace(v_def,
      'v_operating_cost:=round(v_operating_basis*v_operating_rate*v_efficiency_factor*v_economy_factor,2);',
      'v_operating_cost:=round(v_operating_basis*v_operating_rate*v_efficiency_factor*v_economy_factor*private.specialization_factor(p_company_id,''production_operating_cost'',v_product.category),2);'
    );
    execute v_def;
  end if;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='invest_product_research_impl' limit 1;
  select pg_get_functiondef(v_oid) into v_def;
  if position('research_operating_cost' in v_def)=0 then
    v_def:=replace(v_def,
      'v_operating_cost:=round(v_investment_value*v_operating_rate*v_efficiency_factor*v_economy_factor,2);',
      'v_operating_cost:=round(v_investment_value*v_operating_rate*v_efficiency_factor*v_economy_factor*private.specialization_factor(p_company_id,''research_operating_cost'',v_product.category),2);'
    );
    v_def:=replace(v_def,
      'v_patent_gain:=round(v_investment_value*v_patent_factor,2);',
      'v_patent_gain:=round(v_investment_value*v_patent_factor*private.specialization_factor(p_company_id,''patent_gain'',v_product.category),2);'
    );
    execute v_def;
  end if;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='start_retail_sale_on_building_v2_impl' limit 1;
  select pg_get_functiondef(v_oid) into v_def;
  if position('demand_retail_factor' in v_def)=0 then
    v_def:=replace(v_def,'v_avg:=private.retail_average_price(v_inventory.average_unit_cost);','v_avg:=private.retail_average_price(v_inventory.average_unit_cost,v_product.category)*private.specialization_factor(p_company_id,''retail_price_effect'',v_product.category);');
    v_def:=replace(v_def,'v_min:=private.retail_min_price(v_inventory.average_unit_cost);','v_min:=round(v_avg*0.75,2);');
    v_def:=replace(v_def,'v_max:=private.retail_max_price(v_inventory.average_unit_cost);','v_max:=round(v_avg*1.20,2);');
    v_def:=replace(v_def,
      'floor(coalesce(v_product.base_retail_rate,1)*private.building_level_multiplier(v_building.level))',
      'floor(coalesce(v_product.base_retail_rate,1)*private.building_level_multiplier(v_building.level)*private.demand_retail_factor(v_product.category)*private.specialization_factor(p_company_id,''retail_rate'',v_product.category))'
    );
    v_def:=replace(v_def,
      'v_effective_unit:=private.retail_effective_unit_revenue(v_inventory.average_unit_cost,p_unit_price);',
      'v_effective_unit:=private.retail_effective_unit_revenue(v_inventory.average_unit_cost,p_unit_price,v_product.category);'
    );
    execute v_def;
  end if;
end
$patch$;

-- Extend public company profile with visible specialization information.
create or replace function public.get_company_specializations(p_company_id uuid)
returns table(slot_no smallint,specialization_code text,specialization_level smallint,activated_at timestamptz,switch_available_at timestamptz)
language sql
stable
security invoker
set search_path to ''
as $$
  select slot_no,specialization_code,specialization_level,activated_at,switch_available_at
  from public.company_specializations where company_id=p_company_id order by slot_no
$$;
grant execute on function public.get_company_specializations(uuid) to anon,authenticated;
