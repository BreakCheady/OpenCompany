
create or replace function private.operating_cost_rate(
  p_building_code text,
  p_building_category text
)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select case
    when p_building_category='retail' then 0.03
    when p_building_category='research' then 0.08
    when p_building_code='food_factory' then 0.06
    when p_building_code='textile_factory' then 0.06
    when p_building_code='construction_factory' then 0.07
    when p_building_code='machinery_factory' then 0.07
    when p_building_code='auto_factory' then 0.09
    when p_building_code='electronics_factory' then 0.09
    when p_building_code='chemical_factory' then 0.10
    when p_building_code='energy_factory' then 0.12
    when p_building_category='production' then 0.07
    else 0
  end::numeric
$function$;

create or replace function private.operating_efficiency_factor(p_level integer)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select greatest(
    0.80::numeric,
    1.00::numeric - (greatest(coalesce(p_level,1),1)-1) * 0.02::numeric
  )
$function$;

revoke all on function private.operating_cost_rate(text,text) from public,anon,authenticated;
revoke all on function private.operating_efficiency_factor(integer) from public,anon,authenticated;

create or replace function private.start_production_on_building_v2_impl(
  p_company_id uuid,
  p_building_id uuid,
  p_product_id uuid,
  p_hours numeric,
  p_input_text text,
  p_start_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
 v_product public.products%rowtype;
 v_building public.company_buildings%rowtype;
 v_type public.building_types%rowtype;
 v_multiplier numeric;
 v_units_per_hour numeric;
 v_output numeric;
 v_cash_cost numeric;
 v_core_cash_cost numeric:=0;
 v_base_cash_cost numeric:=0;
 v_labor_cost numeric:=0;
 v_input_cost numeric:=0;
 v_finished_unit_cost numeric;
 v_required numeric;
 v_available numeric;
 v_remaining numeric;
 v_take numeric;
 v_input public.production_recipe_inputs%rowtype;
 v_inv public.inventories%rowtype;
 v_min_quality integer;
 v_job uuid;
 v_mat public.material_inventories%rowtype;
 v_operating_rate numeric:=0;
 v_efficiency_factor numeric:=1;
 v_economy_factor numeric:=1;
 v_operating_basis numeric:=0;
 v_operating_cost numeric:=0;
begin
 perform private.assert_company_owner(p_company_id);
 if p_hours is null or p_hours<=0 or p_hours>24 then
   raise exception 'Produktionsdauer muss zwischen 0 und 24 Stunden liegen';
 end if;

 select * into v_product
 from public.products
 where id=p_product_id and company_id=p_company_id and status='active';
 if v_product.id is null then raise exception 'Produkt nicht gefunden'; end if;
 if v_product.required_building_type_id is null then
   raise exception 'Für dieses Produkt ist kein Produktionsgebäude hinterlegt';
 end if;

 select * into v_building
 from public.company_buildings
 where id=p_building_id
   and company_id=p_company_id
   and status='active'
 for update;

 if v_building.id is null then raise exception 'Ausgewähltes Produktionsgebäude ist nicht verfügbar'; end if;
 if v_building.building_type_id<>v_product.required_building_type_id then
   raise exception 'Das ausgewählte Gebäude kann dieses Produkt nicht herstellen';
 end if;
 if exists(select 1 from public.production_jobs j where j.building_id=v_building.id and j.status='running') then
   raise exception 'Das ausgewählte Produktionsgebäude ist bereits belegt';
 end if;

 select * into v_type from public.building_types where id=v_building.building_type_id;
 v_multiplier:=private.building_level_multiplier(v_building.level);
 v_units_per_hour:=greatest(0.01,floor(coalesce(v_product.base_production_rate,1)*v_multiplier)*private.economy_production_output_factor());
 v_output:=floor(v_units_per_hour*p_hours+0.0000001);
 if v_output<=0 then raise exception 'Produktionsmenge ist ungültig'; end if;

 v_min_quality:=greatest(1,v_product.quality_level-1);
 for v_input in
   select * from public.production_recipe_inputs where product_id=p_product_id order by id
 loop
   v_required:=v_input.quantity_per_unit*v_output;
   if v_input.material_id is not null then
     select coalesce(sum(quantity),0) into v_available
     from public.material_inventories
     where company_id=p_company_id and material_id=v_input.material_id and quality_level>=v_min_quality;
     if v_available<v_required then raise exception 'Nicht genügend Materialbestand in mindestens Q%',v_min_quality; end if;
   else
     select coalesce(sum(quantity),0) into v_available
     from public.inventories
     where company_id=p_company_id and product_id=v_input.component_product_id and quality_level>=v_min_quality;
     if v_available<v_required then raise exception 'Nicht genügend Vorprodukte in mindestens Q%',v_min_quality; end if;
   end if;
 end loop;

 if v_product.category='research' then
   v_base_cash_cost:=round(coalesce(v_product.production_cost,0)*v_output,2);
 end if;
 v_labor_cost:=round(coalesce(v_type.labor_cost_per_unit,0)*v_output,2);
 v_economy_factor:=private.economy_production_cost_factor();

 insert into public.production_jobs(
   company_id,product_id,building_id,hours,units_per_hour,output_quantity,
   production_cash_cost,finished_unit_cost,finishes_at,quality_level
 )
 values(
   p_company_id,p_product_id,v_building.id,p_hours,v_units_per_hour,v_output,
   0,0,now()+(p_hours*interval '1 hour'),v_product.quality_level
 )
 returning id into v_job;

 for v_input in
   select * from public.production_recipe_inputs where product_id=p_product_id order by id
 loop
   v_remaining:=v_input.quantity_per_unit*v_output;
   if v_input.material_id is not null then
     for v_mat in
       select * from public.material_inventories
       where company_id=p_company_id and material_id=v_input.material_id
         and quality_level>=v_min_quality and quantity>0
       order by quality_level,average_unit_cost,id
       for update
     loop
       exit when v_remaining<=0;
       v_take:=least(v_remaining,v_mat.quantity);
       update public.material_inventories set quantity=quantity-v_take where id=v_mat.id;
       v_input_cost:=v_input_cost+v_take*v_mat.average_unit_cost;
       insert into private.production_job_input_consumptions(job_id,material_id,quality_level,quantity,average_unit_cost)
       values(v_job,v_input.material_id,v_mat.quality_level,v_take,v_mat.average_unit_cost);
       v_remaining:=v_remaining-v_take;
     end loop;
   else
     for v_inv in
       select * from public.inventories
       where company_id=p_company_id and product_id=v_input.component_product_id
         and quality_level>=v_min_quality and quantity>0
       order by quality_level,average_unit_cost,id
       for update
     loop
       exit when v_remaining<=0;
       v_take:=least(v_remaining,v_inv.quantity);
       update public.inventories set quantity=quantity-v_take where id=v_inv.id;
       v_input_cost:=v_input_cost+v_take*v_inv.average_unit_cost;
       insert into private.production_job_input_consumptions(job_id,component_product_id,quality_level,quantity,average_unit_cost)
       values(v_job,v_input.component_product_id,v_inv.quality_level,v_take,v_inv.average_unit_cost);
       v_remaining:=v_remaining-v_take;
     end loop;
   end if;
 end loop;

 v_operating_rate:=private.operating_cost_rate(v_type.code,v_type.building_category);
 v_efficiency_factor:=private.operating_efficiency_factor(v_building.level);
 v_operating_basis:=v_base_cash_cost+v_labor_cost+v_input_cost;
 v_operating_cost:=round(v_operating_basis*v_operating_rate*v_efficiency_factor*v_economy_factor,2);
 v_core_cash_cost:=round((v_base_cash_cost+v_labor_cost)*v_economy_factor,2);
 v_cash_cost:=round(v_core_cash_cost+v_operating_cost,2);

 v_finished_unit_cost:=case
   when v_output>0 then
     (
       ((v_base_cash_cost+v_labor_cost+v_input_cost)*v_economy_factor)
       +v_operating_cost
     )/v_output
   else 0
 end;
 v_finished_unit_cost:=round(v_finished_unit_cost,6);

 update public.production_jobs
 set production_cash_cost=v_cash_cost,
     finished_unit_cost=v_finished_unit_cost,
     start_input_text=nullif(trim(coalesce(p_input_text,'')),''),
     start_snapshot=coalesce(p_start_snapshot,'{}'::jsonb)||jsonb_build_object(
       'economyPhase',private.economy_phase(),
       'economyProductionCostFactor',v_economy_factor,
       'economyProductionOutputFactor',private.economy_production_output_factor(),
       'operatingCostRate',v_operating_rate,
       'operatingEfficiencyFactor',v_efficiency_factor,
       'operatingCost',v_operating_cost,
       'operatingCostBasis',v_operating_basis
     )
 where id=v_job;

 update public.companies
 set cash_balance=cash_balance-v_cash_cost,updated_at=now()
 where id=p_company_id;

 if v_core_cash_cost<>0 then
   insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id)
   values(p_company_id,'production',-v_core_cash_cost,'Produktion Q'||v_product.quality_level||': '||trunc(v_output)||' × '||v_product.name,'production_job',v_job);
 end if;

 if v_operating_cost>0 then
   insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id)
   values(
     p_company_id,'operating_cost',-v_operating_cost,
     'Energie & Betrieb – '||v_type.name||': '||trunc(v_output)||' × '||v_product.name,
     'production_job',v_job
   );
 end if;

 perform private.handle_insolvency_if_needed(p_company_id);
 return v_job;
