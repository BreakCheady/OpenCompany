-- NPC supply: narrow active-order indexes, once-per-item quality price floor, per-item recovery.
-- Preserve exactly the existing NPC price, quantity and quality calculations.
CREATE INDEX IF NOT EXISTS idx_npc_active_sell_material_quality ON public.market_orders(material_id,quality_level,remaining_quantity,price_per_unit) WHERE order_type='sell' AND status IN ('open','partially_filled') AND material_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_npc_active_sell_product_quality ON public.market_orders(product_id,quality_level,remaining_quantity,price_per_unit) WHERE order_type='sell' AND status IN ('open','partially_filled') AND product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_npc_active_products_name_category ON public.products(name,category,id) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_npc_jobs_finished_cost_lookup ON public.production_jobs(product_id,quality_level,finished_unit_cost) WHERE finished_unit_cost>0;

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
begin
  v_quarter_end :=
    date_trunc('hour', now())
    + (floor(extract(minute from now()) / 15) * interval '15 minutes')
    + interval '15 minutes';

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
      select count(*) into v_existing
      from public.market_orders o
      join public.companies c on c.id=o.company_id
      where c.company_type='npc' and c.company_code<>'U00000' and c.status='active'
        and o.order_type='sell' and o.material_id=v_material.id and o.quality_level=v_quality
        and o.status in ('open','partially_filled') and coalesce(o.remaining_quantity,0)>0
        and (o.expires_at is null or o.expires_at>now());

      v_needed:=greatest(0,10-v_existing);
      if v_needed>0 then
        select ceil(greatest(v_material.base_cost,coalesce(max(i.average_unit_cost),v_material.base_cost))*1.20*100)/100
        into v_price_floor
        from public.material_inventories i join public.companies c on c.id=i.company_id
        where i.material_id=v_material.id and i.quality_level=v_quality and c.company_type='player' and i.average_unit_cost>0;
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
        while exists(
          select 1 from public.market_orders o join public.companies c on c.id=o.company_id
          where c.company_type='npc' and o.material_id=v_material.id and o.quality_level=v_quality
            and o.order_type='sell' and o.status in ('open','partially_filled') and o.remaining_quantity=v_qty
        ) loop v_qty:=v_qty+1; end loop;

        v_price:=greatest(0.01,round(v_base_price*(1+((v_quality-1)::numeric*0.03))*coalesce(v_price_factor,1)*(0.985+random()::numeric*0.03),2), v_price_floor);
        v_price:=greatest(v_price,private.market_quality_price_floor(v_price/1.20,v_quality));
        while exists(
          select 1 from public.market_orders o join public.companies c on c.id=o.company_id
          where c.company_type='npc' and o.material_id=v_material.id and o.quality_level=v_quality
            and o.order_type='sell' and o.status in ('open','partially_filled') and o.price_per_unit=v_price
        ) loop v_price:=v_price+0.01; end loop;

        insert into public.market_orders(company_id,material_id,order_type,quantity,remaining_quantity,price_per_unit,status,expires_at,quality_level)
        values(v_profile_company_id,v_material.id,'sell',v_qty,v_qty,v_price,'open',v_quarter_end,v_quality);
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
    else
      v_base_price:=greatest(0.01,round(coalesce(
        private.npc_product_cost_basis(v_catalog.name,v_catalog.category,1,v_catalog.suggested_retail_price),
        greatest(coalesce(v_catalog.suggested_retail_price,0)/2,0.01)
      )*2.00,2));
    end if;

    for v_quality in 1..(case when v_catalog.category='research' or v_catalog.name='Transportcontainer' then 1 else 5 end) loop
      select count(*) into v_existing
      from public.market_orders o
      join public.companies c on c.id=o.company_id
      join public.products p on p.id=o.product_id
      where c.company_type='npc' and c.company_code<>'U00000' and c.status='active'
        and p.status='active' and p.name=v_catalog.name and p.category=v_catalog.category
        and o.order_type='sell' and o.quality_level=v_quality
        and o.status in ('open','partially_filled') and coalesce(o.remaining_quantity,0)>0
        and (o.expires_at is null or o.expires_at>now());

      v_needed:=greatest(0,(case when v_catalog.category='research' or v_catalog.name='Transportcontainer' then 10 else 10 end)-v_existing);
      if v_needed>0 then
        select ceil(greatest(
          coalesce(private.npc_product_cost_basis(v_catalog.name,v_catalog.category,v_quality,v_catalog.suggested_retail_price),0.01),
          coalesce((select max(i.average_unit_cost) from public.inventories i join public.products p on p.id=i.product_id join public.companies c on c.id=i.company_id where p.name=v_catalog.name and p.category=v_catalog.category and i.quality_level=v_quality and c.company_type='player' and i.average_unit_cost>0),0),
          coalesce((select max(j.finished_unit_cost) from public.production_jobs j join public.products p on p.id=j.product_id where p.name=v_catalog.name and p.category=v_catalog.category and j.quality_level=v_quality and j.finished_unit_cost>0),0)
        )*1.20*100)/100 into v_price_floor;
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

        while exists(
          select 1 from public.market_orders o
          join public.companies c on c.id=o.company_id
          join public.products p on p.id=o.product_id
          where c.company_type='npc' and p.name=v_catalog.name and p.category=v_catalog.category
            and o.quality_level=v_quality and o.order_type='sell'
            and o.status in ('open','partially_filled') and o.remaining_quantity=v_qty
        ) loop v_qty:=v_qty+1; end loop;

        v_price:=greatest(0.01,round(v_base_price*(1+((v_quality-1)::numeric*0.03))*coalesce(v_price_factor,1)*(0.985+random()::numeric*0.03),2),v_price_floor);
        v_price:=greatest(v_price,private.market_quality_price_floor(v_price/1.20,v_quality));
        while exists(
          select 1 from public.market_orders o
          join public.companies c on c.id=o.company_id
          join public.products p on p.id=o.product_id
          where c.company_type='npc' and p.name=v_catalog.name and p.category=v_catalog.category
            and o.quality_level=v_quality and o.order_type='sell'
            and o.status in ('open','partially_filled') and o.price_per_unit=v_price
        ) loop v_price:=v_price+0.01; end loop;

        insert into public.market_orders(company_id,product_id,order_type,quantity,remaining_quantity,price_per_unit,status,expires_at,quality_level)
        values(v_profile_company_id,v_product_id,'sell',v_qty,v_qty,v_price,'open',
          case when v_catalog.name='Transportcontainer' then null else v_quarter_end end,v_quality);
        v_count:=v_count+1;
      end loop;
    end loop;
    exception when others then
      v_count:=v_before_item;
      raise warning 'NPC product %/% skipped: %',v_catalog.name,v_catalog.category,sqlerrm;
    end;
  end loop;

  return v_count;
end $function$

