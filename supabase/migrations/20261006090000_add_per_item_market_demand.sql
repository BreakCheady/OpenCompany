-- OpenCompany 0.10.245: independent demand per market item

create table if not exists public.market_item_demand (
  item_key text primary key,
  item_type text not null check (item_type in ('product','material')),
  product_name text,
  product_category text,
  material_id uuid references public.materials(id) on delete cascade,
  material_name text,
  demand_index numeric(6,2) not null default 100 check (demand_index between 70 and 130),
  previous_index numeric(6,2) not null default 100,
  trend text not null default 'stable' check (trend in ('rising','stable','falling')),
  updated_at timestamptz not null default now(),
  check (
    (item_type='product' and product_name is not null and product_category is not null and material_id is null)
    or
    (item_type='material' and material_id is not null and material_name is not null and product_name is null and product_category is null)
  )
);

alter table public.market_item_demand enable row level security;
drop policy if exists market_item_demand_read on public.market_item_demand;
create policy market_item_demand_read on public.market_item_demand
for select to authenticated using (true);
grant select on public.market_item_demand to authenticated;

create table if not exists public.market_item_demand_history (
  id bigint generated always as identity primary key,
  item_key text not null references public.market_item_demand(item_key) on delete cascade,
  demand_date date not null,
  demand_index numeric(6,2) not null,
  created_at timestamptz not null default now(),
  unique(item_key,demand_date)
);

alter table public.market_item_demand_history enable row level security;
drop policy if exists market_item_demand_history_read on public.market_item_demand_history;
create policy market_item_demand_history_read on public.market_item_demand_history
for select to authenticated using (true);
grant select on public.market_item_demand_history to authenticated;

create or replace function private.sync_market_item_demand()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_count integer := 0;
  v_rows integer := 0;
begin
  insert into public.market_item_demand(
    item_key,item_type,product_name,product_category,demand_index,previous_index,trend
  )
  select
    'product:' || p.category || '::' || p.name,
    'product',
    p.name,
    p.category,
    greatest(70,least(130,coalesce(md.demand_index,100) + floor(random()*11)-5)),
    greatest(70,least(130,coalesce(md.demand_index,100) + floor(random()*11)-5)),
    'stable'
  from (
    select distinct name,category
    from public.products
    where status='active'
  ) p
  left join public.market_demand md on md.category=p.category
  on conflict(item_key) do update
  set product_name=excluded.product_name,
      product_category=excluded.product_category,
      updated_at=public.market_item_demand.updated_at;

  get diagnostics v_count = row_count;

  insert into public.market_item_demand(
    item_key,item_type,material_id,material_name,demand_index,previous_index,trend
  )
  select
    'material:' || m.id::text,
    'material',
    m.id,
    m.name,
    greatest(70,least(130,100 + floor(random()*11)-5)),
    greatest(70,least(130,100 + floor(random()*11)-5)),
    'stable'
  from public.materials m
  where m.status='active'
  on conflict(item_key) do update
  set material_name=excluded.material_name,
      updated_at=public.market_item_demand.updated_at;

  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;
  return v_count;
end
$$;

revoke all on function private.sync_market_item_demand() from public,anon,authenticated;

select private.sync_market_item_demand();

insert into public.market_item_demand_history(item_key,demand_date,demand_index)
select item_key,current_date,demand_index
from public.market_item_demand
on conflict(item_key,demand_date) do nothing;

create or replace function private.run_daily_market_item_demand_update()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  r public.market_item_demand%rowtype;
  v_random numeric;
  v_reversion numeric;
  v_macro numeric;
  v_macro_pull numeric;
  v_next numeric;
  v_count integer := 0;
begin
  perform private.sync_market_item_demand();

  for r in
    select d.*
    from public.market_item_demand d
    where not exists (
      select 1
      from public.market_item_demand_history h
      where h.item_key=d.item_key
        and h.demand_date=current_date
    )
    order by d.item_key
  loop
    v_random := floor(random()*13)-6;

    v_reversion := case
      when r.demand_index>102 then -1
      when r.demand_index<98 then 1
      else 0
    end;

    if r.item_type='product' then
      select coalesce(md.demand_index,100)
      into v_macro
      from public.market_demand md
      where md.category=r.product_category;
      v_macro := coalesce(v_macro,100);
    else
      v_macro := 100;
    end if;

    v_macro_pull := (v_macro-r.demand_index)*0.12;

    v_next := greatest(
      70,
      least(
        130,
        r.demand_index + v_random + v_reversion + v_macro_pull
      )
    );

    update public.market_item_demand
    set previous_index=demand_index,
        demand_index=v_next,
        trend=case
          when v_next>r.demand_index+0.49 then 'rising'
          when v_next<r.demand_index-0.49 then 'falling'
          else 'stable'
        end,
        updated_at=now()
    where item_key=r.item_key;

    insert into public.market_item_demand_history(item_key,demand_date,demand_index)
    values(r.item_key,current_date,v_next)
    on conflict(item_key,demand_date)
    do update set demand_index=excluded.demand_index;

    v_count:=v_count+1;
  end loop;

  return v_count;
end
$$;

revoke all on function private.run_daily_market_item_demand_update() from public,anon,authenticated;

do $cron$
begin
  if not exists(select 1 from cron.job where jobname='opencompany-item-demand-daily') then
    perform cron.schedule(
      'opencompany-item-demand-daily',
      '10 0 * * *',
      'select private.run_daily_market_item_demand_update();'
    );
  end if;
end
$cron$;
