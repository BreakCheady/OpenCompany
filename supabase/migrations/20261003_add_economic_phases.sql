create table if not exists public.game_economy_state (
  id smallint primary key default 1,
  phase text not null default 'neutral' check (phase in ('recession','neutral','boom')),
  effect_rate numeric(6,4) not null default 0.15 check (effect_rate >= 0 and effect_rate <= 0.50),
  production_cost_factor numeric(8,4) not null default 1,
  production_output_factor numeric(8,4) not null default 1,
  retail_price_factor numeric(8,4) not null default 1,
  phase_started_at timestamptz not null default now(),
  next_change_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint game_economy_singleton check (id=1)
);

alter table public.game_economy_state enable row level security;

drop policy if exists "authenticated can read economy state" on public.game_economy_state;
create policy "authenticated can read economy state"
on public.game_economy_state
for select
to authenticated
using (true);

revoke all on public.game_economy_state from anon, authenticated;
grant select on public.game_economy_state to authenticated;

create or replace function private.next_economy_change_at(p_after timestamptz default now())
returns timestamptz
language sql
stable
set search_path to ''
as $function$
  with local_time as (
    select p_after at time zone 'Europe/Berlin' as local_now
  ),
  candidate as (
    select
      local_now,
      (
        local_now::date
        + ((5 - extract(isodow from local_now)::integer + 7) % 7)
        + time '17:00'
      )::timestamp as local_candidate
    from local_time
  )
  select (
    case
      when local_candidate <= local_now then local_candidate + interval '7 days'
      else local_candidate
    end
  ) at time zone 'Europe/Berlin'
  from candidate
$function$;

insert into public.game_economy_state(
  id,phase,effect_rate,production_cost_factor,production_output_factor,retail_price_factor,
  phase_started_at,next_change_at,updated_at
)
values(
  1,'neutral',0.15,1,1,1,now(),private.next_economy_change_at(now()),now()
)
on conflict(id) do nothing;

create or replace function private.economy_phase()
returns text
language sql
stable
set search_path to ''
as $function$
  select coalesce((select phase from public.game_economy_state where id=1),'neutral')
$function$;

create or replace function private.economy_production_cost_factor()
returns numeric
language sql
stable
set search_path to ''
as $function$
  select coalesce((select production_cost_factor from public.game_economy_state where id=1),1)
$function$;

create or replace function private.economy_production_output_factor()
returns numeric
language sql
stable
set search_path to ''
as $function$
  select coalesce((select production_output_factor from public.game_economy_state where id=1),1)
$function$;

create or replace function private.economy_retail_price_factor()
returns numeric
language sql
stable
set search_path to ''
as $function$
  select coalesce((select retail_price_factor from public.game_economy_state where id=1),1)
$function$;

create or replace function private.run_economy_phase_if_due()
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_state public.game_economy_state%rowtype;
  v_roll numeric;
  v_next_phase text;
  v_effect numeric;
begin
  select * into v_state
  from public.game_economy_state
  where id=1
  for update;

  if v_state.id is null then return 'neutral'; end if;
  if now() < v_state.next_change_at then return v_state.phase; end if;

  v_roll := random();
  v_effect := coalesce(v_state.effect_rate,0.15);

  if v_state.phase='recession' then
    v_next_phase := case
      when v_roll < 0.50 then 'recession'
      when v_roll < 0.95 then 'neutral'
      else 'boom'
    end;
  elsif v_state.phase='boom' then
    v_next_phase := case
      when v_roll < 0.50 then 'boom'
      when v_roll < 0.95 then 'neutral'
      else 'recession'
    end;
  else
    v_next_phase := case
      when v_roll < 0.50 then 'neutral'
      when v_roll < 0.75 then 'recession'
      else 'boom'
    end;
  end if;

  update public.game_economy_state
  set phase=v_next_phase,
      production_cost_factor=case v_next_phase when 'recession' then 1-v_effect when 'boom' then 1+v_effect else 1 end,
      production_output_factor=case v_next_phase when 'recession' then 1+v_effect when 'boom' then 1-v_effect else 1 end,
      retail_price_factor=case v_next_phase when 'recession' then 1-v_effect when 'boom' then 1+v_effect else 1 end,
      phase_started_at=case when v_next_phase is distinct from v_state.phase then now() else v_state.phase_started_at end,
      next_change_at=private.next_economy_change_at(now()+interval '1 minute'),
      updated_at=now()
  where id=1;

  return v_next_phase;
end
$function$;

revoke all on function private.run_economy_phase_if_due() from public, anon, authenticated;

create or replace function private.retail_average_price(p_unit_cost numeric)
returns numeric
language sql
stable
set search_path to ''
as $function$
  select round(
    greatest(coalesce(p_unit_cost,0),0)
    * 2.50
    * private.economy_retail_price_factor(),
    2
  )
$function$;

create or replace function private.retail_min_price(p_unit_cost numeric)
returns numeric
language sql
stable
set search_path to ''
as $function$
  select round(private.retail_average_price(p_unit_cost) * 0.75, 2)
