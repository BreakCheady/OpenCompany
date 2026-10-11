-- Weekly management KPI windows use the current Berlin calendar week.
-- Existing goal periods and snapshots remain unchanged.
do $patch$
declare f text;
begin
  select pg_get_functiondef('public.get_management_overview(uuid)'::regprocedure) into f;
  if position('v_previous_start timestamptz' in f)=0 then
    f:=replace(f,'  v_metrics jsonb;',
      '  v_start timestamptz:=(v_week_start::timestamp at time zone ''Europe/Berlin'');'||chr(10)||
      '  v_previous_start timestamptz:=((v_week_start-7)::timestamp at time zone ''Europe/Berlin'');'||chr(10)||
      '  v_metrics jsonb;');
  end if;
  f:=replace(f,'private.management_period_metrics(p_company_id,now()-interval ''7 days'',now())',
                'private.management_period_metrics(p_company_id,v_start,now())');
  f:=replace(f,'private.management_period_metrics(p_company_id,now()-interval ''14 days'',now()-interval ''7 days'')',
                'private.management_period_metrics(p_company_id,v_previous_start,v_start)');
  f:=replace(f,'greatest(started_at,now()-interval ''7 days'')','greatest(started_at,v_start)');
  f:=replace(f,'coalesce(completed_at,finishes_at)>now()-interval ''7 days''','coalesce(completed_at,finishes_at)>v_start');
  f:=replace(f,'v_prod_hours/(v_prod_buildings*168.0)*100',
                'v_prod_hours/(v_prod_buildings*greatest(1,extract(epoch from (now()-v_start))/3600.0))*100');
  execute f;
end $patch$;
