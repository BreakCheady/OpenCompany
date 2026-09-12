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
  transactions: [],
  marketOrders: [],
  marketOrderHistory: [],
  marketOrderHistoryFilter: 'all',
  contracts: [],
  companyDirectory: [],
  recoveringPassword: false
};

let presenceTimer = null;
let productionRefreshTimer = null;

const money = n => new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR', maximumFractionDigits:2 })
  .format(Number(n || 0)).replace('€','OC$');
const num = n => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(Number(n || 0));
const balanceMoney = n => `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Number(n || 0))} OC$`;

function msg(el, text, type='') { el.textContent = text; el.className = `status ${type}`; }

function transactionLabel(type) {
  return ({
    founding_capital: 'Startkapital',
    market_sale: 'Verkauf',
    market_fee: 'Gebühr',
    market_buy: 'Kauf',
    production: 'Produktion',
    production_refund: 'Erstattung Produktion',
    construction: 'Baukosten'
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
    const completedJobs = await sb.rpc('complete_due_production_jobs', { p_company_id: data.id });
    if (completedJobs.error) console.warn('Produktionsabschluss:', completedJobs.error.message);
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
    sb.from('production_jobs').select('*').eq('company_id', cid).order('started_at', {ascending:false}).limit(20),
    sb.from('financial_transactions').select('*').eq('company_id', cid).order('created_at', {ascending:false}).limit(30),
    sb.from('market_orders').select('*, products(name), materials(name)').in('status',['open','partially_filled']).order('created_at',{ascending:false}).limit(100),
    sb.from('market_orders').select('*, products(name), materials(name)').in('status',['filled','cancelled']).order('created_at',{ascending:false}).limit(100),
    sb.from('contracts').select('*').or(`seller_company_id.eq.${cid},buyer_company_id.eq.${cid}`).order('created_at',{ascending:false}),
    sb.rpc('list_companies')
  ]);

  const labels = ['Produkte','Alle Produkte','Produktlager','Materialien','Materiallager','Rezepte','Gebäudetypen','Gebäude','Produktionen','Finanzen','Marktorders','Order-Historie','Verträge','Firmenverzeichnis'];
  const errors = results.map((r,i)=>r.error ? { label: labels[i], error:r.error } : null).filter(Boolean);
  if (errors.length) {
    console.error(errors);
    showGameDataError(errors);
    return;
  }
  clearGameDataError();

  const [products, allProducts, inventory, materials, materialInventory, recipes, buildingTypes, buildings, productionJobs, tx, orders, history, contracts, directory] = results;
  state.products = products.data;
  state.allProducts = allProducts.data;
  state.inventory = inventory.data;
  state.materials = materials.data;
  state.materialInventory = materialInventory.data;
  state.recipes = recipes.data.filter(r => state.products.some(p => p.id === r.product_id));
  state.buildingTypes = buildingTypes.data;
  state.buildings = buildings.data;
  state.productionJobs = productionJobs.data;
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

  const hoursMatch = raw.match(/^(\d{1,2})\s*hrs$/i);
  if (hoursMatch) {
    const hours = Number(hoursMatch[1]);
    if (hours >= 1 && hours <= 24) {
      const ctx = currentProductionContext();
      return {
        matchedHours: true,
        hours,
        units: ctx.unitsPerHour * hours
      };
    }
  }

  const numeric = Number(raw.replace(',', '.'));
  return {
    matchedHours: false,
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

  if (parsed.matchedHours) {
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
    if (r.material_id) {
      const m = state.materials.find(x => x.id === r.material_id);
      const inv = state.materialInventory.find(x => x.material_id === r.material_id);
      name = m?.name || '–';
      unit = m?.unit || '';
      available = Number(inv?.quantity || 0);
    } else {
      const p = state.products.find(x => x.id === r.component_product_id);
      const inv = state.inventory.find(x => x.product_id === r.component_product_id);
      name = p?.name || '–';
      available = Number(inv?.quantity || 0);
    }

    const required = Number(r.quantity_per_unit || 0) * outputQty;
    return { ...r, name, unit, available, required, enough: available + 1e-9 >= required };
  });

  let maxUnitsByMaterial = Infinity;
  for (const input of inputs) {
    const perUnit = Number(input.quantity_per_unit || 0);
    if (perUnit > 0) maxUnitsByMaterial = Math.min(maxUnitsByMaterial, input.available / perUnit);
  }
  if (!Number.isFinite(maxUnitsByMaterial)) maxUnitsByMaterial = 0;

  const maxUnitsByTime = ctx.unitsPerHour * 24;
  const maxUnits = Math.max(0, Math.floor(Math.min(maxUnitsByMaterial, maxUnitsByTime) * 10000) / 10000);

  const productionCost = ctx.product && ctx.buildingType
    ? (Number(ctx.product.production_cost || 0) + Number(ctx.buildingType.labor_cost_per_unit || 0)) * outputQty
    : 0;

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
    `<div class="kv"><span>Produktionsdauer</span><strong>${num(plan.hours)} Std.</strong></div>`,
    `<div class="kv"><span>Produktionskosten</span><strong class="production-cost-negative">-${money(Math.abs(plan.productionCost))}</strong></div>`,
    `<div class="kv"><span>Belegschaft</span><strong>${building ? `${num(staff)} Mitarbeiter` : '–'}</strong></div>`
  ] : ['<div class="kv"><span>Benötigtes Gebäude</span><strong>Keines</strong></div>'];

  if (runningJob) {
    const finish = new Date(runningJob.finishes_at);
    statusRows.push(`<div class="production-running"><strong>Produktion läuft</strong><span>${num(runningJob.output_quantity)} Einheiten – fertig am ${finish.toLocaleString('de-DE')}</span></div>`);
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
  const running = state.productionJobs.filter(j => j.status === 'running');
  if (!running.length) return;
  const nextFinish = Math.min(...running.map(j => new Date(j.finishes_at).getTime()));
  const delay = Math.max(1000, Math.min(2147480000, nextFinish - Date.now() + 1000));
  productionRefreshTimer = setTimeout(() => loadCompany(), delay);
}

