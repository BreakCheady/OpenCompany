const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const start=app.indexOf('async function loadFinancialLedger(');
const end=app.indexOf('async function loadGameData()',start);
assert.ok(start>=0 && end>start,'Paginated ledger loader must exist');
const rows=Array.from({length:2205},(_,i)=>({
 id:String(2205-i),created_at:new Date(Date.UTC(2026,9,12,0,0,0)-i*60000).toISOString(),
 transaction_type:i===1800?'large_customer_order':'production',amount:i===1800?217800:-20
}));
const seen=[];
const sb={from(name){
 assert.equal(name,'financial_transactions');
 const ctx={
 select(){return this},eq(k,id){assert.equal(k,'company_id');assert.equal(id,'own');return this},
 order(){return this},
 range(first,last){seen.push([first,last]);return Promise.resolve({data:rows.slice(first,last+1),error:null})}
 };
 return ctx;
}};
const sandbox={sb};vm.createContext(sandbox);vm.runInContext(app.slice(start,end),sandbox);
(async()=>{
 const result=await sandbox.loadFinancialLedger('own');
 assert.equal(result.error,null);
 assert.equal(result.data.length,2205);
 assert.deepEqual(seen,[[0,999],[1000,1999],[2000,2999]]);
 assert.equal(result.data.filter(x=>x.transaction_type==='large_customer_order').reduce((a,x)=>a+x.amount,0),217800);
 assert.ok(app.includes("const productionCosts = costType('production');"),'Production cost uses booked ledger transactions');
 assert.ok(app.includes("const largeCustomerOrderIncome = sumType('large_customer_order');"));
 console.log('Historical P&L full pagination and large-order inclusion passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
