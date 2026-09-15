const config = window.OPENCOMPANY_CONFIG || {};
const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.includes('YOUR_');
const setupNotice = document.getElementById('setupNotice');
if (!configured) setupNotice.classList.remove('hidden');

const APP_URL = 'https://breakcheady.github.io/OpenCompany/';
const sb = configured ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;

const state = {
  session: null,
  company: null,
  products: [],
  allProducts: [],
  inventory: [],
  materials: [],
  materialInventory: [],
  recipes: [],
  buildingTypes: [],
  buildings: [],
  productionJobs: [],
  retailSaleJobs: [],
  transactions: [],
  marketOrders: [],
  marketOrderHistory: [],
  marketOrderHistoryFilter: 'all',
  financePeriod: 'week',
  contracts: [],
  companyDirectory: [],
  recoveringPassword: false
};

let presenceTimer = null;
let productionRefreshTimer = null;
let npcMarketTimer = null;

const money = n => new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR', maximumFractionDigits:2 })
  .format(Number(n || 0)).replace('€','OC$');
const num = n => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(Number(n || 0));
const balanceMoney = n => `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Number(n || 0))} OC$`;

function msg(el, text, type='') { el.textContent = text; el.className = `status ${type}`; }

function transactionLabel(type) {
  return ({
    founding_capital: 'Startkapital',
    market_sale: 'Marktverkauf',
    retail_sale: 'Handelsverkauf',
    market_fee: 'Gebühr',
    market_buy: 'Kauf',
    production: 'Produktion',
    production_refund: 'Erstattung Produktion',
    construction: 'Baukosten',
    building_refund: 'Gebäude-Erstattung'
  })[type] || type;
}

function transactionAmountClass(type) {
  return ['market_fee', 'market_buy', 'production', 'construction'].includes(type) ? 'transaction-amount fee' : 'transaction-amount';
}


function buildingLevelMultiplier(level) {
  const lvl = Math.max(1, Number(level || 1));
  let factor = 1;
  if (lvl >= 2) factor *= 2;
  if (lvl >= 3) factor *= 1.95;
  if (lvl >= 4) factor *= 1.90;
  if (lvl >= 5) factor *= 1.85;
  if (lvl >= 6) factor *= Math.pow(1.0366, lvl - 5);
  return factor;
}

function buildingUpgradePercent(nextLevel) {
  if (nextLevel === 2) return 100;
  if (nextLevel === 3) return 95;
  if (nextLevel === 4) return 90;
  if (nextLevel === 5) return 85;
  if (nextLevel >= 6) return 3.66;
  return 0;
}

function renderTable(headers, rows) {
  if (!rows.length) return '<p class="muted">Noch keine Daten.</p>';
  return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}
function companyName(id) {
  if (id === state.company?.id) return state.company.name;
  return state.companyDirectory.find(c => c.id === id)?.name || '–';
}
function itemName(row) {
  return row.products?.name || row.materials?.name || '–';
}

function getCompanyLoadErrorBox() {
  let errorBox = document.getElementById('companyLoadError');
  if (!errorBox) {
    errorBox = document.createElement('section');
    errorBox.id = 'companyLoadError';
    errorBox.className = 'panel warning hidden';
    document.querySelector('.main-content').insertBefore(errorBox, document.getElementById('authView'));
  }
  return errorBox;
}
function clearCompanyLoadError() {
  const box = getCompanyLoadErrorBox();
  box.textContent = '';
  box.classList.add('hidden');
}
function showCompanyLoadError(error) {
  const box = getCompanyLoadErrorBox();
  box.textContent = `Unternehmensdaten konnten nicht geladen werden. ${error.message || 'Unbekannter Fehler'}`;
  box.classList.remove('hidden');
}
function getGameDataErrorBox() {
  let errorBox = document.getElementById('gameDataError');
  if (!errorBox) {
    errorBox = document.createElement('section');
    errorBox.id = 'gameDataError';
    errorBox.className = 'panel warning hidden';
    document.getElementById('gameView').prepend(errorBox);
  }
  return errorBox;
}
function clearGameDataError() {
  const box = getGameDataErrorBox();
  box.textContent = '';
  box.classList.add('hidden');
}
function showGameDataError(errors) {
  const box = getGameDataErrorBox();
  box.textContent = `Spieldaten konnten nicht vollständig geladen werden. ${errors.map(x => `${x.label}: ${x.error.message || 'Unbekannter Fehler'}`).join(' | ')}`;
  box.classList.remove('hidden');
}


async function touchPresence() {
  if (!sb || !state.company?.id || document.visibilityState === 'hidden') return;
  const { data, error } = await sb.rpc('touch_company_presence', { p_company_id: state.company.id });
  if (error) {
    console.warn('Präsenz konnte nicht aktualisiert werden:', error.message);
    return;
  }
  state.company.last_seen_at = data;
  renderCompanyStatus();
}

function startPresenceHeartbeat() {
  if (presenceTimer) clearInterval(presenceTimer);
  touchPresence();
  presenceTimer = setInterval(touchPresence, 60000);
}

function stopPresenceHeartbeat() {
  if (presenceTimer) clearInterval(presenceTimer);
  presenceTimer = null;
}

function stopNpcMarketHeartbeat() {
  if (npcMarketTimer) clearInterval(npcMarketTimer);
  npcMarketTimer = null;
}

async function runNpcMarketTickAndRefresh() {
  if (!sb || !state.company?.id || document.visibilityState === 'hidden') return;
  const { data, error } = await sb.rpc('run_npc_market_tick');
  if (error) {
    console.warn('NPC-Markt-Tick:', error.message);
    return;
  }
  if (Number(data || 0) > 0 && document.getElementById('market')?.classList.contains('active-view')) {
    await loadGameData();
  }
}

function startNpcMarketHeartbeat() {
  stopNpcMarketHeartbeat();
  npcMarketTimer = setInterval(runNpcMarketTickAndRefresh, 120000);
}

function isCompanyOnline() {
  if (!state.company?.last_seen_at) return false;
  return Date.now() - new Date(state.company.last_seen_at).getTime() < 120000;
}

function renderCompanyStatus() {
  const online = isCompanyOnline();
  document.querySelectorAll('.company-online-status').forEach(statusEl => {
    statusEl.textContent = online ? 'Online' : 'Offline';
    statusEl.className = `company-online-status presence-status ${online ? 'online' : 'offline'}`;
  });
}

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));
    document.getElementById(view).classList.add('active-view');
    document.getElementById('pageTitle').textContent = btn.textContent;
  }));
}
bindNavigation();

async function init() {
  if (!sb) return;

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      state.recoveringPassword = true;
      state.session = session;
      document.getElementById('authView').classList.add('hidden');
      document.getElementById('gameView').classList.add('hidden');
      document.getElementById('bootstrapView').classList.add('hidden');
      document.getElementById('recoveryView').classList.remove('hidden');
      document.getElementById('logoutBtn').classList.add('hidden');
      document.getElementById('sessionLabel').textContent = 'Passwort zurücksetzen';
      document.getElementById('pageTitle').textContent = 'Passwort zurücksetzen';
      return;
    }
    if (state.recoveringPassword && event !== 'SIGNED_OUT') return;
    await handleSession(session);
  });

  const { data: { session }, error } = await sb.auth.getSession();
  if (error) {
    console.error(error);
    msg(document.getElementById('authMessage'), error.message, 'error');
    return;
  }
  await handleSession(session);
}

