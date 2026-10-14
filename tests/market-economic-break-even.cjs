const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sql=fs.readFileSync('supabase/migrations/20261014190000_market_economic_break_even.sql','utf8');
const app=fs.readFileSync('app.js','utf8');
assert(sql.includes('CREATE OR REPLACE FUNCTION private.market_order_economic_break_even('));
assert.equal((sql.match(/private.market_order_economic_break_even\(p_company_id,v_inv.average_unit_cost,p_quantity/g)||[]).length,2);
assert(sql.includes("ceil(p_quantity/2)*private.specialization_factor"));
assert(sql.includes("round(v_gross*p_quantity*v_fee_rate,2)"));
assert(sql.includes('greatest(NEW.price_per_unit,private.market_balanced_quality_price('));
assert(sql.includes('v_price_floor:=ceil((v_price_floor+v_freight_per_unit)/0.95*100)/100'));
assert(sql.includes("v_category='research' OR v_item='Transportcontainer'"));
assert(app.includes('Wirtschaftliche Gewinnschwelle'));
assert(app.includes('marketSellReferencePrice('));
assert(!app.includes('unitCost * GAME_RULES.pricing.marketMinCostMultiplier;'));
const start=app.indexOf('function marketOrderBreakEven(');
const end=app.indexOf('function marketSellReferencePrice(',start);
assert(start>=0&&end>start);
const sandbox={effectiveMarketFeeRate:()=>0.05,Math};
vm.runInNewContext(app.slice(start,end),sandbox);
for(const qty of [1,2,5,20,250]){
  for(const cost of [0.01,3.19,79.55,150]){
    const freight=qty/2*11.9;
    const price=sandbox.marketOrderBreakEven(cost,qty,freight);
    const net=price*qty-Math.round(price*qty*0.05*100)/100;
    assert(net+1e-6>=qty*cost+freight);
    const below=Math.round((price-0.01)*100)/100;
    if(below>0){const lowerNet=below*qty-Math.round(below*qty*0.05*100)/100;
      assert(lowerNet<qty*cost+freight+1e-6);}
  }
}
console.log('Market break-even and NPC quote floor checks passed');