$function$;

create or replace function private.retail_max_price(p_unit_cost numeric)
returns numeric
language sql
stable
set search_path to ''
as $function$
  select round(private.retail_average_price(p_unit_cost) * 1.20, 2)
$function$;

create or replace function private.retail_profit_factor(p_unit_cost numeric, p_unit_price numeric)
returns numeric
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_avg numeric;
  v_min numeric;
  v_max numeric;
  v_peak_low numeric;
  v_peak_high numeric;
  v_factor numeric;
begin
  v_avg := private.retail_average_price(p_unit_cost);
  v_min := private.retail_min_price(p_unit_cost);
  v_max := private.retail_max_price(p_unit_cost);
  v_peak_low := round(v_avg * 0.95, 2);
  v_peak_high := round(v_avg * 1.05, 2);

  if p_unit_price is null or v_avg <= 0 then return 0; end if;

  if p_unit_price <= v_min or p_unit_price >= v_max then
    return 0;
  elsif p_unit_price < v_peak_low then
    v_factor := (p_unit_price - v_min) / nullif(v_peak_low - v_min,0);
  elsif p_unit_price <= v_peak_high then
    v_factor := 1;
  else
    v_factor := (v_max - p_unit_price) / nullif(v_max - v_peak_high,0);
  end if;

  return greatest(0, least(1, coalesce(v_factor,0)));
end
$function$;

create or replace function private.retail_effective_unit_revenue(p_unit_cost numeric, p_unit_price numeric)
returns numeric
language sql
stable
set search_path to ''
as $function$
  select round(
    greatest(coalesce(p_unit_price,0),0)
    * private.retail_profit_factor(p_unit_cost,p_unit_price),
    6
  )
$function$;

do $patch$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='start_production_on_building_v2_impl'
  limit 1;

  select pg_get_functiondef(v_oid) into v_def;

  if position('economy_production_output_factor' in v_def)=0 then
    v_def := replace(
      v_def,
      'v_units_per_hour:=greatest(1,floor(coalesce(v_product.base_production_rate,1)*v_multiplier));',
      'v_units_per_hour:=greatest(0.01,floor(coalesce(v_product.base_production_rate,1)*v_multiplier)*private.economy_production_output_factor());'
    );
    v_def := replace(
      v_def,
      'v_cash_cost:=v_base_cash_cost+v_labor_cost;',
      'v_cash_cost:=round((v_base_cash_cost+v_labor_cost)*private.economy_production_cost_factor(),2);'
    );
    v_def := replace(
      v_def,
      ' update public.production_jobs' || chr(10) || ' set finished_unit_cost=v_finished_unit_cost,',
      ' v_finished_unit_cost:=round(v_finished_unit_cost*private.economy_production_cost_factor(),6);' || chr(10) ||
      ' update public.production_jobs' || chr(10) || ' set finished_unit_cost=v_finished_unit_cost,'
    );
    v_def := replace(
      v_def,
      'start_snapshot=coalesce(p_start_snapshot,''{}''::jsonb)',
      'start_snapshot=coalesce(p_start_snapshot,''{}''::jsonb)||jsonb_build_object(''economyPhase'',private.economy_phase(),''economyProductionCostFactor'',private.economy_production_cost_factor(),''economyProductionOutputFactor'',private.economy_production_output_factor())'
    );
    execute v_def;
  end if;

  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='start_production_impl'
  limit 1;

  select pg_get_functiondef(v_oid) into v_def;

  if position('economy_production_output_factor' in v_def)=0 then
    v_def := replace(
      v_def,
      'v_units_per_hour:=greatest(1,floor(coalesce(v_product.base_production_rate,1)*v_multiplier));',
      'v_units_per_hour:=greatest(0.01,floor(coalesce(v_product.base_production_rate,1)*v_multiplier)*private.economy_production_output_factor());'
    );
    v_def := replace(
      v_def,
      'v_labor_cost:=round(coalesce(v_type.labor_cost_per_unit,0)*v_output,2); v_cash_cost:=v_base_cash_cost+v_labor_cost;',
      'v_labor_cost:=round(coalesce(v_type.labor_cost_per_unit,0)*v_output,2); v_cash_cost:=round((v_base_cash_cost+v_labor_cost)*private.economy_production_cost_factor(),2);'
    );
    v_def := replace(
      v_def,
      ' update public.production_jobs set finished_unit_cost=v_finished_unit_cost where id=v_job;',
      ' v_finished_unit_cost:=round(v_finished_unit_cost*private.economy_production_cost_factor(),6); update public.production_jobs set finished_unit_cost=v_finished_unit_cost where id=v_job;'
    );
    execute v_def;
  end if;
end
$patch$;

do $cron$
begin
  if not exists(select 1 from cron.job where jobname='opencompany-economy-phase-hourly') then
    perform cron.schedule(
      'opencompany-economy-phase-hourly',
      '0 * * * *',
      'select private.run_economy_phase_if_due();'
    );
  end if;
end
$cron$;
