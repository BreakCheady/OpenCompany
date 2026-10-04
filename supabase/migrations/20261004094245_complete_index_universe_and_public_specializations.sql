
-- Complete index universe and public specialization display for OpenCompany 0.10.220.

create or replace function public.get_market_price_indices()
returns table(
  index_kind text,index_code text,index_label text,index_value numeric,
  current_average numeric,previous_average numeric,change_percent numeric,
  trade_count integer,weighted_units numeric,sufficient_data boolean
)
language sql
stable
security definer
set search_path to ''
as $$
with universe as (
  select * from (values
    ('raw'::text,'metal'::text,'Metallindex'::text),
    ('raw','agri','Agrarindex'),
    ('raw','chemical','Chemierohstoffindex'),
    ('raw','energy','Energie-Rohstoffindex')
  ) r(kind,code,label)
  union all
  select distinct
    'product'::text,
    p.category,
    case p.category
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
      else initcap(p.category)||'index'
    end
  from public.products p
  where p.status='active' and p.category<>'research'
),
weighted as (
  select
    case when t.material_id is not null then 'raw' else 'product' end kind,
    case when t.material_id is not null then mig.index_code else p.category end code,
    t.executed_at,
    t.quantity,
    t.price_per_unit,
    case when buyer.company_type='npc' or seller.company_type='npc' then 0.25 else 1.0 end weight
  from public.market_trades t
  join public.companies buyer on buyer.id=t.buyer_company_id
  join public.companies seller on seller.id=t.seller_company_id
  left join public.products p on p.id=t.product_id
  left join public.material_index_groups mig on mig.material_id=t.material_id
  where t.executed_at>=now()-interval '14 days'
    and (t.material_id is not null or p.category<>'research')
),
agg as (
  select kind,code,
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
  u.kind,u.code,u.label,
  case when coalesce(a.trades_now,0)>=5 and coalesce(a.units_now,0)>=100
          and coalesce(a.trades_prev,0)>=5 and coalesce(a.units_prev,0)>=100 and a.avg_prev>0
       then round(100*a.avg_now/a.avg_prev,2) else null end,
  round(a.avg_now,4),round(a.avg_prev,4),
  case when coalesce(a.trades_now,0)>=5 and coalesce(a.units_now,0)>=100
          and coalesce(a.trades_prev,0)>=5 and coalesce(a.units_prev,0)>=100 and a.avg_prev>0
       then round((a.avg_now/a.avg_prev-1)*100,2) else null end,
  coalesce(a.trades_now,0),
  round(coalesce(a.units_now,0),4),
  (coalesce(a.trades_now,0)>=5 and coalesce(a.units_now,0)>=100
   and coalesce(a.trades_prev,0)>=5 and coalesce(a.units_prev,0)>=100)
from universe u
left join agg a on a.kind=u.kind and a.code=u.code
order by u.kind,u.label
$$;
revoke all on function public.get_market_price_indices() from public,anon;
grant execute on function public.get_market_price_indices() to authenticated;

create or replace function public.get_company_specializations(p_company_id uuid)
returns table(
  slot_no smallint,specialization_code text,specialization_level smallint,
  activated_at timestamptz,switch_available_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $$
  select cs.slot_no,cs.specialization_code,cs.specialization_level,cs.activated_at,cs.switch_available_at
  from public.company_specializations cs
  where cs.company_id=p_company_id
  order by cs.slot_no
$$;
revoke all on function public.get_company_specializations(uuid) from public;
grant execute on function public.get_company_specializations(uuid) to anon,authenticated;

-- The explicitly specified construction-boom example lasts exactly five days.
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
      v_desc:='Die Bautätigkeit zieht stark an. Die Baustoffnachfrage steigt um 20 Punkte.';
      v_effects:='{"demand_points":{"construction":20}}'::jsonb;
      v_days:=5;
    elsif v_pick=1 then
      v_type:='technology_hype';
      v_name:='Technologiehype';
      v_desc:='Ein Technologietrend erhöht die Elektroniknachfrage um 25 Punkte.';
      v_effects:='{"demand_points":{"electronics":25}}'::jsonb;
      v_days:=2+floor(random()*4)::integer;
    else
      v_type:='consumer_slump';
      v_name:='Konsumflaute';
      v_desc:='Textilien, Fahrzeuge und Elektronik verlieren jeweils 15 Nachfragepunkte.';
      v_effects:='{"demand_points":{"textile":-15,"automotive":-15,"electronics":-15}}'::jsonb;
      v_days:=2+floor(random()*4)::integer;
    end if;

    if not exists(
      select 1 from public.global_economic_events
      where status='active' and event_type=v_type and ends_at>now()
    ) then
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
