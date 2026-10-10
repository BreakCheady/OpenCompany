-- Retire quality-only orders and assign weighted Q1-Q5 to remaining types.
-- Existing orders remain untouched; only future generation changes.
do $patch$
declare v_def text;
begin
 select pg_get_functiondef('private.generate_large_customer_order_if_due()'::regprocedure) into v_def;
 if position('array[''raw_material'',''production'',''quality'',''rush'']' in v_def)=0
 then raise exception 'Unexpected order-type generator'; end if;
 v_def:=replace(v_def,
  'array[''raw_material'',''production'',''quality'',''rush'']',
  'array[''raw_material'',''production'',''rush'']');
 v_def:=replace(v_def,'floor(random()*4)::int','floor(random()*3)::int');
 v_def:=replace(v_def,
  'v_quality := case when v_type=''quality'' then 5 else 2+floor(random()*2)::int end;',
  'v_quality := case when random()<0 then 1 else 2 end;');
 -- Use a single random draw, with 20% Q1, 30% Q2, 30% Q3, 15% Q4, 5% Q5.
 v_def:=replace(v_def,
  'v_quality := case when random()<0 then 1 else 2 end;',
  'v_quality := (array[1,2,3,4,5])[1];');
 v_def:=replace(v_def,
  'v_quality := (array[1,2,3,4,5])[1];',
  'v_roll := random();'||chr(10)||'    v_quality := case when v_roll<0.20 then 1 when v_roll<0.50 then 2 when v_roll<0.80 then 3 when v_roll<0.95 then 4 else 5 end;');
 v_def:=replace(v_def,'  v_quality integer;','  v_quality integer;'||chr(10)||'  v_roll numeric;');
 -- The legacy quality branch is now unreachable; remove to keep only three types.
 if position('      elsif v_type=''quality'' then' in v_def)>0 then
   v_def:=regexp_replace(v_def,
     '      elsif v_type=''quality'' then[\s\S]*?      else',
     '      else');
 end if;
 execute v_def;
end $patch$;
