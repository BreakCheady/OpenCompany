-- Stop NPC Mehl prices feeding back from player inventory acquisition costs.
-- Other catalog products retain the existing cost basis behavior.
create or replace function private.npc_product_cost_basis(
  p_product_name text,p_product_category text,p_quality integer,p_fallback_recommended_price numeric
) returns numeric language sql stable set search_path='' as $$
  select case
    when p_product_name='Mehl' and p_product_category='food_component'
      and coalesce(p_fallback_recommended_price,0)>0
    then round(p_fallback_recommended_price/2,2)
    else coalesce(
      (select round(avg(i.average_unit_cost),2)
       from public.inventories i join public.products p on p.id=i.product_id
       join public.companies c on c.id=i.company_id
       where c.company_type='player' and p.status='active'
         and p.name=p_product_name and p.category=p_product_category
         and i.quality_level=p_quality and i.average_unit_cost>0),
      (select round(avg(i.average_unit_cost),2)
       from public.inventories i join public.products p on p.id=i.product_id
       join public.companies c on c.id=i.company_id
       where c.company_type='player' and p.status='active'
         and p.name=p_product_name and p.category=p_product_category
         and i.average_unit_cost>0),
      case when coalesce(p_fallback_recommended_price,0)>0
        then round(p_fallback_recommended_price/2,2) else null end)
  end
$$;
