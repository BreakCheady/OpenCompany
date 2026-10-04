const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const state={company:{id:'own',company_level:15,cash_balance:10000},session:{user:{id:'owner'}},products:[{id:'goal',name:'Lamp <test>',category:'electronics',status:'active',quality_level:1,base_production_rate:100,required_building_type_id:'factory',required_retail_building_type_id:'store'}],allProducts:[],materials:[{id:'raw',name:'Copper',unit:'kg',base_cost:3}],recipes:[{product_id:'goal',material_id:'raw',quantity_per_unit:2}],inventory:[],materialInventory:[{material_id:'raw',quantity:10,quality_level:1,average_unit_cost:3}],buildingTypes:[{id:'factory',name:'Factory',building_category:'production',labor_cost_per_unit:2},{id:'store',name:'Store',building_category:'retail'}],buildings:[{id:'machine',building_type_id:'factory',status:'active',level:3},{id:'shop',building_type_id:'store',status:'active',level:1}],selectedBuildingId:'machine',productionJobs:[],retailSaleJobs:[],marketTrades:[],marketOwnOrders:[],transactions:[],specializations:[],guidance:{},productionPlans:[],plannerChoices:{},plannerOrders:[],largeOrders:[],largeCustomerBids:[],contracts:[]};
state.allProducts=[...state.products];
const elements=new Map(),calls=[],db={company_guidance:[],company_production_plans:[]};
class Element {
  constructor(id){this.id=id;this.value='';this.textContent='';this.dataset={};this.disabled=false;this.options=[];this._html='';this.classList={add(){},remove(){},toggle(){}};}
  set innerHTML(value){this._html=value;
    const found=[...value.matchAll(/<option value="([^"]*)"([^>]*)>([\s\S]*?)<\/option>/g)];
    if(['chainProduct','productionProduct','retailProduct','guidanceProduct'].includes(this.id)){
      this.options=found.map(m=>({value:m[1],selected:m[2].includes('selected')}));this.value=this.options.find(o=>o.selected)?.value || this.options[0]?.value || '';
    }
    const nested=value.match(/<select id="guidanceProduct">([\s\S]*?)<\/select>/);
    if(nested)get('guidanceProduct').innerHTML=nested[1];
  }
  get innerHTML(){return this._html;}
  scrollIntoView(){} setAttribute(){} removeAttribute(){}
}
function get(id){if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);}
for(const id of [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]))get(id);
get('chainQuantity').value=1;get('chainQuality').value=1;get('productionUnits').value=1;get('productionProduct').value='goal';
const ctx={state,CompanyPlanner:require('../planner.js'),CompanyGuidance:require('../guidance.js'),
  document:{getElementById:get},history:{replaceState(){}},
  encyclopediaEscapeHtml:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  encyclopediaRecipeQuantity:v=>String(v),productQuality:p=>Number(p?.quality_level || 1),minimumInputQuality:p=>Math.max(1,Number(p?.quality_level || 1)-1),
  num:v=>String(Math.round(Number(v)*100)/100),money:v=>String(v)+' OC$',balanceMoney:v=>String(v)+' OC$',uiLocale:()=> 'de-DE',
  operatingEconomyFactor:()=>1,operatingCostRate:()=>.09,globalEventFactor:()=>1,
  activateView:v=>calls.push({view:v}),applyLanguageToDom(){},gameConfirm:async()=>true,gameAlert:m=>{throw Error(m)},
  selectBuildingCard:id=>{state.selectedBuildingId=id;get('productionProduct').options=[{value:'goal'}]},
  setProductionUnits:q=>{get('productionUnits').value=q},renderProductionRecipe(){},openRetailBuilding(){},renderRetailSale(){},
  openMarketSellModal(){},marketProductIdentity:p=>`${p.name}::${p.category}`,goToEncyclopediaTarget:v=>calls.push({view:v}),
  openProfileOfferInMarket:(...args)=>calls.push({market:args}),
  sb:{from(table){const q={eqs:[],payload:null,one:false,del:false,select(){return this},eq(k,v){this.eqs.push([k,v]);return this},single(){this.one=true;return this},upsert(payload){this.payload=payload;return this},delete(){this.del=true;return this},then(resolve,reject){
    if(this.payload){const row={...this.payload,id:this.payload.id || 'saved'};db[table]=[row,...db[table].filter(r=>(table==='company_guidance'?r.company_id:r.id)!==(table==='company_guidance'?row.company_id:row.id))];calls.push({table,payload:this.payload});}
    if(this.del)db[table]=db[table].filter(r=>!this.eqs.every(([k,v])=>r[k]===v));
    const rows=db[table] || [];return Promise.resolve({data:this.one ? rows[0]:rows,error:null}).then(resolve,reject);
  }};return q;}},
};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(app.slice(app.indexOf('const specializationFactor ='),app.indexOf('const effectiveMarketFeeRate')),ctx);
vm.runInContext(app.slice(app.indexOf('function currentProductionContext()'),app.indexOf('function formatProductionUnitsInput')),ctx);
vm.runInContext(app.slice(app.indexOf('// Production chains and voluntary company guidance.'),app.indexOf('function renderAll()')),ctx);
const run=code=>vm.runInContext(code,ctx);
(async()=>{
  run('renderCompanyGuidance()');assert.ok(get('guidanceContent').innerHTML.includes('Überblick verstanden'));
  ctx.completeGuidanceStep('review');assert.ok(!state.guidance.completed_steps,'review cannot be skipped before a sale');
  ctx.completeGuidanceStep('overview');await run('guidanceSaveQueue');
  assert.ok(get('guidanceContent').innerHTML.includes('guidanceProduct'));
  ctx.chooseGuidanceProduct();await run('guidanceSaveQueue');await run('guidanceSaveQueue');
  assert.ok(get('guidanceContent').innerHTML.includes('Produktion vorbereiten'));
  assert.ok(get('guidanceContent').innerHTML.includes('Lamp &lt;test&gt;'));
  ctx.setGuidancePaused(true);await run('guidanceSaveQueue');assert.ok(get('guidanceContent').innerHTML.includes('Einstieg fortsetzen'));
  ctx.setGuidancePaused(false);await run('guidanceSaveQueue');ctx.guidanceOpenProduction();
  assert.equal(get('productionProduct').value,'goal');assert.equal(get('productionUnits').value,1);
  const context=run('currentProductionContext()');assert.equal(context.unitsPerHour,350,'UI uses the server multiplier');
  state.productionJobs=[{building_id:'machine',product_id:'goal',status:'running',claimed_quantity:0,quality_level:1,output_quantity:10,finished_unit_cost:8,finishes_at:new Date(Date.now()+3600000).toISOString()}];
  run('renderCompanyGuidance()');await run('guidanceSaveQueue');assert.ok(get('guidanceContent').innerHTML.includes('Fertige Ware abholen'));
  state.productionJobs[0].claimed_quantity=10;state.productionJobs[0].status='completed';
  run('renderCompanyGuidance()');await run('guidanceSaveQueue');assert.ok(get('guidanceContent').innerHTML.includes('Verkauf vorbereiten'));
  state.retailSaleJobs=[{product_id:'goal',status:'completed',total_value:100,start_snapshot:{operatingCostBasis:60,operatingCost:5}}];
  run('renderCompanyGuidance()');await run('guidanceSaveQueue');assert.ok(get('guidanceContent').innerHTML.includes('35 OC$'));
  ctx.completeGuidanceStep('review');await run('guidanceSaveQueue');assert.ok(get('guidanceContent').innerHTML.includes('Geschäftsrunde abgeschlossen'));
  assert.equal(db.company_guidance[0].completed_steps.length,7);

  run('renderProductionPlanner()');get('chainQuantity').value=4;run('updateProductionChain()');
  assert.ok(get('chainResult').innerHTML.includes('Lamp &lt;test&gt;'));assert.ok(state.plannerLastResult.canFinish);
  assert.ok(get('chainResult').innerHTML.includes('Produktion öffnen'));
  ctx.openPlannerProduction('goal','machine',4);assert.equal(get('productionUnits').value,4);
  await ctx.saveProductionChain();assert.equal(db.company_production_plans[0].quantity,4);assert.equal(state.productionPlans.length,1);
  get('chainQuantity').value=5;await ctx.saveProductionChain();assert.equal(state.productionPlans.length,1,'saving an open plan updates it');
  await ctx.deleteProductionChain('saved');assert.equal(state.productionPlans.length,0);
  const comparison=new Element('comparison');ctx.compareProductionChain('goal',comparison);
  assert.ok(comparison.innerHTML.includes('Eigenfertigung'));assert.ok(comparison.innerHTML.includes('Zukauf'));assert.ok(comparison.innerHTML.includes('unvollständig'));
  state.contracts=[{id:'contract',seller_company_id:'own',product_id:'goal',quantity:4,quality_level:2,next_delivery_at:new Date(Date.now()+86400000).toISOString()}];
  // The contextual helper forwards the agreed target fields without running a job.
  let opened;ctx.openProductionPlanner=(...args)=>{opened=args;return Promise.resolve()};
  ctx.openContractProductionChain('contract');assert.equal(opened[0],'goal');assert.equal(opened[1],4);assert.equal(opened[2],2);
  state.largeOrders=[{id:'order',item_kind:'product',item_name:'Lamp <test>',product_category:'electronics',quantity:50,delivered_quantity:10,minimum_quality:2,delivery_deadline:new Date(Date.now()+3600000).toISOString()}];
  ctx.openLargeOrderProductionChain('order');assert.equal(opened[0],'goal');assert.equal(opened[1],40);assert.equal(opened[2],2);

  assert.ok(html.indexOf('planner.js')<html.indexOf('appScript.src'));
  assert.ok(html.indexOf('guidance.js')<html.indexOf('appScript.src'));
  assert.ok(html.includes('id="planner"'));assert.ok(!html.includes('data-view="competition"'));
  console.log('Controller checks passed: real guidance transitions, pause/resume, saved progress, safe review, escaped names, production rate, plan save/update/delete, variant comparison, context links and script ordering.');
})().catch(error=>{console.error(error);process.exitCode=1});
