-- Limit order notifications aggregated by quality across the complete order lifecycle.
-- Previous per-matching-round push creation is removed without changing buy accounting.
create or replace function private.match_limit_buy_orders(p_company_id uuid default null)
returns void language plpgsql security definer set search_path='' as $limitbody$
declare
 v_buy public.market_limit_buy_orders%rowtype;
 v_sell public.market_orders%rowtype;
 v_buyer public.companies%rowtype;
 v_source public.products%rowtype;
 v_target_id uuid;
 v_qty numeric;
 v_cost numeric;
 v_fee numeric;
 v_batch uuid;
 v_trade_id uuid;
 v_name text;
 v_report record;
begin
 -- Prevent recursive cash-change triggers from rematching the same order.
 perform pg_catalog.set_config('app.limit_buy_matching','1',true);
 -- Only callable from trusted database triggers or an authenticated RPC that verifies ownership.
 for v_buy in
  select * from public.market_limit_buy_orders
  where status='open' and remaining_quantity>0
    and (p_company_id is null or company_id=p_company_id)
  order by created_at,id for update
 loop
  v_batch:=gen_random_uuid();
  loop
   select s.* into v_sell
   from public.market_orders s
   left join public.products p on p.id=s.product_id
   where s.order_type='sell' and s.status in ('open','partially_filled')
    and s.remaining_quantity>0 and s.company_id<>v_buy.company_id
    and s.price_per_unit<=v_buy.max_unit_price
    and s.quality_level=any(v_buy.qualities)
    and ((v_buy.material_id is not null and s.material_id=v_buy.material_id)
      or (v_buy.material_id is null and s.material_id is null
        and p.name=v_buy.product_name and p.category=v_buy.product_category))
   order by s.price_per_unit,s.created_at,s.id
   limit 1 for update of s;
   exit when not found;
   select * into v_buyer from public.companies where id=v_buy.company_id for update;
   exit when not found;
   v_qty:=least(v_buy.remaining_quantity,v_sell.remaining_quantity);
   v_cost:=round(v_qty*v_sell.price_per_unit,2);
   -- Without adequate funds for this fill, do not execute any purchase.
   exit when v_buyer.cash_balance<v_cost;
   v_target_id:=null;
   if v_sell.material_id is null then
     select * into v_source from public.products where id=v_sell.product_id;
     select p.id into v_target_id from public.products p where p.company_id=v_buy.company_id
       and p.name=v_source.name and p.category=v_source.category and p.status='active'
       order by p.id limit 1;
     exit when v_target_id is null;
     v_name:=v_source.name;
   else
     select name into v_name from public.materials where id=v_sell.material_id;
   end if;
   v_fee:=round(v_cost*0.05*private.specialization_factor(v_sell.company_id,'market_fee'),2);
   update public.companies set cash_balance=cash_balance-v_cost,updated_at=now() where id=v_buy.company_id;
   update public.companies set cash_balance=cash_balance+(v_cost-v_fee),updated_at=now() where id=v_sell.company_id;
   if v_sell.material_id is not null then
     insert into public.material_inventories(company_id,material_id,quality_level,quantity,average_unit_cost)
      values(v_buy.company_id,v_sell.material_id,v_sell.quality_level,v_qty,v_sell.price_per_unit)
     on conflict(company_id,material_id,quality_level) do update set
      average_unit_cost=(public.material_inventories.quantity*public.material_inventories.average_unit_cost+
         excluded.quantity*excluded.average_unit_cost)/(public.material_inventories.quantity+excluded.quantity),
      quantity=public.material_inventories.quantity+excluded.quantity;
   else
     insert into public.inventories(company_id,product_id,quality_level,quantity,average_unit_cost)
      values(v_buy.company_id,v_target_id,v_sell.quality_level,v_qty,v_sell.price_per_unit)
     on conflict(company_id,product_id,quality_level) do update set
      average_unit_cost=(public.inventories.quantity*public.inventories.average_unit_cost+
         excluded.quantity*excluded.average_unit_cost)/(public.inventories.quantity+excluded.quantity),
      quantity=public.inventories.quantity+excluded.quantity;
   end if;
   update public.market_orders set remaining_quantity=remaining_quantity-v_qty,
      status=case when remaining_quantity-v_qty<=0 then 'filled' else 'partially_filled' end where id=v_sell.id;
   insert into public.market_trades(order_id,buyer_company_id,seller_company_id,product_id,material_id,quantity,price_per_unit,total_value,market_fee,quality_level)
    values(v_sell.id,v_buy.company_id,v_sell.company_id,v_target_id,v_sell.material_id,v_qty,v_sell.price_per_unit,v_cost,v_fee,v_sell.quality_level)
    returning id into v_trade_id;
   insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id) values
     (v_buy.company_id,'market_buy',-v_cost,'Limitkauf: '||coalesce(v_name,'Artikel')||' Q'||v_sell.quality_level,'market_order',v_sell.id),
     (v_sell.company_id,'market_sale',v_cost-v_fee,'Marktverkauf Q'||v_sell.quality_level||' nach Marktgebühr','market_order',v_sell.id),
     (v_sell.company_id,'market_fee',-v_fee,'Marktgebühr','market_order',v_sell.id);
   insert into public.market_limit_buy_fills(limit_order_id,sell_order_id,trade_id,quantity,quality_level,price_per_unit,total_value,batch_id)
    values(v_buy.id,v_sell.id,v_trade_id,v_qty,v_sell.quality_level,v_sell.price_per_unit,v_cost,v_batch);
   update public.market_limit_buy_orders set remaining_quantity=remaining_quantity-v_qty,
     status=case when remaining_quantity-v_qty=0 then 'filled' else 'open' end,
     finished_at=case when remaining_quantity-v_qty=0 then now() else null end
     where id=v_buy.id returning * into v_buy;
   exit when v_buy.remaining_quantity=0;
  end loop;
 end loop;
 perform pg_catalog.set_config('app.limit_buy_matching','0',true);
