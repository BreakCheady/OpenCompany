-- Weekly goal/budget summary, Monday at 09:00 Europe/Berlin.
-- Goal rows are retained for reporting but hidden from the in-game goal list.
create table if not exists private.management_monday_summary_runs(
  company_id uuid not null,
  week_start date not null,
  sent_at timestamptz not null default now(),
  primary key(company_id,week_start)
);
revoke all on private.management_monday_summary_runs from public,anon,authenticated;

create or replace function private.send_management_monday_summary()
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_local timestamp:=now() at time zone 'Europe/Berlin';
  v_week_start date:=date_trunc('week',v_local)::date;
  v_prev_start date:=v_week_start-7;
  v_prev_ts timestamptz:=((v_week_start-7)::timestamp at time zone 'Europe/Berlin');
  v_week_ts timestamptz:=(v_week_start::timestamp at time zone 'Europe/Berlin');
  c record;
  g record;
  b record;
  v_body text;
  v_goals integer;
  v_budgets integer;
  v_used numeric;
  v_count integer:=0;
  v_label text;
begin
  -- pg_cron uses UTC: 07:00 UTC in summer, 08:00 UTC in winter.
  -- Never send outside Berlin Monday 09:00, even if a job is invoked manually.
  if extract(isodow from v_local)<>1 or v_local::time<time '09:00'
     or v_local::time>=time '09:05' then return 0; end if;

  for c in select id from public.companies
           where company_type='player' and status='active' and owner_user_id is not null
  loop
    insert into private.management_monday_summary_runs(company_id,week_start)
      values(c.id,v_week_start) on conflict do nothing;
    if not found then continue; end if;

    v_body:='Boss, hier ist dein Unternehmensziele- und Budgetbericht für '
      ||to_char(v_prev_start,'DD.MM.YYYY')||' bis '
      ||to_char(v_week_start-1,'DD.MM.YYYY')||'.';
    v_goals:=0;
    for g in select * from public.company_goals
      where company_id=c.id and starts_at<v_week_ts and ends_at>v_prev_ts
      order by created_at
    loop
      v_goals:=v_goals+1;
      v_label:=case g.goal_type
        when 'revenue' then 'Umsatz' when 'profit' then 'Gewinn'
        when 'company_value_growth' then 'Unternehmenswert-Wachstum'
        when 'debt_max' then 'Verschuldung' when 'storage_max' then 'Lagerauslastung'
        when 'large_orders' then 'Großaufträge'
        when 'research_patents' then 'Patente' else g.goal_type end;
      v_body:=v_body||E'\n'
        ||'- '||v_label||': '||private.weekly_report_format(private.goal_current_value(g))
        ||' / '||private.weekly_report_format(g.target_value)
        ||' ('||case g.status when 'completed' then 'erreicht'
              when 'expired' then 'nicht erreicht'
              when 'active' then 'noch offen' else g.status end||')';
    end loop;
    if v_goals=0 then v_body:=v_body||E'\nKeine Unternehmensziele für diesen Zeitraum.'; end if;

    v_body:=v_body||E'\n\nBudgetnutzung der vergangenen Kalenderwoche:';
    v_budgets:=0;
    for b in select department,weekly_budget from public.management_budgets
             where company_id=c.id order by department
    loop
      v_used:=private.management_budget_used(c.id,b.department,v_prev_start);
      v_budgets:=v_budgets+1;
      v_label:=case b.department when 'production' then 'Produktion'
        when 'purchasing' then 'Einkauf' when 'sales' then 'Vertrieb'
        when 'finance' then 'Finanzen' when 'research' then 'Forschung'
        when 'logistics' then 'Logistik' else b.department end;
      v_body:=v_body||E'\n'||'- '||v_label||': '
        ||private.weekly_report_format(v_used)||' $ verwendet'
        ||case when b.weekly_budget>0 then ' / '
             ||private.weekly_report_format(b.weekly_budget)
             ||' $ aktuell eingestelltes Wochenbudget'
             else ' (kein Budgetlimit eingestellt)' end;
    end loop;
    if v_budgets=0 then v_body:=v_body||E'\nKeine Budgets eingerichtet.'; end if;
    perform private.management_send_pa(c.id,v_body);
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function private.send_management_monday_summary() from public,anon,authenticated;

-- Two UTC candidates accommodate Berlin daylight saving; local time guard
-- ensures exactly one dispatch and the unique run key prevents duplicates.
select cron.schedule('opencompany-management-monday-summary','0 7,8 * * 1',
  'select private.send_management_monday_summary();');
