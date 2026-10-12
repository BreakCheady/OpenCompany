const assert=require('node:assert/strict');const fs=require('node:fs');
const sql=fs.readFileSync('docs/economy-retail-zero-revenue-guard.sql','utf8');
assert.match(sql,/p_unit_price<=v_min\s+or\s+p_unit_price>=v_max/);
assert.match(sql,/v_effective_unit<=0\s+then\s+raise exception/);
assert.match(sql,/retail_effective_unit_revenue_company/);
assert.doesNotMatch(sql,/if p_unit_price<v_min or p_unit_price>v_max then/);
console.log('Retail positive-revenue price boundary contract passed');
