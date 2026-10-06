-- OpenCompany 0.10.257: significantly larger large-customer orders and longer delivery windows

create or replace function private.generate_large_customer_order_if_due()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_today date:=(now() at time zone 'Europe/Berlin')::date;
  v_last_date date;
  v_cat text;
  v_demand numeric;
  v_product record;
  v_material record;
  v_type text;
  v_qty numeric;
  v_quality integer;
  v_customer text;
  v_item_kind text;
  v_slot integer;
  v_delivery_hours integer;
  v_early_bonus_hours integer;
begin
  select last_generation_date
    into v_last_date
  from private.large_customer_generation_state
  where id=1
  for update;

  if not private.is_large_customer_generation_time(now())
     or v_last_date=v_today
  then
    return 0;
  end if;

  for v_slot in 1..3 loop
    select md.category,md.demand_index
      into v_cat,v_demand
    from public.market_demand md
    left join public.get_market_price_indices() idx
      on idx.index_kind='product' and idx.index_code=md.category
    where md.category<>'research'
    order by
      md.demand_index desc,
      abs(coalesce(idx.index_value,100)-100) desc,
      random()
    limit 1;

    v_type := (array['raw_material','production','quality','rush'])[1+floor(random()*4)::int];
    v_quality := case when v_type='quality' then 5 else 2+floor(random()*2)::int end;
    v_customer := (array['Nova Retail Group','Nordstern Industrie','Helios Handelsgruppe','Atlas Procurement','Vela Commerce'])[1+floor(random()*5)::int];

    if v_type='raw_material' then
      select * into v_material
      from public.materials
      where status='active'
      order by random()
      limit 1;

      v_item_kind:='material';

      -- 50,000 to 300,000 units in 5,000-unit steps.
      v_qty := 50000 + 5000 * floor(random()*51);

      -- Five to seven days.
      v_delivery_hours := (array[120,144,168])[1+floor(random()*3)::int];
      v_early_bonus_hours := greatest(24,floor(v_delivery_hours/2.0)::int);

      insert into public.large_customer_orders(
        customer_name,order_type,item_kind,item_name,material_id,quantity,minimum_quality,
        bidding_ends_at,delivery_hours,early_bonus_hours,early_bonus_rate,rush_bonus_rate
      )
      values(
        v_customer,v_type,v_item_kind,v_material.name,v_material.id,v_qty,v_quality,
        now()+interval '24 hours',v_delivery_hours,v_early_bonus_hours,0.10,0
      );
    else
      select name,category
        into v_product
      from private.game_product_catalog
      where category=v_cat
        and category<>'research'
      order by random()
      limit 1;

      if v_product.name is null then
        select name,category
          into v_product
        from private.game_product_catalog
        where category<>'research'
        order by random()
        limit 1;
      end if;

      v_item_kind:='product';

      if v_type='rush' then
        -- 2,500 to 25,000 units in 500-unit steps.
        v_qty := 2500 + 500 * floor(random()*46);
        -- One to three days.
        v_delivery_hours := (array[24,36,48,72])[1+floor(random()*4)::int];
        v_early_bonus_hours := null;
      elsif v_type='quality' then
        -- 5,000 to 75,000 units in 2,500-unit steps.
        v_qty := 5000 + 2500 * floor(random()*29);
        -- Five to seven days.
        v_delivery_hours := (array[120,144,168])[1+floor(random()*3)::int];
        v_early_bonus_hours := greatest(24,floor(v_delivery_hours/2.0)::int);
      else
        -- 10,000 to 150,000 units in 5,000-unit steps.
        v_qty := 10000 + 5000 * floor(random()*29);
        -- Four to seven days.
        v_delivery_hours := (array[96,120,144,168])[1+floor(random()*4)::int];
        v_early_bonus_hours := greatest(24,floor(v_delivery_hours/2.0)::int);
      end if;

      insert into public.large_customer_orders(
        customer_name,order_type,item_kind,item_name,product_category,quantity,minimum_quality,
        bidding_ends_at,delivery_hours,early_bonus_hours,early_bonus_rate,rush_bonus_rate
      )
      values(
        v_customer,v_type,v_item_kind,v_product.name,v_product.category,v_qty,v_quality,
        now()+interval '24 hours',
        v_delivery_hours,
        v_early_bonus_hours,
        case when v_type='rush' then 0 else 0.10 end,
        case when v_type='rush' then 0.20 else 0 end
      );
    end if;
  end loop;

  update private.large_customer_generation_state
  set last_generation_date=v_today
  where id=1;

  return 3;
end
$$;

revoke all on function private.generate_large_customer_order_if_due() from public,anon,authenticated;
