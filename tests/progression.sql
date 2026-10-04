-- Live-database regression checks. All fixture data and changes are rolled back.
begin;
create temporary table progression_results(test text,passed boolean);
do $$
declare
  c uuid; u uuid; other_company uuid; product uuid; food uuid; textile uuid; chemical uuid;
  research_product uuid; factory_type uuid; store_type uuid; factory uuid; store uuid; lab_type uuid; lab uuid;
  job uuid; plan_id uuid; level integer; before_cash numeric; actual numeric; expected numeric; patent_before numeric; research_result jsonb;
begin
  select id,owner_user_id into c,u from public.companies where company_type='player' order by created_at limit 1;
  if c is null then raise exception 'A player company is required for rollback tests'; end if;
  select id into other_company from public.companies where id<>c order by created_at limit 1;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  update public.companies set cash_balance=10000000,company_level=15 where id=c;
  delete from public.company_specializations where company_id=c;

  for level in 1..3 loop
    insert into public.company_specializations(company_id,slot_no,specialization_code,specialization_level)
      values(c,1,'industry_food',level);
    if abs(private.specialization_factor(c,'retail_rate','food')-(1+.02*level))>1e-9 then raise exception 'food rate'; end if;
    if abs(private.specialization_factor(c,'retail_operating_cost','food')-(1-.02*level))>1e-9 then raise exception 'food cost'; end if;
    if private.specialization_factor(c,'retail_rate','food_component')<>1 then raise exception 'food component leakage'; end if;
    update public.company_specializations set specialization_code='industry_automotive' where company_id=c;
    if abs(private.specialization_factor(c,'production_output','automotive')-(1+.02*level))>1e-9 then raise exception 'auto output'; end if;
    if abs(private.specialization_factor(c,'production_operating_cost','automotive')-(1-.02*level))>1e-9 then raise exception 'auto cost'; end if;
    update public.company_specializations set specialization_code='industry_chemical' where company_id=c;
    if abs(private.specialization_factor(c,'patent_gain','chemical')-(1+.02*level))>1e-9 then raise exception 'chemical patent'; end if;
    if private.specialization_factor(c,'patent_gain','research')<>1 then raise exception 'chemical leakage'; end if;
    update public.company_specializations set specialization_code='industry_textile' where company_id=c;
    if abs(private.specialization_factor(c,'retail_rate','textile')-(1+.02*level))>1e-9 then raise exception 'textile rate'; end if;
    if abs(private.specialization_factor(c,'retail_price_effect','textile')-(1+.01*level))>1e-9 then raise exception 'textile price'; end if;
    delete from public.company_specializations where company_id=c;
  end loop;
  insert into progression_results values('All four industry stages and category isolation',true);
  perform public.set_company_specialization(c,1::smallint,'industry_food');
  perform public.set_company_specialization(c,2::smallint,'retail');
  if abs(private.specialization_factor(c,'retail_rate','food')-1.02*1.07)>1e-9 then raise exception 'stacking'; end if;
  select cash_balance into before_cash from public.companies where id=c;
  perform public.upgrade_company_specialization(c,1::smallint);
  if (select cash_balance from public.companies where id=c)<>before_cash-50000 then raise exception 'upgrade price'; end if;
  if abs(private.specialization_factor(c,'retail_rate','food')-1.02*1.07)>1e-9 then raise exception 'premature upgrade'; end if;
  update public.company_specializations set upgrade_finishes_at=now()-interval '1 minute' where company_id=c and slot_no=1;
  if abs(private.specialization_factor(c,'retail_rate','food')-1.04*1.07)>1e-9 then raise exception 'finished upgrade'; end if;
  delete from public.company_specializations where company_id=c;
  insert into progression_results values('New profiles use normal choice, combination and delayed upgrades',true);

  select id into factory_type from public.building_types where code='auto_factory';
  select id into store_type from public.building_types where building_category='retail' order by id limit 1;
  insert into public.company_buildings(company_id,building_type_id,level,status) values(c,factory_type,3,'active') returning id into factory;
  insert into public.company_buildings(company_id,building_type_id,level,status) values(c,store_type,1,'active') returning id into store;
  insert into public.products(company_id,name,category,production_cost,suggested_retail_price,status,quality_level,base_production_rate,base_retail_rate,required_building_type_id,required_retail_building_type_id)
    values(c,'Rollback automotive fixture','automotive',0,100,'active',1,100,100,factory_type,store_type) returning id into product;
  insert into public.company_specializations(company_id,slot_no,specialization_code,specialization_level) values(c,1,'industry_automotive',3);
  expected:=greatest(.01,floor(100*private.building_level_multiplier(3))*private.economy_production_output_factor()*1.06);
  job:=public.start_production_on_building_v2(c,factory,product,10/expected,null,'{}'::jsonb);
  select output_quantity into actual from public.production_jobs where id=job;
  if actual<>10 then raise exception 'actual production quantity %',actual; end if;
  select units_per_hour into actual from public.production_jobs where id=job;
  if abs(actual-expected)>1e-6 then raise exception 'actual production speed'; end if;
  select production_cash_cost into actual from public.production_jobs where id=job;
  select round(coalesce(bt.labor_cost_per_unit,0)*10*private.economy_production_cost_factor(),2)
    +round(round(coalesce(bt.labor_cost_per_unit,0)*10,2)*private.operating_cost_rate(bt.code,bt.building_category)*private.operating_efficiency_factor(3)*private.economy_production_cost_factor()*.94,2)
    into expected from public.building_types bt where bt.id=factory_type;
  if abs(actual-expected)>1e-6 then raise exception 'actual auto operating cost % expected %',actual,expected; end if;
  delete from public.company_specializations where company_id=c;
  insert into progression_results values('Real automotive production uses correct rate, quantity and costs',true);

  insert into public.products(company_id,name,category,production_cost,suggested_retail_price,status,quality_level,base_production_rate,base_retail_rate,required_building_type_id,required_retail_building_type_id)
    values(c,'Rollback food fixture','food',0,100,'active',1,100,100,factory_type,store_type) returning id into food;
  insert into public.inventories(company_id,product_id,quality_level,quantity,average_unit_cost) values(c,food,1,40,100);
  insert into public.company_specializations(company_id,slot_no,specialization_code,specialization_level) values(c,1,'industry_food',3);
  select cash_balance into before_cash from public.companies where id=c;
  expected:=private.retail_average_price(100,'food');
  job:=public.start_retail_sale_on_building_v2(c,store,food,1,10,expected,null,'{"operatingCost":0}'::jsonb);
  expected:=round(1000*private.operating_cost_rate((select code from public.building_types where id=store_type),'retail')*private.economy_production_cost_factor()*.94,2);
  select (start_snapshot->>'operatingCost')::numeric into actual from public.retail_sale_jobs where id=job;
  if actual<>expected then raise exception 'food cost % expected %',actual,expected; end if;
  if (select cash_balance from public.companies where id=c)<>before_cash-expected then raise exception 'food charge'; end if;
  if (select (start_snapshot->>'operatingCostBasis')::numeric from public.retail_sale_jobs where id=job)<>1000 then raise exception 'food snapshot'; end if;
  update public.retail_sale_jobs set status='cancelled' where id=job;
  job:=public.start_retail_sale_priced_v2(c,food,1,10,private.retail_average_price(100,'food'),null,'{}'::jsonb);
  if not exists(select 1 from public.financial_transactions where company_id=c and reference_id=job and transaction_type='operating_cost' and amount=-expected) then raise exception 'legacy costs bypass'; end if;
  delete from public.company_specializations where company_id=c;
  insert into progression_results values('Real food retail charges reduced operating costs and trusts server snapshots',true);

  select id into lab_type from public.building_types where building_category='research' order by id limit 1;
  insert into public.company_buildings(company_id,building_type_id,level,status) values(c,lab_type,1,'active') returning id into lab;
  select id into research_product from public.products where company_id=c and name='Forschungseinheit' and category='research' limit 1;
  insert into public.products(company_id,name,category,production_cost,suggested_retail_price,status,quality_level,base_production_rate,base_retail_rate,required_building_type_id)
    values(c,'Rollback chemistry fixture','chemical',0,100,'active',1,100,100,factory_type) returning id into chemical;
  insert into public.inventories(company_id,product_id,quality_level,quantity,average_unit_cost) values(c,research_product,1,20,10)
    on conflict(company_id,product_id,quality_level) do update set quantity=20,average_unit_cost=10;
  insert into public.company_specializations(company_id,slot_no,specialization_code,specialization_level) values(c,1,'industry_chemical',3);
  research_result:=public.invest_product_research(c,chemical,10);
  if (research_result->>'patent_gain')::numeric<84.80 or (research_result->>'patent_gain')::numeric>116.60 then raise exception 'chemical patent range %',research_result; end if;
  delete from public.company_specializations where company_id=c;
  insert into progression_results values('Real chemistry research applies the scoped patent bonus',true);

  -- Exercise real RLS as the client role, not as an administrator.
  execute 'set local role authenticated';
  insert into public.company_guidance(company_id,selected_product_id,completed_steps,paused) values(c,product,array['overview','choose'],true)
    on conflict(company_id) do update set selected_product_id=excluded.selected_product_id,completed_steps=excluded.completed_steps,paused=true;
  if not exists(select 1 from public.company_guidance where company_id=c and paused) then raise exception 'guidance persistence'; end if;
  insert into public.company_production_plans(company_id,product_id,quantity,quality_level,choices) values(c,product,100,1,'{}') returning id into plan_id;
  update public.company_production_plans set quantity=101 where id=plan_id;
  if (select quantity from public.company_production_plans where id=plan_id)<>101 then raise exception 'plan persistence'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  perform set_config('request.jwt.claims','{}',true);
  if exists(select 1 from public.company_production_plans where id=plan_id) or exists(select 1 from public.company_guidance where company_id=c) then raise exception 'foreign read'; end if;
  begin
    insert into public.company_guidance(company_id) values(other_company);
    raise exception 'foreign guidance insert accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.company_production_plans(company_id,product_id,quantity,quality_level) values(c,product,1,1);
    raise exception 'foreign plan insert accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  begin
    update public.company_production_plans set company_id=other_company where id=plan_id;
    raise exception 'plan ownership reassigned';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  if has_table_privilege('anon','public.company_guidance','select') or has_table_privilege('anon','public.company_production_plans','insert') then raise exception 'anonymous access'; end if;
  insert into progression_results values('Saved guidance and plans: own read/write, foreign isolation, ownership checks and anonymous denial',true);

  -- Both normal and automatic reset paths explicitly clear the new preferences.
  if position('delete from public.company_guidance' in pg_get_functiondef('private.reset_company_impl(uuid)'::regprocedure))=0
    or position('delete from public.company_production_plans' in pg_get_functiondef('private.system_reset_company_after_bond_default(uuid)'::regprocedure))=0 then raise exception 'reset integration missing'; end if;
  if exists(select 1 from public.bond_investments where (borrower_company_id=c or lender_company_id=c) and status='active') then
    insert into progression_results values('Reset integration definitions verified (active bonds prevent a live reset test)',true);
  else
    perform public.reset_company(c);
    if exists(select 1 from public.company_guidance where company_id=c) or exists(select 1 from public.company_production_plans where company_id=c) then raise exception 'reset state survived'; end if;
    insert into progression_results values('Actual company reset clears saved guidance and plans',true);
  end if;
end $$;
select * from progression_results;
rollback;
