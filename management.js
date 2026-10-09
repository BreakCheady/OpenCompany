
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
    {label:'Gewinnmarge',value:managementNumber(m.profit_margin,1)+' %',note:'Letzte 7 Tage',valueTone:managementValueTone(Number(m.profit_margin||0))},
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

function managementEscape(value){
  return String(value==null?'':value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function managementDecisionLevelLabel(level){
  return ({operational:'Operativ',tactical:'Taktisch',strategic:'Strategisch'})[level]||level||'Operativ';
}

function managementDecisionSeverityLabel(severity){
  return ({normal:'Normal',important:'Wichtig',critical:'Kritisch'})[severity]||severity||'Normal';
}

const MANAGEMENT_CONTEXT_META=Object.freeze({
  storage_pct:['Lagerauslastung','percent'],
  debt_pct:['Verschuldungsgrad','percent'],
  debt_amount:['Schulden','money'],
  cash_runway:['Liquiditätsreichweite','days'],
  cash_balance:['Liquidität','money'],
  cashflow:['Cashflow (7 Tage)','moneySigned'],
  prod_util:['Produktionsauslastung','percent'],
  revenue_change:['Umsatz vs. Vorwoche','percentSigned'],
  profit_margin:['Gewinnmarge','percentSigned'],
  active_large_orders:['Aktive Großaufträge','count'],
  large_order_due_24h:['Großaufträge ≤24 Std.','count'],
  max_budget_util:['Höchste Budgetauslastung','percent'],
  production_budget_util:['Produktionsbudget','percent'],
  purchasing_budget_util:['Einkaufsbudget','percent'],
  research_budget_util:['Forschungsbudget','percent'],
  logistics_budget_util:['Logistikbudget','percent'],
  finance_budget_util:['Finanzbudget','percent'],
  min_manager_motivation:['Niedrigste Manager-Motivation','percent'],
  vacant_manager_count:['Unbesetzte Führungsstellen','count'],
  top_revenue_share:['Größter Umsatzanteil','percent'],
  company_value:['Unternehmenswert','money'],
  company_value_growth_7d:['UW-Wachstum 7 Tage','percentSigned'],
  cash_ratio:['Cash-Anteil am UW','percent'],
  cost_change:['Kosten vs. Vorwoche','percentSigned'],
  affected_manager:['Betroffene Führungskraft','text'],
  affected_manager_motivation:['Motivation dieser Führungskraft','percent'],
  order_customer:['Auftraggeber','text'],
  order_item:['Auftragsware','text'],
  order_remaining:['Offene Menge','number'],
  order_deadline:['Lieferfrist','datetime'],
  order_remaining_value:['Offener Auftragswert','money'],
  order_renegotiation_fee:['Gebühr für Fristverlängerung','money']
});

const MANAGEMENT_EFFECT_LABELS=Object.freeze({
  production_output:'Produktionsleistung',
  production_cost:'Produktionskosten',
  retail_revenue:'Handelserlöse',
  retail_rate:'Verkaufstempo',
  purchase_cost:'Einkaufskosten',
  market_fee:'Marktgebühren',
  maintenance_cost:'Unterhaltskosten',
  research_cost:'Forschungskosten',
  patent_gain:'Patentwert-Gewinn',
  freight_cost:'Frachtkosten',
  storage_cost:'Lagerkosten'
});

function managementContextValue(key,value){
  const meta=MANAGEMENT_CONTEXT_META[key]||[key,'number'];
  const n=Number(value||0);
  if(meta[1]==='text') return String(value==null?'–':value);
  if(meta[1]==='datetime') return value?new Date(value).toLocaleString(uiLocale()):'–';
  if(meta[1]==='money') return money(n);
  if(meta[1]==='moneySigned') return balanceMoney(n);
  if(meta[1]==='percent') return managementNumber(n,1)+' %';
  if(meta[1]==='percentSigned') return (n>0?'+':'')+managementNumber(n,1)+' %';
  if(meta[1]==='days') return managementNumber(n,1)+' Tage';
  if(meta[1]==='count') return num(n);
  return managementNumber(n,1);
}

function managementDecisionRemaining(expiresAt){
  if(!expiresAt) return 'Max. 24 Std.';
  const ms=new Date(expiresAt).getTime()-Date.now();
  if(ms<=0) return 'Frist abgelaufen';
  const totalMinutes=Math.ceil(ms/60000);
  const hours=Math.floor(totalMinutes/60);
  const minutes=totalMinutes%60;
  return hours>0 ? hours+' Std. '+minutes+' Min.' : minutes+' Min.';
}

function managementDecisionRiskLabel(chance){
  const c=Number(chance||0);
  if(c>=.35) return 'hoch';
  if(c>=.18) return 'mittel';
  if(c>0) return 'niedrig';
  return '';
}

function managementDecisionContextHtml(context){
  const entries=Object.entries(context||{}).filter(function(entry){return entry[0]!=='order_id' && entry[0]!=='affected_manager_id';});
  if(!entries.length) return '';
  return '<div class="management-decision-context">'+entries.map(function(entry){
    const meta=MANAGEMENT_CONTEXT_META[entry[0]]||[entry[0],'number'];
    return '<div><span>'+managementEscape(meta[0])+'</span><strong>'+managementEscape(managementContextValue(entry[0],entry[1]))+'</strong></div>';
  }).join('')+'</div>';
}

function managementDecisionAdviceHtml(advice){
  const rows=Array.isArray(advice)?advice:[];
  if(!rows.length) return '';
  return '<div class="management-decision-advice"><h4>Meinung deiner Führungskräfte</h4>'+
    rows.map(function(a){
      return '<div class="management-advice-row"><div><strong>'+managementEscape(a.manager_name||a.role_label||'Führungskraft')+'</strong>'+
        '<span>'+managementEscape(a.role_label||'')+' · Einschätzung '+managementEscape(a.confidence||'mittel')+'</span></div>'+
        '<p>'+managementEscape(a.opinion||'')+'</p></div>';
    }).join('')+'</div>';
}

function managementDecisionOptionHtml(d,o){
  const risk=managementDecisionRiskLabel(o.risk_chance);
  const view=String(o.view||'management');
  return '<button type="button" class="management-decision-option" onclick="handleManagementDecision(\''+
    managementEscape(d.id)+'\',\''+managementEscape(o.key)+'\',\''+managementEscape(view)+'\')">'+
    '<strong>'+managementEscape(o.label||'Entscheiden')+'</strong>'+
    '<span>'+managementEscape(o.summary||'')+'</span>'+
    (o.impact?'<small><b>Erwarteter Impact:</b> '+managementEscape(o.impact)+'</small>':'')+
    (o.commitment_cash_pct_value?'<small><b>Verbindliche Spätfolge:</b> '+managementEscape(managementNumber(Number(o.commitment_cash_pct_value)*100,1))+' % des aktuellen Unternehmenswerts nach '+managementEscape(managementNumber(Number(o.commitment_delay_hours||168)/24,0))+' Tagen</small>':'')+
    (o.guaranteed_followup?'<small><b>Folgeentscheidung:</b> Nach '+managementEscape(managementNumber(Number(o.commitment_delay_hours||168)/24,0))+' Tagen entsteht eine neue Managementsituation.</small>':'')+
    (risk?'<small class="management-decision-risk"><b>Unsicherheit:</b> '+risk+(o.risk_text?' · '+managementEscape(o.risk_text):'')+'</small>':'')+
    '</button>';
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
    const options=Array.isArray(d.options)?d.options:[];
    let html='<div class="management-decision-card" data-level="'+managementEscape(d.decision_level||'operational')+'" data-severity="'+managementEscape(d.severity||'normal')+'">';
    html+='<div class="management-decision-head"><div class="management-decision-badges">'+
      '<span class="management-decision-level">'+managementEscape(managementDecisionLevelLabel(d.decision_level))+'</span>'+
      '<span class="management-decision-severity">'+managementEscape(managementDecisionSeverityLabel(d.severity))+'</span>'+
      '</div><span class="management-decision-deadline">'+managementEscape(managementDecisionRemaining(d.expires_at))+'</span></div>';
    html+='<h3>'+managementEscape(d.title)+'</h3><p>'+managementEscape(d.description)+'</p>';
    html+=managementDecisionContextHtml(d.context);
    html+=managementDecisionAdviceHtml(d.manager_advice);
    html+='<div class="management-decision-options">'+
      options.map(function(o){return managementDecisionOptionHtml(d,o);}).join('')+
      '</div></div>';
    return html;
  }).join('');
}

