const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('management.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261012160000_more_company_goals.sql','utf8');
const included=['production_quantity','retail_revenue','market_revenue','cash_min','profit_margin','production_utilization','large_order_revenue','production_cost_max','contract_revenue','research_spend','market_buy_max','cashflow'];
const excluded=['storage_cost_max','employee_growth','building_capacity_growth'];
for(const name of included){
 assert.ok(html.includes('<option value="'+name+'">'),'Missing UI option '+name);
 assert.ok(js.includes(name+':{label:'),'Missing label/unit '+name);
 assert.ok(sql.includes("p_goal.goal_type='"+name+"'"),'Missing server calculation '+name);
 assert.ok(sql.includes("''"+name+"''"),'Missing accepted SQL type '+name);
}
for(const name of excluded){
 assert.ok(!html.includes('<option value="'+name+'">'),'Excluded goal exposed: '+name);
}
assert.ok(sql.includes("now()>=p_goal.ends_at"),'Expense cap and utilization goal cannot complete early');
assert.ok(js.includes('Verbleibender Spielraum'),'Cost goals need an allowance label');
assert.ok(sql.includes("management_period_metrics"),'Margin and cashflow share server metrics');
assert.ok(sql.includes("company_goals_goal_type_check"),'Database constraint updated');
assert.ok(sql.includes('send_management_monday_summary'),'PA labels extended');
console.log('12 company-goal definitions and exclusions passed.');