end; $limitbody$;
create or replace function private.limit_buy_notify_completion()
returns trigger language plpgsql security definer set search_path='' as $notify$
declare r record; v_name text;
begin
 if new.status not in ('filled','cancelled') or old.status=new.status then return new; end if;
 v_name:=coalesce(new.product_name,(select m.name from public.materials m where m.id=new.material_id),'Ware');
 for r in
   select f.quality_level,
          (array_agg(f.id order by f.created_at,f.id))[1] as notification_id,
          sum(f.quantity) as quantity,
          sum(f.total_value) as total_value
   from public.market_limit_buy_fills f
   where f.limit_order_id=new.id
   group by f.quality_level
 loop
   insert into public.push_notification_queue(user_id,event_type,reference_id,title,body,url,status)
   select c.owner_user_id,'market_sale',r.notification_id,
       case when new.status='filled' then 'Limitauftrag abgeschlossen' else 'Limitauftrag storniert' end,
       format('%s Q%s: Gesamt %s Einheiten zu durchschnittlich %s OC$/Einheit gekauft. Gesamtkosten: %s OC$. %s',
         v_name,r.quality_level,r.quantity,
         round(r.total_value/nullif(r.quantity,0),2),
         round(r.total_value,2),
         case when new.status='filled' then 'Auftrag vollständig ausgeführt.'
              else format('Nicht gekaufte Restmenge: %s.',new.remaining_quantity) end),
       '/#market','pending'
   from public.companies c where c.id=new.company_id
   on conflict (user_id,event_type,reference_id) do nothing;
 end loop;
 return new;
end; $notify$;
revoke all on function private.limit_buy_notify_completion() from public,anon,authenticated;
drop trigger if exists limit_buy_completion_push on public.market_limit_buy_orders;
create trigger limit_buy_completion_push
after update of status on public.market_limit_buy_orders
for each row when (new.status in ('filled','cancelled') and old.status is distinct from new.status)
execute function private.limit_buy_notify_completion();
