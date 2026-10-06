create or replace function public.get_market_product_catalog()
returns table(
  name text,
  category text,
  required_building_type_id uuid
)
language sql
stable
security definer
set search_path=''
as $$
  select
    cat.name::text,
    cat.category::text,
    bt.id
  from private.game_product_catalog cat
  left join public.building_types bt on bt.code=cat.building_code
  order by cat.category,cat.name
$$;

revoke all on function public.get_market_product_catalog() from public,anon;
grant execute on function public.get_market_product_catalog() to authenticated;
