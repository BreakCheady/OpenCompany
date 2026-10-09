-- Keep the quantity selected in the production UI authoritative as an upper bound.
-- Server bonuses may increase capacity but must not silently increase input consumption.
do $patch$
declare
 v_def text;
 v_old text:='v_output:=floor(v_units_per_hour*p_hours+0.0000001);';
 v_new text:=$replacement$
v_output:=floor(v_units_per_hour*p_hours+0.0000001);
-- The user-approved quantity is a cap, never a way to exceed server capacity.
-- Older clients without a valid snapshot continue to use server calculations.
if jsonb_typeof(p_start_snapshot->'outputQty')='number'
   and (p_start_snapshot->>'outputQty')::numeric>0 then
  v_output:=least(v_output,floor((p_start_snapshot->>'outputQty')::numeric));
  -- Keep the progress/claim rate consistent with the actual job quantity.
  v_units_per_hour:=v_output/p_hours;
end if;
$replacement$;
begin
 select pg_get_functiondef('private.start_production_on_building_v2_impl(uuid,uuid,uuid,numeric,text,jsonb)'::regprocedure) into v_def;
 if position('The user-approved quantity is a cap' in v_def)>0 then return; end if;
 if position(v_old in v_def)=0 then raise exception 'Production output computation changed; review migration'; end if;
 execute replace(v_def,v_old,v_new);
end $patch$;
