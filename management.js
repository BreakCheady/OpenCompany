
const MANAGEMENT_ROLE_META = Object.freeze({
  production:{label:'Produktionsleiter',primary:'Produktionskosten',primaryCap:10,secondary:'Produktionsmenge',secondaryCap:10},
  purchasing:{label:'Einkaufsleiter',primary:'Einkaufskosten Warenbörse',primaryCap:10,secondary:'Marktgebühren',secondaryCap:5},
  sales:{label:'Vertriebsleiter',primary:'Erlöse im Handel',primaryCap:10,secondary:'Verkaufsmenge im Handel',secondaryCap:5},
  finance:{label:'Verwaltungs- und Finanzleiter',primary:'Unterhaltskosten',primaryCap:10,secondary:'Personalkosten',secondaryCap:10},
  research:{label:'Forschungsleiter',primary:'Patent-Gewinne',primaryCap:10,secondary:'Forschungskosten',secondaryCap:10},
  logistics:{label:'Logistikleiter',primary:'Transportkosten',primaryCap:10,secondary:'Lagerhaltungskosten',secondaryCap:10}
});

const MANAGEMENT_DEPARTMENT_LABELS = Object.freeze({
  production:'Produktion',purchasing:'Einkauf',sales:'Vertrieb',research:'Forschung',logistics:'Logistik',finance:'Finanzen'
});

const MANAGEMENT_COST_CENTER_LABELS = Object.freeze({
  market:'Warenbörse',retail:'Einzelhandel',contracts:'Verträge',large_orders:'Großaufträge',
  production:'Produktion',research:'Forschung',buildings:'Gebäude',storage_logistics:'Lager & Logistik',
  financing:'Finanzierung',management:'Management',other:'Sonstiges'
});

function managementNumber(value,digits){
  const d=digits==null?1:digits;
  const n=Number(value||0);
  return n.toLocaleString(uiLocale(),{minimumFractionDigits:d,maximumFractionDigits:d});
}

function managementScore(manager){
  return manager ? (Number(manager.competence||0)+Number(manager.experience||0)+Number(manager.motivation||0))/3 : 0;
}

function managementPerkValue(manager,cap){
  return managementScore(manager)/100*Number(cap||0);
}

function managementRemainingText(value){
  if(!value) return '–';
  const ms=new Date(value).getTime()-Date.now();
  if(ms<=0) return 'Abschluss wird verarbeitet …';
  const minutes=Math.ceil(ms/60000);
  const hours=Math.floor(minutes/60);
  const mins=minutes%60;
  return hours>0 ? hours+' Std. '+mins+' Min.' : mins+' Min.';
}

function managementGoalProgressClass(percent){
  const p=Number(percent||0);
  if(p<=35) return 'goal-progress-red';
  if(p<45) return 'goal-progress-red-yellow';
  if(p<=75) return 'goal-progress-yellow';
  if(p<85) return 'goal-progress-yellow-green';
  return 'goal-progress-green';
}

function managementGoalMeta(type){
  return ({
    revenue:{label:'Umsatz',unit:'money'},
    profit:{label:'Gewinn',unit:'money'},
    company_value_growth:{label:'Unternehmenswert-Wachstum',unit:'percent'},
    debt_max:{label:'Verschuldung',unit:'money'},
    storage_max:{label:'Lagerauslastung',unit:'percent'},
    large_orders:{label:'Großaufträge',unit:'count'},
    research_patents:{label:'Neue Patente',unit:'count'}
  })[type] || {label:type,unit:'count'};
}

function managementGoalValue(goal,value){
  const meta=managementGoalMeta(goal.goal_type);
  if(meta.unit==='money') return money(Number(value||0));
  if(meta.unit==='percent') return managementNumber(value,1)+' %';
  return num(Number(value||0));
}

function managementBudgetTone(utilization){
  const u=Number(utilization||0);
  if(u<=70) return 'green';
  if(u>=75 && u<=85) return 'yellow';
  if(u>=90 && u<=95) return 'orange';
  if(u>=100) return 'red';
  return 'neutral';
}

function managementValueTone(value){
  const n=Number(value||0);
  if(n>0) return 'positive';
  if(n<0) return 'negative';
  return 'neutral';
}

