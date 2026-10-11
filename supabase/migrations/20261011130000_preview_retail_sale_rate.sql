-- Authoritative retail rate preview uses exactly the rate multipliers from start_retail_sale_on_building_v2_impl.
create or replace function public.preview_retail_sale_rate(
  p_company_id uuid, p_building_id uuid, p_product_id uuid
) returns numeric
language plpgsql security definer set search_path='' as $$
declare
  v_building public.company_buildings%rowtype;
  v_product public.products%rowtype;
  v_satisfaction numeric;
  v_loyalty numeric;
  v_customer_factor numeric;
begin
  perform private.assert_company_owner(p_company_id);
  select * into v_building from public.company_buildings
    where id=p_building_id and company_id=p_company_id and status='active';
  select * into v_product from public.products
    where id=p_product_id and company_id=p_company_id and status='active';
  if v_building.id is null or v_product.id is null
    or v_product.required_retail_building_type_id is distinct from v_building.building_type_id then
    raise exception 'Verkaufsgebäude oder Produkt nicht verfügbar';
  end if;
  select satisfaction,loyalty into v_satisfaction,v_loyalty
    from public.company_customer_relations where company_id=p_company_id;
  v_customer_factor:=case when coalesce(v_satisfaction,50)<20 then 0.75
    when v_satisfaction<40 then 0.85 when v_satisfaction<60 then 1
    when v_satisfaction<80 then 1.05 when v_satisfaction<95 then 1.10 else 1.15 end;
  return greatest(1,floor(
    coalesce(v_product.base_retail_rate,1)
    *private.building_level_multiplier(v_building.level)
    *private.demand_retail_factor(v_product.category)
    *private.specialization_factor(p_company_id,'retail_rate',v_product.category)
    *private.manager_multiplier(p_company_id,'sales','sales_rate')
    *v_customer_factor
    *(case when private.economy_phase()='recession'
      then 1+least(0.1,greatest(0,coalesce(v_loyalty,40)-40)/600)
      else 1 end)
  ));
end $$;
revoke all on function public.preview_retail_sale_rate(uuid,uuid,uuid) from public,anon;
grant execute on function public.preview_retail_sale_rate(uuid,uuid,uuid) to authenticated;
