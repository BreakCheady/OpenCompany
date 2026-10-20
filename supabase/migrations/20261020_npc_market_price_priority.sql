-- NPC player-order purchases: same product/material and quality, lowest price first.
-- Validate separately before applying to production.
CREATE OR REPLACE FUNCTION private.run_npc_market_tick_core()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_state timestamptz;
  v_order public.market_orders%rowtype;
  v_qty numeric;
  v_total numeric;
  v_fee numeric;
  v_net numeric;
  v_npc uuid;
  v_count int := 0;
  v_roll numeric;
  v_category text;
begin
  select last_run into v_state
  from private.npc_market_state where key='main' for update;
  if v_state > now()-interval '2 minutes' then return 0; end if;
  update private.npc_market_state set last_run=now() where key='main';

  for v_order in
    select o.*
    from public.market_orders o
    join public.companies c on c.id=o.company_id
    join private.market_order_product_cost_basis cb on cb.order_id=o.id
    left join public.materials m on m.id=o.material_id
    left join public.products p on p.id=o.product_id
    where o.order_type='sell' and o.status in ('open','partially_filled')
      and o.remaining_quantity>0
      and (o.expires_at is null or o.expires_at>now())
      and c.company_type='player' and cb.unit_cost>0
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
      and o.price_per_unit<=greatest(
        cb.npc_max_price,
        (case when o.material_id is not null
          then private.market_balanced_quality_price(
            m.base_cost*private.quality_multiplier(o.quality_level),
            m.base_cost,o.quality_level)
          else private.market_balanced_quality_price(
            private.simulated_product_quality_unit_cost(p.name,o.quality_level),
            private.simulated_product_quality_unit_cost(p.name,1),
            o.quality_level)
        end)*1.10
      )
    order by o.price_per_unit asc,o.created_at asc,o.id asc limit 8
  loop
    if v_order.product_id is not null then
      select p.category into v_category from public.products p where p.id=v_order.product_id;
    else v_category:='raw_materials'; end if;

    select c.id into v_npc
    from private.npc_industry_profiles ip join public.companies c on c.id=ip.company_id
    where ip.category=v_category and ip.can_buy and c.company_type='npc'
      and c.company_code<>'U00000' and c.status='active'
    order by random()/greatest(ip.activity_weight,0.1) limit 1;

    if v_npc is null then continue; end if;
    v_roll:=random();
    if v_order.remaining_quantity>=200 then
      v_qty:=case when v_roll<0.15 then 25 when v_roll<0.35 then 50 when v_roll<0.60 then 100 when v_roll<0.80 then 150 else 200 end;
    elsif v_order.remaining_quantity>=100 then
      v_qty:=case when v_roll<0.20 then 20 when v_roll<0.50 then 50 when v_roll<0.75 then 75 else 100 end;
    elsif v_order.remaining_quantity>=50 then
      v_qty:=case when v_roll<0.25 then 10 when v_roll<0.60 then 25 else 50 end;
    else
      v_qty:=least(v_order.remaining_quantity,greatest(2,(2+floor(random()*24))::numeric));
    end if;

    v_qty:=least(v_order.remaining_quantity,v_qty);
    v_total:=round(v_qty*v_order.price_per_unit,2);
    v_fee:=round(v_total*0.05*private.specialization_factor(v_order.company_id,'market_fee'),2);
    v_net:=v_total-v_fee;
    if (select cash_balance from public.companies where id=v_npc)>=v_total then
      update public.companies set cash_balance=cash_balance-v_total where id=v_npc;
      update public.companies set cash_balance=cash_balance+v_net where id=v_order.company_id;
      update public.market_orders
      set remaining_quantity=remaining_quantity-v_qty,
          status=case when remaining_quantity-v_qty<=0 then 'filled' else 'partially_filled' end
      where id=v_order.id;
      insert into public.market_trades(
        order_id,buyer_company_id,seller_company_id,product_id,material_id,
        quantity,price_per_unit,total_value,market_fee,quality_level)
      values(v_order.id,v_npc,v_order.company_id,v_order.product_id,v_order.material_id,
        v_qty,v_order.price_per_unit,v_total,v_fee,v_order.quality_level);
      insert into public.financial_transactions(
        company_id,transaction_type,amount,description,reference_type,reference_id)
      values
        (v_order.company_id,'market_sale',v_net,'Verkauf an NPC nach Marktgebühr','market_order',v_order.id),
        (v_order.company_id,'market_fee',-v_fee,'Marktgebühr','market_order',v_order.id);
      v_count:=v_count+1;
    end if;
  end loop;
  v_count:=v_count+private.run_npc_intercompany_trade();
  v_count:=v_count+private.ensure_npc_market_supply();
  return v_count;
end $function$
;
