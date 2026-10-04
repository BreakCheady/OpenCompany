begin;
create temp table test_results(name text,passed boolean);
do $tests$
declare
  c uuid; u uuid; npc1 uuid; npc2 uuid; material uuid; container uuid;
  v_order_id uuid; bid_fast uuid; bid_mid uuid; bid_slow uuid; v_contract_id uuid;
  code text; amount numeric; fast_score numeric; mid_score numeric; slow_score numeric;
  result jsonb; count_before integer;
begin
  select id,owner_user_id into c,u from public.companies where company_type='player' and owner_user_id is not null order by created_at limit 1;
  select id into npc1 from public.companies where company_type='npc' and id<>'00000000-0000-4000-8000-000000000001'::uuid order by id limit 1;
  select id into npc2 from public.companies where company_type='npc' and id<>npc1 and id<>'00000000-0000-4000-8000-000000000001'::uuid order by id limit 1;
  if c is null or npc1 is null or npc2 is null then raise exception 'Test fixtures unavailable'; end if;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  delete from public.company_specializations where company_id=c;
  update public.companies set company_level=7,cash_balance=100000000 where id=c;
  begin
    perform public.set_company_specialization(c,1::smallint,'trading');
    raise exception 'FAIL: level 8 gate';
  exception when others then if position('Level 8' in sqlerrm)=0 then raise; end if; end;
  update public.companies set company_level=14 where id=c;
  begin
    perform public.set_company_specialization(c,2::smallint,'contracts');
    raise exception 'FAIL: level 15 gate';
  exception when others then if position('Level 15' in sqlerrm)=0 then raise; end if; end;
  update public.companies set company_level=15 where id=c;
  foreach code in array array['production','retail','logistics','research','trading','contracts','industry_electronics'] loop
    update public.company_specializations set switch_available_at=now()-interval '1 day' where company_id=c;
    perform public.set_company_specialization(c,1::smallint,code);
    if not exists(select 1 from public.company_specializations where company_id=c and specialization_code=code) then raise exception 'FAIL: specialization %',code; end if;
  end loop;
  begin
    perform public.set_company_specialization(c,2::smallint,'industry_electronics');
    raise exception 'FAIL: duplicate specialization';
  exception when others then if position('bereits aktiv' in sqlerrm)=0 then raise; end if; end;
  insert into test_results values('Level 8/15 gates; all seven selectable; duplicate blocked',true);

  update public.companies set cash_balance=500000 where id=c;
  perform public.upgrade_company_specialization(c,1::smallint);
  select cash_balance into amount from public.companies where id=c;
  if amount<>450000 then raise exception 'FAIL: II cost %',amount; end if;
  if abs(private.specialization_factor(c,'production_output','electronics')-1.02)>0.000001 then raise exception 'FAIL: early upgrade bonus'; end if;
  if not exists(select 1 from public.company_specializations where company_id=c and upgrade_finishes_at-upgrade_started_at=interval '24 hours') then raise exception 'FAIL: II duration'; end if;
  begin
    perform public.upgrade_company_specialization(c,1::smallint);
    raise exception 'FAIL: duplicate upgrade';
  exception when others then if position('läuft bereits' in sqlerrm)=0 then raise; end if; end;
  begin
    perform public.set_company_specialization(c,1::smallint,'trading');
    raise exception 'FAIL: switch during upgrade';
  exception when others then if position('Ausbaus' in sqlerrm)=0 then raise; end if; end;
  update public.company_specializations set upgrade_finishes_at=now()-interval '1 minute' where company_id=c;
  if (select specialization_level from public.get_company_specialization_progress(c) where slot_no=1)<>2 then raise exception 'FAIL: effective stage II'; end if;
  if abs(private.specialization_factor(c,'production_output','electronics')-1.04)>0.000001 then raise exception 'FAIL: II bonus'; end if;
  perform public.upgrade_company_specialization(c,1::smallint);
  select cash_balance into amount from public.companies where id=c;
  if amount<>350000 then raise exception 'FAIL: III cost %',amount; end if;
  if not exists(select 1 from public.company_specializations where company_id=c and upgrade_finishes_at-upgrade_started_at=interval '48 hours') then raise exception 'FAIL: III duration'; end if;
  update public.company_specializations set upgrade_finishes_at=now()-interval '1 minute' where company_id=c;
  perform private.complete_specialization_upgrades();
  if abs(private.specialization_factor(c,'production_output','electronics')-1.06)>0.000001 then raise exception 'FAIL: III bonus'; end if;
  if private.specialization_factor(c,'production_output','food')<>1 then raise exception 'FAIL: industry bonus leaked'; end if;
  begin
    perform public.upgrade_company_specialization(c,1::smallint);
    raise exception 'FAIL: stage IV';
  exception when others then if position('maximale' in sqlerrm)=0 then raise; end if; end;
  insert into test_results values('Upgrade costs 50k/100k; 24h/48h; bonuses only when complete; 2/4/6%; industry isolation',true);

  update public.company_specializations set switch_available_at=now()-interval '1 day' where company_id=c;
  perform public.set_company_specialization(c,1::smallint,'trading');
  select cash_balance into amount from public.companies where id=c;
  if amount<>250000 then raise exception 'FAIL: switch cost'; end if;
  if not exists(select 1 from public.company_specializations where company_id=c and specialization_level=1 and switch_available_at=now()+interval '14 days') then raise exception 'FAIL: switch reset/cooldown'; end if;
  begin
    perform public.set_company_specialization(c,1::smallint,'research');
    raise exception 'FAIL: cooldown';
  exception when others then if position('erst ab' in sqlerrm)=0 then raise; end if; end;
  update public.companies set cash_balance=1 where id=c;
  begin
    perform public.upgrade_company_specialization(c,1::smallint);
    raise exception 'FAIL: insufficient upgrade cash';
  exception when others then if position('benötigt' in sqlerrm)=0 then raise; end if; end;
  if (select cash_balance from public.companies where id=c)<>1 then raise exception 'FAIL: cash changed on failed upgrade'; end if;
  update public.companies set cash_balance=1000000 where id=c;
  insert into test_results values('Switch cost/reset/cooldown; insufficient cash rejected without charge',true);

  select id into material from public.materials where status='active' order by id limit 1;
  insert into public.company_specializations(company_id,slot_no,specialization_code,specialization_level) values(npc1,1,'trading',3);
  insert into public.market_orders(company_id,material_id,quantity,remaining_quantity,price_per_unit,quality_level)
  values(npc1,material,10,10,10,1) returning id into v_order_id;
  perform public.buy_market_order(c,v_order_id,10);
  -- The order id comparison below is explicit to avoid PL/pgSQL variable ambiguity.
  select t.market_fee into amount from public.market_trades t where t.order_id=v_order_id and t.buyer_company_id=c;
  if amount<>3.50 then raise exception 'FAIL: actual market fee %',amount; end if;
  result:=public.get_company_trade_analysis(c);
  if result->>'enabled'<>'true' or (result->>'trade_count')::integer<1 then raise exception 'FAIL: owned analysis'; end if;
  insert into test_results values('Real market trade charges 3.5% at trading III; own analytics',true);

  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.upgrade_company_specialization(c,1::smallint);
    raise exception 'FAIL: unauthorized upgrade';
  exception when others then if position('Berechtigung' in sqlerrm)=0 then raise; end if; end;
  begin
    perform public.get_company_trade_analysis(c);
    raise exception 'FAIL: unauthorized analytics';
  exception when others then if position('Berechtigung' in sqlerrm)=0 then raise; end if; end;
  if has_function_privilege('anon','public.upgrade_company_specialization(uuid,smallint)','execute') or has_function_privilege('anon','public.get_company_trade_analysis(uuid)','execute') then raise exception 'FAIL: anon access'; end if;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  insert into test_results values('Foreign ownership blocked; anonymous RPC access denied',true);

  insert into public.large_customer_orders(customer_name,order_type,item_kind,item_name,material_id,quantity,minimum_quality,bidding_ends_at,delivery_hours)
  values('Rollback speed test','raw_material','material','Test',material,10,1,now()-interval '1 minute',48) returning id into v_order_id;
  insert into public.large_customer_bids(order_id,company_id,price_per_unit,offered_quality,delivery_hours)
  values(v_order_id,c,10,3,12) returning id into bid_fast;
  insert into public.large_customer_bids(order_id,company_id,price_per_unit,offered_quality,delivery_hours)
  values(v_order_id,npc1,10,3,24) returning id into bid_mid;
  insert into public.large_customer_bids(order_id,company_id,price_per_unit,offered_quality,delivery_hours)
  values(v_order_id,npc2,10,3,48) returning id into bid_slow;
  perform private.award_due_large_customer_orders();
  select score into fast_score from public.large_customer_bids where id=bid_fast;
  select score into mid_score from public.large_customer_bids where id=bid_mid;
  select score into slow_score from public.large_customer_bids where id=bid_slow;
  if not(fast_score>mid_score and mid_score>slow_score) then raise exception 'FAIL: speed scores % % %',fast_score,mid_score,slow_score; end if;
  if not exists(select 1 from public.large_customer_orders where id=v_order_id and awarded_company_id=c) then raise exception 'FAIL: fastest did not win'; end if;
  insert into test_results values('Equal price/quality: 12h beats 24h beats 48h; actual award',true);

  update public.material_inventories set quantity=0 where company_id=c and material_id=material;
  insert into public.material_inventories(company_id,material_id,quality_level,quantity,average_unit_cost)
  values(c,material,2,10,1) on conflict(company_id,material_id,quality_level) do update set quantity=10;
  begin
    perform public.deliver_large_customer_order(c,v_order_id,1);
    raise exception 'FAIL: lower offered quality accepted';
  exception when others then if position('Bestand' in sqlerrm)=0 then raise; end if; end;
  insert into public.material_inventories(company_id,material_id,quality_level,quantity,average_unit_cost)
  values(c,material,3,10,1) on conflict(company_id,material_id,quality_level) do update set quantity=10;
  update public.large_customer_orders set rush_bonus_rate=0.20 where id=v_order_id;
  result:=public.deliver_large_customer_order(c,v_order_id,4);
  if result->>'completed'<>'false' then raise exception 'FAIL: partial completion'; end if;
  begin
    perform public.deliver_large_customer_order(c,v_order_id,7);
    raise exception 'FAIL: over-delivery';
  exception when others then if position('Restmenge' in sqlerrm)=0 then raise; end if; end;
  result:=public.deliver_large_customer_order(c,v_order_id,6);
  if result->>'completed'<>'true' or (result->>'reward')::numeric<>120 then raise exception 'FAIL: delivery reward %',result; end if;
  insert into test_results values('Offered quality enforced; partial deliveries; excess blocked; +20% rush reward on completion',true);

  update public.company_specializations set specialization_code='logistics',specialization_level=3 where company_id=c and slot_no=1;
  update public.companies set company_level=15 where id=c;
  perform public.set_company_specialization(c,2::smallint,'contracts');
  update public.company_specializations set specialization_level=3 where company_id=c and slot_no=2;
  select id into container from public.products where company_id=c and name='Transportcontainer' and status='active' limit 1;
  if container is null then raise exception 'FAIL: container fixture missing'; end if;
  update public.inventories i set quantity=0 from public.products p where i.product_id=p.id and i.company_id=c and p.name='Transportcontainer';
  insert into public.material_inventories(company_id,material_id,quality_level,quantity,average_unit_cost)
  values(c,material,1,100,1) on conflict(company_id,material_id,quality_level) do update set quantity=100;
  update public.companies set cash_balance=1000000 where id=npc1;
  insert into public.contracts(proposer_company_id,seller_company_id,buyer_company_id,material_id,quality_level,quantity,unit_price,status,contract_kind,interval_days,duration_days,delivery_time,total_deliveries,next_delivery_at)
  values(c,c,npc1,material,1,10,10,'accepted','delivery',1,7,'06:00',7,now()-interval '1 minute') returning id into v_contract_id;
  perform private.run_delivery_contracts_if_due();
  select -t.amount into amount from public.financial_transactions t where t.reference_id=v_contract_id and t.company_id=c and t.transaction_type='contract_penalty';
  if amount<>5.60 then raise exception 'FAIL: logistics/contract penalty %',amount; end if;
  insert into public.inventories(company_id,product_id,quality_level,quantity,average_unit_cost)
  values(c,container,1,85,10) on conflict(company_id,product_id,quality_level) do update set quantity=85,average_unit_cost=10;
  insert into public.contracts(proposer_company_id,seller_company_id,buyer_company_id,material_id,quality_level,quantity,unit_price,status,contract_kind,interval_days,duration_days,delivery_time,total_deliveries,next_delivery_at)
  values(c,c,npc1,material,1,100,1,'accepted','delivery',1,7,'06:00',7,now()-interval '1 minute') returning id into v_contract_id;
  perform private.run_delivery_contracts_if_due();
  if not exists(select 1 from public.contracts where id=v_contract_id and completed_deliveries=1) then raise exception 'FAIL: reduced containers precheck'; end if;
  insert into test_results values('Contract/logistics penalty discounts; 85 containers correctly serve 100-unit delivery',true);

  if not private.is_large_customer_generation_time('2026-10-20 04:00+00') or not private.is_large_customer_generation_time('2026-11-01 05:00+00') or private.is_large_customer_generation_time('2026-10-20 05:00+00') or private.is_large_customer_generation_time('2026-10-20 04:01+00') then raise exception 'FAIL: 06:00/DST guard'; end if;
  if not private.is_large_customer_generation_time(now()) and private.generate_large_customer_order_if_due()<>0 then raise exception 'FAIL: outside 06:00 generation'; end if;
  if (select count(*) from cron.job where jobname='opencompany-large-customer-generation' and schedule='0 4,5 * * *' and active)<>1 then raise exception 'FAIL: generation cron'; end if;
  insert into test_results values('06:00 summer/winter time; other hours/minutes blocked; scheduled job active',true);
