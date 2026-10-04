/* Read-only production planning. Every inventory lot, order and machine is shared
 * by the whole plan. No purchases, reservations or jobs are created here. */
(function(root, factory) {
  const planner = factory();
  if (typeof module === 'object' && module.exports) module.exports = planner;
  else root.CompanyPlanner = planner;
})(typeof globalThis === 'object' ? globalThis : this, function() {
  'use strict';
  const EPS = 1e-8;
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const positive = value => Math.max(0, number(value));
  const quality = value => Math.max(1, number(value) || 1);
  const round = (value, digits = 2) => Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits;
  const identity = product => `${product?.name || ''}\u0000${product?.category || ''}`;
  const levelMultiplier = level => 1 + .25 * (Math.max(1, number(level)) - 1) * (Math.max(1, number(level)) + 2);

  function plan(data, options) {
    const now = number(options.now) || Date.now();
    const products = new Map((data.products || []).map(p => [p.id,p]));
    const allProducts = new Map([...(data.allProducts || []),...(data.products || [])].map(p => [p.id,p]));
    const materials = new Map((data.materials || []).map(p => [p.id,p]));
    const types = new Map((data.buildingTypes || []).map(p => [p.id,p]));
    const recipes = new Map();
    for (const recipe of data.recipes || []) {
      if (!recipes.has(recipe.product_id)) recipes.set(recipe.product_id,[]);
      recipes.get(recipe.product_id).push(recipe);
    }
    const factor = (key, category) => positive(data.factor ? data.factor(key,category) : 1);
    const economy = positive(data.economyCostFactor ?? 1);
    const outputFactor = positive(data.outputFactor ?? 1);
    const opRate = type => positive(data.operatingRate ? data.operatingRate(type) : 0);
    const efficiency = level => Math.max(.8,1-(Math.max(1,number(level))-1)*.02);
    const stock = [
      ...(data.inventory || []).map(lot => ({...lot,kind:'product',itemId:lot.product_id})),
      ...(data.materialInventory || []).map(lot => ({...lot,kind:'material',itemId:lot.material_id}))
    ].map(lot => ({...lot,remaining:positive(lot.quantity),cost:positive(lot.average_unit_cost),availableAt:now,source:'stock'}));
    const busy = new Map();
    for (const job of data.productionJobs || []) {
      if (job.status !== 'running') continue;
      const finish = Math.max(now,Date.parse(job.finishes_at) || now);
      busy.set(job.building_id,Math.max(busy.get(job.building_id) || now,finish));
      const remaining = Math.max(0,number(job.output_quantity)-number(job.claimed_quantity));
      if (remaining > EPS) stock.push({kind:'product',itemId:job.product_id,quality_level:job.quality_level,remaining,cost:positive(job.finished_unit_cost),availableAt:finish,source:'incoming'});
    }
    // A research investment has no timed research job in the current game.
    for (const job of data.retailSaleJobs || []) {
      if (job.status === 'running') busy.set(job.building_id,Math.max(busy.get(job.building_id) || now,Date.parse(job.finishes_at) || now));
    }
    const machines = (data.buildings || []).filter(b => b.status === 'active').map(b => ({...b,availableAt:busy.get(b.id) || now}));
    const orders = (data.orders || []).filter(order => order.company_id !== data.companyId
      && order.order_type === 'sell' && ['open','partially_filled'].includes(order.status)
      && (!order.expires_at || Date.parse(order.expires_at)>now)
      && positive(order.price_per_unit)>0)
      .map(order => ({...order,remaining:positive(order.remaining_quantity)}))
      .sort((a,b) => number(a.price_per_unit)-number(b.price_per_unit));
    const rows = new Map();
    const steps = [];
    const issues = new Set();
    let cash = 0;
    let purchases = 0;
    let operating = 0;
    let stockValue = 0;
    let incomingValue = 0;
    let iterations = 0;
    const rate = (p,b) => Math.max(.01,Math.floor(positive(p.base_production_rate)*levelMultiplier(b.level))*outputFactor*factor('production_output',p.category));
    const resultBase = {now,rows:[],steps,issues:[],cashCost:0,purchaseCost:0,productionCashCost:0,stockValue:0,incomingValue:0,economicCost:0,finishAt:null,canFinish:false,deadlineMet:null};
    const target = products.get(options.productId);
    const quantity = number(options.quantity);
    const targetQuality = options.quality==null ? 1:number(options.quality);
    if (!target || !Number.isSafeInteger(quantity) || quantity<1 || quantity>1000000000 || !Number.isSafeInteger(targetQuality) || targetQuality<1 || targetQuality>32767) {
      return {...resultBase,issues:['Bitte ein eigenes Produkt, eine ganze Menge von 1 bis 1.000.000.000 und eine gültige Qualitätsstufe wählen.']};
    }
    function line(kind,id,minQ) {
      const key = `${kind}:${id}:${minQ}`;
      if (!rows.has(key)) {
        const item = kind === 'material' ? materials.get(id) : products.get(id);
        rows.set(key,{key,kind,itemId:id,name:item?.name || 'Unbekannter Artikel',category:item?.category,unit:kind==='material' ? item?.unit || '' : 'Stück',minQuality:minQ,required:0,stock:0,incoming:0,buy:0,produce:0,unavailable:0,purchaseCost:0,stockCost:0,incomingCost:0,productionCashCost:0,mode:kind==='material' ? 'buy' : options.choices?.[id] || 'produce',buyAlternative:null,productionAlternative:null});
      }
      return rows.get(key);
    }
    function takeLots(kind,id,amount,minQ) {
      let remaining = amount, cost = 0, ready = now;
      const eligible=stock.filter(l => l.kind===kind && l.itemId===id && quality(l.quality_level)>=minQ && l.remaining>EPS)
        .sort((a,b)=>a.availableAt-b.availableAt || quality(a.quality_level)-quality(b.quality_level));
      let owned=0,incoming=0,planned=0,ownedCost=0,pendingCost=0;
      for (const lot of eligible) {
        const take=Math.min(remaining,lot.remaining);
        lot.remaining-=take; remaining-=take; cost+=take*lot.cost;
        ready=Math.max(ready,lot.availableAt);
        if(lot.source==='stock'){owned+=take;ownedCost+=take*lot.cost;}
        else if(lot.source==='incoming'){incoming+=take;pendingCost+=take*lot.cost;}
        else planned+=take;
        if(remaining<=EPS)break;
      }
      stockValue+=ownedCost; incomingValue+=pendingCost;
      return {remaining:Math.max(0,remaining),cost,ready,owned,incoming,planned,ownedCost,pendingCost};
    }
    function matchingOrders(kind,id,minQ) {
      const p=products.get(id);
      if(kind==='product' && !p)return [];
      return orders.filter(o=>quality(o.quality_level)>=minQ && o.remaining>EPS && (kind==='material'
        ? o.material_id===id
        : identity(allProducts.get(o.product_id) || o.products)===identity(p)));
    }
    function quote(kind,id,amount,minQ,consume=false) {
      let remaining=amount,cost=0;
      for(const order of matchingOrders(kind,id,minQ)) {
        const take=Math.min(remaining,order.remaining);
        cost+=take*number(order.price_per_unit);remaining-=take;
        if(consume)order.remaining-=take;
        if(remaining<=EPS)break;
      }
      return {cost,available:amount-Math.max(0,remaining),missing:Math.max(0,remaining),complete:remaining<=EPS};
    }
    // Alternative estimate uses the same recursive planner in all-buy mode.
    // It never consumes the selected plan's inventory or order pools.
    function productionQuote(p,amount,minQ) {
      const b=machines.filter(b=>b.building_type_id===p.required_building_type_id)
        .sort((a,b)=>rate(p,b)-rate(p,a))[0];
      if(!b || quality(p.quality_level)<minQ || !positive(p.base_production_rate))return null;
      const inputQ=Math.max(1,quality(p.quality_level)-1);
      let inputCost=0,complete=true;
      for(const input of recipes.get(p.id) || []) {
        const q=quote(input.material_id ? 'material':'product',input.material_id || input.component_product_id,positive(input.quantity_per_unit)*Math.ceil(amount-EPS),inputQ);
        inputCost+=q.cost;complete=complete&&q.complete;
      }
      const qty=Math.ceil(amount-EPS),type=types.get(b.building_type_id);
      const base=p.category==='research' ? positive(p.production_cost)*qty : 0;
      const labor=positive(type?.labor_cost_per_unit)*qty;
      const operation=round((inputCost+base+labor)*opRate(type)*efficiency(b.level)*economy*factor('production_operating_cost',p.category));
      return {complete,cost:round(inputCost+(base+labor)*economy+operation),hours:qty/rate(p,b),buildingId:b.id};
    }
    function supply(kind,id,amount,minQ,path) {
      if(++iterations>5000 || path.length>32){issues.add('Die Kette ist zu groß oder enthält einen Rezeptzyklus.');return {cost:0,ready:Infinity};}
      const row=line(kind,id,minQ); row.required+=amount;
      const own=takeLots(kind,id,amount,minQ);
      row.stock+=own.owned;row.incoming+=own.incoming;row.planned=(row.planned || 0)+own.planned;row.stockCost+=own.ownedCost;row.incomingCost+=own.pendingCost;
      let remaining=own.remaining,cost=own.cost,ready=own.ready;
      if(remaining<=EPS)return {cost,ready};
      const p=products.get(id);
      const buyQuote=quote(kind,id,remaining,minQ);
      if(kind==='product' && p) {
        row.buyAlternative=buyQuote;
        row.productionAlternative=productionQuote(p,remaining,minQ);
      }
      if(kind==='material' || row.mode==='buy') {
        const bought=quote(kind,id,remaining,minQ,true);
        row.buy+=bought.available;row.purchaseCost+=bought.cost;cash+=bought.cost;purchases+=bought.cost;cost+=bought.cost;
        if(bought.missing>EPS){row.unavailable+=bought.missing;issues.add(`${row.name}: ${round(bought.missing,4)} Einheiten in Q${minQ}+ sind nicht durch geladene Marktangebote gedeckt.`);ready=Infinity;}
        return {cost,ready};
      }
      if(!p || path.includes(id)){row.unavailable+=remaining;issues.add(`${row.name}: Rezept fehlt oder die Kette enthält einen Zyklus.`);return {cost,ready:Infinity};}
      if(quality(p.quality_level)<minQ){row.unavailable+=remaining;issues.add(`${row.name}: Deine Produktion erreicht Q${quality(p.quality_level)}, benötigt wird Q${minQ}+. Zukauf prüfen.`);return {cost,ready:Infinity};}
      const candidates=machines.filter(b=>b.building_type_id===p.required_building_type_id);
      if(!candidates.length || !positive(p.base_production_rate)){row.unavailable+=remaining;issues.add(`${row.name}: Ein aktives passendes Produktionsgebäude fehlt. Zukauf prüfen.`);return {cost,ready:Infinity};}
      const amountToProduce=Math.ceil(remaining-EPS);
      let toProduce=amountToProduce,producedCost=0,productionReady=now;
      // Each job is at most 24 hours. Machines are selected again after every
      // batch so parallel owned buildings can actually shorten the plan.
      while(toProduce>EPS && iterations++<5000) {
        const b=[...candidates].sort((a,b)=>(a.availableAt+Math.min(toProduce,Math.floor(rate(p,a)*24+EPS))/rate(p,a)*3600000)-(b.availableAt+Math.min(toProduce,Math.floor(rate(p,b)*24+EPS))/rate(p,b)*3600000))[0];
        const capacity=Math.floor(rate(p,b)*24+EPS);
        if(capacity<1){issues.add(`${p.name}: Innerhalb von 24 Stunden ist keine ganze Einheit herstellbar.`);row.unavailable+=toProduce;productionReady=Infinity;break;}
        const batch=Math.min(toProduce,capacity);
        let inputsCost=0,inputReady=now;
        for(const input of recipes.get(id) || []) {
          const required=positive(input.quantity_per_unit)*batch;
          if(required<=EPS)continue;
          const supplied=supply(input.material_id ? 'material':'product',input.material_id || input.component_product_id,required,Math.max(1,quality(p.quality_level)-1),[...path,id]);
          inputsCost+=supplied.cost;inputReady=Math.max(inputReady,supplied.ready);
        }
        // A prerequisite may have occupied this same machine while being
        // recursively scheduled. Read its availability after dependencies.
        const start=Math.max(now,b.availableAt,inputReady);
        const hours=batch/rate(p,b),finish=start+hours*3600000;
        const type=types.get(b.building_type_id);
        const base=p.category==='research' ? positive(p.production_cost)*batch : 0;
        const labor=round(positive(type?.labor_cost_per_unit)*batch);
        const operation=round((inputsCost+base+labor)*opRate(type)*efficiency(b.level)*economy*factor('production_operating_cost',p.category));
        const paid=round((base+labor)*economy)+operation;
        const finished=round(((inputsCost+base+labor)*economy+operation)/batch,6)*batch;
        cash+=paid;operating+=paid;row.productionCashCost+=paid;producedCost+=finished;
        b.availableAt=finish;productionReady=Math.max(productionReady,finish);
        steps.push({productId:id,name:p.name,quantity:batch,quality:quality(p.quality_level),buildingId:b.id,buildingName:type?.name || 'Gebäude',level:b.level,startAt:start,finishAt:finish,hours,cashCost:paid});
        row.produce+=batch;toProduce-=batch;
      }
      if(toProduce>EPS && iterations>=5000){issues.add('Zu viele Produktionschargen. Bitte die Zielmenge reduzieren.');productionReady=Infinity;row.unavailable+=toProduce;}
      // Integer production can leave a fractional excess that another branch
      // may use. Preserve its cost and ready time in the shared stock pool.
      const excess=amountToProduce-remaining;
      if(excess>EPS && Number.isFinite(productionReady))stock.push({kind:'product',itemId:id,quality_level:p.quality_level,remaining:excess,cost:producedCost/amountToProduce,availableAt:productionReady,source:'planned'});
      return {cost:cost+producedCost*(remaining/amountToProduce),ready:Math.max(ready,productionReady)};
    }
    const supplied=supply('product',target.id,quantity,targetQuality,[]);
    const deadline=options.deadline ? Date.parse(options.deadline):NaN;
    const finishAt=Number.isFinite(supplied.ready) ? supplied.ready:null;
    return {...resultBase,rows:[...rows.values()],steps:steps.sort((a,b)=>a.startAt-b.startAt),issues:[...issues],cashCost:round(cash),purchaseCost:round(purchases),productionCashCost:round(operating),stockValue:round(stockValue),incomingValue:round(incomingValue),economicCost:round(supplied.cost),finishAt,canFinish:finishAt!==null && !issues.size,deadlineMet:Number.isFinite(deadline) ? finishAt!==null && finishAt<=deadline:null};
  }
  return {plan,identity,levelMultiplier};
});
