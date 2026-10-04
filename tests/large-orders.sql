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
  update public.companies set cash_balance=10000000,company_level=15 where id=c;
  select id into material from public.materials where status='active' order by id limit 1;
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