function renderManagementKpis(){
  const root=document.getElementById('managementKpis');
  if(!root) return;
  const m=(state.managementOverview&&state.managementOverview.metrics)||{};
  const change=Number(m.revenue_change_percent||0);
  const operatingResult=Number(m.operating_result||0);
  const cashflow=Number(m.cashflow||0);
  const cards=[
    {label:'Umsatz',value:money(m.revenue),note:(change>=0?'+':'')+managementNumber(change,1)+' % zur Vorwoche',noteTone:managementValueTone(change)},
    {label:'Betriebsergebnis',value:balanceMoney(operatingResult),note:'Letzte 7 Tage',valueTone:managementValueTone(operatingResult)},
    {label:'Gewinnmarge',value:managementNumber(m.profit_margin,1)+' %',note:'Letzte 7 Tage'},
    {label:'Cashflow',value:balanceMoney(cashflow),note:'Letzte 7 Tage',valueTone:managementValueTone(cashflow)},
    {label:'Verschuldungsgrad',value:managementNumber(m.debt_ratio,1)+' %',note:'Schulden / Unternehmenswert'},
    {label:'Lagerauslastung',value:managementNumber(m.storage_utilization,1)+' %',note:'Aktuelle Kapazität'},
    {label:'Produktionsauslastung',value:managementNumber(m.production_utilization,1)+' %',note:'Letzte 7 Tage'},
    {label:'Großaufträge',value:num(Number(m.active_large_orders||0)),note:'Aktiv'}
  ];
  root.innerHTML=cards.map(function(card){
    const valueClass=card.valueTone ? ' management-kpi-value-'+card.valueTone : '';
    const noteClass=card.noteTone ? ' management-kpi-change-'+card.noteTone : '';
    return '<div class="management-kpi-card"><span>'+card.label+'</span><strong class="'+valueClass.trim()+'">'+card.value+'</strong><small class="'+noteClass.trim()+'">'+card.note+'</small></div>';
  }).join('');
}

function managementGoalCard(goal,compact){
  const meta=managementGoalMeta(goal.goal_type);
  const pct=Math.max(0,Math.min(100,Number(goal.progress_percent||0)));
  let html='<div class="management-goal-card">';
  html+='<div class="management-goal-head"><div><strong>'+meta.label+'</strong><div class="muted">'+
    (goal.period_type==='week'?'Diese Woche':goal.period_type==='month'?'Dieser Monat':'30 Tage')+
    '</div></div><strong>'+managementGoalValue(goal,goal.current_value)+' / '+managementGoalValue(goal,goal.target_value)+'</strong></div>';
  html+='<div class="management-progress"><span class="'+managementGoalProgressClass(pct)+'" style="width:'+pct+'%"></span></div>';
  html+='<div class="kv"><span>Fortschritt</span><strong>'+managementNumber(pct,1)+' %</strong></div>';
  if(goal.status==='completed'){
    html+='<div class="status success">Ziel erreicht</div>';
  } else if(!compact){
    html+='<div class="kv"><span>Noch</span><strong>'+managementGoalValue(goal,goal.remaining)+'</strong></div>';
    html+='<button type="button" class="ghost" onclick="cancelManagementGoal(\''+goal.id+'\')">Ziel abbrechen</button>';
  }
  return html+'</div>';
}

function renderManagementGoals(){
  const all=(state.managementOverview&&state.managementOverview.goals)||[];
  const active=all.filter(function(g){return g.status==='active';});
  const completed=all.filter(function(g){return g.status==='completed';});

  const dashboard=document.getElementById('dashboardCompanyGoals');
  if(dashboard) dashboard.innerHTML=active.length
    ? active.map(function(g){return managementGoalCard(g,true);}).join('')
    : '<p class="muted">Aktuell ist kein Unternehmensziel aktiv.</p>';

  const root=document.getElementById('managementGoals');
  if(root) root.innerHTML=(active.length||completed.length)
    ? active.map(function(g){return managementGoalCard(g,false);}).join('')+completed.slice(0,3).map(function(g){return managementGoalCard(g,true);}).join('')
    : '<p class="muted">Noch keine Unternehmensziele angelegt.</p>';

  const submit=document.getElementById('managementGoalSubmit');
  if(submit) submit.disabled=active.length>=3;
}

