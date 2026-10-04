
-- Keep organic demand movement separate from temporary phase/event modifiers.

alter table public.market_demand
  add column if not exists organic_index numeric(6,2);

update public.market_demand
set organic_index=coalesce(organic_index,demand_index)
where organic_index is null;

alter table public.market_demand
  alter column organic_index set default 100,
  alter column organic_index set not null;

create table if not exists private.demand_update_state(
  id smallint primary key default 1 check(id=1),
  last_update_date date
);
insert into private.demand_update_state(id,last_update_date)
values(1,current_date)
on conflict(id) do nothing;

create or replace function private.refresh_effective_demand(p_write_history boolean default true)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  r public.market_demand%rowtype;
  v_effective numeric;
  v_count integer:=0;
begin
  for r in select * from public.market_demand order by category
  loop
    v_effective:=greatest(
      70,
      least(
        130,
        coalesce(r.organic_index,100)
        + private.demand_phase_delta(r.category)
        + private.demand_event_delta(r.category)
      )
    );

    update public.market_demand
    set previous_index=case when abs(v_effective-r.demand_index)>=0.01 then r.demand_index else previous_index end,
        trend=case
          when v_effective>r.demand_index+0.49 then 'rising'
          when v_effective<r.demand_index-0.49 then 'falling'
          else trend
        end,
        demand_index=v_effective,
        updated_at=case when abs(v_effective-r.demand_index)>=0.01 then now() else updated_at end
    where category=r.category;

    if p_write_history then
      insert into public.market_demand_history(category,demand_date,demand_index)
      values(r.category,current_date,v_effective)
      on conflict(category,demand_date)
      do update set demand_index=excluded.demand_index;
    end if;

    v_count:=v_count+1;
  end loop;
  return v_count;
end
$$;
revoke all on function private.refresh_effective_demand(boolean) from public,anon,authenticated;

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
  v_next_organic numeric;
  v_last_date date;
  v_count integer:=0;
begin
  select last_update_date into v_last_date
  from private.demand_update_state
  where id=1
  for update;

  if v_last_date=current_date then return 0; end if;

  for r in select * from public.market_demand order by category
  loop
    v_random:=floor(random()*13)-6;
    v_reversion:=case
      when r.organic_index>102 then -1
      when r.organic_index<98 then 1
      else 0
    end;
    v_next_organic:=greatest(70,least(130,r.organic_index+v_random+v_reversion));

    update public.market_demand
    set organic_index=v_next_organic
    where category=r.category;

    v_count:=v_count+1;
  end loop;

  update private.demand_update_state
  set last_update_date=current_date
  where id=1;

  perform private.refresh_effective_demand(true);
  return v_count;
end
$$;
revoke all on function private.run_daily_demand_update() from public,anon,authenticated;

-- Refresh immediately whenever a demand-specific event starts.
do $patch$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='run_demand_events_if_due'
  limit 1;
  select pg_get_functiondef(v_oid) into v_def;
  if position('refresh_effective_demand' in v_def)=0 then
    v_def:=replace(
      v_def,
      'return v_created;',
      'perform private.refresh_effective_demand(true); return v_created;'
    );
    execute v_def;
  end if;
end
$patch$;

-- Existing global events (notably Konsumflaute) also refresh demand on start/end.
do $patch$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='run_global_events_if_due'
  limit 1;
  select pg_get_functiondef(v_oid) into v_def;
  if position('refresh_effective_demand' in v_def)=0 then
    v_def:=replace(
      v_def,
      'return v_ended+case when v_id is null then 0 else 1 end;',
      'perform private.refresh_effective_demand(true); return v_ended+case when v_id is null then 0 else 1 end;'
    );
    execute v_def;
  end if;
end
$patch$;

-- Economic phase rollover refreshes category demand immediately.
do $patch$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='run_economy_phase_if_due'
  limit 1;
  select pg_get_functiondef(v_oid) into v_def;
  if position('refresh_effective_demand' in v_def)=0 then
    v_def:=replace(
      v_def,
      'return v_next_phase;',
      'perform private.refresh_effective_demand(true); return v_next_phase;'
    );
    execute v_def;
  end if;
end
$patch$;

-- Large-order selection consumes the already-effective demand index, which already
-- contains the currently active phase and global event adjustments.
do $patch$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='generate_large_customer_order_if_due'
  limit 1;
  select pg_get_functiondef(v_oid) into v_def;
  v_def:=replace(
    v_def,
    'md.demand_index desc,
    (private.demand_phase_delta(md.category)+private.demand_event_delta(md.category)) desc,
    abs(coalesce(idx.index_value,100)-100) desc,',
    'md.demand_index desc,
    abs(coalesce(idx.index_value,100)-100) desc,'
  );
  execute v_def;
end
$patch$;

select private.refresh_effective_demand(true);
