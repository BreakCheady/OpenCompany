-- Production function patch applied and verified on 2026-10-12.
-- Prevent zero-revenue retail orders at min/max selling price boundaries.
CREATE OR REPLACE FUNCTION private.start_retail_sale_on_building_v2_impl(p_company_id uuid, p_building_id uuid, p_product_id uuid, p_quality integer, p_quantity numeric, p_unit_price numeric, p_input_text text, p_start_snapshot jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_product public.products%rowtype;
  v_inventory public.inventories%rowtype;
  v_building public.company_buildings%rowtype;
  v_type public.building_types%rowtype;
  v_units_per_hour numeric;
  v_hours numeric;
  v_avg numeric;
  v_min numeric;
  v_max numeric;
  v_effective_unit numeric;
  v_total numeric;
  v_job uuid;
  v_snapshot jsonb;
  v_operating_rate numeric;
  v_efficiency_factor numeric;
  v_economy_factor numeric;
  v_operating_basis numeric;
  v_operating_cost numeric;
  v_cash numeric;
  v_customer_factor numeric; v_customer_satisfaction numeric; v_customer_loyalty numeric;
begin
  perform private.assert_company_owner(p_company_id);

  if p_quantity is null or p_quantity<=0 or p_quantity<>trunc(p_quantity) then
    raise exception 'Im Handel können nur ganze Einheiten verkauft werden';
  end if;
  if p_quality is null or p_quality<1 then raise exception 'Ungültige Qualität'; end if;
  if p_unit_price is null or p_unit_price<=0 then raise exception 'Der Verkaufspreis muss größer als 0 sein'; end if;

  select * into v_product
  from public.products
  where id=p_product_id and company_id=p_company_id and status='active';

  if v_product.id is null then raise exception 'Produkt nicht gefunden'; end if;
  if v_product.name='Transportcontainer' then
    raise exception 'Transportcontainer können nur über die Warenbörse verkauft werden';
  end if;
  if v_product.required_retail_building_type_id is null then
    raise exception 'Dieses Produkt kann aktuell nicht über den Handel verkauft werden';
  end if;

  select * into v_building
  from public.company_buildings
  where id=p_building_id and company_id=p_company_id and status='active'
  for update;

  if v_building.id is null then raise exception 'Ausgewähltes Verkaufsgebäude ist nicht verfügbar'; end if;
  if v_building.building_type_id<>v_product.required_retail_building_type_id then
    raise exception 'Das ausgewählte Gebäude kann dieses Produkt nicht verkaufen';
  end if;
  if exists(select 1 from public.retail_sale_jobs j where j.building_id=v_building.id and j.status='running') then
    raise exception 'Das ausgewählte Verkaufsgebäude ist bereits belegt';
  end if;

  select * into v_type from public.building_types where id=v_building.building_type_id;

  select * into v_inventory
  from public.inventories
  where company_id=p_company_id and product_id=p_product_id and quality_level=p_quality
  for update;

  if v_inventory.id is null or v_inventory.quantity<p_quantity then
    raise exception 'Nicht genügend Produktbestand in Q%',p_quality;
  end if;
  if v_inventory.average_unit_cost<=0 then
    raise exception 'Beschaffungskosten für dieses Produkt sind nicht verfügbar';
  end if;

  v_avg:=private.retail_average_price(v_inventory.average_unit_cost,v_product.category)*private.specialization_factor(p_company_id,'retail_price_effect',v_product.category);
  v_min:=round(v_avg*0.75,2);
  v_max:=round(v_avg*1.20,2);

  if p_unit_price<=v_min or p_unit_price>=v_max then
    raise exception 'Der Verkaufspreis muss zwischen % OC$ und % OC$ liegen',v_min,v_max;
  end if;

  select satisfaction,loyalty into v_customer_satisfaction,v_customer_loyalty from public.company_customer_relations where company_id=p_company_id;
  v_customer_factor:=case when coalesce(v_customer_satisfaction,50)<20 then 0.75 when v_customer_satisfaction<40 then 0.85 when v_customer_satisfaction<60 then 1 when v_customer_satisfaction<80 then 1.05 when v_customer_satisfaction<95 then 1.10 else 1.15 end;
  v_units_per_hour:=greatest(
    1,
    floor(coalesce(v_product.base_retail_rate,1)*private.building_level_multiplier(v_building.level)*private.demand_retail_factor(v_product.category)*private.specialization_factor(p_company_id,'retail_rate',v_product.category)*private.manager_multiplier(p_company_id,'sales','sales_rate')*v_customer_factor*(case when private.economy_phase()='recession' then 1+least(0.1,greatest(0,coalesce(v_customer_loyalty,40)-40)/600) else 1 end))
  );
  v_hours:=p_quantity/v_units_per_hour;
  if v_hours>24 then raise exception 'Die maximale Verkaufsdauer beträgt 24 Stunden'; end if;

  v_effective_unit:=private.retail_effective_unit_revenue_company(p_company_id,v_inventory.average_unit_cost,p_unit_price,v_product.category);
  if v_effective_unit<=0 then raise exception 'Verkaufserlös muss größer als 0 sein'; end if;
  v_total:=round(p_quantity*v_effective_unit,2);

  v_operating_rate:=private.operating_cost_rate(v_type.code,v_type.building_category);
  v_efficiency_factor:=private.operating_efficiency_factor(v_building.level);
  v_economy_factor:=private.economy_production_cost_factor();
  v_operating_basis:=round(v_inventory.average_unit_cost*p_quantity,2);
  v_operating_cost:=round(v_operating_basis*v_operating_rate*v_efficiency_factor*v_economy_factor*private.specialization_factor(p_company_id,'retail_operating_cost',v_product.category),2);

  select cash_balance into v_cash
  from public.companies
  where id=p_company_id
  for update;

  if coalesce(v_cash,0)<v_operating_cost then
    raise exception 'Nicht genügend Guthaben für Energie- und Betriebskosten (% OC$)',v_operating_cost;
  end if;

  update public.inventories set quantity=quantity-p_quantity where id=v_inventory.id;

  insert into public.retail_sale_jobs(
    company_id,product_id,building_id,quantity,units_per_hour,total_value,finishes_at,quality_level
  )
  values(
    p_company_id,p_product_id,v_building.id,p_quantity,v_units_per_hour,
    v_total,now()+(v_hours*interval '1 hour'),p_quality
  )
  returning id into v_job;

  v_snapshot:=coalesce(p_start_snapshot,'{}'::jsonb)||jsonb_build_object(
    'customerSatisfactionAtStart',coalesce(v_customer_satisfaction,50),'customerDemandFactor',v_customer_factor,
    'quantity',p_quantity,
    'quality',p_quality,
    'unitPrice',p_unit_price,
    'referencePrice',v_avg,
    'unitsPerHour',v_units_per_hour,
    'hours',v_hours,
    'totalValue',v_total,
    'buildingTypeName',v_type.name,
    'operatingCostRate',v_operating_rate,
    'operatingEfficiencyFactor',v_efficiency_factor,
    'operatingEconomyFactor',v_economy_factor,
    'operatingCostBasis',v_operating_basis,
    'operatingCost',v_operating_cost,
    'retailOperatingSpecializationFactor',private.specialization_factor(p_company_id,'retail_operating_cost',v_product.category)
  );

  update public.retail_sale_jobs
  set start_input_text=nullif(trim(coalesce(p_input_text,'')),''),
      start_snapshot=v_snapshot
  where id=v_job and company_id=p_company_id;

  if v_operating_cost>0 then
    update public.companies
    set cash_balance=cash_balance-v_operating_cost,updated_at=now()
    where id=p_company_id;

    insert into public.financial_transactions(
      company_id,transaction_type,amount,description,reference_type,reference_id
    )
    values(
      p_company_id,'operating_cost',-v_operating_cost,
      'Energie & Betrieb – '||v_type.name||': '||trunc(p_quantity)||' × '||v_product.name,
      'retail_sale_job',v_job
    );
  end if;

  return v_job;
end
$function$
;
