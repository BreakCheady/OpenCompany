-- OpenCompany: production plans, voluntary guidance and four industry profiles.
create table public.company_guidance (
  company_id uuid primary key references public.companies(id) on delete cascade,
  selected_product_id uuid references public.products(id) on delete set null,
  completed_steps text[] not null default '{}',
  dismissed_lessons text[] not null default '{}',
  paused boolean not null default false,
  skipped boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint guidance_steps_check check(completed_steps <@ array['overview','choose','materials','produce','claim','sell','review']::text[]),
  constraint guidance_lessons_check check(dismissed_lessons <@ array['research_contracts','specialization_1','bonds','specialization_2']::text[])
);
create table public.company_production_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity bigint not null check(quantity between 1 and 1000000000),
  quality_level smallint not null check(quality_level between 1 and 32767),
  deadline timestamptz,
  choices jsonb not null default '{}'::jsonb check(jsonb_typeof(choices)='object' and octet_length(choices::text)<=20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index company_production_plans_company_idx on public.company_production_plans(company_id,updated_at desc);
create index company_production_plans_product_idx on public.company_production_plans(product_id);
create index company_guidance_product_idx on public.company_guidance(selected_product_id) where selected_product_id is not null;
alter table public.company_guidance enable row level security;
alter table public.company_production_plans enable row level security;
revoke all on public.company_guidance,public.company_production_plans from anon,authenticated;
grant select,insert,update,delete on public.company_guidance,public.company_production_plans to authenticated;

create policy guidance_select_own on public.company_guidance for select to authenticated
using(exists(select 1 from public.companies c where c.id=company_id and c.owner_user_id=(select auth.uid())));
create policy guidance_insert_own on public.company_guidance for insert to authenticated
with check(exists(select 1 from public.companies c where c.id=company_id and c.owner_user_id=(select auth.uid())) and
  (selected_product_id is null or exists(select 1 from public.products p where p.id=selected_product_id and p.company_id=company_guidance.company_id)));
create policy guidance_update_own on public.company_guidance for update to authenticated
using(exists(select 1 from public.companies c where c.id=company_id and c.owner_user_id=(select auth.uid())))
with check(exists(select 1 from public.companies c where c.id=company_id and c.owner_user_id=(select auth.uid())) and
  (selected_product_id is null or exists(select 1 from public.products p where p.id=selected_product_id and p.company_id=company_guidance.company_id)));
create policy guidance_delete_own on public.company_guidance for delete to authenticated
using(exists(select 1 from public.companies c where c.id=company_id and c.owner_user_id=(select auth.uid())));
create policy plans_select_own on public.company_production_plans for select to authenticated
using(exists(select 1 from public.companies c where c.id=company_id and c.owner_user_id=(select auth.uid())));
create policy plans_insert_own on public.company_production_plans for insert to authenticated
with check(exists(select 1 from public.companies c where c.id=company_id and c.owner_user_id=(select auth.uid())) and
  exists(select 1 from public.products p where p.id=product_id and p.company_id=company_production_plans.company_id));
create policy plans_update_own on public.company_production_plans for update to authenticated
using(exists(select 1 from public.companies c where c.id=company_id and c.owner_user_id=(select auth.uid())))
with check(exists(select 1 from public.companies c where c.id=company_id and c.owner_user_id=(select auth.uid())) and
  exists(select 1 from public.products p where p.id=product_id and p.company_id=company_production_plans.company_id));
create policy plans_delete_own on public.company_production_plans for delete to authenticated
using(exists(select 1 from public.companies c where c.id=company_id and c.owner_user_id=(select auth.uid())));

alter table public.company_specializations drop constraint company_specializations_specialization_code_check;
alter table public.company_specializations add constraint company_specializations_specialization_code_check
check(specialization_code in ('production','retail','logistics','research','trading','contracts','industry_electronics','industry_food','industry_automotive','industry_chemical','industry_textile'));

CREATE OR REPLACE FUNCTION private.specialization_factor(p_company_id uuid, p_key text, p_category text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(exp(sum(ln(factor))),1)
  from (
    select case
      when specialization_code='production' and p_key='production_output' then 1+0.05*scale
      when specialization_code='production' and p_key='production_operating_cost' then 1-0.05*scale
      when specialization_code='retail' and p_key='retail_rate' then 1+0.07*scale
      when specialization_code='retail' and p_key='retail_price_effect' then 1+0.03*scale
      when specialization_code='logistics' and p_key='transport_container_use' then 1-0.10*scale
      when specialization_code='logistics' and p_key='logistics_penalty' then 1-(0.10+0.05*(lvl-1))
      when specialization_code='research' and p_key='research_operating_cost' then 1-0.08*scale
      when specialization_code='research' and p_key='patent_gain' then 1+0.05*scale
      when specialization_code='trading' and p_key='market_fee' then 1-0.10*lvl
      when specialization_code='contracts' and p_key='contract_penalty' then 1-0.10*lvl
      when specialization_code='industry_electronics' and p_category='electronics' and p_key in ('production_output','retail_rate') then 1+0.02*lvl
      when specialization_code='industry_electronics' and p_category='electronics' and p_key='production_operating_cost' then 1-0.02*lvl
      when specialization_code='industry_food' and p_category='food' and p_key='retail_rate' then 1+0.02*lvl
      when specialization_code='industry_food' and p_category='food' and p_key='retail_operating_cost' then 1-0.02*lvl
      when specialization_code='industry_automotive' and p_category='automotive' and p_key='production_output' then 1+0.02*lvl
      when specialization_code='industry_automotive' and p_category='automotive' and p_key='production_operating_cost' then 1-0.02*lvl
      when specialization_code='industry_chemical' and p_category='chemical' and p_key='production_operating_cost' then 1-0.02*lvl
      when specialization_code='industry_chemical' and p_category='chemical' and p_key='patent_gain' then 1+0.02*lvl
      when specialization_code='industry_textile' and p_category='textile' and p_key='retail_rate' then 1+0.02*lvl
      when specialization_code='industry_textile' and p_category='textile' and p_key='retail_price_effect' then 1+0.01*lvl
      else 1 end factor
    from (
      select specialization_code,lvl,1+0.25*(lvl-1) as scale
      from (
        select specialization_code,private.effective_specialization_level(specialization_level,upgrade_target_level,upgrade_finishes_at) as lvl
        from public.company_specializations where company_id=p_company_id
      ) levels
    ) scaled
  ) effects
$function$;

CREATE OR REPLACE FUNCTION public.set_company_specialization(p_company_id uuid, p_slot_no smallint, p_specialization_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_level integer;
  v_existing public.company_specializations%rowtype;
  v_cash numeric;
  v_required integer;
begin
  perform private.assert_company_owner(p_company_id);
  if p_slot_no is null or p_slot_no not in (1,2) then raise exception 'Ungültiger Spezialisierungsplatz'; end if;

  if p_specialization_code is null or p_specialization_code not in ('production','retail','logistics','research','trading','contracts','industry_electronics','industry_food','industry_automotive','industry_chemical','industry_textile') then
    raise exception 'Ungültige Spezialisierung';
  end if;
  select company_level,cash_balance into v_level,v_cash
  from public.companies where id=p_company_id for update;

  if exists(
    select 1 from public.company_specializations
    where company_id=p_company_id
      and specialization_code=p_specialization_code
      and slot_no<>p_slot_no
  ) then
    raise exception 'Diese Spezialisierung ist bereits aktiv';
  end if;


  v_required:=case when p_slot_no=1 then 8 else 15 end;
  if v_level<v_required then
    raise exception 'Spezialisierungsplatz wird auf Level % freigeschaltet',v_required;
  end if;

  select * into v_existing
  from public.company_specializations
  where company_id=p_company_id and slot_no=p_slot_no
  for update;

  if v_existing.id is not null and v_existing.specialization_code=p_specialization_code then
    return jsonb_build_object('status','unchanged');
  end if;

  if v_existing.id is not null then
    if v_existing.upgrade_target_level is not null and v_existing.upgrade_finishes_at>now() then
      raise exception 'Während des Ausbaus ist kein Spezialisierungswechsel möglich';
    end if;
    if v_existing.switch_available_at is not null and v_existing.switch_available_at>now() then
      raise exception 'Spezialisierung kann erst ab % gewechselt werden',v_existing.switch_available_at;
    end if;
    if v_cash<100000 then
      raise exception 'Für die Umstrukturierung werden 100.000 OC$ benötigt';
    end if;
    update public.companies
    set cash_balance=cash_balance-100000,updated_at=now()
    where id=p_company_id;
    insert into public.financial_transactions(
      company_id,transaction_type,amount,description,reference_type,reference_id
    )
    values(
      p_company_id,'specialization_change',-100000,
      'Umstrukturierung: Spezialisierung gewechselt','company_specialization',v_existing.id
    );
  end if;

  insert into public.company_specializations(
    company_id,slot_no,specialization_code,specialization_level,activated_at,switch_available_at,updated_at
  )
  values(p_company_id,p_slot_no,p_specialization_code,1,now(),now()+interval '14 days',now())
  on conflict(company_id,slot_no) do update set
    specialization_code=excluded.specialization_code,
    specialization_level=1,
    upgrade_target_level=null,upgrade_started_at=null,upgrade_finishes_at=null,
    activated_at=now(),
    switch_available_at=now()+interval '14 days',
    updated_at=now();

  return jsonb_build_object('status','ok','switch_available_at',now()+interval '14 days');
end
$function$;

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

  if p_unit_price<v_min or p_unit_price>v_max then
    raise exception 'Der Verkaufspreis muss zwischen % OC$ und % OC$ liegen',v_min,v_max;
  end if;

  v_units_per_hour:=greatest(
    1,
    floor(coalesce(v_product.base_retail_rate,1)*private.building_level_multiplier(v_building.level)*private.demand_retail_factor(v_product.category)*private.specialization_factor(p_company_id,'retail_rate',v_product.category))
  );
  v_hours:=p_quantity/v_units_per_hour;
  if v_hours>24 then raise exception 'Die maximale Verkaufsdauer beträgt 24 Stunden'; end if;

  v_effective_unit:=private.retail_effective_unit_revenue_company(p_company_id,v_inventory.average_unit_cost,p_unit_price,v_product.category);
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
$function$;


create or replace function private.start_retail_sale_priced_impl(p_company_id uuid,p_product_id uuid,p_quality integer,p_quantity numeric,p_price numeric)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_building uuid;
begin
  perform private.assert_company_owner(p_company_id);
  select b.id into v_building from public.company_buildings b
  join public.products p on p.id=p_product_id and p.company_id=p_company_id
  where b.company_id=p_company_id and b.status='active'
    and b.building_type_id=p.required_retail_building_type_id
    and not exists(select 1 from public.retail_sale_jobs j where j.building_id=b.id and j.status='running')
  order by b.built_at,b.id limit 1;
  if v_building is null then raise exception 'Benötigtes oder freies Verkaufsgebäude fehlt'; end if;
  return private.start_retail_sale_on_building_v2_impl(p_company_id,v_building,p_product_id,p_quality,p_quantity,p_price,null,'{}'::jsonb);
end $$;
revoke all on function private.start_retail_sale_priced_impl(uuid,uuid,integer,numeric,numeric) from public,anon;
grant execute on function private.start_retail_sale_priced_impl(uuid,uuid,integer,numeric,numeric) to authenticated;

CREATE OR REPLACE FUNCTION private.reset_company_impl(p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_company_owner(p_company_id);

  if exists(
    select 1
    from public.bond_investments
    where (borrower_company_id=p_company_id or lender_company_id=p_company_id)
      and status='active'
  ) then
    raise exception 'Unternehmen kann mit laufenden Anleihen nicht zurückgesetzt werden';
  end if;

  update public.bond_requests
  set status='cancelled',updated_at=now()
  where borrower_company_id=p_company_id
    and status='open';

  delete from public.market_trades
  where buyer_company_id=p_company_id
     or seller_company_id=p_company_id
     or order_id in(
       select id from public.market_orders where company_id=p_company_id
     )
     or product_id in(
       select id from public.products where company_id=p_company_id
     );

  delete from public.contracts
  where buyer_company_id=p_company_id
     or seller_company_id=p_company_id
     or proposer_company_id=p_company_id
     or product_id in(
       select id from public.products where company_id=p_company_id
     );

  delete from private.production_job_input_consumptions
  where component_product_id in(
    select id from public.products where company_id=p_company_id
  )
  or job_id in(
    select id from public.production_jobs where company_id=p_company_id
  );

  delete from public.production_recipe_inputs
  where product_id in(
    select id from public.products where company_id=p_company_id
  )
  or component_product_id in(
    select id from public.products where company_id=p_company_id
  );

  delete from public.market_orders where company_id=p_company_id;
  delete from public.production_jobs where company_id=p_company_id;
  delete from public.retail_sale_jobs where company_id=p_company_id;
  delete from public.company_buildings where company_id=p_company_id;
  delete from public.material_inventories where company_id=p_company_id;
  delete from public.inventories where company_id=p_company_id;
  delete from public.employees where company_id=p_company_id;
  delete from public.financial_transactions where company_id=p_company_id;
  delete from public.company_guidance where company_id=p_company_id;
  delete from public.company_production_plans where company_id=p_company_id;
  delete from public.products where company_id=p_company_id;
  delete from public.company_loans where company_id=p_company_id;
  delete from public.company_valuation_history where company_id=p_company_id;
  delete from private.company_xp_activity_daily where company_id=p_company_id;

  update public.companies
  set status='active',
      brand_reputation=50,
      company_level=1,
      experience_points=0,
      last_daily_xp_date=null,
      cash_balance=100000,
      company_value=100000,
      patent_value=0,
      updated_at=now(),
      last_seen_at=now()
  where id=p_company_id;

  perform private.sync_company_product_catalog(p_company_id);

  insert into public.company_buildings(
    company_id,building_type_id,level,status,built_at
  )
  select p_company_id,bt.id,1,'active',now()
  from public.building_types bt
  where bt.code in ('electronics_factory','electronics_store');

  update public.companies
  set company_value=100000+private.company_building_value(p_company_id),
      updated_at=now()
  where id=p_company_id;

  insert into public.financial_transactions(
    company_id,transaction_type,amount,description
  )
  values(
    p_company_id,
    'founding_capital',
    100000,
    'Startkapital nach Zurücksetzen'
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.system_reset_company_after_bond_default(p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_type text;
  v_start_cash numeric;
begin
  select company_type into v_type from public.companies where id=p_company_id;
  v_start_cash:=case when v_type='npc' then 5000000 else 100000 end;

  update public.bond_requests set status='defaulted',updated_at=now() where borrower_company_id=p_company_id and status in ('open','funded');
  delete from public.market_trades where buyer_company_id=p_company_id or seller_company_id=p_company_id or order_id in(select id from public.market_orders where company_id=p_company_id) or product_id in(select id from public.products where company_id=p_company_id);
  delete from public.contracts where buyer_company_id=p_company_id or seller_company_id=p_company_id or proposer_company_id=p_company_id or product_id in(select id from public.products where company_id=p_company_id);
  delete from public.market_orders where company_id=p_company_id;
  delete from public.production_jobs where company_id=p_company_id;
  delete from public.retail_sale_jobs where company_id=p_company_id;
  delete from public.company_buildings where company_id=p_company_id;
  delete from public.material_inventories where company_id=p_company_id;
  delete from public.inventories where company_id=p_company_id;
  delete from public.employees where company_id=p_company_id;
  delete from public.financial_transactions where company_id=p_company_id;
  delete from public.company_guidance where company_id=p_company_id;
  delete from public.company_production_plans where company_id=p_company_id;
  delete from public.products where company_id=p_company_id;
  delete from public.company_loans where company_id=p_company_id;
  delete from public.company_value_history where company_id=p_company_id;
  delete from public.company_valuation_history where company_id=p_company_id;
  delete from private.company_xp_activity_daily where company_id=p_company_id;

  update public.companies
  set status='active',brand_reputation=50,
      company_level=case when v_type='player' then 1 else 0 end,
      experience_points=0,last_daily_xp_date=null,
      cash_balance=v_start_cash,company_value=v_start_cash,patent_value=0,
      updated_at=now(),last_seen_at=case when v_type='player' then now() else null end
  where id=p_company_id;

  perform private.sync_company_product_catalog(p_company_id);

  if v_type='npc' then
    insert into public.company_buildings(company_id,building_type_id,level,status,built_at)
    select p_company_id,bt.id,1,'active',now()
    from public.building_types bt
    where bt.code in ('auto_factory','research_lab','energy_factory','chemical_factory','auto_dealership','machinery_factory','construction_factory','technology_store');
  else
    insert into public.company_buildings(company_id,building_type_id,level,status,built_at)
    select p_company_id,bt.id,1,'active',now()
    from public.building_types bt
    where bt.code in ('electronics_factory','electronics_store');
  end if;

  update public.companies
  set company_value=v_start_cash+private.company_building_value(p_company_id),updated_at=now()
  where id=p_company_id;

  insert into public.financial_transactions(company_id,transaction_type,amount,description) values
    (p_company_id,'founding_capital',v_start_cash,case when v_type='npc' then 'NPC-Neustart nach Insolvenzverfahren' else 'Startkapital nach Insolvenzverfahren' end),
    (p_company_id,'bond_default_reset',0,'Unternehmen nach drei Zinsausfällen zurückgesetzt');

  insert into public.bond_borrower_state(company_id,consecutive_missed_days,last_interest_date,last_missed_at,updated_at)
  values(p_company_id,0,null,null,now())
  on conflict(company_id) do update
  set consecutive_missed_days=0,last_interest_date=null,last_missed_at=null,updated_at=now();
end
$function$;

-- No public entry point is added; existing wrappers retain owner checks.
revoke all on function private.specialization_factor(uuid,text,text) from public,anon,authenticated;
revoke all on function private.start_retail_sale_on_building_v2_impl(uuid,uuid,uuid,integer,numeric,numeric,text,jsonb) from public,anon;
grant execute on function private.start_retail_sale_on_building_v2_impl(uuid,uuid,uuid,integer,numeric,numeric,text,jsonb) to authenticated;
revoke all on function private.reset_company_impl(uuid) from public,anon;
grant execute on function private.reset_company_impl(uuid) to authenticated;
revoke all on function private.system_reset_company_after_bond_default(uuid) from public,anon,authenticated;

