-- Safe schema/function smoke tests: no player data modified.
do $test$
declare f text;
begin
 if to_regclass('public.company_customer_relations') is null
    or to_regclass('public.production_machine_health') is null
    or to_regclass('public.customer_complaints') is null then
   raise exception 'Management tables absent';
 end if;
 select pg_get_functiondef('private.start_production_on_building_v2_impl(uuid,uuid,uuid,numeric,text,jsonb)'::regprocedure) into f;
 if position('v_machine_condition' in f)=0
    or position('v_disruption_chance' in f)=0
    or position('hours=p_hours+v_disruption_hours' in f)=0 then
   raise exception 'Production condition/disruption or elapsed-time handling missing';
 end if;
 select pg_get_functiondef('private.claim_retail_revenue_impl(uuid,uuid)'::regprocedure) into f;
 if position('private.process_customer_sale' in f)=0 then
   raise exception 'Customer reward is not coupled to claimed sales';
 end if;
 select pg_get_functiondef('public.maintain_production_machine(uuid,uuid,text)'::regprocedure) into f;
 if position('Wartung nur für Produktionsgebäude' in f)=0 then
   raise exception 'Maintenance not restricted to machines';
 end if;
 if not has_function_privilege('authenticated','public.get_company_management_health(uuid)','EXECUTE')
    or not has_function_privilege('authenticated','public.resolve_customer_complaint(uuid,uuid,text)','EXECUTE') then
   raise exception 'Management RPC permissions missing';
 end if;
end $test$;
