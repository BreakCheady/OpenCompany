const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8');
new vm.Script(app,{filename:'app.js'});
assert(app.includes('data-bulk-building='));
assert(app.includes('previous[0].building_type_id!==building.building_type_id'));
assert(app.includes('function bulkProductionPlans('));
assert(app.includes('function bulkAggregatedIngredients('));
assert(app.includes("sb.rpc('start_production_on_building_v2'"));
assert(app.includes("sb.rpc('start_retail_sale_on_building_v2'"));
assert(app.includes("sb.rpc('claim_production_output'"));
assert(app.includes("sb.rpc('claim_retail_revenue'"));
assert(app.includes('event.stopImmediatePropagation()'));
assert(html.includes('.building-batch-summary'));
console.log('Multi-building selection and batch operations checks OK');

assert(app.includes('building-bulk-incompatible'));
assert(app.includes('building-bulk-active'));
assert(app.includes('buildingBulkToolbar'));
assert(app.includes('building-bulk-clear'));
assert(app.includes("state.bulkBuildingIds=[]"));
assert(html.includes('.building-bulk-toolbar'));

assert(app.includes('building-card-selection-row'));
assert(app.includes('</span></label></div><div class="building-card-head">'));
assert(html.includes('.building-card .building-card-head{display:block;width:100%'));

assert(html.includes('#productionBatchSummary:not(:empty),#retailBatchSummary:not(:empty)'));
assert(html.includes('background:#fff8d8'));
assert(html.includes('border:2px solid #e4b928'));

assert(html.includes('#productionBatchSummary p:has(> strong),#retailBatchSummary p:has(> strong)'));
assert(html.includes('color:var(--success,#00a63c)!important;font-weight:700'));
assert(html.includes('.building-batch-buttons button:not(:disabled)'));

assert(app.includes('data-bulk-buy-index'));
assert(app.includes('buyAggregatedProductionInput(item)'));
assert(app.includes('purchaseProductionInputShortfall(actual)'));
assert(app.includes('bulkAggregatedIngredients(free)'));
assert(app.includes('fetchMarketOrdersForProductionInput(input)'));
