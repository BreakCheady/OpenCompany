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
begin
  select last_generation_date into v_last_date
  from private.large_customer_generation_state
  where id=1
  for update;

  if not private.is_large_customer_generation_time(now()) or v_last_date=v_today then
    return 0;
  end if;

  for v_slot in 1..3 loop
    select md.category,md.demand_index into v_cat,v_demand
    from public.market_demand md
    left join public.get_market_price_indices() idx
      on idx.index_kind='product' and idx.index_code=md.category
    where md.category<>'research'
    order by md.demand_index desc,abs(coalesce(idx.index_value,100)-100) desc,random()
    limit 1;

    v_type:=(array['raw_material','production','quality','rush'])[1+floor(random()*4)::int];
    v_quality:=case when v_type='quality' then 5 else 2+floor(random()*2)::int end;
    v_customer:=(array['Nova Retail Group','Nordstern Industrie','Helios Handelsgruppe','Atlas Procurement','Vela Commerce'])[1+floor(random()*5)::int];

    if v_type='raw_material' then
      select * into v_material from public.materials where status='active' order by random() limit 1;
      v_item_kind:='material';
      v_qty:=500+100*floor(random()*16);

      insert into public.large_customer_orders(
        customer_name,order_type,item_kind,item_name,material_id,quantity,minimum_quality,
        bidding_ends_at,delivery_hours,early_bonus_hours,early_bonus_rate,rush_bonus_rate
      ) values(
        v_customer,v_type,v_item_kind,v_material.name,v_material.id,v_qty,v_quality,
        now()+interval '24 hours',48,24,0.10,0
      );
    else
      select name,category into v_product
      from private.game_product_catalog
      where category=v_cat and category<>'research'
      order by random()
      limit 1;

      if v_product.name is null then
        select name,category into v_product
        from private.game_product_catalog
        where category<>'research'
        order by random()
        limit 1;
      end if;

      v_item_kind:='product';
      v_qty:=case when v_type='rush' then 300+100*floor(random()*5) else 500+100*floor(random()*16) end;

      insert into public.large_customer_orders(
        customer_name,order_type,item_kind,item_name,product_category,quantity,minimum_quality,
        bidding_ends_at,delivery_hours,early_bonus_hours,early_bonus_rate,rush_bonus_rate
      ) values(
        v_customer,v_type,v_item_kind,v_product.name,v_product.category,v_qty,v_quality,
        now()+interval '24 hours',
        case when v_type='rush' then 12 else 48 end,
        case when v_type='rush' then null else 24 end,
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
