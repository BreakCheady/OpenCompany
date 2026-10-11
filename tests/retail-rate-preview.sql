-- Non-destructive verification of retail speed preview against the start RPC.
do $test$
declare preview_text text; start_text text;
begin
 select pg_get_functiondef('public.preview_retail_sale_rate(uuid,uuid,uuid)'::regprocedure) into preview_text;
 select pg_get_functiondef('private.start_retail_sale_on_building_v2_impl(uuid,uuid,uuid,integer,numeric,numeric,text,jsonb)'::regprocedure) into start_text;
 if preview_text is null or start_text is null then raise exception 'Missing retail RPC'; end if;
 if not has_function_privilege('authenticated','public.preview_retail_sale_rate(uuid,uuid,uuid)','EXECUTE') then raise exception 'Preview privilege missing'; end if;
 if has_function_privilege('anon','public.preview_retail_sale_rate(uuid,uuid,uuid)','EXECUTE') then raise exception 'Anonymous access unexpectedly allowed'; end if;
 if position('private.assert_company_owner' in preview_text)=0 then raise exception 'Ownership validation missing'; end if;
 if position('private.manager_multiplier' in preview_text)=0 or position('private.specialization_factor' in preview_text)=0 then raise exception 'Buff multiplier missing'; end if;
 if position('private.manager_multiplier' in start_text)=0 or position('private.specialization_factor' in start_text)=0 then raise exception 'Retail start rate changed'; end if;
end $test$;
