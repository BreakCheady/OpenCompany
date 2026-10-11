const assert=require('node:assert/strict');const fs=require('node:fs');const sql=fs.readFileSync('supabase/migrations/20261011210000_weekly_management_report_locale.sql','utf8');
for(const value of ["v_start","v_prev_start","v_prev_end","Europe/Berlin","Einzelhandel","Warenbörse","Lager & Logistik","Lagerauslastung (aktuell)","v_storage_prev","v_storage_cost","FM999,999,999,990.00"])assert.ok(sql.includes(value),value);
assert.ok(!sql.includes("now()-interval '7 days'"));
assert.ok(sql.includes("management_period_metrics(p_company_id,v_start,now())"));
assert.ok(sql.includes("management_period_metrics(p_company_id,v_prev_start,v_prev_end)"));
assert.ok(sql.includes("(v_cur->>'operating_result')"));
console.log('Weekly PA calendar-week / localized output checks passed.');