function renderManagementManagers(){
  const root=document.getElementById('managementManagers');
  if(!root) return;
  const managers=(state.managementOverview&&state.managementOverview.managers)||[];
  const recruitments=(state.managementOverview&&state.managementOverview.recruitments)||[];
  const roles=['production','purchasing','sales','finance','research','logistics'];

  root.innerHTML=roles.map(function(role){
    const meta=MANAGEMENT_ROLE_META[role];
    const manager=managers.find(function(m){return m.role===role;});
    const recruitment=recruitments.find(function(r){return r.role===role;});

    if(manager){
      const primary=managementPerkValue(manager,meta.primaryCap);
      const secondary=managementPerkValue(manager,meta.secondaryCap);
      const training=manager.status==='training';
      let html='<div class="management-manager-card"><h3>'+meta.label+'</h3>';
      html+='<div class="manager-name">'+manager.manager_name+'</div>';
      html+='<div class="muted">'+manager.age+' Jahre · '+money(manager.weekly_salary)+' / Woche</div>';
      html+='<div class="manager-stats">';
      html+='<div class="manager-stat"><span>Kompetenz</span><strong>'+manager.competence+'</strong></div>';
      html+='<div class="manager-stat"><span>Erfahrung</span><strong>'+manager.experience+'</strong></div>';
      html+='<div class="manager-stat"><span>Motivation</span><strong>'+manager.motivation+'</strong></div></div>';
      if(training){
        html+='<div class="manager-training-note">Training aktiv · '+managementRemainingText(manager.training_ends_at)+' · Buffs pausiert</div>';
      } else {
        html+='<div class="manager-perks"><span>'+meta.primary+': <strong>'+managementNumber(primary,1)+' %</strong></span>';
        html+='<span>'+meta.secondary+': <strong>'+managementNumber(secondary,1)+' %</strong></span></div>';
        html+='<button type="button" class="ghost" onclick="startManagerTraining(\''+manager.id+'\')">8 Std. trainieren</button>';
      }
      return html+'</div>';
    }

    if(recruitment){
      if(recruitment.status==='ready'){
        const avg=(Number(recruitment.candidate_competence||0)+Number(recruitment.candidate_experience||0)+Number(recruitment.candidate_motivation||0))/3;
        let html='<div class="management-manager-card"><h3>'+meta.label+'</h3><div class="status success">Kandidat verfügbar</div>';
        html+='<div class="manager-name">'+recruitment.candidate_name+'</div>';
        html+='<div class="muted">'+recruitment.candidate_age+' Jahre · '+money(recruitment.candidate_salary)+' / Woche</div>';
        html+='<div class="manager-stats">';
        html+='<div class="manager-stat"><span>Kompetenz</span><strong>'+recruitment.candidate_competence+'</strong></div>';
        html+='<div class="manager-stat"><span>Erfahrung</span><strong>'+recruitment.candidate_experience+'</strong></div>';
        html+='<div class="manager-stat"><span>Motivation</span><strong>'+recruitment.candidate_motivation+'</strong></div></div>';
        html+='<div class="muted">Ø Managerwert '+managementNumber(avg,1)+'</div>';
        html+='<div class="management-decision-actions"><button type="button" onclick="acceptManagerCandidate(\''+recruitment.id+'\')">Annehmen</button>';
        html+='<button type="button" class="ghost" onclick="rejectManagerCandidate(\''+recruitment.id+'\')">Ablehnen</button></div></div>';
        return html;
      }
      return '<div class="management-manager-card"><h3>'+meta.label+'</h3><div class="muted">Rekrutierung läuft · '+
        (recruitment.source==='internal'?'Hausintern':recruitment.source==='agency'?'Personalvermittlung':'Elite Agentur')+
        '</div><strong>'+managementRemainingText(recruitment.completes_at)+'</strong></div>';
    }

    return '<div class="management-manager-card"><h3>'+meta.label+'</h3><p class="muted">Position nicht besetzt. Es wirken keine Manager-Buffs.</p>'+
      '<button type="button" onclick="openManagerRecruitment(\''+role+'\')">Rekrutieren</button></div>';
  }).join('');
}

