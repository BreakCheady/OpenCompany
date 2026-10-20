-- Align NPC-to-NPC consumption with cheapest valid sell order per item/quality.
CREATE OR REPLACE FUNCTION private.run_npc_intercompany_trade()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.market_orders%rowtype;
  v_category text;
  v_demand numeric;
  v_buyer uuid;
  v_qty numeric;
  v_total numeric;
  v_count integer:=0;
begin
  for v_order in
    select o.*
    from public.market_orders o
    join public.companies seller on seller.id=o.company_id
    left join public.products p on p.id=o.product_id
    where seller.company_type='npc'
      and seller.company_code<>'U00000'
      and seller.status='active'
      and o.order_type='sell'
      and o.status in ('open','partially_filled')
      and coalesce(o.remaining_quantity,0)>0
      and (o.expires_at is null or o.expires_at>now())
      and not exists (
        select 1 from public.market_orders cheaper
        left join public.products cp on cp.id=cheaper.product_id
        where cheaper.order_type='sell'
          and cheaper.status in ('open','partially_filled')
          and cheaper.remaining_quantity>0
          and (cheaper.expires_at is null or cheaper.expires_at>now())
          and cheaper.quality_level=o.quality_level
          and ((o.material_id is not null and cheaper.material_id=o.material_id)
            or (o.product_id is not null and cp.name=p.name and cp.category=p.category))
          and (cheaper.price_per_unit<o.price_per_unit
            or (cheaper.price_per_unit=o.price_per_unit
              and (cheaper.created_at<o.created_at
                or (cheaper.created_at=o.created_at and cheaper.id<o.id))))
      )
    order by o.price_per_unit asc,o.created_at asc,o.id asc
    limit 12
  loop
    if v_order.product_id is not null then
      select p.category into v_category from public.products p where p.id=v_order.product_id;
      select coalesce(md.demand_index,100) into v_demand
      from public.market_demand md where md.category=v_category;
      v_demand:=coalesce(v_demand,100);
    else
      v_category:='raw_materials';
      v_demand:=100;
    end if;

    -- Higher demand means more frequent NPC consumption, but activity stays bounded.
    if random() > least(0.65,greatest(0.18,v_demand/250.0)) then
      continue;
    end if;

    select c.id into v_buyer
    from private.npc_industry_profiles ip
    join public.companies c on c.id=ip.company_id
    where ip.category=v_category
      and ip.can_buy
      and c.company_type='npc'
      and c.company_code<>'U00000'
      and c.status='active'
      and c.id<>v_order.company_id
      and c.cash_balance>greatest(250000,v_order.price_per_unit*5)
    order by random()/greatest(ip.activity_weight,0.1)
    limit 1;

    if v_buyer is null then
      continue;
    end if;

    v_qty:=least(
      v_order.remaining_quantity,
      case when v_order.material_id is not null
        then greatest(10,floor(20+random()*81))
        else greatest(2,floor(3+random()*23))
      end
    );
    v_total:=round(v_qty*v_order.price_per_unit,2);

    if (select cash_balance from public.companies where id=v_buyer) < v_total then
      continue;
    end if;

    update public.companies set cash_balance=cash_balance-v_total where id=v_buyer;
    update public.companies set cash_balance=cash_balance+v_total where id=v_order.company_id;

    update public.market_orders
    set remaining_quantity=remaining_quantity-v_qty,
        status=case when remaining_quantity-v_qty<=0 then 'filled' else 'partially_filled' end
    where id=v_order.id;

    insert into public.market_trades(
      order_id,buyer_company_id,seller_company_id,product_id,material_id,
      quantity,price_per_unit,total_value,market_fee,quality_level
    )
    values(
      v_order.id,v_buyer,v_order.company_id,v_order.product_id,v_order.material_id,
      v_qty,v_order.price_per_unit,v_total,0,v_order.quality_level
    );

    v_count:=v_count+1;
  end loop;
  return v_count;
end $function$
;
