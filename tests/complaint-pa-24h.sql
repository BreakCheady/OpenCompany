-- Structural checks for complaint notifications and UI-independent response deadline.
do $test$
declare v_default text;
begin
 if (select count(*) from pg_trigger where tgrelid='public.customer_complaints'::regclass and tgname='trg_notify_new_customer_complaint' and not tgisinternal)<>1 then
   raise exception 'PA notification trigger absent';
 end if;
 if position('private.management_send_pa' in
  pg_get_functiondef('private.notify_new_customer_complaint()'::regprocedure))=0 then
   raise exception 'PA notification invocation absent';
 end if;
 select pg_get_expr(d.adbin,d.adrelid) into v_default
 from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
 where d.adrelid='public.customer_complaints'::regclass and a.attname='expires_at';
 if v_default not like '%24:00:00%' and v_default not like '%24 hours%' then
   raise exception 'Complaint deadline is not 24 hours: %',v_default;
 end if;
end $test$;
