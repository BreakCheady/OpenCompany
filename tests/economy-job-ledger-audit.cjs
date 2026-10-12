const assert=require('node:assert/strict');const fs=require('node:fs');
const sql=fs.readFileSync('docs/economy-job-ledger-reconciliation.sql','utf8');
assert.ok(sql.includes('private.production_job_input_consumptions'));
assert.ok(sql.includes('economyProductionCostFactor'));
assert.ok(sql.includes('production_cash_cost'));
assert.ok(sql.includes('finished_unit_cost'));
assert.ok(sql.includes('HISTORICAL_INPUT_RECORD_MISSING'));
assert.ok(!/\b(?:insert|update|delete|truncate|alter|drop)\s+(?:into\s+|from\s+|table\s+)?(?:public|private)\./i.test(sql));
console.log('Production ledger audit contract passed');
