const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const js=fs.readFileSync('management.js','utf8');const css=fs.readFileSync('style.css','utf8');
new vm.Script(js,{filename:'management.js'});
for(const x of ['managerDeltaBadge(manager.competence','managerDeltaBadge(manager.experience','managerDeltaBadge(manager.motivation','managerDeltaBadge(primary','managerDeltaBadge(secondary','managerRememberSnapshot(manager,snapshot)','managerPreviousSnapshot(manager)'])assert(js.includes(x),'Missing manager delta: '+x);
for(const x of ['.manager-delta-up','.manager-delta-down','#166534','#991b1b'])assert(css.includes(x),'Missing visual treatment: '+x);
assert(js.includes("state.company?.id"),'Snapshot must be company-specific');
assert(js.includes("localStorage.setItem"),'Changes must persist across page reloads');
assert(js.includes("(up?'▲ +':'▼ −')"),'Delta direction missing');
console.log('Manager delta styling and rendering passed');
