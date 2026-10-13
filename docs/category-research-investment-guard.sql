CREATE OR REPLACE FUNCTION private.invest_product_research_impl(p_company_id uuid, p_product_id uuid, p_quantity numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and name=private.category_research_unit_name(v_product.category)
    and category='research'
    and status='active'
  limit 1;

  if v_research_product is null then
    raise exception 'Für diese Produktkategorie sind keine passenden Forschungseinheiten verfügbar (%).',v_product.category;
  end if;

  select coalesce(sum(quantity),0) into v_available
  from public.inventories
  where company_id=p_company_id and product_id=v_research_product;

  if v_available<p_quantity then
    raise exception 'Nicht genügend passende Forschungseinheiten für Kategorie % im Lager',v_product.category;
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
  v_operating_cost:=round(v_investment_value*v_operating_rate*v_efficiency_factor*v_economy_factor*private.specialization_factor(p_company_id,'research_operating_cost',v_product.category),2);

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
  v_patent_gain:=round(v_investment_value*v_patent_factor*private.specialization_factor(p_company_id,'patent_gain',v_product.category),2);

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
$function$
;
