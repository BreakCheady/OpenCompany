-- Correct expired complaint penalties, loyalty's recession effect and machine mode timing.
create or replace function private.tick_customer_relations()
returns void language plpgsql security definer set search_path='' as $$
declare v_company uuid;
begin
 for v_company in
   update public.customer_complaints
      set status='ignored',resolved_at=now()
      where status='open' and expires_at<=now()
      returning company_id
 loop
   perform private.adjust_customer_relations(v_company,-2,-0.5);
 end loop;
 update public.company_customer_relations
 set satisfaction=case when satisfaction>50 then greatest(50,satisfaction-0.1)
                       when satisfaction<50 then least(50,satisfaction+0.1) else 50 end,
 loyalty=case when loyalty>40 then greatest(40,loyalty-0.1)
              when loyalty<40 then least(40,loyalty+0.1) else 40 end,
 updated_at=now()
 where updated_at<now()-interval '24 hours';
end $$;
do $patch$
declare f text;
begin
 select pg_get_functiondef('private.start_retail_sale_on_building_v2_impl(uuid,uuid,uuid,integer,numeric,numeric,text,jsonb)'::regprocedure) into f;
 if position('v_customer_loyalty numeric' in f)=0 then
   f:=replace(f,'v_customer_satisfaction numeric;', 'v_customer_satisfaction numeric; v_customer_loyalty numeric;');
   f:=replace(f,'select satisfaction into v_customer_satisfaction from public.company_customer_relations',
                  'select satisfaction,loyalty into v_customer_satisfaction,v_customer_loyalty from public.company_customer_relations');
   f:=replace(f,'*v_customer_factor)', '*v_customer_factor*(case when private.economy_phase()=''recession'' then 1+least(0.1,greatest(0,coalesce(v_customer_loyalty,40)-40)/600) else 1 end))');
   execute f;
 end if;
end $patch$;
