-- OpenCompany 0.10.276: use period-start company value for company-value growth goals

create or replace function public.create_company_goal(
  p_company_id uuid,
  p_goal_type text,
  p_target_value numeric,
  p_period_type text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_baseline numeric:=0;
  v_local timestamp:=now() at time zone 'Europe/Berlin';
  v_start_date date;
begin
  perform private.assert_company_owner(p_company_id);
  perform private.evaluate_company_goals(p_company_id);

  if p_goal_type not in ('revenue','profit','company_value_growth','debt_max','storage_max','large_orders','research_patents') then
    raise exception 'Ungültiges Unternehmensziel';
  end if;
  if p_period_type not in ('week','month','30d') then
    raise exception 'Ungültiger Zielzeitraum';
  end if;
  if p_target_value is null or p_target_value<0 then
    raise exception 'Zielwert darf nicht negativ sein';
  end if;
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
    if p_period_type in ('week','month') then
      v_start_date:=(v_start at time zone 'Europe/Berlin')::date;

      select h.company_value
        into v_baseline
      from public.company_valuation_history h
      where h.company_id=p_company_id
        and h.valuation_date<v_start_date
      order by h.valuation_date desc
      limit 1;
    end if;

    if coalesce(v_baseline,0)<=0 then
      select company_value
        into v_baseline
      from public.companies
      where id=p_company_id;
    end if;
  end if;

  insert into public.company_goals(
    company_id,goal_type,target_value,period_type,starts_at,ends_at,baseline_value
  )
  values(
    p_company_id,p_goal_type,p_target_value,p_period_type,v_start,v_end,coalesce(v_baseline,0)
  )
  returning id into v_id;

  perform private.evaluate_company_goals(p_company_id);
  return v_id;
end
$function$;

-- Repair active week/month growth goals that were created with the value at goal creation.
with corrected as (
  select
    g.id,
    (
      select h.company_value
      from public.company_valuation_history h
      where h.company_id=g.company_id
        and h.valuation_date < (g.starts_at at time zone 'Europe/Berlin')::date
      order by h.valuation_date desc
      limit 1
    ) as baseline
  from public.company_goals g
  where g.goal_type='company_value_growth'
    and g.status='active'
    and g.period_type in ('week','month')
)
update public.company_goals g
set baseline_value=c.baseline
from corrected c
where g.id=c.id
  and c.baseline is not null
  and c.baseline>0;

do $$
declare
  v_company_id uuid;
begin
  for v_company_id in
    select distinct company_id
    from public.company_goals
    where goal_type='company_value_growth'
      and status='active'
  loop
    perform private.evaluate_company_goals(v_company_id);
  end loop;
end
$$;
