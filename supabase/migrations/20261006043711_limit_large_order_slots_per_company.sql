create or replace function public.submit_large_customer_bid(
  p_company_id uuid,
  p_order_id uuid,
  p_price_per_unit numeric,
  p_quality integer,
  p_delivery_hours integer
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.large_customer_orders%rowtype;
  v_id uuid;
  v_committed integer;
  v_other_submitted integer;
begin
  perform private.assert_company_owner(p_company_id);

  select * into v
  from public.large_customer_orders
  where id=p_order_id
  for update;

  if v.id is null or v.status<>'bidding' or v.bidding_ends_at<=now() then
    raise exception 'Ausschreibung ist nicht mehr offen';
  end if;

  select count(*) into v_committed
  from public.large_customer_orders o
  where o.awarded_company_id=p_company_id
    and o.status='awarded';

  select count(*) into v_other_submitted
  from public.large_customer_bids b
  join public.large_customer_orders o on o.id=b.order_id
  where b.company_id=p_company_id
    and b.status='submitted'
    and b.order_id<>p_order_id
    and o.status='bidding'
    and o.bidding_ends_at>now();

  if v_committed+v_other_submitted>=3
     and not exists(
       select 1
       from public.large_customer_bids b
       where b.company_id=p_company_id
         and b.order_id=p_order_id
         and b.status='submitted'
     )
  then
    raise exception 'Du kannst maximal drei Großaufträge gleichzeitig belegen. Schließe zuerst einen offenen Auftrag ab oder warte auf die Vergabe deiner laufenden Gebote.';
  end if;

  if p_price_per_unit<=0 then raise exception 'Preis muss größer als 0 sein'; end if;
  if p_quality<v.minimum_quality or p_quality>5 then
    raise exception 'Mindestqualität Q% wird nicht erfüllt',v.minimum_quality;
  end if;
  if p_delivery_hours<=0 or p_delivery_hours>v.delivery_hours then
    raise exception 'Lieferzeit muss innerhalb der Frist liegen';
  end if;

  insert into public.large_customer_bids(
    order_id,company_id,price_per_unit,offered_quality,delivery_hours
  )
  values(
    p_order_id,p_company_id,round(p_price_per_unit,2),p_quality,p_delivery_hours
  )
  on conflict(order_id,company_id) do update set
    price_per_unit=excluded.price_per_unit,
    offered_quality=excluded.offered_quality,
    delivery_hours=excluded.delivery_hours,
    created_at=now(),
    status='submitted'
  returning id into v_id;

  return v_id;
end
$$;
