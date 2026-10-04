const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const app = fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const factorSource = app.slice(app.indexOf('const specializationFactor ='), app.indexOf('const retailAveragePrice ='));
const uiSource = app.slice(app.indexOf('const SPECIALIZATION_META ='), app.indexOf('function largeOrderTypeLabel'));
const outputs = new Map();
const calls = [];
const state = {company:{id:'test-company',company_level:15,cash_balance:500000},specializations:[]};
const ctx = vm.createContext({
  state,window:{},Date,JSON,Number,Object,String,Map,
  GAME_RULES:{fees:{marketRate:0.05}},
  document:{getElementById(id){if(!outputs.has(id)) outputs.set(id,{innerHTML:''});return outputs.get(id);}},
  num:value=>String(Math.round(Number(value)*100)/100),money:value=>`${value} OC$`,uiLocale:()=> 'de-DE',
  escapeChatText:value=>String(value).replace(/</g,'&lt;').replace(/>/g,'&gt;'),
  gameConfirm:async()=>true,gameAlert:message=>{throw Error(message);},loadCompany:async()=>{},
  sb:{rpc:async(name,args)=>{calls.push({name,args});return {error:null};}},
  renderSellOrderPreview(){},renderProductionRecipe(){},renderRetailSale(){},renderResearch(){},renderContractPreview(){}
});
vm.runInContext(factorSource+'\n'+uiSource,ctx);
const factor = (key,category) => vm.runInContext(`specializationFactor(${JSON.stringify(key)},${JSON.stringify(category||null)})`,ctx);
const near = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
for(const level of [1,2,3]) {
  state.specializations=[{slot_no:1,specialization_code:'industry_electronics',specialization_level:level}];
  near(factor('production_output','electronics'),1+[0.02,0.04,0.06][level-1]);
  near(factor('production_operating_cost','electronics'),1-[0.02,0.04,0.06][level-1]);
  near(factor('retail_rate','food'),1);
  state.specializations=[{slot_no:1,specialization_code:'trading',specialization_level:level}];
  near(vm.runInContext('effectiveMarketFeeRate()',ctx),[0.045,0.04,0.035][level-1]);
}
state.specializations=[{slot_no:1,specialization_code:'production',specialization_level:3},{slot_no:2,specialization_code:'industry_electronics',specialization_level:3}];
near(factor('production_output','electronics'),1.075*1.06);
near(factor('production_output','food'),1.075);
state.specializations=[];
vm.runInContext('renderSpecializations()',ctx);
assert.equal((outputs.get('specializationsContent').innerHTML.match(/>Auswählen<\/button>/g)||[]).length,22);
assert.ok(!outputs.get('specializationsContent').innerHTML.includes('Wert noch offen'));
state.company.company_level=7;
vm.runInContext('renderSpecializations()',ctx);
assert.ok(!outputs.get('specializationsContent').innerHTML.includes('onclick="setCompanySpecialization'));
state.company.company_level=15;
state.specializations=[{slot_no:1,specialization_code:'industry_electronics',specialization_level:1,upgrade_target_level:2,upgrade_finishes_at:new Date(Date.now()+86400000).toISOString()}];
vm.runInContext('renderSpecializations()',ctx);
let html = outputs.get('specializationsContent').innerHTML;
assert.ok(html.includes('Ausbau auf Stufe II läuft'));
assert.ok(html.includes('Elektronikproduktion +2 %'));
assert.ok(html.includes('Danach: Elektronikproduktion +4 %'));
near(factor('production_output','electronics'),1.02);
state.specializations=[{slot_no:1,specialization_code:'industry_electronics',specialization_level:1}];
state.company.cash_balance=1;
vm.runInContext('renderSpecializations()',ctx);
assert.ok(outputs.get('specializationsContent').innerHTML.includes('disabled onclick="upgradeCompanySpecialization(1)"'));
state.company.cash_balance=500000;
state.companyTradeAnalysis={enabled:true,trade_count:1,items:[{item_name:'<script>',quality_level:3,bought_units:1,sold_units:0,average_buy:10,average_sell:null}]};
html=vm.runInContext('renderTradeAnalysis()',ctx);
assert.ok(html.includes('&lt;script&gt;'));
assert.ok(!html.includes('<script>'));
(async()=>{
  await ctx.window.upgradeCompanySpecialization(1);
  assert.equal(calls.at(-1).name,'upgrade_company_specialization');
  assert.equal(calls.at(-1).args.p_slot_no,1);
  assert.equal(calls.at(-1).args.p_company_id,'test-company');
  console.log('Frontend checks passed: bonuses, fee rates, stacking, all eleven options, level gates, pending upgrades, cash gate, analysis escaping, upgrade RPC.');
})().catch(error=>{console.error(error);process.exitCode=1;});
