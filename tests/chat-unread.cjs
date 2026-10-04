const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
class Element{
  constructor(){this.innerHTML='';this.textContent='';this.value='';this.attributes={};this.classes=new Set();this.classList={contains:n=>this.classes.has(n),add:n=>this.classes.add(n),remove:n=>this.classes.delete(n),toggle:(n,on)=>on?this.classes.add(n):this.classes.delete(n)};}
  querySelectorAll(){return [];}setAttribute(k,v){this.attributes[k]=v;}
}
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
const state={company:{id:'self'},session:{user:{id:'user'}},chatUnreadCounts:{},chatRooms:[{id:'general',name:'General',icon:'G'}],companyDirectory:[{id:'alice',name:'Alice <test>',company_type:'player',status:'active'},{id:'bob',name:'Bob',company_type:'player',status:'active'}],chatSelectedType:'contact',chatSelectedId:'alice',chatMessages:[],chatContactSearch:'',chatCompanyLogos:{}};
let rpcHandler=async()=>({data:[],error:null}),queryHandler=async()=>({data:[],error:null});
const calls=[],events={},intervals=[];
const channel={on(event,filter,callback){events[filter.table]=callback;return this},subscribe(callback){this.subscribed=callback;return this}};
const ctx={state,currentLanguage:'de',document:{hidden:false,getElementById:get,addEventListener:(name,fn)=>events[name]=fn},
  Date,Number,Object,String,Map,JSON,Promise,console:{...console,warn:()=>{}},
  uiLocale:()=> 'de-DE',escapeChatText:s=>String(s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])),
  chatCompanyAvatarHtml:()=>'<span>avatar</span>',chatCompany:id=>state.companyDirectory.find(c=>c.id===id),
  PERSONAL_ASSISTANT_COMPANY_ID:'assistant',chatCompanyInitial:()=> 'A',
  requestAnimationFrame:fn=>fn(),history:{replaceState(){}},renderChatMessages:()=>calls.push({render:true}),gameAlert:async()=>{},
  setTimeout:fn=>{events.timeout=fn;return 1},clearTimeout:()=>{},setInterval:fn=>{intervals.push(fn);return 1},clearInterval:()=>{},
  sb:{rpc:async(name,args)=>{calls.push({name,args});return rpcHandler(name,args)},channel:()=>channel,removeChannel:()=>{},from(){return {select(){return this},is(){return this},order(){return this},limit(){return this},eq(){return this},or(){return this},then(resolve,reject){return queryHandler().then(resolve,reject)}}}}
};
vm.createContext(ctx);
vm.runInContext('let chatRealtimeChannel=null,chatRealtimeCompanyId=null,chatUnreadPollTimer=null,chatUnreadRefreshTimer=null,chatUnreadRequest=0,chatConversationRequest=0,chatViewRequest=0;',ctx);
for(const [a,b] of [['function chatContacts()','function formatChatTime('],['function chatUnreadCount(','function renderChatMessages('],['async function loadChatConversation(','async function editChatMessage('],['function stopChatRealtime(','async function openChatView(']])vm.runInContext(app.slice(app.indexOf(a),app.indexOf(b)),ctx);
const run=s=>vm.runInContext(s,ctx);
function counts(){return [{target_type:'contact',target_id:'alice',unread_count:2},{target_type:'contact',target_id:'bob',unread_count:3},{target_type:'room',target_id:'general',unread_count:9}]}
(async()=>{
  rpcHandler=async()=>({data:counts(),error:null});await ctx.loadChatUnreadCounts();
  assert.equal(get('headerChatUnread').textContent,'5','header totals received private messages only');
  assert.match(get('chatRoomList').innerHTML,/9<\/span>/);assert.match(get('chatContactList').innerHTML,/2<\/span>/);assert.match(get('chatContactList').innerHTML,/3<\/span>/);
  assert.ok(get('chatContactList').innerHTML.includes('Alice &lt;test&gt;'));
  state.chatUnreadCounts={'room:general':10};ctx.renderChatUnreadBadge();assert.equal(get('headerChatUnread').textContent,'');assert.ok(get('headerChatUnread').classes.has('hidden'));
  // Out-of-order refresh responses must not restore old counts.
  let resolveOld;rpcHandler=()=>new Promise(resolve=>resolveOld=resolve);const older=ctx.loadChatUnreadCounts();
  rpcHandler=async()=>({data:[{target_type:'contact',target_id:'alice',unread_count:1}],error:null});await ctx.loadChatUnreadCounts();resolveOld({data:counts(),error:null});await older;assert.equal(get('headerChatUnread').textContent,'1');
  // A failed query retains existing counts, never pretending there are no messages.
  rpcHandler=async()=>({data:null,error:{message:'test failure'}});await ctx.loadChatUnreadCounts();assert.equal(get('headerChatUnread').textContent,'1');
  // Mark only the message returned by the successful load, after rendering.
  get('chat').classes.add('active-view');queryHandler=async()=>({data:[{id:'latest',read_sequence:'9007199254740994'},{id:'older',read_sequence:'9007199254740993'}],error:null});
  rpcHandler=async(name,args)=>{
    if(name==='mark_chat_read'){assert.ok(calls.at(-2).render,'read after display');assert.equal(args.p_message_id,'latest');return {error:null}}
    // Simulate a new message arriving between loading and read acknowledgement.
    return {data:[{target_type:'contact',target_id:'alice',unread_count:1}],error:null};
  };
  await ctx.loadChatConversation();assert.equal(state.chatMessages[0].id,'older');assert.equal(get('headerChatUnread').textContent,'1','arrival after displayed cutoff remains unread');
  const marked=()=>calls.filter(c=>c.name==='mark_chat_read').length;
  let before=marked();get('chat').classes.delete('active-view');await ctx.loadChatConversation();assert.equal(marked(),before,'background view is not read');
  get('chat').classes.add('active-view');ctx.document.hidden=true;await ctx.loadChatConversation();assert.equal(marked(),before,'hidden tab is not read');ctx.document.hidden=false;
  // Account switches discard async results and clear every counter.
  let resolveQuery;queryHandler=()=>new Promise(resolve=>resolveQuery=resolve);const pending=ctx.loadChatConversation();await Promise.resolve();state.company={id:'other'};ctx.stopChatRealtime();resolveQuery({data:[{id:'stale'}],error:null});await pending;assert.equal(state.chatMessages.length,0);assert.equal(marked(),before);assert.equal(get('headerChatUnread').textContent,'');
  state.company={id:'self'};rpcHandler=async()=>({data:counts(),error:null});ctx.startChatRealtime();await new Promise(setImmediate);assert.equal(intervals.length,1,'watcher starts before opening Chat');
  events.chat_messages({new:{id:'new',sender_company_id:'alice',recipient_company_id:'self'}});assert.ok(events.timeout,'incoming private message schedules header refresh without a selected chat');
  await events.timeout();await new Promise(setImmediate);assert.equal(get('headerChatUnread').textContent,'5');
  events.chat_messages({new:{id:'public',room_id:'general',sender_company_id:'alice'}});await events.timeout();await new Promise(setImmediate);assert.equal(get('headerChatUnread').textContent,'5');
  assert.ok(!html.includes('id="planner"'));assert.ok(!html.includes('id="specializations"'));assert.ok(!app.includes('CompanyPlanner'));assert.ok(!app.includes('specializationFactor('));
  console.log('Chat controller checks passed: header/room/contact totals, escaping, reload, stale results, failures, read-after-display, concurrent arrivals, hidden tabs, company switching, background Realtime and polling.');
})().catch(error=>{console.error(error);process.exitCode=1});
