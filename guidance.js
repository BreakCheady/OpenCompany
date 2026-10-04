/* Voluntary onboarding: evidence comes from existing game events, with no rewards. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.CompanyGuidance=api;
})(typeof globalThis==='object' ? globalThis:this,function(){
  'use strict';
  const STEPS=['overview','choose','materials','produce','claim','sell','review'];
  const LESSONS=[
    {id:'research_contracts',level:5,title:'Forschung und Verträge',text:'Forschung entwickelt die Qualität deiner Produkte. Verträge vereinbaren Preis, Menge und gegebenenfalls wiederkehrende Lieferungen.',article:'research'},
    {id:'bonds',level:10,title:'Anleihen und Verpflichtungen',text:'Prüfe Laufzeit, Zinsen und die später fällige Rückzahlung, bevor du eine Anleihe eingehst.',article:'bonds'}
  ];
  const num=v=>Math.max(0,Number(v)||0);
  function suggest(data){
    const types=new Map((data.buildingTypes || []).map(t=>[t.id,t]));
    const buildingIds=new Set((data.buildings || []).filter(b=>b.status==='active' && ['production','research'].includes(types.get(b.building_type_id)?.building_category)).map(b=>b.building_type_id));
    const retailIds=new Set((data.buildings || []).filter(b=>b.status==='active' && types.get(b.building_type_id)?.building_category==='retail').map(b=>b.building_type_id));
    const candidates=(data.products || []).filter(p=>p.status==='active' && buildingIds.has(p.required_building_type_id) && num(p.base_production_rate)>0);
    const prior=(data.productionJobs || []).find(j=>candidates.some(p=>p.id===j.product_id));
    if(prior)return candidates.find(p=>p.id===prior.product_id);
    const estimate=p=>{
      const recipes=(data.recipes || []).filter(r=>r.product_id===p.id);
      return recipes.reduce((sum,r)=>sum+num(r.quantity_per_unit)*(r.material_id
        ? num((data.materials || []).find(m=>m.id===r.material_id)?.base_cost)
        : num((data.products || []).find(c=>c.id===r.component_product_id)?.suggested_retail_price)),0)
        +(retailIds.has(p.required_retail_building_type_id)?0:100000000)
        +recipes.filter(r=>r.component_product_id).length*1000000;
    };
    return candidates.sort((a,b)=>estimate(a)-estimate(b) || a.name.localeCompare(b.name))[0] || null;
  }
  function progress(data,saved={}){
    const product=(data.products || []).find(p=>p.id===saved.selected_product_id) || suggest(data);
    const done=new Set((saved.completed_steps || []).filter(id=>STEPS.includes(id)));
    const jobs=(data.productionJobs || []).filter(j=>j.product_id===product?.id);
    const sales=(data.retailSaleJobs || []).filter(j=>j.product_id===product?.id);
    const trades=(data.marketTrades || []).filter(t=>t.seller_company_id===data.companyId && t.product_id===product?.id);
    const orders=(data.marketOwnOrders || []).filter(o=>o.product_id===product?.id);
    if(jobs.length || sales.length || trades.length){['overview','choose','materials'].forEach(s=>done.add(s));}
    if(jobs.length)done.add('produce');
    if(jobs.some(j=>num(j.claimed_quantity)>0 || j.status==='completed'))done.add('claim');
    if(sales.length || trades.length || orders.length)done.add('sell');
    const minQuality=Math.max(1,num(product?.quality_level)-1);
    const recipe=(data.recipes || []).filter(r=>r.product_id===product?.id);
    const hasMaterials=!!product && recipe.every(r=>{
      const lots=r.material_id ? data.materialInventory || [] : data.inventory || [];
      return lots.filter(l=>(r.material_id ? l.material_id===r.material_id:l.product_id===r.component_product_id) && num(l.quality_level || 1)>=minQuality)
        .reduce((sum,l)=>sum+num(l.quantity),0)+1e-8>=num(r.quantity_per_unit);
    });
    if(done.has('choose') && hasMaterials)done.add('materials');
    const completedSale=sales.find(s=>s.status==='completed') || null;
    const completedTrade=trades.find(t=>num(t.quantity)>0) || null;
    let result=null;
    if(completedSale){
      const snapshot=completedSale.start_snapshot || {};
      const hasCosts=Number.isFinite(Number(snapshot.operatingCostBasis)) && snapshot.operatingCostBasis!=null;
      const revenue=num(completedSale.total_value),goods=hasCosts ? num(snapshot.operatingCostBasis):null,operation=num(snapshot.operatingCost);
      result={kind:'retail',revenue,goodsCost:goods,operatingCost:operation,margin:hasCosts ? revenue-goods-operation:null};
    }else if(completedTrade){
      const tx=(data.transactions || []).find(t=>t.transaction_type==='market_sale' && t.reference_id===completedTrade.order_id);
      const hasCosts=tx?.cost_basis!=null;
      // One order can have multiple fills. Never attribute its aggregated finance
      // movement to one fill; show this fill's net proceeds and explain missing costs.
      const revenue=num(completedTrade.total_value)-num(completedTrade.market_fee);
      result={kind:'market',revenue,goodsCost:null,operatingCost:0,margin:null};
    }
    const current=STEPS.find(id=>!done.has(id)) || null;
    return {product,done:[...done],current,hasMaterials,jobs,sales,orders,result,lessons:LESSONS.filter(l=>num(data.companyLevel)>=l.level && !(saved.dismissed_lessons || []).includes(l.id)),complete:current===null};
  }
  return {STEPS,LESSONS,suggest,progress};
});
