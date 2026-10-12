-- Keep weekly revenue goals numerically identical to management KPI revenue.
-- Week begins Monday 00:00 Europe/Berlin; other goal types/periods are unchanged.
do $patch$
declare f text;
begin
 select pg_get_functiondef('private.goal_current_value(public.company_goals)'::regprocedure) into f;
 if position('p_goal.period_type=''week''' in f)=0 then
   f:=replace(f,
     'if p_goal.goal_type=''revenue'' then',
     'if p_goal.goal_type=''revenue'' and p_goal.period_type=''week'' then'||chr(10)||
     '    v:=coalesce((private.management_period_metrics(p_goal.company_id,(date_trunc(''week'',now() at time zone ''Europe/Berlin'') at time zone ''Europe/Berlin''),now())->>''revenue'')::numeric,0);'||chr(10)||
     '  elsif p_goal.goal_type=''revenue'' then');
   execute f;
 end if;
end $patch$;
