const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261022160000_persistent_limit_buy_orders.sql'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
test('lowest sell price wins, oldest equal-price sell order wins',()=>{
 assert.match(migration,/order by s\.price_per_unit,s\.created_at,s\.id/i);
});
test('purchase requires locked buyer balance and sufficient funds',()=>{
 assert.match(migration,/from public\.companies where id=v_buy\.company_id for update/i);
 assert.match(migration,/exit when v_buyer\.cash_balance<v_cost/i);
 assert.match(migration,/cash_balance=cash_balance-v_cost/i);
});
test('each fill uses actual offer price, not buy limit',()=>{
 assert.match(migration,/v_cost:=round\(v_qty\*v_sell\.price_per_unit,2\)/);
 assert.match(migration,/price_per_unit,total_value,batch_id\)/);
 assert.match(migration,/v_qty,v_sell\.quality_level,v_sell\.price_per_unit,v_cost,v_batch/);
});
test('no expiry; terminal status only filled or cancelled',()=>{
 assert.match(migration,/status text not null default 'open' check \(status in \('open','filled','cancelled'\)\)/);
 assert.doesNotMatch(migration,/expires_at/i);
});
test('separate quality push with weighted mean and unique fill reference',()=>{
 assert.match(migration,/group by quality_level loop/i);
 assert.match(migration,/round\(v_report\.total\/v_report\.qty,2\)/);
 assert.match(migration,/v_report\.notification_id,'Limitauftrag ausgeführt'/);
});
test('market triggers and deposit trigger invoke matcher',()=>{
 assert.match(migration,/after insert on public\.market_orders/);
 assert.match(migration,/after update of cash_balance on public\.companies/);
 assert.match(migration,/new\.cash_balance>old\.cash_balance/);
});
test('frontend has catalog and detail limit buttons, dialog and cancellation',()=>{
 for(const id of ['marketCatalogLimitOpenBtn','marketLimitOpenBtn','marketLimitModal','marketLimitForm','myLimitBuyOrders'])assert.ok(html.includes(id));
 for(const id of ['place_limit_buy_order','cancel_limit_buy_order','refreshMarketLimitOrders'])assert.ok(app.includes(id));
});
test('migration contains no accidentally escaped literal newlines',()=>assert.equal(migration.includes('\\n'),false));
