
-- Follow-up hardening for OpenCompany 0.10.220

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
    case when buyer.company_type='npc' or seller.company_type='npc' then 0.25 else 1.0 end weight
  from public.market_trades t
  join public.companies buyer on buyer.id=t.buyer_company_id
  join public.companies seller on seller.id=t.seller_company_id
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
revoke all on function public.get_market_price_indices() from public,anon;
grant execute on function public.get_market_price_indices() to authenticated;

create or replace function private.consume_transport_containers(
  p_company_id uuid,p_quantity numeric,p_reference_type text,p_reference_id uuid
)
returns numeric
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_available numeric;
  v_requested numeric := greatest(coalesce(p_quantity,0),0)
    * private.specialization_factor(p_company_id,'transport_container_use',null);
  v_remaining numeric := v_requested;
  v_take numeric;
  v_cost numeric := 0;
  r record;
begin
  if v_remaining <= 0 then return 0; end if;

  if p_reference_type = 'market_order'
     and exists (
       select 1
       from public.market_orders mo
       join public.products p on p.id = mo.product_id
       where mo.id = p_reference_id
         and mo.company_id = p_company_id
         and p.name = 'Transportcontainer'
     )
  then
    return 0;
  end if;

  select coalesce(sum(i.quantity),0)
    into v_available
  from public.inventories i
  join public.products p on p.id=i.product_id
  where i.company_id=p_company_id
    and p.company_id=p_company_id
    and p.status='active'
    and p.name='Transportcontainer';

  if v_available < v_remaining then
    raise exception 'Nicht genügend Transportcontainer. Benötigt: %, verfügbar: %',
      v_remaining, v_available;
  end if;

  for r in
    select i.id,i.quantity,i.average_unit_cost,i.quality_level
    from public.inventories i
    join public.products p on p.id=i.product_id
    where i.company_id=p_company_id
      and p.company_id=p_company_id
      and p.status='active'
      and p.name='Transportcontainer'
      and i.quantity>0
    order by i.quality_level,i.id
    for update of i
  loop
    exit when v_remaining<=0;
    v_take := least(v_remaining,r.quantity);
    v_cost := v_cost + v_take * coalesce(r.average_unit_cost,0);
    update public.inventories set quantity=quantity-v_take where id=r.id;
    v_remaining := v_remaining-v_take;
  end loop;

  v_cost := round(v_cost,2);
  insert into public.financial_transactions(
    company_id,transaction_type,amount,description,reference_type,reference_id,cost_basis
  )
  values(
    p_company_id,'freight_cost',-v_cost,
    'Frachtkosten: '||trim(to_char(v_requested,'FM9999999990.####'))||' × Transportcontainer',
    p_reference_type,p_reference_id,v_cost
  );
  return v_cost;
end
$$;
revoke all on function private.consume_transport_containers(uuid,numeric,text,uuid) from public,anon,authenticated;

-- Make current demand the primary order-selection signal, while market-price movement,
-- the active economic phase and current global demand events are explicit secondary signals.
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
  if v_count>=3 then return 0; end if;

  select md.category,md.demand_index into v_cat,v_demand
  from public.market_demand md
  left join public.get_market_price_indices() idx
    on idx.index_kind='product' and idx.index_code=md.category
  where md.category<>'research'
  order by
    md.demand_index desc,
    (private.demand_phase_delta(md.category)+private.demand_event_delta(md.category)) desc,
    abs(coalesce(idx.index_value,100)-100) desc,
    random()
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
