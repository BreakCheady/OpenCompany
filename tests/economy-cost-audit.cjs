const assert=require('node:assert/strict');const fs=require('node:fs');
const first=fs.readFileSync('docs/economy-unit-cost-audit.sql','utf8');
const recursive=fs.readFileSync('docs/economy-recursive-material-costs.sql','utf8');
for(const sql of [first,recursive]){
 assert.ok(/select/i.test(sql));
 assert.ok(!/\b(insert|update|delete|truncate|alter|drop)\s+(?:into\s+|from\s+|table\s+)?(?:public|private)\./i.test(sql),'Audit scripts must not change production data');
}
assert.ok(recursive.includes('WITH RECURSIVE expanded'));
assert.ok(recursive.includes('e.qty*r.quantity_per_unit'));
assert.ok(recursive.includes("e.input_kind='material'"));
assert.ok(recursive.includes('missing_ask_count'));
assert.ok(first.includes('finished_unit_cost'));
console.log('Read-only cost audit script contracts passed.');