function renderManagementDecisions(){
  const root=document.getElementById('managementDecisions');
  if(!root) return;
  const items=(state.managementOverview&&state.managementOverview.decisions)||[];
  if(!items.length){
    root.innerHTML='<p class="muted">Aktuell besteht kein besonderer Management-Handlungsbedarf.</p>';
    return;
  }
  root.innerHTML=items.map(function(d){
    let html='<div class="management-decision-card"><strong>'+d.title+'</strong><p>'+d.description+'</p><div class="management-decision-actions">';
    html+='<button type="button" onclick="handleManagementDecision(\''+d.id+'\',\'primary\',\''+d.primary_view+'\')">'+d.primary_label+'</button>';
    if(d.secondary_label){
      html+='<button type="button" class="ghost" onclick="handleManagementDecision(\''+d.id+'\',\'secondary\',\''+d.secondary_view+'\')">'+d.secondary_label+'</button>';
    }
    html+='<button type="button" class="ghost" onclick="handleManagementDecision(\''+d.id+'\',\'observe\',\'\')">Situation beobachten</button></div></div>';
    return html;
  }).join('');
}

function renderFinanceBudgets(){
  const root=document.getElementById('financeBudgets');
  if(!root) return;
  const budgets=(state.managementOverview&&state.managementOverview.budgets)||[];
  root.innerHTML=budgets.map(function(b){
    const util=Number(b.utilization||0);
    const tone=managementBudgetTone(util);
    const configured=Number(b.weekly_budget||0)>0;
    let html='<div class="management-budget-card" data-tone="'+tone+'">';
    html+='<div class="management-budget-head"><strong>'+(MANAGEMENT_DEPARTMENT_LABELS[b.department]||b.department)+'</strong><span>'+
      (configured?managementNumber(util,1)+' %':'Kein Budget gesetzt')+'</span></div>';
    html+='<div class="management-progress"><span style="width:'+(configured?Math.min(100,Math.max(0,util)):0)+'%"></span></div>';
    html+='<div class="kv"><span>Bisher ausgegeben</span><strong>'+money(b.used)+'</strong></div>';
    html+='<div class="kv"><span>Verfügbar</span><strong>'+(configured?balanceMoney(Number(b.remaining||0)):'–')+'</strong></div>';
    html+='<div class="management-budget-edit"><label>Wochenbudget<input id="managementBudget_'+b.department+'" type="number" min="0" step="100" value="'+Number(b.weekly_budget||0)+'"></label>';
    html+='<button type="button" onclick="saveManagementBudget(\''+b.department+'\')">Speichern</button></div></div>';
    return html;
  }).join('');
}

function renderFinanceCostCenters(){
  const root=document.getElementById('financeCostCenters');
  if(!root) return;
  const rows=(state.managementOverview&&state.managementOverview.cost_centers)||[];
  if(!rows.length){
    root.innerHTML='<p class="muted">Für den aktuellen Monat liegen noch keine Buchungen vor.</p>';
    return;
  }
  const totalCosts=rows.reduce(function(sum,r){return sum+Number(r.costs||0);},0);
  root.innerHTML=renderTable(
    ['Bereich','Typ','Einnahmen','Kosten','Ergebnis','Anteil Gesamtkosten'],
    rows.map(function(r){
      const share=totalCosts>0?Number(r.costs||0)/totalCosts*100:0;
      return '<tr><td><strong>'+(MANAGEMENT_COST_CENTER_LABELS[r.cost_center]||r.cost_center)+'</strong></td>'+
        '<td><span class="management-center-type">'+(r.center_type==='profit'?'Profit-Center':'Kostenstelle')+'</span></td>'+
        '<td>'+money(r.income)+'</td><td>'+money(r.costs)+'</td><td>'+balanceMoney(Number(r.result||0))+'</td>'+
        '<td><span class="management-cost-share">'+managementNumber(share,1)+' %</span></td></tr>';
    })
  );
}

