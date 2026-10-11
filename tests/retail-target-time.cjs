const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=app.indexOf('function retailQuantityFromInput(rawValue)');
const end=app.indexOf('function retailSoldQuantity(job)',start);
assert.ok(start>=0&&end>start,'Retail input parser must exist');
const inputs={retailQty:{value:'',dataset:{}}};
let rate=60,available=2000;
const anchor=Date.UTC(2026,9,11,12,0,0);
class FixedDate extends Date {
  constructor(...args){super(...(args.length?args:[anchor]));}
  static now(){return anchor;}
}
const context={
  Date:FixedDate,
  document:{getElementById:id=>inputs[id]||null},
  retailSaleContext:()=>({unitsPerHour:rate,available}),
  Math,Number,String
};
vm.createContext(context);
vm.runInContext(app.slice(start,end),context);
const parse=value=>vm.runInContext('retailQuantityFromInput('+JSON.stringify(value)+')',context);
assert.equal(parse('6hrs').units,360,'Duration accounts for the previewed rate');
assert.equal(parse('6pm').units,360,'6pm targets 18:00 with all pre-start bonuses');
rate=90;
assert.equal(parse('6pm').units,540,'Buff changes must change target-time quantity before sale start');
assert.equal(parse('2hrs').units,180,'Duration uses refreshed rate');
assert.equal(parse('120').units,120,'Fixed numeric quantities must not depend on sale speed');
assert.equal(parse('25hrs').matchedHours,false,'Durations above 24 hours must not be accepted as hours');
inputs.retailQty.dataset.quantityExpression='6pm';
assert.equal(context.recalculateRetailQuantityFromRememberedExpression(),true);
assert.equal(inputs.retailQty.value,'540','Remembered expression recomputes quantity using active buffs');
available=400;
context.recalculateRetailQuantityFromRememberedExpression();
assert.equal(inputs.retailQty.value,'400','Requested quantity is capped to available inventory in preview');
console.log('Retail target time and buff regression checks passed.');
