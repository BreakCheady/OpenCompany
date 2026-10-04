const assert=require('node:assert/strict');
const guidance=require('../guidance.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6);
function fixture(){return {companyId:'own',companyLevel:1,products:[{id:'goal',name:'Goal',status:'active',quality_level:1,base_production_rate:100,required_building_type_id:'factory'},{id:'a'},{id:'b'}],recipes:[{product_id:'goal',component_product_id:'a',quantity_per_unit:1},{product_id:'goal',component_product_id:'b',quantity_per_unit:1}],inventory:[],materialInventory:[],materials:[],productionJobs:[],buildings:[{id:'machine',building_type_id:'factory',status:'active'}],buildingTypes:[{id:'factory',building_category:'production'}]};}
let data;
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
assert.equal(progress.lessons.length,1);assert.ok(!progress.lessons.some(l=>l.id==='bonds'));

assert.ok(!guidance.LESSONS.some(l=>l.article==='specializations'));
console.log('Guidance event and financial-result checks passed.');