async function handleSession(session) {
  if (state.recoveringPassword) return;
  state.session = session;
  const loggedIn = !!session;
  document.getElementById('authView').classList.toggle('hidden', loggedIn);
  document.getElementById('recoveryView').classList.add('hidden');
  document.getElementById('logoutBtn').classList.toggle('hidden', !loggedIn);
  document.getElementById('sessionLabel').textContent = loggedIn ? session.user.email : 'Nicht angemeldet';

  if (!loggedIn) {
    stopPresenceHeartbeat();
    stopNpcMarketHeartbeat();
    document.getElementById('gameView').classList.add('hidden');
    document.getElementById('bootstrapView').classList.add('hidden');
    clearCompanyLoadError();
    return;
  }
  await loadCompany();
}

async function loadCompany() {
  const { data, error } = await sb.from('companies').select('*').eq('owner_user_id', state.session.user.id).maybeSingle();
  if (error) {
    console.error(error);
    showCompanyLoadError(error);
    return;
  }
  clearCompanyLoadError();
  state.company = data;
  document.getElementById('bootstrapView').classList.toggle('hidden', !!data);
  document.getElementById('gameView').classList.toggle('hidden', !data);

  if (data) {
    startPresenceHeartbeat();
    startNpcMarketHeartbeat();
    const completedJobs = await sb.rpc('complete_due_production_jobs', { p_company_id: data.id });
    if (completedJobs.error) console.warn('Produktionsabschluss:', completedJobs.error.message);
    const completedRetailSales = await sb.rpc('complete_due_retail_sales', { p_company_id: data.id });
    if (completedRetailSales.error) console.warn('Handelsabschluss:', completedRetailSales.error.message);
    // NPCs may buy suitable player orders at most once every five minutes.
    const npcTick = await sb.rpc('run_npc_market_tick');
    if (npcTick.error) console.warn('NPC-Markt-Tick:', npcTick.error.message);
    await loadGameData();
  }
}

async function loadGameData() {
  const cid = state.company.id;
  const results = await Promise.all([
    sb.from('products').select('*').eq('company_id', cid).order('name'),
    sb.from('products').select('*').eq('status','active').order('name'),
    sb.from('inventories').select('*, products(name)').eq('company_id', cid),
    sb.from('materials').select('*').eq('status','active').order('name'),
    sb.from('material_inventories').select('*').eq('company_id', cid),
    sb.from('production_recipe_inputs').select('*'),
    sb.from('building_types').select('*').order('construction_cost'),
    sb.from('company_buildings').select('*').eq('company_id', cid),
    sb.from('production_jobs').select('*').eq('company_id', cid).order('started_at', {ascending:false}).limit(500),
    sb.from('retail_sale_jobs').select('*').eq('company_id', cid).order('started_at', {ascending:false}).limit(500),
    sb.from('financial_transactions').select('*').eq('company_id', cid).order('created_at', {ascending:false}).limit(500),
    sb.from('market_orders').select('*, products(name), materials(name)').in('status',['open','partially_filled']).order('created_at',{ascending:false}).limit(100),
    sb.from('market_orders').select('*, products(name), materials(name)').in('status',['filled','cancelled']).order('created_at',{ascending:false}).limit(100),
    sb.from('contracts').select('*').or(`seller_company_id.eq.${cid},buyer_company_id.eq.${cid}`).order('created_at',{ascending:false}),
    sb.rpc('list_companies')
  ]);

  const labels = ['Produkte','Alle Produkte','Produktlager','Materialien','Materiallager','Rezepte','Gebäudetypen','Gebäude','Produktionen','Handelsverkäufe','Finanzen','Marktorders','Order-Historie','Verträge','Firmenverzeichnis'];
  const errors = results.map((r,i)=>r.error ? { label: labels[i], error:r.error } : null).filter(Boolean);
  if (errors.length) {
    console.error(errors);
    showGameDataError(errors);
    return;
  }
  clearGameDataError();

  const [products, allProducts, inventory, materials, materialInventory, recipes, buildingTypes, buildings, productionJobs, retailSaleJobs, tx, orders, history, contracts, directory] = results;
  state.products = products.data;
  state.allProducts = allProducts.data;
  state.inventory = inventory.data;
  state.materials = materials.data;
  state.materialInventory = materialInventory.data;
  state.recipes = recipes.data.filter(r => state.products.some(p => p.id === r.product_id));
  state.buildingTypes = buildingTypes.data;
  state.buildings = buildings.data;
  state.productionJobs = productionJobs.data;
  state.retailSaleJobs = retailSaleJobs.data;
  state.transactions = tx.data;
  state.marketOrders = orders.data;
  state.marketOrderHistory = history.data;
  state.contracts = contracts.data;
  state.companyDirectory = directory.data || [];
  renderAll();
}

function currentProductionContext() {
  const productId = document.getElementById('productionProduct').value;
  const product = state.products.find(p => p.id === productId);
  const buildingType = state.buildingTypes.find(b => b.id === product?.required_building_type_id);
  const building = buildingType
    ? state.buildings.find(cb => cb.building_type_id === buildingType.id && cb.status === 'active')
    : null;
  const multiplier = building ? buildingLevelMultiplier(building.level) : 1;
  const unitsPerHour = buildingType && building
    ? Number(buildingType.base_units_per_hour || 0) * multiplier
    : 0;
  const runningJob = building
    ? state.productionJobs.find(j => j.building_id === building.id && j.status === 'running')
    : null;
  return { productId, product, buildingType, building, multiplier, unitsPerHour, runningJob };
}

function productionUnitsFromInput(rawValue) {
  const raw = String(rawValue ?? '').trim().toLowerCase();
  const ctx = currentProductionContext();

  const hoursMatch = raw.match(/^(\d{1,2})\s*hrs$/i);
  if (hoursMatch) {
    const hours = Number(hoursMatch[1]);
    if (hours >= 1 && hours <= 24) {
      return {
        matchedHours: true,
        matchedTime: false,
        hours,
        units: ctx.unitsPerHour * hours
      };
    }
  }

  const timeMatch = raw.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i);
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] || 0);
    const meridiem = timeMatch[3].toLowerCase();

    if (hour >= 1 && hour <= 12) {
      if (hour === 12) hour = 0;
      if (meridiem === 'pm') hour += 12;

      const now = new Date();
      const target = new Date(now);
      target.setHours(hour, minute, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);

      const hours = (target.getTime() - now.getTime()) / 3600000;
      if (hours > 0 && hours <= 24.01) {
        return {
          matchedHours: false,
          matchedTime: true,
          hours,
          units: ctx.unitsPerHour * hours,
          targetTime: target
        };
      }
    }
  }

  const numeric = Number(raw.replace(',', '.'));
  return {
    matchedHours: false,
    matchedTime: false,
    hours: null,
    units: Number.isFinite(numeric) ? numeric : 0
  };
}