end
$function$;

create or replace function private.start_retail_sale_on_building_v2_impl(
  p_company_id uuid,
  p_building_id uuid,
  p_product_id uuid,
  p_quality integer,
  p_quantity numeric,
  p_unit_price numeric,
  p_input_text text,
  p_start_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
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

  v_avg:=private.retail_average_price(v_inventory.average_unit_cost);
  v_min:=private.retail_min_price(v_inventory.average_unit_cost);
  v_max:=private.retail_max_price(v_inventory.average_unit_cost);

  if p_unit_price<v_min or p_unit_price>v_max then
    raise exception 'Der Verkaufspreis muss zwischen % OC$ und % OC$ liegen',v_min,v_max;
  end if;

  v_units_per_hour:=greatest(
    1,
    floor(coalesce(v_product.base_retail_rate,1)*private.building_level_multiplier(v_building.level))
  );
  v_hours:=p_quantity/v_units_per_hour;
  if v_hours>24 then raise exception 'Die maximale Verkaufsdauer beträgt 24 Stunden'; end if;

  v_effective_unit:=private.retail_effective_unit_revenue(v_inventory.average_unit_cost,p_unit_price);
  v_total:=round(p_quantity*v_effective_unit,2);

  v_operating_rate:=private.operating_cost_rate(v_type.code,v_type.building_category);
  v_efficiency_factor:=private.operating_efficiency_factor(v_building.level);
  v_economy_factor:=private.economy_production_cost_factor();
  v_operating_basis:=round(v_inventory.average_unit_cost*p_quantity,2);
  v_operating_cost:=round(v_operating_basis*v_operating_rate*v_efficiency_factor*v_economy_factor,2);

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
    'operatingCost',v_operating_cost
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
$function$;

create or replace function private.invest_product_research_impl(
  p_company_id uuid,
  p_product_id uuid,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_product public.products%rowtype;
  v_research_product uuid;
  v_available numeric;
  v_remaining numeric;
  v_take numeric;
  v_row public.inventories%rowtype;
  v_investment_value numeric:=0;
  v_patent_factor numeric;
  v_patent_gain numeric;
  v_new_patent_value numeric;
  v_new_quality integer;
  v_new_progress numeric;
  v_required numeric;
  v_to_next numeric;
  v_levels_gained integer:=0;
  v_building public.company_buildings%rowtype;
  v_type public.building_types%rowtype;
  v_operating_rate numeric;
  v_efficiency_factor numeric;
  v_economy_factor numeric;
  v_operating_cost numeric;
  v_cash numeric;
begin
  perform private.assert_company_owner(p_company_id);

  if coalesce((select company_level from public.companies where id=p_company_id),0)<5 then
    raise exception 'Forschung wird auf Unternehmenslevel 5 freigeschaltet';
  end if;

  if p_quantity is null or p_quantity<=0 or p_quantity<>trunc(p_quantity) then
    raise exception 'Es können nur ganze Forschungseinheiten investiert werden';
  end if;

  select * into v_product
  from public.products
  where id=p_product_id and company_id=p_company_id and status='active'
  for update;

  if v_product.id is null then
    raise exception 'Produkt nicht gefunden';
  end if;

  select cb.* into v_building
  from public.company_buildings cb
  join public.building_types bt on bt.id=cb.building_type_id
  where cb.company_id=p_company_id
    and cb.status='active'
    and bt.building_category='research'
  order by cb.level desc,cb.built_at,cb.id
  limit 1
  for update of cb;

  if v_building.id is null then
    raise exception 'Für die Produktforschung wird ein aktives Forschungsgebäude benötigt';
  end if;

  select * into v_type
  from public.building_types
  where id=v_building.building_type_id;

  select id into v_research_product
  from public.products
  where company_id=p_company_id
    and name='Forschungseinheit'
    and category='research'
    and status='active'
  limit 1;

  if v_research_product is null then
    raise exception 'Forschungseinheiten sind nicht verfügbar';
  end if;

  select coalesce(sum(quantity),0) into v_available
  from public.inventories
  where company_id=p_company_id and product_id=v_research_product;

  if v_available<p_quantity then
    raise exception 'Nicht genügend Forschungseinheiten im Lager';
  end if;

  v_remaining:=p_quantity;

  for v_row in
    select *
    from public.inventories
    where company_id=p_company_id
      and product_id=v_research_product
      and quantity>0
    order by quality_level,id
    for update
  loop
    exit when v_remaining<=0;
    v_take:=least(v_remaining,v_row.quantity);
    v_investment_value:=v_investment_value+v_take*v_row.average_unit_cost;

    update public.inventories
    set quantity=quantity-v_take
    where id=v_row.id;

    v_remaining:=v_remaining-v_take;
  end loop;

  v_operating_rate:=private.operating_cost_rate(v_type.code,v_type.building_category);
  v_efficiency_factor:=private.operating_efficiency_factor(v_building.level);
  v_economy_factor:=private.economy_production_cost_factor();
  v_operating_cost:=round(v_investment_value*v_operating_rate*v_efficiency_factor*v_economy_factor,2);

  select cash_balance into v_cash
  from public.companies
  where id=p_company_id
  for update;

  if coalesce(v_cash,0)<v_operating_cost then
    raise exception 'Nicht genügend Guthaben für Labor- und Betriebskosten (% OC$)',v_operating_cost;
  end if;

  v_remaining:=p_quantity;
  v_new_quality:=greatest(1,coalesce(v_product.quality_level,1));
  v_new_progress:=greatest(0,coalesce(v_product.research_units_progress,0));

  while v_remaining>0 loop
    v_required:=private.research_requirement(v_new_quality);

    if v_new_progress>=v_required then
      v_new_progress:=v_new_progress-v_required;
      v_new_quality:=v_new_quality+1;
      v_levels_gained:=v_levels_gained+1;
      continue;
    end if;

    v_to_next:=v_required-v_new_progress;

    if v_remaining>=v_to_next then
      v_remaining:=v_remaining-v_to_next;
      v_new_progress:=0;
      v_new_quality:=v_new_quality+1;
      v_levels_gained:=v_levels_gained+1;
    else
      v_new_progress:=v_new_progress+v_remaining;
      v_remaining:=0;
    end if;
  end loop;

  update public.products
  set quality_level=v_new_quality,
      research_units_progress=v_new_progress
  where id=v_product.id;

  v_patent_factor:=0.80 + random()*0.30;
  v_patent_gain:=round(v_investment_value*v_patent_factor,2);

  update public.companies
  set patent_value=round(coalesce(patent_value,0)+v_patent_gain,2),
      cash_balance=cash_balance-v_operating_cost,
      updated_at=now()
  where id=p_company_id
  returning patent_value into v_new_patent_value;

  insert into public.financial_transactions(
    company_id,transaction_type,amount,cost_basis,description,reference_type,reference_id
  )
  values(
    p_company_id,
    'research_investment',
    v_patent_gain,
    round(v_investment_value,2),
    'Forschung: '||trunc(p_quantity)||' Einheiten in '||v_product.name||
    ' investiert'||
    case
      when v_levels_gained>0
        then ' – Qualität Q'||v_new_quality||' erreicht'
      else ''
    end,
    'product',
    v_product.id
  );

  if v_operating_cost>0 then
    insert into public.financial_transactions(
      company_id,transaction_type,amount,description,reference_type,reference_id
    )
    values(
      p_company_id,'operating_cost',-v_operating_cost,
      'Labor & Betrieb – Produktforschung: '||trunc(p_quantity)||' Forschungseinheiten',
      'product',v_product.id
    );
  end if;

  perform private.handle_insolvency_if_needed(p_company_id);

  return jsonb_build_object(
    'product_id',v_product.id,
    'quantity',p_quantity,
    'investment_value',round(v_investment_value,2),
    'operating_cost',v_operating_cost,
    'operating_cost_rate',v_operating_rate,
    'operating_efficiency_factor',v_efficiency_factor,
    'operating_economy_factor',v_economy_factor,
    'patent_factor',round(v_patent_factor,4),
    'patent_gain',v_patent_gain,
    'patent_value',v_new_patent_value,
    'quality_level',v_new_quality,
    'research_units_progress',v_new_progress,
    'next_requirement',private.research_requirement(v_new_quality),
    'upgraded',v_levels_gained>0,
    'levels_gained',v_levels_gained
  );
end
$function$;
