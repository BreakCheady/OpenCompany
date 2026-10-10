-- Correct customer rewards to actual delivered/claimed sales and improve mode throughput.
do $patch$
declare f text; v_start text; v_end text;
begin
 select pg_get_functiondef('private.start_retail_sale_on_building_v2_impl(uuid,uuid,uuid,integer,numeric,numeric,text,jsonb)'::regprocedure) into f;
 v_start:='  insert into public.company_customer_relations(company_id,satisfaction,loyalty)';
 if position(v_start in f)>0 then
   f:=substring(f from 1 for position(v_start in f)-1)||
        '  return v_job;'||chr(10)||'end'||chr(10)||'$function$';
   execute f;
 end if;
 select pg_get_functiondef('private.claim_retail_revenue_impl(uuid,uuid)'::regprocedure) into f;
 if position('company_customer_relations' in f)=0 then
   f:=replace(f,'  return v_amount;',
'  insert into public.company_customer_relations(company_id,satisfaction,loyalty)'||chr(10)||
'  values(p_company_id,50.2+(case when v_job.quality_level>=5 then 0.5 when v_job.quality_level=4 then 0.3 else 0 end),40.1)'||chr(10)||
'  on conflict(company_id) do update set satisfaction=least(100,public.company_customer_relations.satisfaction+least(2,0.2+case when v_job.quality_level>=5 then 0.5 when v_job.quality_level=4 then 0.3 else 0 end)),'||chr(10)||
'  loyalty=least(100,public.company_customer_relations.loyalty+0.1),updated_at=now();'||chr(10)||
'  return v_amount;');
   execute f;
 end if;
end $patch$;
