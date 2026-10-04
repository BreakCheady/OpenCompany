
-- Apply the phase values as percentages, while event values remain demand points.

create or replace function private.demand_phase_factor(p_category text)
returns numeric
language sql
stable
set search_path to ''
as $$
  select case private.economy_phase()
    when 'recession' then case p_category
      when 'food' then 0.98
      when 'automotive' then 0.90
      else 1.00
    end
    when 'boom' then case p_category
      when 'food' then 1.03
      when 'automotive' then 1.10
      else 1.00
    end
    else 1.00
  end::numeric
$$;

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
        * private.demand_phase_factor(r.category)
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
        demand_index=round(v_effective,2),
        updated_at=case when abs(v_effective-r.demand_index)>=0.01 then now() else updated_at end
    where category=r.category;

    if p_write_history then
      insert into public.market_demand_history(category,demand_date,demand_index)
      values(r.category,current_date,round(v_effective,2))
      on conflict(category,demand_date)
      do update set demand_index=excluded.demand_index;
    end if;

    v_count:=v_count+1;
  end loop;
  return v_count;
end
$$;
revoke all on function private.refresh_effective_demand(boolean) from public,anon,authenticated;

do $cron$
begin
  if not exists(select 1 from cron.job where jobname='opencompany-demand-refresh-hourly') then
    perform cron.schedule(
      'opencompany-demand-refresh-hourly',
      '25 * * * *',
      'select private.refresh_effective_demand(true);'
    );
  end if;
end
$cron$;

select private.refresh_effective_demand(true);