function renderMonthlyClosings(){
  const root=document.getElementById('financeMonthlyClosings');
  if(!root) return;
  const items=(state.managementOverview&&state.managementOverview.monthly_closings)||[];
  if(!items.length){
    root.innerHTML='<p class="muted">Noch kein Monatsabschluss gespeichert. Der erste Abschluss entsteht am ersten Tag des Folgemonats.</p>';
    return;
  }
  root.innerHTML=items.map(function(item){
    const m=item.metrics||{};
    const g=item.grades||{};
    const month=new Date(item.month_start+'T12:00:00').toLocaleDateString(uiLocale(),{month:'long',year:'numeric'});
    let html='<div class="management-closing-card"><div class="management-closing-head"><div><strong>'+month+'</strong><div class="muted">Monatsabschluss</div></div><span class="management-grade">'+item.overall_grade+'</span></div>';
    html+='<div class="grid two"><div>';
    html+='<div class="kv"><span>Umsatz</span><strong>'+money(m.revenue)+'</strong></div>';
    html+='<div class="kv"><span>Wareneinsatz / Beschaffung</span><strong>'+money(m.procurement)+'</strong></div>';
    html+='<div class="kv"><span>Betriebskosten</span><strong>'+money(m.operating_costs)+'</strong></div>';
    html+='<div class="kv"><span>Betriebsergebnis</span><strong>'+balanceMoney(Number(m.operating_result||0))+'</strong></div>';
    html+='<div class="kv"><span>Zinsaufwand</span><strong>'+money(m.interest_expense)+'</strong></div></div><div>';
    html+='<div class="kv"><span>Gewinn</span><strong>'+balanceMoney(Number(m.profit||0))+'</strong></div>';
    html+='<div class="kv"><span>Cashflow</span><strong>'+balanceMoney(Number(m.cashflow||0))+'</strong></div>';
    html+='<div class="kv"><span>Unternehmenswert</span><strong>'+money(m.company_value_start)+' → '+money(m.company_value_end)+'</strong></div>';
    html+='<div class="kv"><span>Veränderung</span><strong>'+(Number(m.company_value_change_percent||0)>=0?'+':'')+managementNumber(m.company_value_change_percent,1)+' %</strong></div></div></div>';
    html+='<div class="management-grade-grid">';
    html+='<div class="kv"><span>Profitabilität</span><strong>'+(g.profitability||'–')+'</strong></div>';
    html+='<div class="kv"><span>Liquidität</span><strong>'+(g.liquidity||'–')+'</strong></div>';
    html+='<div class="kv"><span>Wachstum</span><strong>'+(g.growth||'–')+'</strong></div>';
    html+='<div class="kv"><span>Verschuldung</span><strong>'+(g.debt||'–')+'</strong></div>';
    html+='<div class="kv"><span>Budgettreue</span><strong>'+(g.budget||'–')+'</strong></div>';
    html+='<div class="kv"><span>Zielerreichung</span><strong>'+(g.goals||'–')+'</strong></div></div></div>';
    return html;
  }).join('');
}

function renderManagement(){
  renderManagementKpis();
  renderManagementGoals();
  renderManagementManagers();
  renderManagementDecisions();
  renderFinanceBudgets();
  renderFinanceCostCenters();
  renderMonthlyClosings();
}

window.renderManagement=renderManagement;

window.refreshManagementOverview=async function(){
  if(!state.company||!state.company.id) return;
  const result=await sb.rpc('get_management_overview',{p_company_id:state.company.id});
  if(result.error){
    await gameAlert('Managementdaten konnten nicht aktualisiert werden. '+result.error.message);
    return;
  }
  state.managementOverview=result.data||state.managementOverview;
  renderManagement();
};

window.openManagerRecruitment=function(role){
  state.managementRecruitRole=role;
  const panel=document.getElementById('managementRecruitPanel');
  const title=document.getElementById('managementRecruitTitle');
  if(title) title.textContent=(MANAGEMENT_ROLE_META[role]?MANAGEMENT_ROLE_META[role].label:'Manager')+' rekrutieren';
  if(panel) panel.classList.remove('hidden');
  if(panel) panel.scrollIntoView({behavior:'smooth',block:'nearest'});
};

window.closeManagerRecruitment=function(){
  state.managementRecruitRole='';
  const panel=document.getElementById('managementRecruitPanel');
  if(panel) panel.classList.add('hidden');
};