function formatProductionUnitsInput(units) {
  const value = Math.round(Number(units || 0) * 10000) / 10000;
  return String(value);
}

function handleProductionUnitsInput(event) {
  const parsed = productionUnitsFromInput(event.target.value);

  if (parsed.matchedHours || parsed.matchedTime) {
    event.target.value = formatProductionUnitsInput(parsed.units);
  }

  renderProductionRecipe();
}

function productionPlan(unitsOverride = null) {
  const ctx = currentProductionContext();
  const unitsInput = document.getElementById('productionUnits');
  const inputParsed = productionUnitsFromInput(unitsInput?.value || 0);
  let requestedUnits = unitsOverride === null ? inputParsed.units : Number(unitsOverride || 0);
  requestedUnits = Number.isFinite(requestedUnits) ? Math.max(0, requestedUnits) : 0;

  const hours = ctx.unitsPerHour > 0 ? requestedUnits / ctx.unitsPerHour : 0;
  const outputQty = requestedUnits;
  const recipe = state.recipes.filter(r => r.product_id === ctx.productId);

  const inputs = recipe.map(r => {
    let name = '–';
    let unit = '';
    let available = 0;
    let averageUnitCost = 0;
    if (r.material_id) {
      const m = state.materials.find(x => x.id === r.material_id);
      const inv = state.materialInventory.find(x => x.material_id === r.material_id);
      name = m?.name || '–';
      unit = m?.unit || '';
      available = Number(inv?.quantity || 0);
      averageUnitCost = Number(inv?.average_unit_cost || 0);
    } else {
      const p = state.products.find(x => x.id === r.component_product_id);
      const inv = state.inventory.find(x => x.product_id === r.component_product_id);
      name = p?.name || '–';
      available = Number(inv?.quantity || 0);
      averageUnitCost = Number(inv?.average_unit_cost || 0);
    }

    const required = Number(r.quantity_per_unit || 0) * outputQty;
    const inputCost = required * averageUnitCost;
    return { ...r, name, unit, available, averageUnitCost, inputCost, required, enough: available + 1e-9 >= required };
  });

  let maxUnitsByMaterial = Infinity;
  for (const input of inputs) {
    const perUnit = Number(input.quantity_per_unit || 0);
    if (perUnit > 0) maxUnitsByMaterial = Math.min(maxUnitsByMaterial, input.available / perUnit);
  }
  if (!Number.isFinite(maxUnitsByMaterial)) maxUnitsByMaterial = 0;

  const maxUnitsByTime = ctx.unitsPerHour * 24;
  const maxUnits = Math.max(0, Math.floor(Math.min(maxUnitsByMaterial, maxUnitsByTime) * 10000) / 10000);

  const procurementCost = inputs.reduce((sum, input) => sum + Number(input.inputCost || 0), 0);
  const personnelCost = ctx.buildingType
    ? Number(ctx.buildingType.labor_cost_per_unit || 0) * outputQty
    : 0;
  const productionCost = procurementCost + personnelCost;

  const materialsOk = inputs.every(i => i.enough);
  const within24h = hours > 0 && hours <= 24;
  const atLeastOne = outputQty >= 1;
  const runnable = !!ctx.building && !ctx.runningJob && atLeastOne && within24h && materialsOk;

  return {
    ...ctx,
    requestedUnits,
    outputQty,
    hours,
    inputs,
    maxUnits,
    procurementCost,
    personnelCost,
    productionCost,
    materialsOk,
    within24h,
    atLeastOne,
    runnable
  };
}

function setProductionUnits(units) {
  const input = document.getElementById('productionUnits');
  input.value = formatProductionUnitsInput(units);
  renderProductionRecipe();
}

