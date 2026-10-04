-- Transactional regression tests: fixtures and read states are rolled back.
begin;
create temporary table chat_test_results(test text,passed boolean);
do $$
declare
  c uuid; u uuid; a uuid; b uuid; room uuid; inactive_room uuid;
  first_message uuid; latest_message uuid; other_message uuid; later_message uuid;
  material uuid; v_order_id uuid; fee numeric; key text; category text;
  cursor_before bigint; old_cash numeric;
begin
  select id,owner_user_id into c,u from public.companies where company_type='player' and owner_user_id is not null order by created_at limit 1;
  select id into a from public.companies where company_type='npc' and id<>'00000000-0000-4000-8000-000000000001'::uuid order by id limit 1;
  select id into b from public.companies where company_type='npc' and id<>a and id<>'00000000-0000-4000-8000-000000000001'::uuid order by id limit 1;
  if c is null or a is null or b is null then raise exception 'Rollback test companies required'; end if;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  delete from public.chat_messages where sender_company_id=c or recipient_company_id=c;
  delete from public.company_chat_reads where company_id=c;
  insert into public.chat_rooms(slug,name,is_active) values('rollback-'||gen_random_uuid(),'Rollback room',true) returning id into room;
  insert into public.chat_rooms(slug,name,is_active) values('rollback-'||gen_random_uuid(),'Inactive rollback room',false) returning id into inactive_room;
  insert into public.chat_messages(sender_company_id,recipient_company_id,body) values(a,c,'first') returning id into first_message;
  insert into public.chat_messages(sender_company_id,recipient_company_id,body) values(a,c,'latest') returning id into latest_message;
  insert into public.chat_messages(sender_company_id,recipient_company_id,body) values(b,c,'other contact');
  insert into public.chat_messages(sender_company_id,recipient_company_id,body) values(c,a,'outgoing');
  insert into public.chat_messages(sender_company_id,recipient_company_id,body,deleted_at) values(a,c,'deleted',now());
  insert into public.chat_messages(sender_company_id,recipient_company_id,body) values(a,b,'private foreign') returning id into other_message;
  insert into public.chat_messages(sender_company_id,room_id,body) values(a,room,'room 1'),(b,room,'room 2'),(c,room,'own room message'),(a,inactive_room,'inactive room message');

  execute 'set local role authenticated';
  insert into public.chat_messages(sender_company_id,room_id,body) values(c,room,'authenticated own message');
  if (select unread_count from public.get_chat_unread_counts(c) where target_type='contact' and target_id=a) is distinct from 2 then raise exception 'incoming contact count'; end if;
  if (select unread_count from public.get_chat_unread_counts(c) where target_type='contact' and target_id=b) is distinct from 1 then raise exception 'other contact count'; end if;
  if (select unread_count from public.get_chat_unread_counts(c) where target_type='room' and target_id=room) is distinct from 2 then raise exception 'public room excludes own'; end if;
  if exists(select 1 from public.get_chat_unread_counts(c) where target_id=inactive_room) then raise exception 'inactive room leakage'; end if;
  if exists(select 1 from public.get_chat_unread_counts(a)) then raise exception 'foreign counts leakage'; end if;
  if exists(select 1 from public.chat_messages where id=other_message) then raise exception 'foreign messages leakage'; end if;
  perform public.mark_chat_read(c,'contact',a,latest_message);
  if exists(select 1 from public.get_chat_unread_counts(c) where target_type='contact' and target_id=a) then raise exception 'read contact not cleared'; end if;
  if (select unread_count from public.get_chat_unread_counts(c) where target_id=room) is distinct from 2 then raise exception 'reading contact clears room'; end if;
  select last_read_sequence into cursor_before from public.company_chat_reads where company_id=c and target_type='contact' and target_id=a;
  perform public.mark_chat_read(c,'contact',a,first_message);
  if (select last_read_sequence from public.company_chat_reads where company_id=c and target_type='contact' and target_id=a)<>cursor_before then raise exception 'stale read cursor regression'; end if;
  begin
    perform public.mark_chat_read(c,'contact',b,latest_message);
    raise exception 'wrong conversation accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.mark_chat_read(a,'contact',b,other_message);
    raise exception 'foreign owner accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.company_chat_reads(company_id,target_type,target_id,last_read_sequence) values(c,'contact',b,999999);
    raise exception 'direct cursor write accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.chat_messages set read_sequence=999999 where id=latest_message;
    raise exception 'message sequence write accepted';
  exception when insufficient_privilege or sqlstate '428C9' then null; end;
  execute 'reset role';
  insert into chat_test_results values('Authenticated counts, outgoing/deleted isolation, rooms, RLS and cursor permissions',true);

  insert into public.chat_messages(sender_company_id,recipient_company_id,body) values(a,c,'arrived after display') returning id into later_message;
  execute 'set local role authenticated';
  perform public.mark_chat_read(c,'contact',a,latest_message);
  if (select unread_count from public.get_chat_unread_counts(c) where target_id=a) is distinct from 1 then raise exception 'new arrival skipped by old read'; end if;
  perform public.mark_chat_read(c,'contact',a,later_message);
  if exists(select 1 from public.get_chat_unread_counts(c) where target_id=a) then raise exception 'latest read not persisted'; end if;
  execute 'reset role';
  insert into public.chat_messages(sender_company_id,recipient_company_id,body) select a,c,'bulk '||i from generate_series(1,125) i;
  execute 'set local role authenticated';
  if (select unread_count from public.get_chat_unread_counts(c) where target_id=a) is distinct from 125 then raise exception 'count truncated at 100'; end if;
  select id into latest_message from public.chat_messages where sender_company_id=a and recipient_company_id=c order by read_sequence desc limit 1;
  perform public.mark_chat_read(c,'contact',a,latest_message);
  if exists(select 1 from public.get_chat_unread_counts(c) where target_id=a) then raise exception 'long history not cleared'; end if;
  select id into latest_message from public.chat_messages where room_id=room order by read_sequence desc limit 1;
  perform public.mark_chat_read(c,'room',room,latest_message);
  if exists(select 1 from public.get_chat_unread_counts(c) where target_id=room) then raise exception 'room unread not cleared'; end if;
  execute 'reset role';
  insert into chat_test_results values('Persisted and monotonic reads, equal timestamps, concurrent arrival cutoff, 125 messages, independent rooms',true);

  -- Archived selections must not retain benefits, and old clients cannot buy upgrades.
  delete from public.company_specializations where company_id=c;
  insert into public.company_specializations(company_id,slot_no,specialization_code,specialization_level) values(c,1,'production',3),(c,2,'industry_food',3);
  foreach key in array array['production_output','production_operating_cost','retail_rate','retail_operating_cost','retail_price_effect','market_fee','transport_container_use','contract_penalty','logistics_penalty','research_operating_cost','patent_gain'] loop
    foreach category in array array['food','electronics','chemical','automotive','textile','research'] loop
      if private.specialization_factor(c,key,category) is distinct from 1 then raise exception 'retired bonus still active'; end if;
    end loop;
  end loop;
  select cash_balance into old_cash from public.companies where id=c;
  begin
    perform public.set_company_specialization(c,1::smallint,'trading');
    raise exception 'retired selection accepted';
  exception when others then if position('entfernt' in sqlerrm)=0 then raise; end if; end;
  begin
    perform public.upgrade_company_specialization(c,1::smallint);
    raise exception 'retired upgrade accepted';
  exception when others then if position('entfernt' in sqlerrm)=0 then raise; end if; end;
  if (select cash_balance from public.companies where id=c)<>old_cash then raise exception 'retired feature charged cash'; end if;
  if exists(select 1 from public.get_company_specializations(c)) or exists(select 1 from public.get_company_specialization_progress(c)) then raise exception 'retired profile exposed'; end if;
  if private.complete_specialization_upgrades() is distinct from 0 then raise exception 'retired upgrade completion'; end if;
  if exists(select 1 from cron.job where jobname='opencompany-specialization-upgrades') then raise exception 'retired cron still scheduled'; end if;
  if has_table_privilege('authenticated','public.company_production_plans','select') or has_table_privilege('authenticated','public.company_specializations','select') then raise exception 'retired table exposed'; end if;
  if has_function_privilege('anon','public.get_chat_unread_counts(uuid)','execute') or has_function_privilege('anon','public.mark_chat_read(uuid,text,uuid,uuid)','execute') then raise exception 'anonymous chat access'; end if;
  insert into chat_test_results values('Features retired server-side, no hidden bonuses or new charges, archive and anonymous access protected',true);

  update public.companies set cash_balance=10000000 where id=c;
  delete from public.company_specializations where company_id=a;
  insert into public.company_specializations(company_id,slot_no,specialization_code,specialization_level) values(a,1,'trading',3);
  select id into material from public.materials where status='active' order by id limit 1;
  insert into public.market_orders(company_id,material_id,quantity,remaining_quantity,price_per_unit,quality_level) values(a,material,10,10,10,1) returning id into v_order_id;
  execute 'set local role authenticated';
  perform public.buy_market_order(c,v_order_id,10);
  select market_fee into fee from public.market_trades t where t.order_id=v_order_id and t.buyer_company_id=c;
  if fee is distinct from 5 then raise exception 'actual market fee %, expected 5',fee; end if;
  execute 'reset role';
  insert into chat_test_results values('Actual marketplace trade uses base 5% fee despite archived trading III',true);
end $$;
select * from chat_test_results;
rollback;
