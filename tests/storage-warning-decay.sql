-- Non-destructive server-side contract checks; execute against the deployed database.
do $test$
declare
  decay_def text:=pg_get_functiondef('private.decay_storage_warnings(uuid)'::regprocedure);
  status_def text:=pg_get_functiondef('private.storage_status_impl(uuid)'::regprocedure);
  threshold_def text:=pg_get_functiondef('private.handle_storage_threshold(uuid)'::regprocedure);
  daily_def text:=pg_get_functiondef('private.run_storage_daily_if_due()'::regprocedure);
  trigger_def text:=pg_get_functiondef('private.handle_storage_capacity_after()'::regprocedure);
begin
  if position('2592000' in decay_def)=0 then raise exception '30-day window missing'; end if;
  if position('least(v_elapsed,v_state.warning_count)' in decay_def)=0 then raise exception 'Warning decay not limited by count'; end if;
  if position('v_total>v_capacity' in decay_def)=0 then raise exception 'Overflow must interrupt warning countdown'; end if;
  if position('perform private.decay_storage_warnings(p_company_id)' in status_def)=0 then raise exception 'Status does not refresh warning expiry'; end if;
  if position('warning_decay_at' in status_def)=0 then raise exception 'UI countdown timestamp not exposed'; end if;
  if position('perform private.decay_storage_warnings(p_company_id)' in threshold_def)=0 then raise exception 'Threshold skips old warning expiry'; end if;
  if position('warning_decay_started_at=null' in threshold_def)=0 then raise exception 'New warning does not reset countdown'; end if;
  if position('perform private.decay_storage_warnings(r.id)' in daily_def)=0 then raise exception 'Daily run does not refresh warning expiry'; end if;
  if position('warning_decay_started_at=null' in trigger_def)=0 then raise exception 'New storage overflow does not stop countdown'; end if;
end $test$;