end
$tests$;
-- Test the real generator at an eligible time using a rollback-only clock guard.
create or replace function private.is_large_customer_generation_time(p_at timestamptz)
returns boolean language sql immutable set search_path to '' as $$ select true $$;
do $generator$
declare generated integer;
begin
  if exists(select 1 from public.large_customer_orders where status in ('bidding','awarded')) then raise exception 'Generation test requires no active real orders'; end if;
  update private.large_customer_generation_state set last_generation_date=current_date-1 where id=1;
  generated:=private.generate_large_customer_order_if_due();
  if generated<>3 or (select count(*) from public.large_customer_orders where status='bidding')<>3 then raise exception 'FAIL: fill three slots %',generated; end if;
  if private.generate_large_customer_order_if_due()<>0 then raise exception 'FAIL: duplicate daily generation'; end if;
  update private.large_customer_generation_state set last_generation_date=current_date-1 where id=1;
  if private.generate_large_customer_order_if_due()<>0 then raise exception 'FAIL: capacity exceeded'; end if;
  if exists(select 1 from public.large_customer_orders where status='bidding' and bidding_ends_at-published_at<>interval '24 hours') then raise exception 'FAIL: 24h bidding'; end if;
  insert into test_results values('Generator fills three slots; duplicate/capacity guards; 24h bidding',true);
end
$generator$;
select * from test_results;
rollback;