function renderManagementDecisionProfile(){
  const root=document.getElementById('managementDecisionProfile');
  if(!root) return;
  const p=(state.managementDecisionCenter&&state.managementDecisionCenter.profile)||{};
  const rows=[
    ['Reputation',p.reputation],
    ['Wachstumsorientierung',p.growth_orientation],
    ['Risikobereitschaft',p.risk_orientation],
    ['Mitarbeiterorientierung',p.people_orientation],
    ['Finanzielle Disziplin',p.discipline_orientation],
    ['Kostenorientierung',p.cost_orientation]
  ];
  root.innerHTML=rows.map(function(row){
    const value=Math.max(0,Math.min(100,Number(row[1]||50)));
    return '<div class="management-style-row"><span>'+row[0]+'</span><div class="management-style-bar"><i style="width:'+value+'%"></i></div><strong>'+managementNumber(value,0)+'</strong></div>';
  }).join('');
}

function renderManagementActiveEffects(){
  const root=document.getElementById('managementDecisionEffects');
  if(!root) return;
  const items=(state.managementDecisionCenter&&state.managementDecisionCenter.effects)||[];
  if(!items.length){
    root.innerHTML='<p class="muted">Aktuell wirken keine temporären Entscheidungseffekte.</p>';
    return;
  }
  root.innerHTML=items.map(function(e){
    const value=Number(e.effect_value||0)*100;
    const favorable=(String(e.effect_key||'').includes('cost')||e.effect_key==='market_fee') ? value<0 : value>0;
    const cls=value===0?'':(favorable?'positive':'negative');
    return '<div class="management-effect-row"><div><strong>'+managementEscape(MANAGEMENT_EFFECT_LABELS[e.effect_key]||e.effect_key)+'</strong>'+
      '<span>'+managementEscape(e.description||'Managemententscheidung')+'</span></div>'+
      '<div><strong class="'+cls+'">'+(value>0?'+':'')+managementNumber(value,1)+' %</strong>'+
      '<small>'+managementEscape(managementDecisionRemaining(e.ends_at))+'</small></div></div>';
  }).join('');
}

