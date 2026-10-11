-- Thirty real calendar days in a compliant warehouse remove one storage warning.
-- During overflow the clock is stopped; another threshold violation resets it.
alter table private.storage_company_state
  add column if not exists warning_decay_started_at timestamptz;

create or replace function private.decay_storage_warnings(p_company_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_state private.storage_company_state%rowtype;
  v_capacity numeric;
  v_total numeric;
  v_elapsed integer;
  v_reduction integer;
begin
  select * into v_state from private.storage_company_state
    where company_id=p_company_id for update;
  if not found then return; end if;
  if coalesce(v_state.warning_count,0)<=0 then
    if v_state.warning_decay_started_at is not null then
      update private.storage_company_state set warning_decay_started_at=null
      where company_id=p_company_id;
    end if;
    return;
  end if;

  v_capacity:=private.storage_capacity(p_company_id);
  v_total:=private.storage_total_quantity(p_company_id);
  if v_total>v_capacity then
    update private.storage_company_state
      set warning_decay_started_at=null
      where company_id=p_company_id and warning_decay_started_at is not null;
    return;
  end if;

  if v_state.warning_decay_started_at is null then
    update private.storage_company_state
      set warning_decay_started_at=now()
      where company_id=p_company_id;
    return;
  end if;

  v_elapsed:=floor(extract(epoch from (now()-v_state.warning_decay_started_at))/2592000);
  if v_elapsed<1 then return; end if;
  v_reduction:=least(v_elapsed,v_state.warning_count);
  update private.storage_company_state
    set warning_count=warning_count-v_reduction,
        warning_decay_started_at=case when warning_count-v_reduction<=0 then null
          else v_state.warning_decay_started_at+(v_reduction*interval '30 days') end,
        updated_at=now()
    where company_id=p_company_id;
end $$;
revoke all on function private.decay_storage_warnings(uuid) from public,anon,authenticated;

-- Call decay at every status read, daily billing, and before warning escalation.
-- Keep the existing auction, inventory and accounting logic intact.
do $patch$
declare f text;
begin
  select pg_get_functiondef('private.storage_status_impl(uuid)'::regprocedure) into f;
  if position('perform private.decay_storage_warnings(p_company_id);' in f)=0 then
    f:=replace(f,'  select * into v_state'||chr(10),
      '  perform private.decay_storage_warnings(p_company_id);'||chr(10)||'  select * into v_state'||chr(10));
    f:=replace(f,'''warning_count'',coalesce(v_state.warning_count,0),',
      '''warning_count'',coalesce(v_state.warning_count,0),'||chr(10)||
      '    ''warning_decay_started_at'',v_state.warning_decay_started_at,'||chr(10)||
      '    ''warning_decay_at'',case when v_state.warning_decay_started_at is null then null else v_state.warning_decay_started_at+interval ''30 days'' end,');
    execute f;
  end if;

  select pg_get_functiondef('private.handle_storage_threshold(uuid)'::regprocedure) into f;
  if position('warning_decay_started_at=null' in f)=0 then
    f:=replace(f,'  v_warning:=coalesce(v_state.warning_count,0)+1;',
      '  perform private.decay_storage_warnings(p_company_id);'||chr(10)||
      '  select * into v_state from private.storage_company_state where company_id=p_company_id for update;'||chr(10)||
      '  v_warning:=coalesce(v_state.warning_count,0)+1;');
    f:=replace(f,'  set warning_count=case when v_full then 0 else v_warning end,',
      '  set warning_count=case when v_full then 0 else v_warning end,'||chr(10)||
      '      warning_decay_started_at=null,');
    execute f;
  end if;

  select pg_get_functiondef('private.run_storage_daily_if_due()'::regprocedure) into f;
  if position('perform private.decay_storage_warnings(r.id);' in f)=0 then
    f:=replace(f,'    if v_state.last_daily_charge_date is null then',
      '    perform private.decay_storage_warnings(r.id);'||chr(10)||
      '    if v_state.last_daily_charge_date is null then');
    execute f;
  end if;

  select pg_get_functiondef('private.handle_storage_capacity_after()'::regprocedure) into f;
  if position('warning_decay_started_at=null' in f)=0 then
    f:=replace(f,'  if v_total>=v_capacity+1000 then',
      '  if v_total>v_capacity then'||chr(10)||
      '    update private.storage_company_state set warning_decay_started_at=null'||chr(10)||
      '      where company_id=new.company_id and warning_decay_started_at is not null;'||chr(10)||
      '  end if;'||chr(10)||
      '  if v_total>=v_capacity+1000 then');
    execute f;
  end if;
end $patch$;

-- Existing warnings start their clean-period clock once this feature goes live,
-- but only if storage is already within capacity.
update private.storage_company_state s
set warning_decay_started_at=now()
where s.warning_count>0 and s.warning_decay_started_at is null
  and private.storage_total_quantity(s.company_id)<=private.storage_capacity(s.company_id);
