const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const start=src.indexOf('function renderLargeOrders()');
const end=src.indexOf('window.submitLargeCustomerBid',start);
assert.ok(start>=0&&end>start);
const block=src.slice(start,end);
for(const marker of [
 'const tenders=active.filter',
 "const awarded=active.filter",
 "const other=active.filter",
 'large-order-group-title',
 'large-order-bid-details',
 'Gebot bearbeiten',
 'Gebot abgegeben',
 'Zuschlag erhalten',
 'Keine freien Großauftrags-Slots',
 'large-order-delivery-form',
 'submitLargeCustomerBid(event,',
 'deliverLargeCustomerOrder(event,'
]) assert.ok(block.includes(marker),marker);
assert.ok(block.includes("tenders.map(renderOrder)"));
assert.ok(block.includes("awarded.map(renderOrder)"));
assert.ok(block.includes("other.map(renderOrder)"));
assert.ok(src.includes('el.textContent=\`00:00:'),'Countdown uses HH:MM:SS');
assert.ok(!src.includes("padStart(2,'0')} Stunden\`;"),'No unit appended to HH:MM:SS');
assert.ok(html.includes('.large-order-summary'));
assert.ok(html.includes('.large-order-bid-details'));
console.log('Compact large-order grouping, controls, and localization verified.');