window.startManagerRecruitment=async function(source){
  const role=state.managementRecruitRole;
  if(!role) return;
  const result=await sb.rpc('start_manager_recruitment',{p_company_id:state.company.id,p_role:role,p_source:source});
  if(result.error){await gameAlert(result.error.message);return;}
  closeManagerRecruitment();
  await refreshManagementOverview();
};

window.acceptManagerCandidate=async function(id){
  const result=await sb.rpc('accept_manager_candidate',{p_company_id:state.company.id,p_recruitment_id:id});
  if(result.error){await gameAlert(result.error.message);return;}
  await refreshManagementOverview();
};

window.rejectManagerCandidate=async function(id){
  const ok=await gameConfirm('Diesen Kandidaten ablehnen? Danach kann eine neue Rekrutierung gestartet werden.');
  if(!ok) return;
  const result=await sb.rpc('reject_manager_candidate',{p_company_id:state.company.id,p_recruitment_id:id});
  if(result.error){await gameAlert(result.error.message);return;}
  await refreshManagementOverview();
};

window.startManagerTraining=async function(id){
  const ok=await gameConfirm('Training starten? Es dauert 8 Stunden. Währenddessen wirken die Buffs dieses Managers nicht.');
  if(!ok) return;
  const result=await sb.rpc('start_manager_training',{p_company_id:state.company.id,p_manager_id:id});
  if(result.error){await gameAlert(result.error.message);return;}
  await refreshManagementOverview();
};

window.saveManagementBudget=async function(department){
  const input=document.getElementById('managementBudget_'+department);
  const value=Number(input?input.value:0);
  if(!Number.isFinite(value)||value<0){await gameAlert('Bitte ein gültiges Wochenbudget eingeben.');return;}
  const result=await sb.rpc('set_management_budget',{p_company_id:state.company.id,p_department:department,p_weekly_budget:value});
  if(result.error){await gameAlert(result.error.message);return;}
  await refreshManagementOverview();
};

window.createManagementGoal=async function(event){
  if(event) event.preventDefault();
  const type=document.getElementById('managementGoalType')?document.getElementById('managementGoalType').value:'revenue';
  const target=Number(document.getElementById('managementGoalTarget')?document.getElementById('managementGoalTarget').value:0);
  const period=document.getElementById('managementGoalPeriod')?document.getElementById('managementGoalPeriod').value:'month';
  if(!Number.isFinite(target)||target<0){await gameAlert('Bitte einen gültigen Zielwert eingeben.');return;}
  const result=await sb.rpc('create_company_goal',{p_company_id:state.company.id,p_goal_type:type,p_target_value:target,p_period_type:period});
  if(result.error){await gameAlert(result.error.message);return;}
  await refreshManagementOverview();
};

window.cancelManagementGoal=async function(id){
  const ok=await gameConfirm('Dieses Unternehmensziel abbrechen?');
  if(!ok) return;
  const result=await sb.rpc('cancel_company_goal',{p_company_id:state.company.id,p_goal_id:id});
  if(result.error){await gameAlert(result.error.message);return;}
  await refreshManagementOverview();
};

window.handleManagementDecision=async function(id,action,view){
  const result=await sb.rpc('resolve_management_decision',{p_company_id:state.company.id,p_decision_id:id,p_action:action});
  if(result.error){await gameAlert(result.error.message);return;}
  await refreshManagementOverview();
  if(action!=='observe'&&view) activateView(view);
};

setInterval(function(){
  if(!state.company||!state.managementOverview) return;
  const dueRecruitment=((state.managementOverview.recruitments||[]).some(function(r){
    return r.status==='searching'&&new Date(r.completes_at).getTime()<=Date.now();
  }));
  const dueTraining=((state.managementOverview.managers||[]).some(function(m){
    return m.status==='training'&&new Date(m.training_ends_at).getTime()<=Date.now();
  }));
  if(dueRecruitment||dueTraining) refreshManagementOverview();
  else if(document.getElementById('management')&&document.getElementById('management').classList.contains('active-view')) renderManagementManagers();
},30000);

if(typeof state!=='undefined' && state.company) renderManagement();
