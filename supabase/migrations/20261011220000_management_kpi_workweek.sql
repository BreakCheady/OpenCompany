-- Scope only flow metrics to Berlin Monday-Friday; preserve current stock metrics.
do $patch$
declare f text;
begin
  select pg_get_functiondef('public.get_management_overview(uuid)'::regprocedure) into f;
  if position('v_workweek_end timestamptz' in f)=0 then
    f:=replace(f,'  v_metrics jsonb;',
      '  v_workweek_start timestamptz:=(v_week_start::timestamp at time zone ''Europe/Berlin'');'||chr(10)||
      '  v_workweek_end timestamptz:=least(now(),((v_week_start+5)::timestamp at time zone ''Europe/Berlin''));'||chr(10)||
      '  v_lastweek_start timestamptz:=((v_week_start-7)::timestamp at time zone ''Europe/Berlin'');'||chr(10)||
      '  v_lastweek_end timestamptz;'||chr(10)||'  v_metrics jsonb;');
    f:=replace(f,'  v_metrics:=private.management_period_metrics(p_company_id,now()-interval ''7 days'',now());',
      '  v_lastweek_end:=v_lastweek_start+(v_workweek_end-v_workweek_start);'||chr(10)||
      '  v_metrics:=private.management_period_metrics(p_company_id,v_workweek_start,v_workweek_end);');
    f:=replace(f,'  v_prev:=private.management_period_metrics(p_company_id,now()-interval ''14 days'',now()-interval ''7 days'');',
      '  v_prev:=private.management_period_metrics(p_company_id,v_lastweek_start,v_lastweek_end);');
    execute f;
  end if;
end $patch$;