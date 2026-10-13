CREATE OR REPLACE FUNCTION private.consume_transport_containers(p_company_id uuid, p_quantity numeric, p_reference_type text, p_reference_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_available numeric;
  v_requested numeric := ceil(greatest(coalesce(p_quantity,0),0)/2)
    * private.specialization_factor(p_company_id,'transport_container_use',null);
  v_remaining numeric := v_requested;
  v_take numeric;
  v_cost numeric := 0;
  r record;
begin
  if v_remaining <= 0 then return 0; end if;

  if p_reference_type = 'market_order'
     and exists (
       select 1
       from public.market_orders mo
       join public.products p on p.id = mo.product_id
       where mo.id = p_reference_id
         and mo.company_id = p_company_id
         and p.name = 'Transportcontainer'
     )
  then
    return 0;
  end if;

  select coalesce(sum(i.quantity),0)
    into v_available
  from public.inventories i
  join public.products p on p.id=i.product_id
  where i.company_id=p_company_id
    and p.company_id=p_company_id
    and p.status='active'
    and p.name='Transportcontainer';

  if v_available < v_remaining then
    raise exception 'Nicht genügend Transportcontainer. Benötigt: %, verfügbar: %',
      v_remaining, v_available;
  end if;

  for r in
    select i.id,i.quantity,i.average_unit_cost,i.quality_level
    from public.inventories i
    join public.products p on p.id=i.product_id
    where i.company_id=p_company_id
      and p.company_id=p_company_id
      and p.status='active'
      and p.name='Transportcontainer'
      and i.quantity>0
    order by i.quality_level,i.id
    for update of i
  loop
    exit when v_remaining<=0;
    v_take := least(v_remaining,r.quantity);
    v_cost := v_cost + v_take * coalesce(r.average_unit_cost,0);
    update public.inventories set quantity=quantity-v_take where id=r.id;
    v_remaining := v_remaining-v_take;
  end loop;

  v_cost := round(v_cost,2);
  insert into public.financial_transactions(
    company_id,transaction_type,amount,description,reference_type,reference_id,cost_basis
  )
  values(
    p_company_id,'freight_cost',-v_cost,
    'Frachtkosten: '||trim(to_char(v_requested,'FM9999999990.####'))||' × Transportcontainer',
    p_reference_type,p_reference_id,v_cost
  );
  return v_cost;
end
$function$
;
