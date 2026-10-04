const assert=require('node:assert/strict');
const planner=require('../planner.js');
const guidance=require('../guidance.js');
const fs=require('node:fs');
const vm=require('node:vm');
const now=Date.parse('2026-10-04T12:00:00Z');
const p=(id,extra={})=>({id,name:id,category:'electronics',status:'active',quality_level:1,base_production_rate:100,required_building_type_id:'factory',...extra});
function fixture(){return {companyId:'own',products:[p('goal'),p('a'),p('b')],allProducts:[p('foreign-a',{name:'a'})],materials:[{id:'raw',name:'Raw',unit:'kg',base_cost:10}],recipes:[{product_id:'goal',component_product_id:'a',quantity_per_unit:1},{product_id:'goal',component_product_id:'b',quantity_per_unit:1},{product_id:'a',material_id:'raw',quantity_per_unit:2},{product_id:'b',material_id:'raw',quantity_per_unit:3}],inventory:[],materialInventory:[],buildings:[{id:'machine',status:'active',building_type_id:'factory',level:1}],buildingTypes:[{id:'factory',name:'Factory',building_category:'production',labor_cost_per_unit:1}],productionJobs:[],orders:[{id:'order',company_id:'other',material_id:'raw',order_type:'sell',status:'open',quality_level:1,price_per_unit:10,remaining_quantity:1000}],operatingRate:()=>.1,economyCostFactor:1,outputFactor:1,factor:()=>1};}
const plan=(d,extra={})=>planner.plan(d,{productId:'goal',quantity:10,quality:1,now,...extra});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
let data=fixture();
data.materialInventory=[{material_id:'raw',quantity:35,quality_level:1,average_unit_cost:8}];
let result=plan(data);
const raw=result.rows.find(r=>r.itemId==='raw');
near(raw.required,50);near(raw.stock,35);near(raw.buy,15);near(result.purchaseCost,150);
assert.ok(result.canFinish);
assert.equal(data.materialInventory[0].quantity,35,'planning never mutates inventory');
assert.equal(data.orders[0].remaining_quantity,1000,'planning never consumes real offers');
for(let i=1;i<result.steps.length;i++)assert.ok(result.steps[i].startAt>=result.steps[i-1].finishAt,'one building cannot overlap itself');
near(result.steps.reduce((sum,s)=>sum+s.hours,0),.3);

// Higher quality lots are not counted in lower-quality stock twice.
data=fixture();data.products[0].quality_level=3;data.products[1].quality_level=2;data.products[2].quality_level=2;
data.materialInventory=[{material_id:'raw',quantity:50,quality_level:1,average_unit_cost:10}];
data.inventory=[{product_id:'goal',quantity:2,quality_level:2,average_unit_cost:100},{product_id:'goal',quantity:3,quality_level:3,average_unit_cost:110}];
result=plan(data,{quality:3});
near(result.rows.find(r=>r.itemId==='goal').stock,3);
near(result.rows.find(r=>r.itemId==='goal').produce,7);
assert.ok(result.steps.every(s=>s.quality>=2));
data.products[1].quality_level=1;
assert.ok(plan(data,{quality:3}).issues.some(i=>i.includes('Q2+')));

// An incoming job has already been paid. Claiming it does not create a new cost.
data=fixture();data.productionJobs=[{building_id:'machine',product_id:'goal',quality_level:1,status:'running',output_quantity:15,claimed_quantity:5,finished_unit_cost:12,finishes_at:new Date(now+3600000).toISOString()}];
result=plan(data);
near(result.cashCost,0);near(result.economicCost,120);near(result.incomingValue,120);
assert.equal(result.finishAt,now+3600000);assert.equal(result.steps.length,0);
assert.equal(plan(data,{deadline:new Date(now+1800000).toISOString()}).deadlineMet,false);

// Market identity matches across companies, own/expired orders are excluded.
data=fixture();data.orders.push({id:'component',company_id:'other',product_id:'foreign-a',order_type:'sell',status:'open',quality_level:1,price_per_unit:20,remaining_quantity:10});
result=plan(data,{choices:{a:'buy'}});
near(result.rows.find(r=>r.itemId==='a').buy,10);assert.ok(!result.steps.some(s=>s.productId==='a'));
data.orders[1].company_id='own';assert.ok(!plan(data,{choices:{a:'buy'}}).canFinish);
data.orders[1].company_id='other';data.orders[1].expires_at=new Date(now-1).toISOString();assert.ok(!plan(data,{choices:{a:'buy'}}).canFinish);

// Shared order capacity and shared stock survive a diamond dependency graph.
data=fixture();data.orders[0].remaining_quantity=49;
assert.equal(plan(data).canFinish,false);near(plan(data).rows.find(r=>r.itemId==='raw').unavailable,1);
data=fixture();data.recipes.push({product_id:'a',component_product_id:'goal',quantity_per_unit:1});
assert.ok(plan(data).issues.some(i=>i.includes('Zyklus')));
data=fixture();data.buildings=[];assert.ok(!plan(data).canFinish);

