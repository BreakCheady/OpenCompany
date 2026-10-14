-- Unified server-side net-zero market break-even and cost-aware NPC quotes.
CREATE OR REPLACE FUNCTION private.market_order_economic_break_even(
 p_company_id uuid,p_unit_cost numeric,p_quantity numeric,p_freight_exempt boolean DEFAULT false
) RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
 v_remaining numeric;
 v_cost numeric := 0;
 v_take numeric;
 v_gross numeric;
 v_fee_rate numeric;
 v_total numeric;
 r record;
BEGIN
 IF p_quantity IS NULL OR p_quantity<=0 OR p_unit_cost IS NULL OR p_unit_cost<=0 THEN
   RAISE EXCEPTION 'Ungültige Menge oder Stückkosten für die Gewinnschwelle';
 END IF;
 v_remaining:=case when p_freight_exempt then 0 else
    ceil(p_quantity/2)*private.specialization_factor(p_company_id,'transport_container_use',null) end;
 IF v_remaining>0 THEN
  FOR r IN SELECT i.quantity,i.average_unit_cost
    FROM public.inventories i JOIN public.products p ON p.id=i.product_id
    WHERE i.company_id=p_company_id AND p.company_id=p_company_id
      AND p.status='active' AND p.name='Transportcontainer' AND i.quantity>0
    ORDER BY i.quality_level,i.id
  LOOP
    EXIT WHEN v_remaining<=0;
    v_take:=least(v_remaining,r.quantity);
    v_cost:=v_cost+v_take*coalesce(r.average_unit_cost,0);
    v_remaining:=v_remaining-v_take;
  END LOOP;
  IF v_remaining>0 THEN
    RAISE EXCEPTION 'Nicht genügend Transportcontainer für die berechnete Gewinnschwelle';
  END IF;
 END IF;
 v_cost:=round(v_cost,2);
 v_fee_rate:=0.05*private.specialization_factor(p_company_id,'market_fee',null);
 IF v_fee_rate>=1 OR v_fee_rate<0 THEN RAISE EXCEPTION 'Ungültige Marktgebühr'; END IF;
 v_total:=p_quantity*p_unit_cost+v_cost;
 v_gross:=ceil(v_total/(p_quantity*(1-v_fee_rate))*100)/100;
 WHILE v_gross*p_quantity-round(v_gross*p_quantity*v_fee_rate,2)<v_total LOOP
    v_gross:=v_gross+0.01;
 END LOOP;
 RETURN v_gross;