function renderBuildings() {
  document.getElementById('buildingsTable').innerHTML = renderTable(
    ['Gebäude','Level','Kapazität / Std.','Mitarbeiter','Nächster Ausbau','Ausbaukosten','Aktion'],
    state.buildingTypes.map(bt => {
      const building = state.buildings.find(b => b.building_type_id === bt.id && b.status === 'active');
      if (!building) {
        return `<tr>
          <td>${bt.name}</td>
          <td>–</td>
          <td>${num(bt.base_units_per_hour)} Einheiten</td>
          <td>${num(bt.employees_per_building)}</td>
          <td>Level 1</td>
          <td>${money(bt.construction_cost)}</td>
          <td><button onclick="buildBuilding('${bt.id}')">Bauen</button></td>
        </tr>`;
      }

      const level = Number(building.level || 1);
      const multiplier = buildingLevelMultiplier(level);
      const staff = Math.round(Number(bt.employees_per_building || 0) * multiplier);
      const capacity = Number(bt.base_units_per_hour || 0) * multiplier;
      const nextLevel = level + 1;
      const nextPercent = buildingUpgradePercent(nextLevel);
      const nextCost = Number(bt.construction_cost || 0) * buildingLevelMultiplier(nextLevel);
      const running = state.productionJobs.some(j => j.building_id === building.id && j.status === 'running');

      return `<tr>
        <td>${bt.name}</td>
        <td>Level ${level}</td>
        <td>${num(capacity)} Einheiten</td>
        <td>${num(staff)}</td>
        <td>Level ${nextLevel}: +${num(nextPercent)}%</td>
        <td>${money(nextCost)}</td>
        <td><button ${running ? 'disabled' : ''} onclick="upgradeBuilding('${building.id}','${bt.id}')">${running ? 'Produktion läuft' : 'Ausbauen'}</button></td>
      </tr>`;
    })
  );
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
      <td>${o.company_id === state.company.id ? `<button onclick="cancelOrder('${o.id}')">Stornieren</button>` : `<button onclick="buyOrder('${o.id}')">Kaufen</button>`}</td>
    </tr>`)
  );
}

function renderMarketOrderHistory() {
  const rows = state.marketOrderHistoryFilter === 'all'
    ? state.marketOrderHistory
    : state.marketOrderHistory.filter(o => o.status === state.marketOrderHistoryFilter);

  document.getElementById('marketOrderHistory').innerHTML = renderTable(
    ['Firma','Gut','Menge','Rest','Preis','Status','Erstellt'],
    rows.map(o => {
      const status = o.status === 'filled' ? 'Abgeschlossen' : 'Storniert';
      return `<tr><td>${companyName(o.company_id)}</td><td>${itemName(o)}</td><td>${num(o.quantity)}</td><td>${num(o.remaining_quantity)}</td><td>${money(o.price_per_unit)}</td><td><span class="badge">${status}</span></td><td>${new Date(o.created_at).toLocaleString('de-DE')}</td></tr>`;
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
  const bt=state.buildingTypes.find(b=>b.id===buildingTypeId);
  if(!confirm(`${bt?.name || 'Gebäude'} für ${money(bt?.construction_cost)} bauen?`)) return;
  const { error }=await sb.rpc('build_building',{p_company_id:state.company.id,p_building_type_id:buildingTypeId});
  if(error) alert(error.message); else await loadCompany();
};
window.upgradeBuilding = async function(buildingId, buildingTypeId) {
  const bt = state.buildingTypes.find(b => b.id === buildingTypeId);
  const building = state.buildings.find(b => b.id === buildingId);
  const nextLevel = Number(building?.level || 1) + 1;
  const increase = buildingUpgradePercent(nextLevel);
  const nextCost = Number(bt?.construction_cost || 0) * buildingLevelMultiplier(nextLevel);
  if (!confirm(`${bt?.name || 'Gebäude'} auf Level ${nextLevel} ausbauen? Kosten: ${money(nextCost)}. Kapazität und Mitarbeiter: +${num(increase)}%.`)) return;
  const { error } = await sb.rpc('upgrade_building', {
    p_company_id: state.company.id,
    p_building_id: buildingId
  });
  if (error) alert(error.message); else await loadCompany();
};

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
  if (document.visibilityState === 'visible') touchPresence();
});

init();
