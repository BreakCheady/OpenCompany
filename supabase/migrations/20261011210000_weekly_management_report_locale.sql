-- Normalize weekly PA reports: Berlin calendar week, localized numbers/cost centers.
-- No historical messages or financial transactions are modified.
create or replace function private.create_weekly_management_report(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_week date:=private.management_week_start(now());
  v_start timestamptz:=(v_week::timestamp at time zone 'Europe/Berlin');
  v_prev_start timestamptz:=((v_week-7)::timestamp at time zone 'Europe/Berlin');
  v_prev_end timestamptz;
  v_cur jsonb;
  v_prev jsonb;
  v_revenue numeric;
  v_prev_revenue numeric;
  v_change numeric:=0;
  v_profit numeric;
  v_value_now numeric;
  v_value_prev numeric;
  v_value_change numeric:=0;
  v_storage numeric:=0;
  v_large integer:=0;
  v_top_income text:='–';
  v_top_cost text:='–';
  v_note text:='';
  v_storage_cost numeric:=0;
  v_storage_prev numeric:=0;
  v_prod_cost numeric:=0;
  v_prod_prev numeric:=0;
  v_body text;
begin
  insert into private.management_weekly_report_runs(company_id,week_start)
  values(p_company_id,v_week)
  on conflict do nothing;
  if not found then return; end if;

  v_prev_end:=least(v_start,v_prev_start+(now()-v_start));
  v_cur:=private.management_period_metrics(p_company_id,v_start,now());
  v_prev:=private.management_period_metrics(p_company_id,v_prev_start,v_prev_end);
  v_revenue:=coalesce((v_cur->>'revenue')::numeric,0);
  v_prev_revenue:=coalesce((v_prev->>'revenue')::numeric,0);
  v_profit:=coalesce((v_cur->>'operating_result')::numeric,0);
  v_large:=coalesce((v_cur->>'large_orders_completed')::integer,0);
  v_change:=case when v_prev_revenue<>0 then (v_revenue-v_prev_revenue)/abs(v_prev_revenue)*100 else 0 end;
  v_storage:=case when private.storage_capacity(p_company_id)>0
    then private.storage_total_quantity(p_company_id)/private.storage_capacity(p_company_id)*100 else 0 end;

  select company_value into v_value_now from public.companies where id=p_company_id;
  select company_value into v_value_prev
  from public.company_valuation_history
  where company_id=p_company_id and valuation_date<=((now() at time zone 'Europe/Berlin')::date-7)
  order by valuation_date desc limit 1;
  v_value_change:=case when coalesce(v_value_prev,0)>0 then (v_value_now-v_value_prev)/v_value_prev*100 else 0 end;

  select cost_center into v_top_income
  from public.financial_transactions
  where company_id=p_company_id and created_at>=v_start and created_at<now() and amount>0
    and transaction_type not in ('bond_proceeds','bond_principal_income','founding_capital','manager_saving')
  group by cost_center order by sum(amount) desc limit 1;

  select cost_center into v_top_cost
  from public.financial_transactions
  where company_id=p_company_id and created_at>=v_start and created_at<now() and amount<0
    and transaction_type not in ('bond_investment','bond_repayment')
  group by cost_center order by sum(abs(amount)) desc limit 1;

  select abs(coalesce(sum(amount),0)) into v_storage_cost
  from public.financial_transactions where company_id=p_company_id and created_at>=v_start and created_at<now()
    and transaction_type='storage_fee';
  select abs(coalesce(sum(amount),0)) into v_storage_prev
  from public.financial_transactions where company_id=p_company_id
    and created_at>=v_prev_start and created_at<v_prev_end
    and transaction_type='storage_fee';
  select abs(coalesce(sum(amount),0)) into v_prod_cost
  from public.financial_transactions where company_id=p_company_id and created_at>=v_start and created_at<now()
    and cost_center='production' and amount<0;
  select abs(coalesce(sum(amount),0)) into v_prod_prev
  from public.financial_transactions where company_id=p_company_id
    and created_at>=v_prev_start and created_at<v_prev_end
    and cost_center='production' and amount<0;

  if v_storage_prev>0 and v_storage_cost>v_storage_prev*1.20 then
    v_note:='Auffällig: Die Lagerkosten sind gegenüber der Vorwoche um '
      ||translate(to_char(round((v_storage_cost-v_storage_prev)/v_storage_prev*100,1),'FM999,999,999,990.0'),',.','.,')||' % gestiegen (von '||translate(to_char(v_storage_prev,'FM999,999,999,990.00'),',.','.,')||' $ auf '||translate(to_char(v_storage_cost,'FM999,999,999,990.00'),',.','.,')||' $).';
  elsif v_prod_prev>0 and v_prev_revenue>0
    and (v_prod_cost-v_prod_prev)/v_prod_prev > (v_revenue-v_prev_revenue)/abs(v_prev_revenue) then
    v_note:='Auffällig: Die Produktionskosten sind diese Woche stärker gestiegen als der Umsatz.';
  end if;

  v_body:='Boss, hier ist der Wochenbericht (Kalenderwoche ab '||to_char(v_week,'DD.MM.YYYY')||', Stand '||to_char(now() at time zone 'Europe/Berlin','DD.MM.YYYY HH24:MI')||' Uhr). Vorwochenvergleich für den gleichen Wochenabschnitt.'||E'\n\n'
    ||'Umsatz: '||translate(to_char(round(v_revenue,2),'FM999,999,999,990.00'),',.','.,')||' $'||E'\n'
    ||'Vorwoche: '||translate(to_char(round(v_prev_revenue,2),'FM999,999,999,990.00'),',.','.,')||' $'||E'\n'
    ||'Veränderung: '||case when v_change>=0 then '+' else '' end||translate(to_char(round(v_change,1),'FM999,999,999,990.0'),',.','.,')||' %'||E'\n'
    ||'Betriebsergebnis: '||translate(to_char(round(v_profit,2),'FM999,999,999,990.00'),',.','.,')||' $'||E'\n'
    ||'Größte Einnahmequelle: '||case coalesce(v_top_income,'') when 'retail' then 'Einzelhandel' when 'market' then 'Warenbörse' when 'contracts' then 'Verträge' when 'large_orders' then 'Großaufträge' when 'production' then 'Produktion' when 'research' then 'Forschung' when 'buildings' then 'Gebäude' when 'storage_logistics' then 'Lager & Logistik' when 'financing' then 'Finanzierung' when 'management' then 'Management' when 'other' then 'Sonstiges' else coalesce(v_top_income,'–') end||E'\n'
    ||'Größter Kostenblock: '||case coalesce(v_top_cost,'') when 'retail' then 'Einzelhandel' when 'market' then 'Warenbörse' when 'contracts' then 'Verträge' when 'large_orders' then 'Großaufträge' when 'production' then 'Produktion' when 'research' then 'Forschung' when 'buildings' then 'Gebäude' when 'storage_logistics' then 'Lager & Logistik' when 'financing' then 'Finanzierung' when 'management' then 'Management' when 'other' then 'Sonstiges' else coalesce(v_top_cost,'–') end||E'\n'
    ||'Unternehmenswert: '||case when v_value_change>=0 then '+' else '' end||translate(to_char(round(v_value_change,1),'FM999,999,999,990.0'),',.','.,')||' %'||E'\n'
    ||'Lagerauslastung (aktuell): '||translate(to_char(round(v_storage,1),'FM999,999,999,990.0'),',.','.,')||' %'||E'\n'
    ||v_large||' Großaufträge wurden erfolgreich abgeschlossen.'
    ||case when v_note<>'' then E'\n\n'||v_note else '' end;

  perform private.management_send_pa(p_company_id,v_body);
end
$$;
