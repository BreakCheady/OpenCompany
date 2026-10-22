-- Persistent, unreserved limit purchases. Apply only after staging validation.
create table if not exists public.market_limit_buy_orders (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 material_id uuid references public.materials(id),
 product_name text,
 product_category text,
 qualities integer[] not null,
 target_quantity numeric not null check (target_quantity>0 and target_quantity=trunc(target_quantity)),
 remaining_quantity numeric not null check (remaining_quantity>=0 and remaining_quantity=trunc(remaining_quantity)),
 max_unit_price numeric not null check (max_unit_price>0),
 status text not null default 'open' check (status in ('open','filled','cancelled')),
 created_at timestamptz not null default now(),
 finished_at timestamptz,
 check ((material_id is not null and product_name is null and product_category is null) or (material_id is null and product_name is not null and product_category is not null)),
 check (remaining_quantity<=target_quantity),
 check (cardinality(qualities)>0 and qualities <@ array[1,2,3,4,5])
);
create index if not exists market_limit_buy_open_idx on public.market_limit_buy_orders(status,material_id,max_unit_price,created_at);
create table if not exists public.market_limit_buy_fills (
 id uuid primary key default gen_random_uuid(),
 limit_order_id uuid not null references public.market_limit_buy_orders(id),
 sell_order_id uuid not null references public.market_orders(id),
 trade_id uuid references public.market_trades(id),
 quantity numeric not null check(quantity>0),
 quality_level integer not null,
 price_per_unit numeric not null,
 total_value numeric not null,
 batch_id uuid not null,
 created_at timestamptz not null default now()
);
create index if not exists market_limit_fills_order_idx on public.market_limit_buy_fills(limit_order_id,created_at);
alter table public.market_limit_buy_orders enable row level security;
alter table public.market_limit_buy_fills enable row level security;
create policy limit_buy_owner_read on public.market_limit_buy_orders for select to authenticated
 using (exists(select 1 from public.companies c where c.id=company_id and c.owner_user_id=(select auth.uid())));
create policy limit_fill_owner_read on public.market_limit_buy_fills for select to authenticated
 using (exists(select 1 from public.market_limit_buy_orders o join public.companies c on c.id=o.company_id where o.id=limit_order_id and c.owner_user_id=(select auth.uid())));
grant select on public.market_limit_buy_orders,public.market_limit_buy_fills to authenticated;

create or replace function private.match_limit_buy_orders(p_company_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
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
  for v_report in select quality_level,min(id) notification_id,sum(quantity) qty,sum(total_value) total
     from public.market_limit_buy_fills where batch_id=v_batch and limit_order_id=v_buy.id
     group by quality_level loop
   insert into public.push_notification_queue(user_id,event_type,reference_id,title,body,url,status)
     select c.owner_user_id,'market_sale',v_report.notification_id,'Limitauftrag ausgeführt',
       format('%s Q%s: %s Einheiten zu Ø %s OC$/Einheit gekauft. Kosten: %s OC$. Verbleibend: %s.',
         coalesce(v_buy.product_name,(select name from public.materials where id=v_buy.material_id)),
         v_report.quality_level,v_report.qty,round(v_report.total/v_report.qty,2),
         v_report.total,v_buy.remaining_quantity),
       '/#market','pending'
     from public.companies c where c.id=v_buy.company_id;
  end loop;
 end loop;
 perform pg_catalog.set_config('app.limit_buy_matching','0',true);
end $;
revoke all on function private.match_limit_buy_orders(uuid) from public,anon,authenticated;

create or replace function public.place_limit_buy_order(
 p_company_id uuid,p_material_id uuid,p_product_id uuid,p_qualities integer[],
 p_quantity numeric,p_max_price numeric
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_product public.products%rowtype;
begin
 perform private.assert_company_owner(p_company_id);
 if p_quantity is null or p_quantity<=0 or p_quantity<>trunc(p_quantity) or p_max_price is null or p_max_price<=0 then
   raise exception 'Ungültige Menge oder Preisgrenze';
 end if;
 if p_qualities is null or cardinality(p_qualities)=0 or not p_qualities <@ array[1,2,3,4,5] then
   raise exception 'Ungültige Qualitätsauswahl';
 end if;
 if (p_material_id is null)=(p_product_id is null) then raise exception 'Genau eine Ware auswählen'; end if;
 if p_material_id is not null and not exists(select 1 from public.materials where id=p_material_id) then
   raise exception 'Unbekannter Rohstoff';
 end if;
 if p_product_id is not null then
   select * into v_product from public.products where id=p_product_id and company_id=p_company_id and status='active';
   if not found then raise exception 'Produkt für Unternehmen nicht verfügbar'; end if;
 end if;
 insert into public.market_limit_buy_orders(company_id,material_id,product_name,product_category,qualities,target_quantity,remaining_quantity,max_unit_price)
 values (p_company_id,p_material_id,v_product.name,v_product.category,p_qualities,p_quantity,p_quantity,p_max_price)
 returning id into v_id;
 perform private.match_limit_buy_orders(p_company_id);
 return v_id;
end $$;
revoke all on function public.place_limit_buy_order(uuid,uuid,uuid,integer[],numeric,numeric) from public,anon;
grant execute on function public.place_limit_buy_order(uuid,uuid,uuid,integer[],numeric,numeric) to authenticated;

create or replace function public.cancel_limit_buy_order(p_order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_order public.market_limit_buy_orders%rowtype;
begin
 select * into v_order from public.market_limit_buy_orders where id=p_order_id for update;
 if not found then raise exception 'Auftrag nicht gefunden'; end if;
 perform private.assert_company_owner(v_order.company_id);
 if v_order.status<>'open' then raise exception 'Auftrag ist bereits abgeschlossen'; end if;
 update public.market_limit_buy_orders set status='cancelled',finished_at=now() where id=p_order_id;
end $$;
revoke all on function public.cancel_limit_buy_order(uuid) from public,anon;
grant execute on function public.cancel_limit_buy_order(uuid) to authenticated;

create or replace function private.limit_buy_market_wakeup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if pg_trigger_depth()=1 and current_setting('app.limit_buy_matching',true) is distinct from '1' then perform private.match_limit_buy_orders(); end if;
 return new;
end $$;
create trigger limit_buy_new_sell after insert on public.market_orders
for each row when (new.order_type='sell' and new.status in ('open','partially_filled'))
execute function private.limit_buy_market_wakeup();
create trigger limit_buy_refreshed_sell after update of remaining_quantity,status,price_per_unit on public.market_orders
for each row when (new.order_type='sell' and new.status in ('open','partially_filled') and new.remaining_quantity>0
  and (new.remaining_quantity>old.remaining_quantity or new.price_per_unit<>old.price_per_unit))
execute function private.limit_buy_market_wakeup();
create or replace function private.limit_buy_funds_wakeup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if pg_trigger_depth()=1 and current_setting('app.limit_buy_matching',true) is distinct from '1' then perform private.match_limit_buy_orders(new.id); end if;
 return new;
end $$;
create trigger limit_buy_funds_replenished after update of cash_balance on public.companies
for each row when (new.cash_balance>old.cash_balance)
execute function private.limit_buy_funds_wakeup();
