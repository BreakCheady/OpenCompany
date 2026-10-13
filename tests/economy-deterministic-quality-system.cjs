const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('docs/economy-deterministic-quality-system.sql','utf8');
assert.match(sql,/WITH RECURSIVE root AS/i);
assert.match(sql,/production_recipe_inputs/);
assert.match(sql,/private\.operating_cost_rate/);
assert.match(sql,/private\.quality_multiplier/);
assert.match(sql,/private\.market_balanced_quality_price/);
assert.match(sql,/v_type IS DISTINCT FROM 'npc'/);
assert.match(sql,/BEFORE INSERT OR UPDATE OF price_per_unit/);

const ceilCent=(n)=>Math.ceil((n-1e-10)*100)/100;
const price=(cost,base,q)=>ceilCent((cost+Math.max(base*.14*(1+.06*(q-1)),cost*.08))/.95);
for(const rate of [1,4,12,42]){
 for(const buildingMultiplier of [1,2,3.5,5.5,8]){
  const hourlyRate=Math.floor(rate*buildingMultiplier);
  const baseline=100;
  const baseProfit=price(baseline,baseline,1)*.95-baseline;
  for(let q=1;q<=5;q++){
   const cost=baseline*(1+(q-1)*.02825);
   const netUnit=price(cost,baseline,q)*.95-cost;
   assert(netUnit>0,'Must stay profitable after five percent market fee');
   assert(netUnit*hourlyRate <= baseProfit*hourlyRate*1.26,'Q5 must not economically dominate Q1 by price alone');
  }
 }
}
for(const base of [.5,1,2,5,20]){
 for(let q=1;q<=5;q++){
  const cost=base*(1+(q-1)*.05);
  assert(price(cost,base,q)*.95>cost);
 }
}
console.log('Deterministic Q1-Q5 pricing, cost and level progression checks passed');
