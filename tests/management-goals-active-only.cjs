const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('management.js','utf8');
const start=source.indexOf('function renderManagementGoals()');
const end=source.indexOf('function renderManagementManagers()',start);
assert.ok(start>=0&&end>start);
const html={};
const doc={getElementById:id=>html[id]||(html[id]={innerHTML:'',disabled:false})};
const state={managementOverview:{goals:[
 {status:'active',goal_type:'revenue',period_type:'week',target_value:1000,current_value:300,progress_percent:30},
 {status:'completed',goal_type:'revenue',period_type:'week',target_value:1000,current_value:1200,progress_percent:100},
 {status:'expired',goal_type:'profit',period_type:'week',target_value:400,current_value:20,progress_percent:5}
]}};
const context={state,document:doc,managementGoalCard:goal=>'<div>'+goal.status+'</div>'};
vm.createContext(context);
vm.runInContext(source.slice(start,end),context);
context.renderManagementGoals();
assert.match(html.managementGoals.innerHTML,/active/);
assert.doesNotMatch(html.managementGoals.innerHTML,/completed|expired/);
assert.doesNotMatch(html.dashboardCompanyGoals.innerHTML,/completed|expired/);
console.log('Completed and expired corporate goals are hidden in UI.');