function renderManagementDecisionCenterExtras(){
  renderManagementDecisionProfile();
  renderManagementActiveEffects();
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
    if(b.department==='finance'){
      const extra=state.managementFinanceBudgetBreakdown||{};
      html+='<div class="muted" style="margin:9px 0 5px">Separat erfasste Zahlungsströme (diese Woche; nicht im Finanzbudget)</div>';
      html+='<div class="kv"><span>Investitionen</span><strong>'+money(extra.investment_outflows||0)+'</strong></div>';
      html+='<div class="kv"><span>Kapitalabflüsse</span><strong>'+money(extra.capital_outflows||0)+'</strong></div>';
      html+='<div class="kv"><span>Kapitalzuflüsse</span><strong>'+money(extra.capital_inflows||0)+'</strong></div>';
      html+='<div class="kv"><span>Finanzerträge</span><strong>'+money(extra.financial_income||0)+'</strong></div>';
    }
    html+='<div class="management-budget-edit"><label>Wochenbudget<input id="managementBudget_'+b.department+'" type="number" min="0" step="100" value="'+Number(b.weekly_budget||0)+'"></label>';
    html+='<button type="button" onclick="saveManagementBudget(\''+b.department+'\')">Speichern</button></div></div>';
    return html;
  }).join('');
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
  renderManagementDecisionCenterExtras();
  renderFinanceBudgets();
  renderMonthlyClosings();
}

window.renderManagement=renderManagement;

window.refreshManagementOverview=async function(){
  if(!state.company||!state.company.id) return;
  const results=await Promise.all([
    sb.rpc('get_management_overview',{p_company_id:state.company.id}),
    sb.rpc('get_management_decision_center',{p_company_id:state.company.id}),
    sb.rpc('get_management_finance_budget_breakdown',{p_company_id:state.company.id})
  ]);
  const overview=results[0], center=results[1], financeBreakdown=results[2];
  if(overview.error||center.error||financeBreakdown.error){
    const error=overview.error||center.error||financeBreakdown.error;
    await gameAlert('Managementdaten konnten nicht aktualisiert werden. '+error.message);
    return;
  }
  state.managementFinanceBudgetBreakdown=financeBreakdown.data||{};
  state.managementOverview=overview.data||state.managementOverview;
  state.managementDecisionCenter=center.data||state.managementDecisionCenter;
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
  const decision=((state.managementOverview&&state.managementOverview.decisions)||[]).find(function(d){return d.id===id;});
  const option=(decision&&Array.isArray(decision.options))?decision.options.find(function(o){return o.key===action;}):null;
  if(!decision||!option){await gameAlert('Diese Entscheidung ist nicht mehr verfügbar.');await refreshManagementOverview();return;}
  const ok=await gameConfirm(
    (option.label||'Diese Option')+' wirklich umsetzen?'+
    (option.impact?'\n\nErwarteter Impact: '+option.impact:'')+
    (Number(option.risk_chance||0)>0?'\n\nDie Option enthält ein Folgerisiko.':''),
    'Managemententscheidung'
  );
  if(!ok) return;
  const result=await sb.rpc('resolve_management_decision',{p_company_id:state.company.id,p_decision_id:id,p_action:action});
  if(result.error){await gameAlert(result.error.message);await refreshManagementOverview();return;}
  await refreshManagementOverview();
  if(view) activateView(view);
};

setInterval(function(){
  if(!state.company||!state.managementOverview) return;
  const dueRecruitment=((state.managementOverview.recruitments||[]).some(function(r){
    return r.status==='searching'&&new Date(r.completes_at).getTime()<=Date.now();
  }));
  const dueTraining=((state.managementOverview.managers||[]).some(function(m){
    return m.status==='training'&&new Date(m.training_ends_at).getTime()<=Date.now();
  }));
  const dueDecision=((state.managementOverview.decisions||[]).some(function(d){
    return d.status==='open'&&d.expires_at&&new Date(d.expires_at).getTime()<=Date.now();
  }));
  if(dueRecruitment||dueTraining||dueDecision) refreshManagementOverview();
  else if(document.getElementById('management')&&document.getElementById('management').classList.contains('active-view')){
    renderManagementManagers();
    renderManagementDecisions();
    renderManagementActiveEffects();
  }
},30000);

if(typeof state!=='undefined' && state.company) renderManagement();