// Large runs split into legal jobs, and two machines allow real parallel work.
data=fixture();data.recipes=[];result=plan(data,{quantity:5000});
assert.ok(result.steps.every(s=>s.hours<=24));near(result.steps.reduce((sum,s)=>sum+s.quantity,0),5000);
data.buildings.push({id:'second',status:'active',building_type_id:'factory',level:1});
const parallel=plan(data,{quantity:5000});assert.ok(parallel.finishAt<result.finishAt);
data=fixture();data.recipes=[];data.buildings[0].level=3;
near(planner.levelMultiplier(3),3.5);near(plan(data).steps[0].hours,10/350);

// Costs carry across levels without double-counting previous cash payments.
data=fixture();data.products=[p('goal')];data.recipes=[{product_id:'goal',material_id:'raw',quantity_per_unit:1}];
data.materialInventory=[{material_id:'raw',quantity:5,quality_level:1,average_unit_cost:8}];
result=plan(data);near(result.purchaseCost,50);near(result.productionCashCost,20);near(result.cashCost,70);near(result.economicCost,110);
data.economyCostFactor=1.15;result=plan(data);near(result.productionCashCost,23);near(result.economicCost,126.5);

// Guidance relies on real starts/claims/sales and preserves pause/lesson state.
data=fixture();data.companyLevel=1;
let progress=guidance.progress(data,{});assert.equal(progress.current,'overview');
progress=guidance.progress(data,{completed_steps:['overview','choose'],selected_product_id:'goal'});assert.equal(progress.current,'materials');
data.inventory=[{product_id:'a',quantity:10,quality_level:1},{product_id:'b',quantity:10,quality_level:1}];
progress=guidance.progress(data,{completed_steps:['overview','choose'],selected_product_id:'goal'});assert.equal(progress.current,'produce');
data.productionJobs=[{product_id:'goal',status:'running',claimed_quantity:0}];
progress=guidance.progress(data,{selected_product_id:'goal'});assert.equal(progress.current,'claim');
data.productionJobs[0].claimed_quantity=1;
progress=guidance.progress(data,{selected_product_id:'goal'});assert.equal(progress.current,'sell');
data.retailSaleJobs=[{product_id:'goal',status:'running',total_value:100}];
progress=guidance.progress(data,{selected_product_id:'goal'});assert.equal(progress.current,'review');assert.equal(progress.result,null);
data.retailSaleJobs[0]={product_id:'goal',status:'completed',total_value:100,start_snapshot:{operatingCostBasis:60,operatingCost:5}};
progress=guidance.progress(data,{selected_product_id:'goal'});near(progress.result.margin,35);
data.retailSaleJobs[0].start_snapshot={};progress=guidance.progress(data,{selected_product_id:'goal'});assert.equal(progress.result.margin,null);
data.companyLevel=15;progress=guidance.progress(data,{selected_product_id:'goal',dismissed_lessons:['bonds']});
assert.equal(progress.lessons.length,3);assert.ok(!progress.lessons.some(l=>l.id==='bonds'));

// Client industry effects match all agreed stages and respect category boundaries.
const app=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const factorCode=app.slice(app.indexOf('const specializationFactor ='),app.indexOf('const effectiveMarketFeeRate'));
const state={specializations:[]};const context=vm.createContext({state});vm.runInContext(factorCode,context);
const effect=(key,category)=>vm.runInContext(`specializationFactor('${key}','${category}')`,context);
for(const level of [1,2,3]){
  state.specializations=[{specialization_code:'industry_food',specialization_level:level}];near(effect('retail_rate','food'),1+.02*level);near(effect('retail_operating_cost','food'),1-.02*level);near(effect('retail_rate','food_component'),1);
  state.specializations=[{specialization_code:'industry_automotive',specialization_level:level}];near(effect('production_output','automotive'),1+.02*level);near(effect('production_operating_cost','automotive'),1-.02*level);near(effect('production_output','electronics'),1);
  state.specializations=[{specialization_code:'industry_chemical',specialization_level:level}];near(effect('patent_gain','chemical'),1+.02*level);near(effect('production_operating_cost','chemical'),1-.02*level);near(effect('patent_gain','research'),1);
  state.specializations=[{specialization_code:'industry_textile',specialization_level:level}];near(effect('retail_rate','textile'),1+.02*level);near(effect('retail_price_effect','textile'),1+.01*level);near(effect('retail_price_effect','food'),1);
}
state.specializations=[{specialization_code:'retail',specialization_level:1},{specialization_code:'industry_food',specialization_level:1}];near(effect('retail_rate','food'),1.07*1.02);
console.log('Progression checks passed: shared resources, quality, incoming stock, market identity, missing supply, cycles, batch limits, parallel machines, cost accounting, real onboarding events and four industry stages.');
