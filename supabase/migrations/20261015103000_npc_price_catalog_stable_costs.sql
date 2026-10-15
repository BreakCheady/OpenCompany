-- Stabilize all NPC prices against historical player inventory and job outliers.
-- Preserve special research/container trigger overrides, freight, market fee and quality factors.
CREATE OR REPLACE FUNCTION private.ensure_npc_market_supply()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_material public.materials%rowtype;
  v_catalog record;
  v_profile_company_id uuid;
  v_volume_factor numeric;
  v_price_factor numeric;
  v_product_id uuid;
  v_existing integer;
  v_needed integer;
  v_i integer;
  v_qty numeric;
  v_price numeric;
  v_base_price numeric;
  v_quality integer;
  v_count integer := 0;
  v_before_item integer := 0;
  v_price_floor numeric;
  v_quarter_end timestamptz;
  v_freight_per_unit numeric := 0;
  v_used_qty numeric[];
  v_used_prices numeric[];
  v_inserted_price numeric;
begin
  v_quarter_end :=
    date_trunc('hour', now())
    + (floor(extract(minute from now()) / 15) * interval '15 minutes')
    + interval '15 minutes';

  -- Reference transport cost for NPC quotes, based on actual player inventory cost.
  select coalesce(round(avg(i.average_unit_cost)/2,2),0) into v_freight_per_unit
  from public.inventories i join public.products p on p.id=i.product_id
  join public.companies c on c.id=i.company_id
  where p.name='Transportcontainer' and c.company_type='player' and i.average_unit_cost>0;

  update public.market_orders o
  set status='expired'
  where o.order_type='sell'
    and o.status in ('open','partially_filled')
    and o.expires_at is not null
    and o.expires_at<=now()
    and exists(select 1 from public.companies c where c.id=o.company_id and c.company_type='npc');

  for v_material in select * from public.materials where status='active' order by name
  loop
    v_before_item := v_count;
    begin
    v_base_price := greatest(0.01,round(v_material.base_cost*1.25,2));
    for v_quality in 1..5 loop
      -- Snapshot matching active NPC offers once per quality, instead of probing twice for every new offer.
      select count(*) filter (where c.company_code<>'U00000' and c.status='active'
                 and coalesce(o.remaining_quantity,0)>0
                 and (o.expires_at is null or o.expires_at>now())),
             coalesce(array_agg(o.remaining_quantity),array[]::numeric[]),
             coalesce(array_agg(o.price_per_unit),array[]::numeric[])
        into v_existing,v_used_qty,v_used_prices
      from public.market_orders o join public.companies c on c.id=o.company_id
      where c.company_type='npc' and o.order_type='sell'
        and o.material_id=v_material.id and o.quality_level=v_quality
        and o.status in ('open','partially_filled');

      v_needed:=greatest(0,10-v_existing);
      if v_needed>0 then
        -- Raw-material NPC quotes use immutable resource base cost, not prices
        -- copied into player inventory by a previous NPC market purchase.
        v_price_floor:=ceil((greatest(v_material.base_cost,0.01)
          *private.quality_multiplier(v_quality))*1.20*100)/100;
      end if;
      if v_needed>0 then
        -- The previous cost floor already includes the 20% cost markup.
        -- Account for transport overhead and 5% marketplace commission.
        v_price_floor:=ceil((v_price_floor+v_freight_per_unit)/0.95*100)/100;
      end if;
      for v_i in 1..v_needed loop
        v_profile_company_id:=null;
        select mp.company_id,mp.volume_factor,mp.price_factor
        into v_profile_company_id,v_volume_factor,v_price_factor
        from private.npc_market_profiles mp
        join public.companies c on c.id=mp.company_id
        join private.npc_industry_profiles ip on ip.company_id=c.id and ip.category='raw_materials' and ip.can_sell
        where c.company_type='npc' and c.company_code<>'U00000' and c.status='active'
        order by random()/greatest(ip.activity_weight,0.1)
        limit 1;

        exit when v_profile_company_id is null;
        v_qty:=floor(220::numeric+random()::numeric*61);
        while v_qty=any(v_used_qty) loop v_qty:=v_qty+1; end loop;

        v_price:=greatest(0.01,round(v_base_price*(1+((v_quality-1)::numeric*0.03))*coalesce(v_price_factor,1)*(0.985+random()::numeric*0.03),2), v_price_floor);
        v_price:=greatest(v_price,private.market_quality_price_floor(v_price/1.20,v_quality));
        while v_price=any(v_used_prices) loop v_price:=v_price+0.01; end loop;

        insert into public.market_orders(company_id,material_id,order_type,quantity,remaining_quantity,price_per_unit,status,expires_at,quality_level)
        values(v_profile_company_id,v_material.id,'sell',v_qty,v_qty,v_price,'open',v_quarter_end,v_quality)
        returning price_per_unit into v_inserted_price;
        v_used_qty:=array_append(v_used_qty,v_qty);
        v_used_prices:=array_append(v_used_prices,v_inserted_price);
        v_count:=v_count+1;
      end loop;
    end loop;
    exception when others then
      v_count:=v_before_item;
      raise warning 'NPC raw material % skipped: %',v_material.name,sqlerrm;
    end;
  end loop;

  for v_catalog in
    select name,category,suggested_retail_price from private.game_product_catalog where category <> 'research' union all select p.name,p.category,min(p.suggested_retail_price) from public.products p where p.category='research' and p.status='active' group by p.name,p.category
  loop
    v_before_item:=v_count;
    begin
    if v_catalog.name='Transportcontainer' then v_base_price:=10.00;
    elsif v_catalog.category='research' then
      v_base_price:=greatest(0.01,round(coalesce(
        private.npc_product_cost_basis(v_catalog.name,v_catalog.category,1,v_catalog.suggested_retail_price),
        greatest(coalesce(v_catalog.suggested_retail_price,0)/2,0.01)
      )*2.00,2));
    else
      -- Use underlying production cost instead of player inventory costs:
      -- purchased NPC goods in player inventories must not reprice future NPC quotes.
      v_base_price:=greatest(0.01,round(coalesce(
        private.simulated_product_quality_unit_cost(v_catalog.name,1),
        private.npc_product_cost_basis(v_catalog.name,v_catalog.category,1,v_catalog.suggested_retail_price),
        greatest(coalesce(v_catalog.suggested_retail_price,0)/2,0.01)
      )*1.20,2));
    end if;

    for v_quality in 1..(case when v_catalog.category='research' or v_catalog.name='Transportcontainer' then 1 else 5 end) loop
      select count(*) filter (where c.company_code<>'U00000' and c.status='active'
                 and p.status='active' and coalesce(o.remaining_quantity,0)>0
                 and (o.expires_at is null or o.expires_at>now())),
             coalesce(array_agg(o.remaining_quantity),array[]::numeric[]),
             coalesce(array_agg(o.price_per_unit),array[]::numeric[])
        into v_existing,v_used_qty,v_used_prices
      from public.market_orders o
      join public.companies c on c.id=o.company_id
      join public.products p on p.id=o.product_id
      where c.company_type='npc' and p.name=v_catalog.name and p.category=v_catalog.category
        and o.order_type='sell' and o.quality_level=v_quality
        and o.status in ('open','partially_filled');

      v_needed:=greatest(0,(case when v_catalog.category='research' or v_catalog.name='Transportcontainer' then 10 else 10 end)-v_existing);
      if v_needed>0 then
        -- An exceptional historical manufacturing job is not a universal NPC
        -- price floor. All regular products have calculable recipe costs.
        -- Keep the legacy fallback for special Q1 research/container products.
        select ceil(greatest(coalesce(
          private.simulated_product_quality_unit_cost(v_catalog.name,v_quality),
          private.npc_product_cost_basis(v_catalog.name,v_catalog.category,v_quality,v_catalog.suggested_retail_price),
          greatest(coalesce(v_catalog.suggested_retail_price,0)/2,0.01)
        ),0.01)*1.20*100)/100 into v_price_floor;
      end if;
      -- Compute expensive recursive recipe costs once per catalog/quality and transaction.
      if v_needed>0 and v_catalog.category<>'research' and v_catalog.name<>'Transportcontainer' then
        insert into private.npc_market_quote_cost_cache
          (transaction_id,product_name,quality_level,base_cost,quality_cost)
        values (pg_current_xact_id()::text,v_catalog.name,v_quality,
          private.simulated_product_quality_unit_cost(v_catalog.name,1),
          private.simulated_product_quality_unit_cost(v_catalog.name,v_quality))
        on conflict (transaction_id,product_name,quality_level)
        do update set base_cost=excluded.base_cost,quality_cost=excluded.quality_cost;
      end if;
      if v_needed>0 then
        -- The previous cost floor already includes the 20% cost markup.
        -- Account for transport overhead and 5% marketplace commission.
        v_price_floor:=ceil((v_price_floor+v_freight_per_unit)/0.95*100)/100;
      end if;
      for v_i in 1..v_needed loop
        v_product_id:=null; v_profile_company_id:=null;
        select p.id,mp.company_id,mp.volume_factor,mp.price_factor
        into v_product_id,v_profile_company_id,v_volume_factor,v_price_factor
        from public.products p
        join public.companies c on c.id=p.company_id
        join private.npc_market_profiles mp on mp.company_id=c.id
        join private.npc_industry_profiles ip on ip.company_id=c.id and ip.category=v_catalog.category and ip.can_sell
        where c.company_type='npc' and c.company_code<>'U00000' and c.status='active'
          and p.status='active' and p.name=v_catalog.name and p.category=v_catalog.category
        order by random()/greatest(ip.activity_weight,0.1)
        limit 1;

        exit when v_product_id is null or v_profile_company_id is null;
        v_qty:=case when v_catalog.name='Transportcontainer'
          then floor(1100::numeric+random()::numeric*401)
          when v_catalog.category='research' then floor(1100::numeric+random()::numeric*401)
          else floor(220::numeric+random()::numeric*61) end;

        while v_qty=any(v_used_qty) loop v_qty:=v_qty+1; end loop;

        v_price:=greatest(0.01,round(v_base_price*(1+((v_quality-1)::numeric*0.03))*coalesce(v_price_factor,1)*(0.985+random()::numeric*0.03),2),v_price_floor);
        v_price:=greatest(v_price,private.market_quality_price_floor(v_price/1.20,v_quality));
        while v_price=any(v_used_prices) loop v_price:=v_price+0.01; end loop;

        insert into public.market_orders(company_id,product_id,order_type,quantity,remaining_quantity,price_per_unit,status,expires_at,quality_level)
        values(v_profile_company_id,v_product_id,'sell',v_qty,v_qty,v_price,'open',
          case when v_catalog.name='Transportcontainer' then null else v_quarter_end end,v_quality)
        returning price_per_unit into v_inserted_price;
        v_used_qty:=array_append(v_used_qty,v_qty);
        v_used_prices:=array_append(v_used_prices,v_inserted_price);
        v_count:=v_count+1;
      end loop;
    end loop;
    exception when others then
      v_count:=v_before_item;
      raise warning 'NPC product %/% skipped: %',v_catalog.name,v_catalog.category,sqlerrm;
    end;
  end loop;

  delete from private.npc_market_quote_cost_cache where transaction_id=pg_current_xact_id()::text;
  return v_count;
end $function$;
