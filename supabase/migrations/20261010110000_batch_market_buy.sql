-- One server request for multiple independently validated order purchases.
-- The transaction is atomic: a failing fill rolls back all earlier fills.
create or replace function public.buy_market_orders_batch(
 p_buyer_company_id uuid,
 p_fills jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
 v_fill jsonb;
 v_order_id uuid;
 v_quantity numeric;
 v_total_quantity numeric:=0;
 v_total_value numeric:=0;
 v_order public.market_orders%rowtype;
 v_count integer:=0;
begin
 perform private.assert_company_owner(p_buyer_company_id);
 if jsonb_typeof(p_fills)<>'array' or jsonb_array_length(p_fills)=0 or jsonb_array_length(p_fills)>150 then
   raise exception 'Ungültige Anzahl Kaufpositionen (1 bis 150)';
 end if;
 -- Prevalidate without side effects; normal purchase function revalidates with row locks.
 for v_fill in select value from jsonb_array_elements(p_fills) loop
   if jsonb_typeof(v_fill)<>'object' then raise exception 'Ungültige Kaufposition'; end if;
   v_order_id:=(v_fill->>'order_id')::uuid;
   v_quantity:=(v_fill->>'quantity')::numeric;
   if v_order_id is null or v_quantity is null or v_quantity<=0 then
     raise exception 'Ungültige Kaufmenge';
   end if;
   if exists(select 1 from jsonb_array_elements(p_fills) x
             where x.value->>'order_id'=v_order_id::text
             group by x.value->>'order_id' having count(*)>1) then
     raise exception 'Doppelte Verkaufsorder im Kauf';
   end if;
   select * into v_order from public.market_orders where id=v_order_id;
   if v_order.id is null or v_order.order_type<>'sell' or v_order.company_id=p_buyer_company_id
      or v_order.status not in ('open','partially_filled') or v_order.remaining_quantity<v_quantity then
     raise exception 'Angebot nicht mehr verfügbar';
   end if;
   v_total_value:=v_total_value+round(v_quantity*v_order.price_per_unit,2);
   v_total_quantity:=v_total_quantity+v_quantity;
   v_count:=v_count+1;
 end loop;
 -- Use existing ledger and inventory logic, so every fill retains its accounting triggers.
 for v_fill in select value from jsonb_array_elements(p_fills) loop
   perform private.buy_market_order_impl(p_buyer_company_id,(v_fill->>'order_id')::uuid,(v_fill->>'quantity')::numeric);
 end loop;
 return jsonb_build_object('quantity',v_total_quantity,'total',v_total_value,'orders',v_count);
end $$;
revoke all on function public.buy_market_orders_batch(uuid,jsonb) from public,anon;
grant execute on function public.buy_market_orders_batch(uuid,jsonb) to authenticated;
