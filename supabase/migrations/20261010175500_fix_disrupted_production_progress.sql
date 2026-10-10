-- A disrupted production job must accrue output at the slower rate.
do $patch$
declare f text;
begin
 select pg_get_functiondef('private.start_production_on_building_v2_impl(uuid,uuid,uuid,numeric,text,jsonb)'::regprocedure) into f;
 if position('hours=p_hours+v_disruption_hours' in f)=0 then
   if position('update public.production_jobs set finishes_at=finishes_at+interval ''2 hours'' where id=v_job' in f)=0
   then raise exception 'Unexpected disruption code'; end if;
   f:=replace(f,
   'update public.production_jobs set finishes_at=finishes_at+interval ''2 hours'' where id=v_job',
   'update public.production_jobs set finishes_at=finishes_at+(v_disruption_hours*interval ''1 hour''), hours=p_hours+v_disruption_hours,units_per_hour=v_output/(p_hours+v_disruption_hours) where id=v_job');
   execute f;
 end if;
end $patch$;
