const fs=require('node:fs');
const assert=require('node:assert/strict');
const sql=fs.readFileSync('supabase/migrations/20261014080000_random_customer_complaint_quantity.sql','utf8');
assert(sql.includes('CREATE OR REPLACE FUNCTION private.process_customer_sale('));
assert(sql.includes('least(1+floor(random()*500),greatest(1,floor(j.quantity)))'));
assert(!sql.includes('least(250,j.quantity)'));
assert(sql.includes('on conflict(sale_job_id) do nothing'));
// Check the 1..500 range and cap against sold whole units independently.
for(const sold of [1,2,25,250,500,750]){
  for(const roll of [0,0.001,0.5,0.999999]){
    const quantity=Math.min(1+Math.floor(roll*500),Math.max(1,Math.floor(sold)));
    assert(quantity>=1&&quantity<=500&&quantity<=sold);
  }
}
console.log('Customer complaint quantity bounds passed');
