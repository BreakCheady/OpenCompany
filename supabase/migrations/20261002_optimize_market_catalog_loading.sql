-- OpenCompany: compact marketplace catalog loading
-- Keeps the catalog request small while item-level orders are loaded on demand.

create index if not exists idx_market_orders_status_material_price
  on public.market_orders (status, material_id, price_per_unit, created_at);

create or replace function public.get_market_catalog_summary()
returns table(
  item_type text,
  material_id uuid,
  product_name text,
  product_category text,
  offer_count bigint,
  total_quantity numeric,
  best_price numeric
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with own_company as (
    select c.id
    from public.companies c
    where c.owner_user_id = (select auth.uid())
      and c.company_type = 'player'
    limit 1
  ),
  active_orders as (
    select o.*
    from public.market_orders o
    where o.order_type = 'sell'
      and o.status in ('open','partially_filled')
      and o.remaining_quantity > 0
      and (
        not exists (select 1 from own_company)
        or o.company_id <> (select id from own_company)
      )
  )
  select
    'material'::text,
    o.material_id,
    null::text,
    null::text,
    count(*)::bigint,
    sum(o.remaining_quantity)::numeric,
    min(o.price_per_unit)::numeric
  from active_orders o
  where o.material_id is not null
  group by o.material_id

  union all

  select
    'product'::text,
    null::uuid,
    p.name::text,
    p.category::text,
    count(*)::bigint,
    sum(o.remaining_quantity)::numeric,
    min(o.price_per_unit)::numeric
  from active_orders o
  join public.products p on p.id = o.product_id
  where o.product_id is not null
  group by p.name,p.category;
$function$;

revoke execute on function public.get_market_catalog_summary() from public, anon;
grant execute on function public.get_market_catalog_summary() to authenticated;