END $function$;
CREATE OR REPLACE FUNCTION private.place_sell_order_quality_impl(p_company_id uuid, p_product_id uuid, p_quality integer, p_quantity numeric, p_price numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv public.inventories%rowtype;
  v_id uuid;
  v_min_price numeric;
begin
  perform private.assert_company_owner(p_company_id);

  if p_quantity<=0 or p_price<=0 or p_quality<1 then
    raise exception 'Ungültige Orderdaten';
  end if;

  select * into v_inv
  from public.inventories
  where company_id=p_company_id
    and product_id=p_product_id
    and quality_level=p_quality
  for update;

  if v_inv.id is null or coalesce(v_inv.quantity,0)<p_quantity then
    raise exception 'Nicht genügend Lagerbestand in Q%',p_quality;
  end if;

  if coalesce(v_inv.average_unit_cost,0)<=0 then
    raise exception 'Beschaffungskosten für dieses Produkt sind nicht verfügbar';
  end if;

  v_min_price := private.market_order_economic_break_even(p_company_id,v_inv.average_unit_cost,p_quantity,
    exists(select 1 from public.products p where p.id=p_product_id and p.name='Transportcontainer'));
  if p_price < v_min_price then
    raise exception 'Der Mindestpreis beträgt % OC$ je Einheit',v_min_price;
  end if;

  update public.inventories
  set quantity=quantity-p_quantity
  where id=v_inv.id;

  insert into public.market_orders(
    company_id,product_id,order_type,quantity,remaining_quantity,price_per_unit,quality_level
  )
  values(
    p_company_id,p_product_id,'sell',p_quantity,p_quantity,p_price,p_quality
  )
  returning id into v_id;

  insert into private.market_order_product_cost_basis(
    order_id,company_id,product_id,material_id,quality_level,unit_cost
  )
  values(
    v_id,p_company_id,p_product_id,null,p_quality,v_inv.average_unit_cost
  );

  perform private.consume_transport_containers(p_company_id,p_quantity,'market_order',v_id);

  return v_id;
end
$function$;
CREATE OR REPLACE FUNCTION private.place_material_sell_order_quality_impl(p_company_id uuid, p_material_id uuid, p_quality integer, p_quantity numeric, p_price numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv public.material_inventories%rowtype;
  v_id uuid;
  v_min_price numeric;
begin
  perform private.assert_company_owner(p_company_id);

  if p_quantity<=0 or p_price<=0 or p_quality<1 then
    raise exception 'Ungültige Orderdaten';
  end if;

  select * into v_inv
  from public.material_inventories
  where company_id=p_company_id
    and material_id=p_material_id
    and quality_level=p_quality
  for update;

  if v_inv.id is null or coalesce(v_inv.quantity,0)<p_quantity then
    raise exception 'Nicht genügend Materialbestand in Q%',p_quality;
  end if;

  if coalesce(v_inv.average_unit_cost,0)<=0 then
    raise exception 'Beschaffungskosten für dieses Material sind nicht verfügbar';
  end if;

  v_min_price := private.market_order_economic_break_even(p_company_id,v_inv.average_unit_cost,p_quantity,false);
  if p_price < v_min_price then
    raise exception 'Der Mindestpreis beträgt % OC$ je Einheit',v_min_price;
  end if;

  update public.material_inventories
  set quantity=quantity-p_quantity
  where id=v_inv.id;

  insert into public.market_orders(
    company_id,material_id,order_type,quantity,remaining_quantity,price_per_unit,quality_level
  )
  values(
    p_company_id,p_material_id,'sell',p_quantity,p_quantity,p_price,p_quality
  )
  returning id into v_id;

  insert into private.market_order_product_cost_basis(
    order_id,company_id,product_id,material_id,quality_level,unit_cost
  )
  values(
    v_id,p_company_id,null,p_material_id,p_quality,v_inv.average_unit_cost
  );

  perform private.consume_transport_containers(p_company_id,p_quantity,'market_order',v_id);

  return v_id;
end
$function$;
CREATE OR REPLACE FUNCTION private.enforce_balanced_npc_quality_quote()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_type text;v_cost numeric;v_base numeric;v_item text;v_category text;v_material public.materials%rowtype;
BEGIN
 IF NEW.order_type <> 'sell' OR NEW.status NOT IN ('open','partially_filled') THEN RETURN NEW; END IF;
 SELECT company_type INTO v_type FROM public.companies WHERE id=NEW.company_id;
 IF v_type IS DISTINCT FROM 'npc' THEN RETURN NEW; END IF;
 IF NEW.product_id IS NOT NULL THEN
   SELECT name,category INTO v_item,v_category FROM public.products WHERE id=NEW.product_id;
   IF v_category='research' OR v_item='Transportcontainer' THEN
     NEW.quality_level:=1;
     IF v_category='research' THEN NEW.price_per_unit:=round(27::numeric+random()::numeric*3,2);
     ELSE NEW.price_per_unit:=round(54::numeric+random()::numeric*4,2); END IF;
     RETURN NEW;
   END IF;
 END IF;
 IF NEW.material_id IS NOT NULL THEN
   SELECT * INTO v_material FROM public.materials WHERE id=NEW.material_id;
   IF v_material.id IS NULL THEN RAISE EXCEPTION 'Rohstoffpreis: Unbekannter Rohstoff'; END IF;
   v_base:=greatest(v_material.base_cost,0.01);
   v_cost:=v_base*private.quality_multiplier(NEW.quality_level);
 ELSE
   SELECT name INTO v_item FROM public.products WHERE id=NEW.product_id;
   IF v_item IS NULL THEN RAISE EXCEPTION 'Produktpreis: Unbekanntes Produkt'; END IF;
   select q.base_cost,q.quality_cost into v_base,v_cost
   from private.npc_market_quote_cost_cache q
   where q.transaction_id=pg_current_xact_id()::text
     and q.product_name=v_item and q.quality_level=NEW.quality_level;
   if not found then
     v_base:=private.simulated_product_quality_unit_cost(v_item,1);
     v_cost:=private.simulated_product_quality_unit_cost(v_item,NEW.quality_level);
   end if;
   IF v_base IS NULL OR v_cost IS NULL OR v_base<=0 OR v_cost<=0 THEN
     RAISE EXCEPTION 'Für dieses Produkt fehlen berechenbare Rezeptkosten';
   END IF;
 END IF;
 NEW.price_per_unit:=greatest(NEW.price_per_unit,private.market_balanced_quality_price(v_cost,v_base,NEW.quality_level));
 RETURN NEW;
END $function$;
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
        select ceil(greatest(v_material.base_cost,coalesce(max(i.average_unit_cost),v_material.base_cost))*1.20*100)/100
        into v_price_floor
        from public.material_inventories i join public.companies c on c.id=i.company_id
        where i.material_id=v_material.id and i.quality_level=v_quality and c.company_type='player' and i.average_unit_cost>0;
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
    else
      v_base_price:=greatest(0.01,round(coalesce(
        private.npc_product_cost_basis(v_catalog.name,v_catalog.category,1,v_catalog.suggested_retail_price),
        greatest(coalesce(v_catalog.suggested_retail_price,0)/2,0.01)
      )*2.00,2));
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
        select ceil(greatest(
          coalesce(private.npc_product_cost_basis(v_catalog.name,v_catalog.category,v_quality,v_catalog.suggested_retail_price),0.01),
          coalesce((select max(i.average_unit_cost) from public.inventories i join public.products p on p.id=i.product_id join public.companies c on c.id=i.company_id where p.name=v_catalog.name and p.category=v_catalog.category and i.quality_level=v_quality and c.company_type='player' and i.average_unit_cost>0),0),
          coalesce((select max(j.finished_unit_cost) from public.production_jobs j join public.products p on p.id=j.product_id where p.name=v_catalog.name and p.category=v_catalog.category and j.quality_level=v_quality and j.finished_unit_cost>0),0)
        )*1.20*100)/100 into v_price_floor;
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