function formatProductionDuration(hours) {
  const totalMinutes = Math.max(0, Math.round(Number(hours || 0) * 60));
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${wholeHours} Std. ${minutes} Min.`;
}

function formatProductionFinish(hours) {
  const durationHours = Number(hours || 0);
  if (!Number.isFinite(durationHours) || durationHours <= 0) return '–';

  const finish = new Date(Date.now() + durationHours * 60 * 60 * 1000);
  return finish.toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) + ' Uhr';
}

function renderProductionRecipe() {
  const plan = productionPlan();
  const { buildingType, building, multiplier, unitsPerHour, runningJob } = plan;
  const staff = buildingType && building
    ? Math.round(Number(buildingType.employees_per_building || 0) * multiplier)
    : 0;

  const statusRows = buildingType ? [
    `<div class="kv"><span>Benötigtes Gebäude</span><strong>${buildingType.name} ${building ? '✓' : '✗'}</strong></div>`,
    `<div class="kv"><span>Gebäudelevel</span><strong>${building ? `Level ${building.level}` : 'Nicht gebaut'}</strong></div>`,
    `<div class="kv"><span>Kapazität</span><strong>${building ? `${num(unitsPerHour)} Einheiten / Std.` : '–'}</strong></div>`,
    `<div class="kv"><span>Produktionsmenge</span><strong>${num(plan.outputQty)} Einheiten</strong></div>`,
    `<div class="kv"><span>Produktionsdauer</span><strong>${formatProductionDuration(plan.hours)}</strong></div>`,
    `<div class="kv"><span>Voraussichtliches Ende</span><strong>${building && plan.hours > 0 ? formatProductionFinish(plan.hours) : '–'}</strong></div>`,
    `<div class="kv"><span>Beschaffungskosten</span><strong class="production-cost-negative">-${money(Math.abs(plan.procurementCost))}</strong></div>`,
    `<div class="kv"><span>Personalkosten</span><strong class="production-cost-negative">-${money(Math.abs(plan.personnelCost))}</strong></div>`,
    `<div class="kv"><span>Produktionskosten gesamt</span><strong class="production-cost-negative">-${money(Math.abs(plan.productionCost))}</strong></div>`,
    `<div class="kv"><span>Belegschaft</span><strong>${building ? `${num(staff)} Mitarbeiter` : '–'}</strong></div>`
  ] : ['<div class="kv"><span>Benötigtes Gebäude</span><strong>Keines</strong></div>'];

  if (runningJob) {
    const finish = new Date(runningJob.finishes_at);
    statusRows.push(`<div class="production-running"><strong>Produktion läuft</strong><span>${num(runningJob.output_quantity)} Einheiten – fertig am ${finish.toLocaleString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })} Uhr</span></div>`);
  }

  document.getElementById('productionRequirement').innerHTML = statusRows.join('');

  const rows = plan.inputs.map(input => `
    <tr>
      <td>${input.material_id ? 'Material' : 'Vorprodukt'}</td>
      <td>${input.name}</td>
      <td>${num(input.quantity_per_unit)} ${input.unit}</td>
      <td class="material-amount ${input.enough ? '' : 'missing'}">${num(input.required)} ${input.unit}</td>
      <td class="material-amount ${input.enough ? '' : 'missing'}">${num(input.available)} ${input.unit}</td>
    </tr>`);

  document.getElementById('productionRecipe').innerHTML = renderTable(
    ['Typ','Input','Bedarf je Einheit','Benötigt','Bestand'],
    rows
  );

  const button = document.getElementById('productionStartBtn');
  button.classList.remove('production-ready', 'production-cancel');

  if (runningJob) {
    button.disabled = false;
    button.textContent = 'Produktion abbrechen';
    button.classList.add('production-cancel');
  } else {
    button.disabled = !plan.runnable;
    button.textContent = 'Produktion starten';
    button.classList.toggle('production-ready', plan.runnable);
  }

  const hint = document.getElementById('productionCheck');
  if (!building) {
    hint.textContent = 'Benötigtes Gebäude fehlt.';
  } else if (runningJob) {
    const refundCash = Number(runningJob.production_cash_cost || 0) * 0.95;
    hint.textContent = `Abbruch möglich: 95% der Produktionskosten (${money(refundCash)}) und 95% der Materialien werden erstattet.`;
  } else if (!plan.atLeastOne) {
    hint.textContent = 'Es muss mindestens 1 Einheit produziert werden können.';
  } else if (!plan.within24h) {
    hint.textContent = 'Die gewählte Menge überschreitet die maximale Produktionsdauer von 24 Stunden.';
  } else if (!plan.materialsOk) {
    hint.textContent = 'Nicht genügend Material für diese Produktionsmenge.';
  } else {
    hint.textContent = `Bereit: ${num(plan.outputQty)} Einheiten in ${num(plan.hours)} Std. für ${money(plan.productionCost)}.`;
  }

  scheduleProductionRefresh();
}

function scheduleProductionRefresh() {
  if (productionRefreshTimer) clearTimeout(productionRefreshTimer);
  const running = [
    ...state.productionJobs.filter(j => j.status === 'running'),
    ...state.retailSaleJobs.filter(j => j.status === 'running')
  ];
  if (!running.length) return;
  const nextFinish = Math.min(...running.map(j => new Date(j.finishes_at).getTime()));
  const delay = Math.max(1000, Math.min(2147480000, nextFinish - Date.now() + 1000));
  productionRefreshTimer = setTimeout(() => loadCompany(), delay);
}

function buildingCategoryLabel(category) {
  return category === 'retail' ? 'Verkauf' : 'Produktion';
}

function renderBuildingCatalog() {
  const table = document.getElementById('buildingCatalogTable');
  const filter = document.getElementById('buildingCategoryFilter');
  if (!table || !filter) return;

  const selectedCategory = filter.value || 'all';
  const rows = state.buildingTypes
    .filter(bt => selectedCategory === 'all' || bt.building_category === selectedCategory)
    .map(bt => {
      const existing = state.buildings.find(
        b => b.building_type_id === bt.id && b.status === 'active'
      );
      const cost = Number(bt.construction_cost || 0);

      return `<tr>
        <td>${bt.name}</td>
        <td>${buildingCategoryLabel(bt.building_category)}</td>
        <td><span class="building-construction-cost">-${money(Math.abs(cost))}</span></td>
        <td>
          <button
            class="building-catalog-build-btn"
            ${existing ? 'disabled' : ''}
            onclick="buildBuilding('${bt.id}')"
          >${existing ? 'Vorhanden' : 'Bauen'}</button>
        </td>
      </tr>`;
    });

  table.innerHTML = renderTable(
    ['Gebäude', 'Kategorie', 'Baukosten', 'Aktion'],
    rows
  );
}

function renderBuildings() {
  const builtRows = state.buildings
    .filter(building => building.status === 'active')
    .map(building => {
      const bt = state.buildingTypes.find(type => type.id === building.building_type_id);
      if (!bt) return '';

      const isRetail = bt.building_category === 'retail';
      const level = Number(building.level || 1);
      const multiplier = buildingLevelMultiplier(level);
      const staff = Math.round(Number(bt.employees_per_building || 0) * multiplier);
      const capacity = Number(bt.base_units_per_hour || 0) * multiplier;
      const nextLevel = level + 1;
      const nextPercent = buildingUpgradePercent(nextLevel);
      const nextCost = Number(bt.construction_cost || 0) * buildingLevelMultiplier(nextLevel);
      const productionRunning = state.productionJobs.some(
        j => j.building_id === building.id && j.status === 'running'
      );
      const retailRunning = state.retailSaleJobs.some(
        j => j.building_id === building.id && j.status === 'running'
      );
      const buildingInUse = productionRunning || retailRunning;
      const runningLabel = isRetail ? 'Verkauf läuft' : 'Produktion läuft';
      const reduceLabel = level <= 1 ? 'Abreißen' : 'Abstufen';

      const actionHtml = buildingInUse
        ? `<button class="building-running-btn" disabled>${runningLabel}</button>`
        : `
          <button
            class="building-upgrade-btn"
            onclick="upgradeBuilding('${building.id}','${bt.id}')"
          >Aufstufen</button>
          <button
            class="building-downgrade-btn"
            onclick="downgradeBuilding('${building.id}','${bt.id}')"
          >${reduceLabel}</button>
        `;

      return `<tr>
        <td>${bt.name}</td>
        <td>${buildingCategoryLabel(bt.building_category)}</td>
        <td>Level ${level}</td>
        <td>${num(capacity)} Einheiten</td>
        <td>${num(staff)}</td>
        <td>Level ${nextLevel}: +${num(nextPercent)}%</td>
        <td><span class="building-upgrade-cost">-${money(Math.abs(nextCost))}</span></td>
        <td class="building-actions">${actionHtml}</td>
      </tr>`;
    })
    .filter(Boolean);

  document.getElementById('buildingsTable').innerHTML = builtRows.length
    ? renderTable(
        ['Gebäude','Kategorie','Level','Kapazität / Std.','Mitarbeiter','Nächste Aufstufung','Aufstufungskosten','Aktionen'],
        builtRows
      )
    : '<p class="muted building-empty-state">Noch keine Gebäude gebaut. Nutze oben „Bauen“, um dein erstes Gebäude zu errichten.</p>';

  renderBuildingCatalog();
}

function retailSaleContext() {
  const productId = document.getElementById('retailProduct')?.value;
  const product = state.products.find(p => p.id === productId);
  const inventory = state.inventory.find(i => i.product_id === productId);
  const buildingType = state.buildingTypes.find(
    bt => bt.id === product?.required_retail_building_type_id
  );
  const building = buildingType
    ? state.buildings.find(
        b => b.building_type_id === buildingType.id && b.status === 'active'
      )
    : null;

  const multiplier = building ? buildingLevelMultiplier(building.level) : 1;
  const unitsPerHour = buildingType && building
    ? Number(buildingType.base_units_per_hour || 0) * multiplier
    : 0;
  const runningJob = building
    ? state.retailSaleJobs.find(j => j.building_id === building.id && j.status === 'running')
    : null;

  return {
    product,
    inventory,
    buildingType,
    building,
    runningJob,
    unitsPerHour,
    available: Number(inventory?.quantity || 0),
    productionCost: Number(inventory?.average_unit_cost || 0),
    price: Number(inventory?.average_unit_cost || 0) * 2
  };
}

function retailQuantityFromInput(rawValue) {
  const raw = String(rawValue ?? '').trim().toLowerCase();
  const ctx = retailSaleContext();

  const hoursMatch = raw.match(/^(\d{1,2})\s*hrs$/i);
  if (hoursMatch) {
    const hours = Number(hoursMatch[1]);
    if (hours >= 1 && hours <= 24 && ctx.unitsPerHour > 0) {
      return {
        matchedHours: true,
        matchedTime: false,
        hours,
        units: ctx.unitsPerHour * hours
      };
    }
  }

  const timeMatch = raw.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i);
  if (timeMatch && ctx.unitsPerHour > 0) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] || 0);
    const meridiem = timeMatch[3].toLowerCase();

    if (hour >= 1 && hour <= 12) {
      if (hour === 12) hour = 0;
      if (meridiem === 'pm') hour += 12;

      const now = new Date();
      const target = new Date(now);
      target.setHours(hour, minute, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);

      const hours = (target.getTime() - now.getTime()) / 3600000;
      if (hours > 0 && hours <= 24.01) {
        return {
          matchedHours: false,
          matchedTime: true,
          hours,
          units: ctx.unitsPerHour * hours,
          targetTime: target
        };
      }
    }
  }

  const numeric = Number(raw.replace(',', '.'));
  return {
    matchedHours: false,
    matchedTime: false,
    hours: null,
    units: Number.isFinite(numeric) ? numeric : 0
  };
}

function formatRetailQuantityInput(units) {
  const value = Number(units || 0);
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function renderRetailSale() {
  const select = document.getElementById('retailProduct');
  const details = document.getElementById('retailSaleDetails');
  const button = document.getElementById('retailSaleBtn');
  const qtyInput = document.getElementById('retailQty');
  if (!select || !details || !button || !qtyInput) return;

  const retailProducts = state.products.filter(p => p.required_retail_building_type_id);
  const previous = select.value;

  select.innerHTML = retailProducts.length
    ? retailProducts.map(p => `<option value="${p.id}">${p.name}</option>`).join('')
    : '<option value="">Keine Handelsprodukte verfügbar</option>';

  if (retailProducts.some(p => p.id === previous)) select.value = previous;

  const ctx = retailSaleContext();
  const parsedQty = retailQuantityFromInput(qtyInput.value);
  const qty = Number(parsedQty.units || 0);
  const hasStock = ctx.product && qty > 0 && ctx.available + 1e-9 >= qty;
  const saleHours = ctx.unitsPerHour > 0 ? qty / ctx.unitsPerHour : 0;
  const hasPrice = ctx.productionCost > 0;
  const ready = !!ctx.product && !!ctx.building && !ctx.runningJob && hasStock && hasPrice && saleHours > 0;

  details.innerHTML = ctx.product ? [
    `<div class="kv"><span>Verkaufsgebäude</span><strong>${ctx.buildingType?.name || '–'}</strong></div>`,
    `<div class="kv"><span>Gebäudestatus</span><strong class="${ctx.building ? 'retail-ready' : 'retail-missing'}">${ctx.runningJob ? 'Verkauf läuft' : (ctx.building ? 'Bereit' : 'Fehlt')}</strong></div>`,
    `<div class="kv"><span>Verkaufsrate</span><strong>${ctx.building ? `${num(ctx.unitsPerHour)} Einheiten / Std.` : '–'}</strong></div>`,
    `<div class="kv"><span>Bestand</span><strong>${num(ctx.available)} Einheiten</strong></div>`,
    `<div class="kv"><span>Produktionskosten</span><strong>${money(ctx.productionCost)} / Einheit</strong></div>`,
    `<div class="kv"><span>Verkaufspreis</span><strong>${money(ctx.price)} / Einheit</strong></div>`,
    `<div class="kv"><span>Verkaufsdauer</span><strong>${ctx.building && saleHours > 0 ? formatProductionDuration(saleHours) : '–'}</strong></div>`,
    `<div class="kv"><span>Voraussichtliches Ende</span><strong>${ctx.building && saleHours > 0 ? formatProductionFinish(saleHours) : '–'}</strong></div>`,
    `<div class="kv"><span>Erwarteter Erlös</span><strong>${money(ctx.price * Math.max(0, qty))}</strong></div>`
  ].join('') : '<p class="muted">Für dieses Unternehmen sind noch keine Handelsprodukte vorhanden.</p>';

  button.disabled = !ready;

  if (!ctx.product) {
    button.textContent = 'Kein Handelsprodukt';
  } else if (!ctx.building) {
    button.textContent = `${ctx.buildingType?.name || 'Verkaufsgebäude'} fehlt`;
  } else if (ctx.runningJob) {
    button.textContent = 'Verkauf läuft';
  } else if (!hasStock) {
    button.textContent = 'Nicht genügend Bestand';
  } else if (!hasPrice) {
    button.textContent = 'Produktionskosten fehlen';
  } else {
    button.textContent = 'Im Handel verkaufen';
  }

  scheduleProductionRefresh();
}

function renderMarket() {
  document.getElementById('marketOrders').innerHTML = renderTable(
    ['Firma','Gut','Art','Menge','Preis','Gebühr','Aktion'],
    state.marketOrders.map(o => `<tr>
      <td>${companyName(o.company_id)}</td>
      <td>${itemName(o)}</td>
      <td>${o.material_id ? 'Rohstoff' : 'Produkt'}</td>
      <td>${num(o.remaining_quantity)}</td>
      <td>${money(o.price_per_unit)}</td>
      <td>5%</td>
      <td>${o.company_id === state.company.id ? `<button onclick="cancelOrder('${o.id}')">Stornieren</button>` : `<button class="market-buy-btn" onclick="buyOrder('${o.id}')">Kaufen</button>`}</td>
    </tr>`)
  );
}

function renderMarketOrderHistory() {
  const rows = state.marketOrderHistoryFilter === 'all'
    ? state.marketOrderHistory
    : state.marketOrderHistory.filter(o => o.status === state.marketOrderHistoryFilter);

  document.getElementById('marketOrderHistory').innerHTML = renderTable(
    ['Produkt','Menge','Preis','Status','Erstellt'],
    rows.map(o => {
      const status = o.status === 'filled' ? 'Abgeschlossen' : 'Storniert';
      const statusClass = o.status === 'filled' ? 'order-status-filled' : 'order-status-cancelled';
      return `<tr><td>${itemName(o)}</td><td>${num(o.quantity)}</td><td>${money(o.price_per_unit)}</td><td><span class="badge ${statusClass}">${status}</span></td><td>${new Date(o.created_at).toLocaleString('de-DE')}</td></tr>`;
    })
  );
}

function contractItemName(c) {
  if (c.material_id) return state.materials.find(m => m.id === c.material_id)?.name || 'Material';
  return state.allProducts.find(p => p.id === c.product_id)?.name || 'Produkt';
}
function contractStatus(s) {
  return ({ proposed:'Vorgeschlagen', accepted:'Angenommen', fulfilled:'Erfüllt', cancelled:'Storniert', rejected:'Abgelehnt' })[s] || s;
}
function renderContracts() {
  const cid = state.company.id;
  document.getElementById('contractsTable').innerHTML = renderTable(
    ['Verkäufer','Käufer','Gut','Menge','Preis','Status','Aktion'],
    state.contracts.map(c => {
      let action = '–';
      if (c.status === 'proposed' && c.proposer_company_id !== cid) action = `<button onclick="acceptContract('${c.id}')">Annehmen</button>`;
      else if (c.status === 'accepted') action = `<button onclick="fulfillContract('${c.id}')">Erfüllen</button>`;
      if (['proposed','accepted'].includes(c.status)) action += ` <button class="ghost" onclick="cancelContract('${c.id}')">Stornieren</button>`;
      return `<tr><td>${companyName(c.seller_company_id)}</td><td>${companyName(c.buyer_company_id)}</td><td>${contractItemName(c)}</td><td>${num(c.quantity)}</td><td>${money(c.unit_price)}</td><td>${contractStatus(c.status)}</td><td>${action}</td></tr>`;
    })
  );

  const others = state.companyDirectory.filter(c => c.company_type === 'player' && c.id !== cid);
  document.getElementById('contractPartner').innerHTML = others.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  updateContractGoods();
}

function updateContractGoods() {
  const role = document.getElementById('contractRole').value;
  const partnerId = document.getElementById('contractPartner').value;
  const type = document.getElementById('contractItemType').value;
  let opts = [];

  if (type === 'material') {
    opts = state.materials.map(m => `<option value="${m.id}">${m.name}</option>`);
  } else {
    const sellerId = role === 'sell' ? state.company.id : partnerId;
    opts = state.allProducts.filter(p => p.company_id === sellerId).map(p => `<option value="${p.id}">${p.name}</option>`);
  }
  document.getElementById('contractItem').innerHTML = opts.join('');
}


function financePeriodStart(period) {
  const now = new Date();

  if (period === 'day') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }

  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  const start = new Date(now);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}


function financePeriodEnd(period, start) {
  const end = new Date(start);

  if (period === 'day') {
    end.setHours(23, 59, 59, 999);
    return end;
  }

  if (period === 'week') {
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  end.setMonth(end.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return end;
}

function formatFinancePeriodRange(period, start, end) {
  const shortDate = (date, includeYear = false) => date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    ...(includeYear ? { year: 'numeric' } : {})
  });

  if (period === 'day') {
    return shortDate(start, true);
  }

  if (period === 'week') {
    return `${shortDate(start)} – ${shortDate(end, true)}`;
  }

  return `${shortDate(start)} – ${shortDate(end, true)}`;
}

function renderFinanceSummary() {
  const container = document.getElementById('financeSummary');
  if (!container) return;

  const start = financePeriodStart(state.financePeriod);
  const end = financePeriodEnd(state.financePeriod, start);
  const periodRange = formatFinancePeriodRange(state.financePeriod, start, end);
  const transactions = state.transactions.filter(t => {
    const createdAt = new Date(t.created_at);
    return createdAt >= start && createdAt <= end;
  });
  const jobs = state.productionJobs.filter(j => {
    const startedAt = new Date(j.started_at);
    return startedAt >= start && startedAt <= end && j.status !== 'cancelled';
  });

  // Marktverkäufe werden in den Transaktionen netto nach Marktgebühr gespeichert.
  // Für die Übersicht rekonstruieren wir die Brutto-Einnahmen und ziehen Gebühren separat ab.
  const netSales = transactions
    .filter(t => t.transaction_type === 'market_sale')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const retailSales = transactions
    .filter(t => t.transaction_type === 'retail_sale')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const fees = Math.abs(transactions
    .filter(t => t.transaction_type === 'market_fee')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0));

  const buildingRefunds = transactions
    .filter(t => t.transaction_type === 'building_refund')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const revenue = netSales + fees + retailSales + buildingRefunds;

  // Produktionskosten = tatsächlich verbrauchte Beschaffungskosten + Personalkosten.
  const productionCosts = jobs.reduce(
    (sum, j) => sum + (Number(j.finished_unit_cost || 0) * Number(j.output_quantity || 0)),
    0
  );

  // Materialeinkäufe werden hier bewusst nicht erneut als "sonstige Kosten" gezählt,
  // da deren verbrauchter Anteil bereits in den Produktionskosten steckt.
  // Produktionsbuchungen und Marktgebühren werden ebenfalls separat ausgewiesen.
  const excludedCostTypes = new Set([
    'production',
    'production_refund',
    'market_fee',
    'market_buy'
  ]);

  const otherCosts = Math.abs(transactions
    .filter(t => Number(t.amount || 0) < 0 && !excludedCostTypes.has(t.transaction_type))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0));

  const profit = revenue - productionCosts - fees - otherCosts;
  const profitClass = profit < 0 ? 'finance-negative' : 'finance-positive';

  const periodLabel =
    state.financePeriod === 'day' ? 'Heute' :
    state.financePeriod === 'month' ? 'Aktueller Monat' :
    'Aktuelle Woche';

  container.innerHTML = `
    <div class="finance-summary-card finance-period-card"><span>Zeitraum</span><strong>${periodLabel}</strong><small>${periodRange}</small></div>
    <div class="finance-summary-card"><span>Einnahmen</span><strong>${money(revenue)}</strong></div>
    <div class="finance-summary-card finance-cost-card"><span>Produktionskosten</span><strong>-${money(productionCosts)}</strong></div>
    <div class="finance-summary-card finance-cost-card"><span>Gebühren</span><strong>-${money(fees)}</strong></div>
    <div class="finance-summary-card finance-cost-card"><span>Sonstige Kosten</span><strong>-${money(otherCosts)}</strong></div>
    <div class="finance-summary-card finance-profit-card ${profit < 0 ? 'finance-profit-loss' : 'finance-profit-gain'}"><span>Gewinn / Verlust</span><strong class="${profitClass}">${profit < 0 ? '-' : ''}${money(Math.abs(profit))}</strong></div>
  `;

  document.querySelectorAll('.finance-period-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === state.financePeriod);
  });
}

function renderAll() {
  const c = state.company;
  document.getElementById('statCompany').textContent = c.name;
  const cashValue = Number(c.cash_balance || 0);
  const statCash = document.getElementById('statCash');
  statCash.textContent = balanceMoney(cashValue);
  statCash.classList.toggle('negative-balance', cashValue < 0);
  const automaticEmployees = state.buildings
    .filter(b => b.status === 'active')
    .reduce((sum, b) => {
      const type = state.buildingTypes.find(bt => bt.id === b.building_type_id);
      const multiplier = buildingLevelMultiplier(b.level);
      return sum + Math.round(Number(type?.employees_per_building || 0) * multiplier);
    }, 0);
  document.getElementById('statEmployees').textContent = num(automaticEmployees);
  document.getElementById('statValue').textContent = money(c.company_value);

  const companyRows = [
    `<div class="kv"><span>Name</span><strong>${c.name}</strong></div>`,
    `<div class="kv"><span>Status</span><strong class="company-online-status presence-status"></strong></div>`,
    `<div class="kv"><span>Level</span><strong>${num(c.company_level)}</strong></div>`
  ].join('');
  document.getElementById('companySummary').innerHTML = companyRows;
  document.getElementById('companyDetails').innerHTML = companyRows;
  renderCompanyStatus();

  document.getElementById('recentTransactions').innerHTML = renderTable(['Betrag','Beschreibung','Zeit'], state.transactions.slice(0,8).map(t=>`<tr><td class="${transactionAmountClass(t.transaction_type)}">${money(t.amount)}</td><td>${t.description || transactionLabel(t.transaction_type)}</td><td>${new Date(t.created_at).toLocaleString('de-DE')}</td></tr>`));
  renderFinanceSummary();
  document.getElementById('financeTable').innerHTML = renderTable(['Betrag','Beschreibung','Zeit'], state.transactions.map(t=>`<tr><td class="${transactionAmountClass(t.transaction_type)}">${money(t.amount)}</td><td>${t.description || transactionLabel(t.transaction_type)}</td><td>${new Date(t.created_at).toLocaleString('de-DE')}</td></tr>`));
  document.getElementById('inventoryTable').innerHTML = renderTable(['Produkt','Menge','Ø Kosten'], state.inventory.map(i=>`<tr><td>${i.products?.name || '–'}</td><td>${num(i.quantity)}</td><td>${money(i.average_unit_cost)}</td></tr>`));
  document.getElementById('materialInventoryTable').innerHTML = renderTable(['Material','Menge','Einheit','Ø Kosten'], state.materials.map(m => {
    const i = state.materialInventory.find(x => x.material_id === m.id);
    return `<tr><td>${m.name}</td><td>${num(i?.quantity || 0)}</td><td>${m.unit}</td><td>${money(i?.average_unit_cost || 0)}</td></tr>`;
  }));

  const opts = state.products.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('productionProduct').innerHTML = opts;
  document.getElementById('sellProduct').innerHTML = opts;
  renderProductionRecipe();
  renderBuildings();
  renderRetailSale();
  renderMarket();
  renderMarketOrderHistory();
  renderContracts();

}

// Auth
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({
    email: document.getElementById('loginEmail').value.trim(),
    password: document.getElementById('loginPassword').value
  });
  msg(document.getElementById('authMessage'), error ? error.message : 'Angemeldet.', error ? 'error' : 'success');
});
document.getElementById('signupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await sb.auth.signUp({
    email: document.getElementById('signupEmail').value.trim(),
    password: document.getElementById('signupPassword').value,
    options: { emailRedirectTo: APP_URL }
  });
  msg(document.getElementById('authMessage'), error ? error.message : 'Account erstellt. Bitte ggf. E-Mail bestätigen.', error ? 'error' : 'success');
});
document.getElementById('forgotPasswordBtn').addEventListener('click', async () => {
  const input = document.getElementById('loginEmail');
  const email = input.value.trim();
  if (!email) { msg(document.getElementById('authMessage'),'Bitte zuerst E-Mail eingeben.','error'); input.focus(); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email,{redirectTo:APP_URL});
  msg(document.getElementById('authMessage'), error ? error.message : 'Passwort-Link wurde versendet.', error ? 'error' : 'success');
});
document.getElementById('recoveryForm').addEventListener('submit', async e => {
  e.preventDefault();
  const p = document.getElementById('newPassword').value;
  const c = document.getElementById('newPasswordConfirm').value;
  if (p !== c) { msg(document.getElementById('recoveryMessage'),'Die Passwörter stimmen nicht überein.','error'); return; }
  const { error } = await sb.auth.updateUser({password:p});
  if (error) { msg(document.getElementById('recoveryMessage'),error.message,'error'); return; }
  state.recoveringPassword = false;
  const { data:{session} } = await sb.auth.getSession();
  await handleSession(session);
  window.history.replaceState({},document.title,APP_URL);
});
document.getElementById('logoutBtn').addEventListener('click', async () => {
  if (state.company?.id) {
    await sb.rpc('set_company_offline', { p_company_id: state.company.id });
  }
  stopPresenceHeartbeat();
  stopNpcMarketHeartbeat();
  await sb?.auth.signOut();
});

// Company
document.getElementById('companyForm').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await sb.rpc('bootstrap_company',{
    p_name:document.getElementById('companyName').value.trim()
  });
  msg(document.getElementById('companyMessage'), error ? error.message : 'Unternehmen gegründet.', error ? 'error' : 'success');
  if (!error) await loadCompany();
});


document.getElementById('resetCompanyBtn').addEventListener('click', async () => {
  if (!state.company?.id) return;

  const confirmed = confirm(
    'Unternehmen wirklich zurücksetzen? Alle Gebäude, Lagerbestände, laufenden Produktionen, Marktaktivitäten und Finanzdaten werden gelöscht. Firmenname und Account bleiben erhalten. Startkapital danach: 50.000 OC$.'
  );
  if (!confirmed) return;

  const secondConfirmed = confirm('Letzte Bestätigung: Unternehmensfortschritt jetzt vollständig zurücksetzen?');
  if (!secondConfirmed) return;

  const { error } = await sb.rpc('reset_company', { p_company_id: state.company.id });
  if (error) {
    alert(error.message);
    return;
  }

  await loadCompany();
  alert('Unternehmen wurde zurückgesetzt. Du startest wieder mit 50.000 OC$.');
});

document.getElementById('deleteCompanyBtn').addEventListener('click', async () => {
  if (!state.session) return;

  const confirmed = confirm(
    'Account wirklich löschen? Dein Unternehmen, der komplette Spielfortschritt und dein Login-Account werden dauerhaft gelöscht. Danach musst du dich neu registrieren.'
  );
  if (!confirmed) return;

  const typed = prompt('Zur Bestätigung bitte LÖSCHEN eingeben:');
  if (typed !== 'LÖSCHEN') {
    alert('Löschen abgebrochen. Bestätigung war nicht korrekt.');
    return;
  }

  stopPresenceHeartbeat();
  stopNpcMarketHeartbeat();
  const { error } = await sb.rpc('delete_account');
  if (error) {
    alert(error.message);
    return;
  }

  state.session = null;
  state.company = null;
  try { await sb.auth.signOut(); } catch (_) {}
  window.location.reload();
});


// Production
document.getElementById('productionProduct').addEventListener('change', renderProductionRecipe);
document.getElementById('productionUnits').addEventListener('input', handleProductionUnitsInput);
document.getElementById('productionMaxBtn').addEventListener('click', () => {
  const plan = productionPlan(0);
  setProductionUnits(plan.maxUnits);
});
document.getElementById('production24Btn').addEventListener('click', () => {
  const ctx = currentProductionContext();
  setProductionUnits(ctx.unitsPerHour * 24);
});

document.getElementById('productionForm').addEventListener('submit', async e => {
  e.preventDefault();
  const plan = productionPlan();

  if (plan.runningJob) {
    if (!confirm('Produktion wirklich abbrechen? 95% der Produktionskosten und 95% der Materialien werden erstattet.')) return;
    const { error } = await sb.rpc('cancel_production', {
      p_company_id: state.company.id,
      p_job_id: plan.runningJob.id
    });
    if (error) alert(error.message); else await loadCompany();
    return;
  }

  if (!plan.runnable) {
    renderProductionRecipe();
    return;
  }

  const { error } = await sb.rpc('start_production',{
    p_company_id:state.company.id,
    p_product_id:document.getElementById('productionProduct').value,
    p_hours:plan.hours
  });
  if(error) alert(error.message); else await loadCompany();
});
window.buildBuilding = async function(buildingTypeId) {
  const bt = state.buildingTypes.find(b => b.id === buildingTypeId);
  if (!bt) return;

  if (!confirm(`${bt.name} für ${money(bt.construction_cost)} bauen?`)) return;

  const { error } = await sb.rpc('build_building', {
    p_company_id: state.company.id,
    p_building_type_id: buildingTypeId
  });

  if (error) {
    alert(error.message);
  } else {
    await loadCompany();
  }
};

window.upgradeBuilding = async function(buildingId, buildingTypeId) {
  const bt = state.buildingTypes.find(b => b.id === buildingTypeId);
  const building = state.buildings.find(b => b.id === buildingId);
  const nextLevel = Number(building?.level || 1) + 1;
  const increase = buildingUpgradePercent(nextLevel);
  const nextCost = Number(bt?.construction_cost || 0) * buildingLevelMultiplier(nextLevel);

  if (!confirm(
    `${bt?.name || 'Gebäude'} auf Level ${nextLevel} aufstufen? ` +
    `Kosten: ${money(nextCost)}. Mitarbeiter und vorhandene Gebäudekapazität: +${num(increase)}%.`
  )) return;

  const { error } = await sb.rpc('upgrade_building', {
    p_company_id: state.company.id,
    p_building_id: buildingId
  });

  if (error) {
    alert(error.message);
  } else {
    await loadCompany();
  }
};

window.downgradeBuilding = async function(buildingId, buildingTypeId) {
  const bt = state.buildingTypes.find(b => b.id === buildingTypeId);
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || !bt) return;

  const level = Number(building.level || 1);
  const isDemolition = level <= 1;
  const action = isDemolition ? 'abreißen' : `auf Level ${level - 1} abstufen`;

  const refundableCost = isDemolition
    ? Number(bt.construction_cost || 0)
    : Number(bt.construction_cost || 0) * buildingLevelMultiplier(level);
  const refund = refundableCost * 0.95;

  const warning = isDemolition
    ? `Das Gebäude wird vollständig entfernt. Erstattung: ${money(refund)} (95% der Baukosten).`
    : `Die letzte Aufstufung wird zurückgenommen. Erstattung: ${money(refund)} (95% der Kosten dieser Stufe).`;

  if (!confirm(`${bt.name} ${action}? ${warning}`)) return;

  const { error } = await sb.rpc('downgrade_building', {
    p_company_id: state.company.id,
    p_building_id: buildingId
  });

  if (error) {
    alert(error.message);
  } else {
    await loadCompany();
  }
};

const buildingBuilderBtn = document.getElementById('openBuildingBuilderBtn');
const buildingBuilder = document.getElementById('buildingBuilder');
const buildingCategoryFilter = document.getElementById('buildingCategoryFilter');

buildingBuilderBtn?.addEventListener('click', () => {
  const opening = buildingBuilder.classList.contains('hidden');
  buildingBuilder.classList.toggle('hidden');
  buildingBuilderBtn.textContent = opening ? 'Schließen' : 'Bauen';
  if (opening) renderBuildingCatalog();
});

buildingCategoryFilter?.addEventListener('change', renderBuildingCatalog);

// Market
document.getElementById('sellOrderForm').addEventListener('submit', async e => {
  e.preventDefault();
  const { error }=await sb.rpc('place_sell_order',{
    p_company_id:state.company.id,
    p_product_id:document.getElementById('sellProduct').value,
    p_quantity:Number(document.getElementById('sellQty').value),
    p_price:Number(document.getElementById('sellPrice').value)
  });
  if(error) alert(error.message); else await loadCompany();
});

document.getElementById('retailProduct').addEventListener('change', renderRetailSale);
document.getElementById('retailQty').addEventListener('input', e => {
  const parsed = retailQuantityFromInput(e.target.value);
  if (parsed.matchedHours || parsed.matchedTime) {
    e.target.value = formatRetailQuantityInput(parsed.units);
  }
  renderRetailSale();
});
document.getElementById('retailSaleForm').addEventListener('submit', async e => {
  e.preventDefault();
  const ctx = retailSaleContext();
  const parsedQuantity = retailQuantityFromInput(document.getElementById('retailQty').value);
  const quantity = Number(parsedQuantity.units || 0);

  if (!ctx.product || !ctx.building || !Number.isFinite(quantity) || quantity <= 0) {
    renderRetailSale();
    return;
  }

  const { error } = await sb.rpc('start_retail_sale', {
    p_company_id: state.company.id,
    p_product_id: ctx.product.id,
    p_quantity: quantity
  });

  if (error) {
    alert(error.message);
  } else {
    await loadCompany();
  }
});
window.buyOrder = async function(orderId) {
  const qty=Number(prompt('Wie viele Einheiten möchtest du kaufen?','1'));
  if(!Number.isFinite(qty)||qty<=0) return;
  const { error }=await sb.rpc('buy_market_order',{p_buyer_company_id:state.company.id,p_order_id:orderId,p_quantity:qty});
  if(error) alert(error.message); else await loadCompany();
};
window.cancelOrder = async function(orderId) {
  if(!confirm('Verkaufsorder wirklich stornieren?')) return;
  const { error }=await sb.rpc('cancel_market_order',{p_order_id:orderId});
  if(error) alert(error.message); else await loadCompany();
};
document.getElementById('marketOrderHistoryFilter').addEventListener('change',e=>{
  state.marketOrderHistoryFilter=e.target.value;
  renderMarketOrderHistory();
});

document.querySelectorAll('.finance-period-btn').forEach(btn => btn.addEventListener('click', () => {
  state.financePeriod = btn.dataset.period;
  renderFinanceSummary();
}));

// Contracts
['contractRole','contractPartner','contractItemType'].forEach(id => document.getElementById(id).addEventListener('change',updateContractGoods));
document.getElementById('contractForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const role=document.getElementById('contractRole').value;
  const partner=document.getElementById('contractPartner').value;
  if(!partner) { alert('Es gibt noch kein anderes Spielerunternehmen für einen Vertrag.'); return; }
  const type=document.getElementById('contractItemType').value;
  const item=document.getElementById('contractItem').value;
  const seller=role==='sell' ? state.company.id : partner;
  const buyer=role==='sell' ? partner : state.company.id;
  const { error }=await sb.rpc('create_contract',{
    p_proposer_company_id:state.company.id,
    p_seller_company_id:seller,
    p_buyer_company_id:buyer,
    p_product_id:type==='product' ? item : null,
    p_material_id:type==='material' ? item : null,
    p_quantity:Number(document.getElementById('contractQty').value),
    p_unit_price:Number(document.getElementById('contractPrice').value)
  });
  if(error) alert(error.message); else await loadCompany();
});
window.acceptContract=async id=>{ const {error}=await sb.rpc('accept_contract',{p_contract_id:id}); if(error) alert(error.message); else await loadCompany(); };
window.fulfillContract=async id=>{ const {error}=await sb.rpc('fulfill_contract',{p_contract_id:id}); if(error) alert(error.message); else await loadCompany(); };
window.cancelContract=async id=>{ const {error}=await sb.rpc('cancel_contract',{p_contract_id:id}); if(error) alert(error.message); else await loadCompany(); };

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    touchPresence();
    runNpcMarketTickAndRefresh();
  }
});

init();
