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
  storageSearchFilter: '',
  storageTypeFilter: 'all',
  recipes: [],
  buildingTypes: [],
  buildings: [],
  productionJobs: [],
  retailSaleJobs: [],
  transactions: [],
  marketOrders: [],
  marketTrades: [],
  marketSearchFilter: '',
  marketTypeFilter: 'all',
  selectedMarketOrderIds: [],
  financePeriod: 'week',
  financePeriodOffset: 0,
  contracts: [],
  companyDirectory: [],
  companyDebt: 0,
  companyValueChange: 0,
  recoveringPassword: false
};

let presenceTimer = null;
let productionRefreshTimer = null;
let productionClaimDisplayTimer = null;
let npcMarketTimer = null;
let companyValueRefreshTimer = null;
let buildingConstructionTimer = null;

const money = n => new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR', maximumFractionDigits:2 })
  .format(Number(n || 0)).replace('€','OC$');
const num = n => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(Number(n || 0));
const balanceMoney = n => `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Number(n || 0))} OC$`;

function msg(el, text, type='') { el.textContent = text; el.className = `status ${type}`; }


function openGameDialog({ title='Hinweis', message='', mode='alert', defaultValue='' } = {}) {
  const overlay = document.getElementById('gameDialogOverlay');
  const titleEl = document.getElementById('gameDialogTitle');
  const messageEl = document.getElementById('gameDialogMessage');
  const inputEl = document.getElementById('gameDialogInput');
  const cancelBtn = document.getElementById('gameDialogCancel');
  const confirmBtn = document.getElementById('gameDialogConfirm');

  if (!overlay || !titleEl || !messageEl || !inputEl || !cancelBtn || !confirmBtn) {
    return Promise.resolve(mode === 'confirm' ? false : mode === 'prompt' ? null : true);
  }

  titleEl.textContent = title;
  messageEl.textContent = String(message ?? '');
  inputEl.classList.toggle('hidden', mode !== 'prompt');
  cancelBtn.classList.toggle('hidden', mode === 'alert');
  confirmBtn.textContent = mode === 'alert' ? 'OK' : 'Bestätigen';
  inputEl.value = mode === 'prompt' ? String(defaultValue ?? '') : '';

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('game-dialog-open');

  return new Promise(resolve => {
    const close = result => {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('game-dialog-open');
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      overlay.onclick = null;
      document.removeEventListener('keydown', onKeyDown);
      resolve(result);
    };

    const acceptDialog = () => close(mode === 'prompt' ? inputEl.value : true);
    const cancelDialog = () => close(mode === 'prompt' ? null : false);
    const onKeyDown = event => {
      if (event.key === 'Escape' && mode !== 'alert') cancelDialog();
      if (event.key === 'Enter' && (mode !== 'prompt' || document.activeElement === inputEl)) {
        event.preventDefault();
        acceptDialog();
      }
    };

    confirmBtn.onclick = acceptDialog;
    cancelBtn.onclick = cancelDialog;
    overlay.onclick = event => {
      if (event.target === overlay && mode !== 'alert') cancelDialog();
    };
    document.addEventListener('keydown', onKeyDown);
    setTimeout(() => (mode === 'prompt' ? inputEl : confirmBtn).focus(), 0);
  });
}

function gameAlert(message, title='Hinweis') {
  return openGameDialog({ title, message, mode:'alert' });
}

function gameConfirm(message, title='Bestätigung') {
  return openGameDialog({ title, message, mode:'confirm' });
}

function gamePrompt(message, defaultValue='', title='Eingabe') {
  return openGameDialog({ title, message, mode:'prompt', defaultValue });
}

function transactionLabel(type) {
  return ({
    founding_capital: 'Startkapital',
    market_sale: 'Marktverkauf',
    retail_sale: 'Handelsgewinn',
    retail_cancel_fee: 'Abbruchgebühr Handel',
    market_fee: 'Gebühr',
    market_buy: 'Kauf',
    production: 'Produktion',
    production_refund: 'Erstattung Produktion',
    construction: 'Baukosten',
    building_refund: 'Gebäude-Erstattung',
    research: 'Forschung',
    research_investment: 'Forschungsinvestition'
  })[type] || type;
}

function transactionAmountClass(type) {
  return ['market_fee', 'market_buy', 'production', 'construction', 'retail_cancel_fee', 'research'].includes(type) ? 'transaction-amount fee' : 'transaction-amount';
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

function buildingConstructionHours(targetLevel) {
  const level = Math.max(1, Number(targetLevel || 1));
  if (level <= 2) return 3;
  if (level === 3) return 5;
  if (level === 4) return 7;
  if (level === 5) return 10;
  return 10 + ((level - 5) * 5);
}

function formatBuildingConstructionTime(hours) {
  return `${num(hours)} Std.`;
}

function buildingConstructionFinishText(hours) {
  const finish = new Date(Date.now() + (Number(hours || 0) * 60 * 60 * 1000));
  return finish.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildingConstructionFinishDate(building) {
  if (!building?.construction_complete_at) return '–';
  return new Date(building.construction_complete_at).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatBuildingConstructionStatus(building) {
  if (!building?.construction_complete_at) return 'Im Bau';
  const target = new Date(building.construction_complete_at);
  const remainingMs = target.getTime() - Date.now();
  if (remainingMs <= 0) return 'Fertigstellung läuft …';

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `Im Bau · ${hours > 0 ? `${hours} Std. ` : ''}${minutes} Min.`;
}

async function refreshBuildingConstruction() {
  if (!sb || !state.company?.id || document.visibilityState === 'hidden') return;

  const { data, error } = await sb.rpc('complete_due_buildings', {
    p_company_id: state.company.id
  });

  if (error) {
    console.warn('Gebäudebau konnte nicht aktualisiert werden:', error.message);
    return;
  }

  if (Number(data || 0) > 0) {
    await loadGameData();
  } else if (state.buildings?.some(b => b.status === 'inactive' && b.construction_complete_at)) {
    renderBuildings();
  }
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

async function refreshCompanyValueSnapshot() {
  if (!sb || !state.company?.id || document.visibilityState === 'hidden') return;
  const cid = state.company.id;
  const [companyResult, historyResult] = await Promise.all([
    sb.from('companies').select('company_value').eq('id',cid).single(),
    sb.from('company_valuation_history').select('change_amount,calculated_at').eq('company_id',cid).order('valuation_date',{ascending:false}).limit(1)
  ]);

  if (companyResult.error || historyResult.error) return;
  state.company.company_value = Number(companyResult.data?.company_value || state.company.company_value || 0);
  state.companyValueChange = Number(historyResult.data?.[0]?.change_amount || 0);

  const valueEl = document.getElementById('statValue');
  const changeEl = document.getElementById('statValueChange');
  if (valueEl) valueEl.textContent = money(state.company.company_value);
  if (changeEl) {
    const change = state.companyValueChange;
    changeEl.textContent = change > 0 ? `+${money(change)}` : change < 0 ? `-${money(Math.abs(change))}` : money(0);
    changeEl.className = `company-value-change ${change > 0 ? 'company-value-change-positive' : change < 0 ? 'company-value-change-negative' : 'company-value-change-zero'}`;
  }
}

function startPresenceHeartbeat() {
  if (presenceTimer) clearInterval(presenceTimer);
  touchPresence();
  presenceTimer = setInterval(touchPresence, 60000);
  if (companyValueRefreshTimer) clearInterval(companyValueRefreshTimer);
  refreshCompanyValueSnapshot();
  companyValueRefreshTimer = setInterval(refreshCompanyValueSnapshot, 60000);

  if (buildingConstructionTimer) clearInterval(buildingConstructionTimer);
  buildingConstructionTimer = setInterval(refreshBuildingConstruction, 60000);
}

function stopPresenceHeartbeat() {
  if (presenceTimer) clearInterval(presenceTimer);
  presenceTimer = null;
  if (companyValueRefreshTimer) clearInterval(companyValueRefreshTimer);
  companyValueRefreshTimer = null;
  if (buildingConstructionTimer) clearInterval(buildingConstructionTimer);
  buildingConstructionTimer = null;
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
    const completedBuildings = await sb.rpc('complete_due_buildings', { p_company_id: data.id });
    if (completedBuildings.error) console.warn('Gebäudebau:', completedBuildings.error.message);
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
    sb.from('market_trades').select('id,buyer_company_id,seller_company_id,product_id,material_id,quantity,price_per_unit,total_value,executed_at,products(name,category)').eq('buyer_company_id',cid).order('executed_at',{ascending:false}).limit(500),
    sb.from('contracts').select('*').or(`seller_company_id.eq.${cid},buyer_company_id.eq.${cid}`).order('created_at',{ascending:false}),
    sb.rpc('list_companies'),
    sb.rpc('get_company_debt', { p_company_id: cid }),
    sb.from('company_valuation_history').select('valuation_date,company_value,previous_company_value,change_amount,calculated_at').eq('company_id',cid).order('valuation_date',{ascending:false}).limit(1)
  ]);

  const labels = ['Produkte','Alle Produkte','Produktlager','Materialien','Materiallager','Rezepte','Gebäudetypen','Gebäude','Produktionen','Handelsverkäufe','Finanzen','Marktorders','Marktkäufe','Verträge','Firmenverzeichnis','Kreditschulden','Unternehmenswert-Verlauf'];
  const errors = results.map((r,i)=>r.error ? { label: labels[i], error:r.error } : null).filter(Boolean);
  if (errors.length) {
    console.error(errors);
    showGameDataError(errors);
    return;
  }
  clearGameDataError();

  const [products, allProducts, inventory, materials, materialInventory, recipes, buildingTypes, buildings, productionJobs, retailSaleJobs, tx, orders, marketTrades, contracts, directory, companyDebt, valuationHistory] = results;
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
  state.marketTrades = marketTrades.data || [];
  state.contracts = contracts.data;
  state.companyDirectory = directory.data || [];
  state.companyDebt = Number(companyDebt.data || 0);
  state.companyValueChange = Number(valuationHistory.data?.[0]?.change_amount || 0);
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
        units: Math.floor(ctx.unitsPerHour * hours)
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
          units: Math.floor(ctx.unitsPerHour * hours),
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
    units: Number.isFinite(numeric) ? Math.floor(numeric) : 0
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

function marketOrdersForProductionInput(input) {
  return state.marketOrders
    .filter(order =>
      order.order_type === 'sell' &&
      ['open', 'partially_filled'].includes(order.status) &&
      order.company_id !== state.company?.id &&
      Number(order.remaining_quantity || 0) > 0 &&
      (
        (input.material_id && order.material_id === input.material_id) ||
        (input.component_product_id && order.product_id === input.component_product_id)
      )
    )
    .sort((a, b) => Number(a.price_per_unit || 0) - Number(b.price_per_unit || 0));
}

function estimateMissingInputPurchase(input) {
  const missing = Math.max(0, Number(input.required || 0) - Number(input.available || 0));
  if (missing <= 0) return { missing: 0, availableOnMarket: 0, estimatedCost: 0, fullyAvailable: true };

  const orders = marketOrdersForProductionInput(input);
  let remaining = missing;
  let availableOnMarket = 0;
  let estimatedCost = 0;

  for (const order of orders) {
    if (remaining <= 1e-9) break;
    const orderQty = Number(order.remaining_quantity || 0);
    const take = Math.min(remaining, orderQty);
    availableOnMarket += take;
    estimatedCost += take * Number(order.price_per_unit || 0);
    remaining -= take;
  }

  // Wenn der Markt die komplette Fehlmenge nicht deckt, wird der ungedeckte Rest
  // mit einem stabilen Referenzpreis geschätzt, damit offene Beschaffungskosten nicht 0 werden.
  if (remaining > 1e-9) {
    let fallbackPrice = 0;
    if (input.material_id) {
      fallbackPrice = Number(state.materials.find(m => m.id === input.material_id)?.base_cost || 0);
    } else if (input.component_product_id) {
      const product = state.products.find(p => p.id === input.component_product_id);
      fallbackPrice = Number(product?.suggested_retail_price || input.averageUnitCost || 0);
    }
    estimatedCost += remaining * fallbackPrice;
  }

  return {
    missing,
    availableOnMarket,
    estimatedCost,
    fullyAvailable: availableOnMarket + 1e-9 >= missing
  };
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
    const enough = available + 1e-9 >= required;
    const input = { ...r, name, unit, available, averageUnitCost, required, enough };
    const purchase = estimateMissingInputPurchase(input);
    return {
      ...input,
      missing: purchase.missing,
      openProcurementCost: purchase.estimatedCost,
      marketAvailable: purchase.availableOnMarket,
      marketFullyAvailable: purchase.fullyAvailable
    };
  });

  let maxUnitsByMaterial = Infinity;
  for (const input of inputs) {
    const perUnit = Number(input.quantity_per_unit || 0);
    if (perUnit > 0) maxUnitsByMaterial = Math.min(maxUnitsByMaterial, input.available / perUnit);
  }
  const maxUnitsByTime = ctx.unitsPerHour * 24;
  if (!Number.isFinite(maxUnitsByMaterial)) maxUnitsByMaterial = maxUnitsByTime;
  const maxUnits = Math.max(0, Math.floor(Math.min(maxUnitsByMaterial, maxUnitsByTime) * 10000) / 10000);

  const procurementCost = inputs.reduce((sum, input) => sum + Number(input.openProcurementCost || 0), 0);
  const baseProductionCost = ctx.product?.category === 'research'
    ? Number(ctx.product.production_cost || 0) * outputQty
    : 0;
  const personnelCost = ctx.buildingType
    ? Number(ctx.buildingType.labor_cost_per_unit || 0) * outputQty
    : 0;
  const productionCost = procurementCost + baseProductionCost + personnelCost;

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
    baseProductionCost,
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

function productionClaimableQuantity(job) {
  if (!job || job.status !== 'running') return 0;

  const output = Number(job.output_quantity || 0);
  const claimed = Number(job.claimed_quantity || 0);
  const unitsPerHour = Number(job.units_per_hour || 0);
  const startedAt = new Date(job.started_at).getTime();
  const finishesAt = new Date(job.finishes_at).getTime();
  const now = Date.now();

  let produced;
  if (now >= finishesAt) {
    produced = output;
  } else {
    const elapsedHours = Math.max(0, (now - startedAt) / 3600000);
    produced = Math.min(output, Math.floor(unitsPerHour * elapsedHours));
  }

  return Math.max(0, produced - claimed);
}

function productionProductDisplayName(name, quantity) {
  if (name === 'Elektronikmodul' && Number(quantity) !== 1) return 'Elektronikmodule';
  if (name === 'Smartphone' && Number(quantity) !== 1) return 'Smartphones';
  return name || 'Einheiten';
}

function startProductionClaimDisplayTimer() {
  if (productionClaimDisplayTimer) clearInterval(productionClaimDisplayTimer);
  productionClaimDisplayTimer = null;

  const hasRunningActivity =
    state.productionJobs.some(j => j.status === 'running') ||
    state.retailSaleJobs.some(j => j.status === 'running');
  if (!hasRunningActivity) return;

  productionClaimDisplayTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (document.getElementById('production')?.classList.contains('active-view')) {
      renderProductionRecipe();
    }
    if (document.getElementById('market')?.classList.contains('active-view')) {
      renderRetailSale();
    }
  }, 10000);
}

function renderProductionRecipe() {
  let plan = productionPlan();
  let { buildingType, building, multiplier, unitsPerHour, runningJob } = plan;
  const productSelect = document.getElementById('productionProduct');
  const unitsInput = document.getElementById('productionUnits');
  const maxBtn = document.getElementById('productionMaxBtn');
  const h24Btn = document.getElementById('production24Btn');

  // Während einer laufenden Produktion bleibt der komplette Startzustand sichtbar.
  // Die Werte stammen persistent aus dem Produktionsauftrag und überleben auch Seiten-Reloads.
  if (runningJob) {
    productSelect.dataset.runningJobId = runningJob.id;
    unitsInput.value = runningJob.start_input_text || formatProductionUnitsInput(runningJob.output_quantity);
    productSelect.disabled = false;
    unitsInput.disabled = true;
    if (maxBtn) maxBtn.disabled = true;
    if (h24Btn) h24Btn.disabled = true;

    // Das Produkt-Dropdown bleibt frei wählbar, damit andere Produktionsgebäude parallel genutzt werden können.
    // Die angezeigten Startwerte des laufenden Auftrags bleiben eingefroren.
    plan = productionPlan(Number(runningJob.output_quantity || 0));
    ({ buildingType, building, multiplier, unitsPerHour, runningJob } = plan);
  } else {
    const hadRunningJob = !!productSelect.dataset.runningJobId;
    delete productSelect.dataset.runningJobId;
    productSelect.disabled = false;
    unitsInput.disabled = false;
    if (maxBtn) maxBtn.disabled = false;
    if (h24Btn) h24Btn.disabled = false;

    if (hadRunningJob) {
      unitsInput.value = '1';
      plan = productionPlan();
      ({ buildingType, building, multiplier, unitsPerHour, runningJob } = plan);
    }
  }

  const staff = buildingType && building
    ? Math.round(Number(buildingType.employees_per_building || 0) * multiplier)
    : 0;

  const startSnapshot = runningJob?.start_snapshot || {};
  const displayOutputQty = runningJob ? Number(startSnapshot.outputQty ?? runningJob.output_quantity ?? 0) : plan.outputQty;
  const displayHours = runningJob ? Number(startSnapshot.hours ?? runningJob.hours ?? 0) : plan.hours;
  const displayProcurementCost = runningJob ? Number(startSnapshot.procurementCost ?? 0) : plan.procurementCost;
  const displayBaseProductionCost = runningJob ? Number(startSnapshot.baseProductionCost ?? 0) : plan.baseProductionCost;
  const displayPersonnelCost = runningJob ? Number(startSnapshot.personnelCost ?? runningJob.production_cash_cost ?? 0) : plan.personnelCost;
  const displayProductionCost = runningJob
    ? Number(startSnapshot.productionCost ?? (displayProcurementCost + displayPersonnelCost))
    : plan.productionCost;
  const displayFinish = runningJob
    ? new Date(runningJob.finishes_at).toLocaleString('de-DE', {
        weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
      }) + ' Uhr'
    : (building && plan.hours > 0 ? formatProductionFinish(plan.hours) : '–');

  const statusRows = buildingType ? [
    `<div class="kv"><span>Benötigtes Gebäude</span><strong>${buildingType.name} ${building ? '✓' : '✗'}</strong></div>`,
    `<div class="kv"><span>Gebäudelevel</span><strong>${building ? `Level ${building.level}` : 'Nicht gebaut'}</strong></div>`,
    `<div class="kv"><span>Kapazität</span><strong>${building ? `${num(unitsPerHour)} Einheiten / Std.` : '–'}</strong></div>`,
    `<div class="kv"><span>Produktionsmenge</span><strong>${num(displayOutputQty)} Einheiten</strong></div>`,
    `<div class="kv"><span>Produktionsdauer</span><strong>${formatProductionDuration(displayHours)}</strong></div>`,
    `<div class="kv"><span>Voraussichtliches Ende</span><strong>${displayFinish}</strong></div>`,
    ...(plan.product?.category === 'research'
      ? [`<div class="kv"><span>Grund-Produktionskosten</span><strong class="production-cost-negative">-${money(Math.abs(displayBaseProductionCost))}</strong></div>`]
      : [`<div class="kv"><span>Beschaffungskosten</span><strong class="${displayProcurementCost > 0 ? 'production-cost-negative' : 'production-cost-zero'}">${displayProcurementCost > 0 ? '-' : ''}${money(Math.abs(displayProcurementCost))}</strong></div>`]),
    `<div class="kv"><span>Personalkosten</span><strong class="production-cost-negative">-${money(Math.abs(displayPersonnelCost))}</strong></div>`,
    `<div class="kv"><span>Produktionskosten gesamt</span><strong class="production-cost-negative">-${money(Math.abs(displayProductionCost))}</strong></div>`,
    `<div class="kv"><span>Belegschaft</span><strong>${building ? `${num(staff)} Mitarbeiter` : '–'}</strong></div>`
  ] : ['<div class="kv"><span>Benötigtes Gebäude</span><strong>Keines</strong></div>'];

  if (runningJob) {
    const finish = new Date(runningJob.finishes_at);
    const claimable = productionClaimableQuantity(runningJob);
    const runningProduct = state.products.find(p => p.id === runningJob.product_id);
    const productName = productionProductDisplayName(runningProduct?.name, claimable);

    statusRows.push(`<div class="production-running">
      <div class="production-running-main">
        <div>
          <strong>Produktion läuft</strong>
          <span>${num(Math.max(0, Number(runningJob.output_quantity || 0) - Number(runningJob.claimed_quantity || 0)))} Einheiten – fertig am ${finish.toLocaleString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })} Uhr</span>
        </div>
        <button type="button" class="production-claim-btn" ${claimable <= 0 ? 'disabled' : ''} onclick="claimProductionOutput('${runningJob.id}')">Abrufen</button>
      </div>
      <div class="production-claimable ${claimable > 0 ? 'has-output' : ''}">Abrufbar: <strong>${num(claimable)} ${productName}</strong></div>
    </div>`);
  }

  document.getElementById('productionRequirement').innerHTML = statusRows.join('');

  const rows = plan.inputs.map(input => {
    const inputId = input.material_id || input.component_product_id;
    const inputKind = input.material_id ? 'material' : 'product';
    const buyButton = input.enough
      ? ''
      : `<button type="button" class="production-buy-input-btn" onclick="buyMissingProductionInput('${inputKind}','${inputId}')">Kaufen</button>`;

    return `<tr>
      <td>${input.material_id ? 'Material' : 'Vorprodukt'}</td>
      <td>${input.name}</td>
      <td>${num(input.quantity_per_unit)} ${input.unit}</td>
      <td class="material-amount ${input.enough ? '' : 'missing'}">${num(input.required)} ${input.unit}</td>
      <td class="material-amount ${input.enough ? '' : 'missing'}">${num(input.available)} ${input.unit}</td>
      <td>${buyButton}</td>
    </tr>`;
  });

  document.getElementById('productionRecipe').innerHTML = rows.length
    ? renderTable(['Typ','Input','Bedarf je Einheit','Benötigt','Bestand','Aktion'], rows)
    : (plan.product?.category === 'research'
      ? '<div class="research-production-note">Keine Rohstoffe benötigt. Forschungseinheiten benötigen ausschließlich Geld: 12 OC$ Grundkosten + 14 OC$ Personalkosten pro Einheit.</div>'
      : renderTable(['Typ','Input','Bedarf je Einheit','Benötigt','Bestand','Aktion'], rows));

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
  hint.classList.toggle('missing-building-warning', !building);
  if (!building) {
    hint.textContent = 'Benötigtes Gebäude fehlt.';
  } else if (runningJob) {
    const refundCash = Number(runningJob.production_cash_cost || 0) * 0.90;
    hint.textContent = `Abbruch möglich: 90% der Produktionskosten (${money(refundCash)}) und 90% der Materialien werden erstattet.`;
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
  if (category === 'retail') return 'Verkauf';
  if (category === 'research') return 'Forschung';
  return 'Produktion';
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
        b => b.building_type_id === bt.id
      );
      const cost = Number(bt.construction_cost || 0);
      const buildHours = buildingConstructionHours(1);
      const existingLabel = existing?.status === 'inactive' ? 'Im Bau' : 'Vorhanden';

      return `<tr>
        <td>${bt.name}</td>
        <td>${buildingCategoryLabel(bt.building_category)}</td>
        <td><span class="building-construction-cost">-${money(Math.abs(cost))}</span></td>
        <td>${formatBuildingConstructionTime(buildHours)}</td>
        <td>
          <button
            class="building-catalog-build-btn"
            ${existing ? 'disabled' : ''}
            onclick="buildBuilding('${bt.id}')"
          >${existing ? existingLabel : 'Bauen'}</button>
        </td>
      </tr>`;
    });

  table.innerHTML = renderTable(
    ['Gebäude', 'Kategorie', 'Baukosten', 'Bauzeit', 'Aktion'],
    rows
  );
}

function renderBuildings() {
  const builtRows = state.buildings
    .map(building => {
      const bt = state.buildingTypes.find(type => type.id === building.building_type_id);
      if (!bt) return '';

      const isUnderConstruction = building.status === 'inactive' && !!building.construction_complete_at;
      const isRetail = bt.building_category === 'retail';
      const level = Number(building.level || 1);
      const targetLevel = Number(building.construction_target_level || level);
      const multiplier = buildingLevelMultiplier(level);
      const staff = Math.round(Number(bt.employees_per_building || 0) * multiplier);
      const capacity = Number(bt.base_units_per_hour || 0) * multiplier;
      const nextLevel = level + 1;
      const nextPercent = buildingUpgradePercent(nextLevel);
      const nextCost = Number(bt.construction_cost || 0) * buildingLevelMultiplier(nextLevel);
      const nextBuildHours = buildingConstructionHours(nextLevel);

      if (isUnderConstruction) {
        return `<tr>
          <td>${bt.name}</td>
          <td>${buildingCategoryLabel(bt.building_category)}</td>
          <td>Level ${targetLevel}</td>
          <td>–</td>
          <td>–</td>
          <td><span class="badge">${formatBuildingConstructionStatus(building)}</span></td>
          <td>–</td>
          <td>${buildingConstructionFinishDate(building)}</td>
          <td class="building-actions"><button disabled>Im Bau</button></td>
        </tr>`;
      }

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
        <td>Level ${nextLevel}: ${formatBuildingConstructionTime(nextBuildHours)}</td>
        <td><span class="building-upgrade-cost">-${money(Math.abs(nextCost))}</span></td>
        <td>–</td>
        <td class="building-actions">${actionHtml}</td>
      </tr>`;
    })
    .filter(Boolean);

  document.getElementById('buildingsTable').innerHTML = builtRows.length
    ? renderTable(
        ['Gebäude','Kategorie','Level','Kapazität / Std.','Mitarbeiter','Status / nächste Bauzeit','Aufstufungskosten','Fertig am','Aktionen'],
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
          units: Math.floor(ctx.unitsPerHour * hours),
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
    units: Number.isFinite(numeric) ? Math.floor(numeric) : 0
  };
}

function formatRetailQuantityInput(units) {
  const value = Number(units || 0);
  if (!Number.isFinite(value)) return '0';
  return String(Math.max(0, Math.floor(value)));
}

function retailSoldQuantity(job) {
  if (!job || job.status !== 'running') return 0;
  const quantity = Number(job.quantity || 0);
  const unitsPerHour = Number(job.units_per_hour || 0);
  const startedAt = new Date(job.started_at).getTime();
  const finishesAt = new Date(job.finishes_at).getTime();
  const now = Date.now();

  if (now >= finishesAt) return quantity;
  const elapsedHours = Math.max(0, (now - startedAt) / 3600000);
  return Math.min(quantity, Math.floor(unitsPerHour * elapsedHours));
}

function retailSaleProgress(job) {
  if (!job) {
    return {
      sold: 0,
      claimed: 0,
      claimableUnits: 0,
      unitPrice: 0,
      claimableRevenue: 0,
      openRevenue: 0,
      cancellationFee: 0
    };
  }

  const quantity = Number(job.quantity || 0);
  const claimed = Number(job.claimed_quantity || 0);
  const sold = retailSoldQuantity(job);
  const claimableUnits = Math.max(0, sold - claimed);
  const unitPrice = quantity > 0 ? Number(job.total_value || 0) / quantity : 0;

  return {
    sold,
    claimed,
    claimableUnits,
    unitPrice,
    claimableRevenue: claimableUnits * unitPrice,
    openRevenue: Math.max(0, Number(job.total_value || 0) - claimed * unitPrice),
    cancellationFee: Number(job.total_value || 0) * 0.20
  };
}

function renderRetailSale() {
  const select = document.getElementById('retailProduct');
  const details = document.getElementById('retailSaleDetails');
  const button = document.getElementById('retailSaleBtn');
  const qtyInput = document.getElementById('retailQty');
  const maxBtn = document.getElementById('retailMaxBtn');
  const h24Btn = document.getElementById('retail24Btn');
  if (!select || !details || !button || !qtyInput) return;

  const retailProducts = state.products.filter(p => p.required_retail_building_type_id);
  const previous = select.value;

  select.innerHTML = retailProducts.length
    ? retailProducts.map(p => `<option value="${p.id}">${p.name}</option>`).join('')
    : '<option value="">Keine Handelsprodukte verfügbar</option>';

  if (retailProducts.some(p => p.id === previous)) select.value = previous;

  let ctx = retailSaleContext();

  // Während eines laufenden Verkaufs bleibt der komplette Startzustand sichtbar.
  if (ctx.runningJob) {
    select.dataset.runningJobId = ctx.runningJob.id;
    select.value = ctx.runningJob.product_id;
    qtyInput.value = ctx.runningJob.start_input_text || formatRetailQuantityInput(ctx.runningJob.quantity);
    ctx = retailSaleContext();
  } else if (select.dataset.runningJobId) {
    delete select.dataset.runningJobId;
    qtyInput.value = '1';
  }

  const parsedQty = retailQuantityFromInput(qtyInput.value);
  const qty = Number(parsedQty.units || 0);
  const wholeUnits = Number.isInteger(qty);
  const hasStock = ctx.product && qty > 0 && wholeUnits && ctx.available + 1e-9 >= qty;
  const saleHours = ctx.unitsPerHour > 0 ? qty / ctx.unitsPerHour : 0;
  const hasPrice = ctx.productionCost > 0;
  const ready = !!ctx.product && !!ctx.building && !ctx.runningJob && hasStock && hasPrice && saleHours > 0;

  button.classList.remove('retail-cancel-mode');
  select.disabled = !!ctx.runningJob;
  qtyInput.disabled = !!ctx.runningJob;
  if (maxBtn) maxBtn.disabled = !!ctx.runningJob;
  if (h24Btn) h24Btn.disabled = !!ctx.runningJob;

  if (ctx.runningJob) {
    const job = ctx.runningJob;
    const progress = retailSaleProgress(job);
    const runningProduct = state.products.find(p => p.id === job.product_id);
    const finish = new Date(job.finishes_at);
    const remainingUnits = Math.max(0, Number(job.quantity || 0) - progress.sold);

    const startSnapshot = job.start_snapshot || {};
    const startQty = Number(startSnapshot.quantity ?? job.quantity ?? 0);
    const startHours = Number(startSnapshot.hours ?? ((new Date(job.finishes_at) - new Date(job.started_at)) / 3600000));
    const startUnitPrice = Number(startSnapshot.unitPrice ?? (startQty > 0 ? Number(job.total_value || 0) / startQty : 0));
    const startTotalValue = Number(startSnapshot.totalValue ?? job.total_value ?? 0);
    const startUnitsPerHour = Number(startSnapshot.unitsPerHour ?? job.units_per_hour ?? 0);
    const startAvailable = Number(startSnapshot.available ?? 0);

    details.innerHTML = `
      <div class="kv"><span>Verkaufsgebäude</span><strong>${startSnapshot.buildingTypeName || ctx.buildingType?.name || '–'}</strong></div>
      <div class="kv"><span>Gebäudestatus</span><strong class="retail-ready">Verkauf läuft</strong></div>
      <div class="kv"><span>Verkaufsrate</span><strong>${num(startUnitsPerHour)} Einheiten / Std.</strong></div>
      <div class="kv"><span>Bestand beim Start</span><strong>${num(startAvailable)} Einheiten</strong></div>
      <div class="kv"><span>Verkaufspreis</span><strong>${money(startUnitPrice)} / Einheit</strong></div>
      <div class="kv"><span>Verkaufsdauer</span><strong>${formatProductionDuration(startHours)}</strong></div>
      <div class="kv"><span>Voraussichtliches Ende</span><strong>${finish.toLocaleString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })} Uhr</strong></div>
      <div class="kv"><span>Erwarteter Erlös</span><strong>${money(startTotalValue)}</strong></div>
      <div class="retail-running-box">
        <div class="retail-running-head">
          <div>
            <strong>Verkauf läuft</strong>
            <span>${num(remainingUnits)} ${productionProductDisplayName(runningProduct?.name, remainingUnits)} noch offen – fertig am ${finish.toLocaleString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })} Uhr</span>
          </div>
          <button type="button" class="retail-collect-btn" ${progress.claimableUnits <= 0 ? 'disabled' : ''} onclick="collectRetailRevenue('${job.id}')">Einsammeln</button>
        </div>
        <div class="kv"><span>Bereits verkauft</span><strong>${num(progress.sold)} ${productionProductDisplayName(runningProduct?.name, progress.sold)}</strong></div>
        <div class="kv"><span>Einsammelbarer Erlös</span><strong class="retail-revenue-positive">${money(progress.claimableRevenue)}</strong></div>
        <div class="kv"><span>Erwarteter Erlös (offen)</span><strong>${money(progress.openRevenue)}</strong></div>
        <div class="kv"><span>Abbruchgebühr</span><strong class="retail-cancel-fee">-${money(progress.cancellationFee)}</strong></div>
      </div>`;

    button.disabled = false;
    button.textContent = 'Verkauf abbrechen';
    button.classList.add('retail-cancel-mode');
    startProductionClaimDisplayTimer();
    scheduleProductionRefresh();
    return;
  }

  details.innerHTML = ctx.product ? [
    `<div class="kv"><span>Verkaufsgebäude</span><strong>${ctx.buildingType?.name || '–'}</strong></div>`,
    `<div class="kv"><span>Gebäudestatus</span><strong class="${ctx.building ? 'retail-ready' : 'missing-building-warning'}">${ctx.building ? 'Bereit' : 'Benötigtes Gebäude fehlt'}</strong></div>`,
    `<div class="kv"><span>Verkaufsrate</span><strong>${ctx.building ? `${num(ctx.unitsPerHour)} Einheiten / Std.` : '–'}</strong></div>`,
    `<div class="kv"><span>Bestand</span><strong>${num(ctx.available)} Einheiten</strong></div>`,
    `<div class="kv"><span>Verkaufspreis</span><strong>${money(ctx.price)} / Einheit</strong></div>`,
    `<div class="kv"><span>Verkaufsdauer</span><strong>${ctx.building && saleHours > 0 ? formatProductionDuration(saleHours) : '–'}</strong></div>`,
    `<div class="kv"><span>Voraussichtliches Ende</span><strong>${ctx.building && saleHours > 0 ? formatProductionFinish(saleHours) : '–'}</strong></div>`,
    `<div class="kv"><span>Erwarteter Erlös</span><strong>${money(ctx.price * Math.max(0, qty))}</strong></div>`
  ].join('') : '<p class="muted">Für dieses Unternehmen sind noch keine Handelsprodukte vorhanden.</p>';

  button.disabled = !ready;

  if (!ctx.product) {
    button.textContent = 'Kein Handelsprodukt';
  } else if (!ctx.building) {
    button.textContent = 'Benötigtes Gebäude fehlt';
  } else if (!wholeUnits) {
    button.textContent = 'Nur ganze Einheiten';
  } else if (!hasStock) {
    button.textContent = 'Nicht genügend Bestand';
  } else if (!hasPrice) {
    button.textContent = 'Produktionskosten fehlen';
  } else {
    button.textContent = 'Im Handel verkaufen';
  }

  startProductionClaimDisplayTimer();
  scheduleProductionRefresh();
}

function filteredMarketOrders() {
  const search = String(state.marketSearchFilter || '').trim().toLocaleLowerCase('de-DE');
  const type = state.marketTypeFilter || 'all';

  let orders = state.marketOrders.filter(o => {
    const matchesType =
      type === 'all' ||
      (type === 'material' && !!o.material_id) ||
      (type === 'product' && !!o.product_id);

    if (!matchesType) return false;
    if (!search) return true;

    const item = itemName(o).toLocaleLowerCase('de-DE');
    const company = companyName(o.company_id).toLocaleLowerCase('de-DE');
    const kind = o.material_id ? 'rohstoff material' : 'produkt';
    return item.includes(search) || company.includes(search) || kind.includes(search);
  });

  orders = [...orders].sort((a,b) =>
    itemName(a).localeCompare(itemName(b), 'de-DE') ||
    Number(a.price_per_unit || 0) - Number(b.price_per_unit || 0) ||
    companyName(a.company_id).localeCompare(companyName(b.company_id), 'de-DE')
  );

  return orders;
}

function selectedMarketOrders() {
  return state.selectedMarketOrderIds
    .map(id => state.marketOrders.find(o => o.id === id))
    .filter(Boolean);
}

function marketOrderItemKey(order) {
  if (order.material_id) return `material:${order.material_id}`;
  const product = state.allProducts.find(p => p.id === order.product_id);
  return product ? `product:${product.name}:${product.category}` : `product:${order.product_id}`;
}

function updateMarketBuyPreview() {
  const qtyInput = document.getElementById('marketBuyQty');
  const totalEl = document.getElementById('marketBuyTotal');
  const buyBtn = document.getElementById('marketBuyCheapest');
  if (!qtyInput || !totalEl || !buyBtn) return;

  const selected = selectedMarketOrders().filter(o => o.company_id !== state.company?.id);
  const qty = Number(qtyInput.value || 0);
  const validQty = Number.isFinite(qty) && qty > 0;

  if (!selected.length) {
    totalEl.textContent = 'Position auswählen';
    buyBtn.disabled = true;
    return;
  }

  if (!validQty) {
    totalEl.textContent = '–';
    buyBtn.disabled = true;
    return;
  }

  const keys = [...new Set(selected.map(marketOrderItemKey))];
  if (keys.length !== 1) {
    totalEl.textContent = 'Nur gleicher Artikel';
    buyBtn.disabled = true;
    return;
  }

  const sorted = [...selected].sort((a,b) => Number(a.price_per_unit || 0) - Number(b.price_per_unit || 0));
  const available = sorted.reduce((sum,o) => sum + Number(o.remaining_quantity || 0), 0);
  let remaining = qty;
  let total = 0;

  for (const order of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(order.remaining_quantity || 0));
    total += take * Number(order.price_per_unit || 0);
    remaining -= take;
  }

  totalEl.textContent = remaining > 0 ? `Max. ${num(available)} verfügbar` : money(total);
  buyBtn.disabled = remaining > 0;
}

function toggleMarketOrderSelection(orderId) {
  const order = state.marketOrders.find(o => o.id === orderId);
  if (!order) return;

  const current = selectedMarketOrders();
  const exists = state.selectedMarketOrderIds.includes(orderId);

  if (exists) {
    state.selectedMarketOrderIds = state.selectedMarketOrderIds.filter(id => id !== orderId);
    renderMarket();
    return;
  }

  if (order.company_id === state.company?.id) {
    return;
  }

  if (current.length) {
    const currentKey = marketOrderItemKey(current[0]);
    const newKey = marketOrderItemKey(order);
    if (currentKey !== newKey) {
      gameAlert('Mehrfachauswahl ist nur für denselben Artikel möglich.');
      return;
    }
  }

  state.selectedMarketOrderIds.push(orderId);
  renderMarket();
}

function renderMarket() {
  const orders = filteredMarketOrders();

  state.selectedMarketOrderIds = state.selectedMarketOrderIds.filter(id =>
    state.marketOrders.some(o => o.id === id)
  );

  document.getElementById('marketOrders').innerHTML = renderTable(
    ['Firma','Gut','Art','Menge','Preis','Gebühr','Aktion'],
    orders.map(o => {
      const selected = state.selectedMarketOrderIds.includes(o.id);
      return `<tr class="market-order-row ${selected ? 'selected' : ''}" data-order-id="${o.id}" tabindex="0" aria-selected="${selected}">
        <td>${companyName(o.company_id)}</td>
        <td>${itemName(o)}</td>
        <td>${o.material_id ? 'Rohstoff' : 'Produkt'}</td>
        <td>${num(o.remaining_quantity)}</td>
        <td>${money(o.price_per_unit)}</td>
        <td>5%</td>
        <td>${o.company_id === state.company.id ? `<button onclick="event.stopPropagation(); cancelOrder('${o.id}')">Stornieren</button>` : selected ? '<strong>Ausgewählt</strong>' : 'Auswählen'}</td>
      </tr>`;
    })
  );

  document.querySelectorAll('#marketOrders .market-order-row').forEach(row => {
    const choose = () => toggleMarketOrderSelection(row.dataset.orderId);
    row.addEventListener('click', choose);
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        choose();
      }
    });
  });

  updateMarketBuyPreview();
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


function financePeriodStart(period, offset = state.financePeriodOffset || 0) {
  const now = new Date();

  if (period === 'day') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    start.setDate(start.getDate() + offset);
    return start;
  }

  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth() + offset, 1, 0, 0, 0, 0);
  }

  const start = new Date(now);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day + (offset * 7));
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

function financePeriodTransactions() {
  const start = financePeriodStart(state.financePeriod);
  const end = financePeriodEnd(state.financePeriod, start);
  return state.transactions.filter(t => {
    const createdAt = new Date(t.created_at);
    return createdAt >= start && createdAt <= end;
  });
}

function renderFinanceTable() {
  const table = document.getElementById('financeTable');
  if (!table) return;
  const transactions = financePeriodTransactions();
  table.innerHTML = renderTable(
    ['Betrag','Beschreibung','Zeit'],
    transactions.map(t => `<tr><td class="${transactionAmountClass(t.transaction_type)}">${money(t.amount)}</td><td>${t.description || transactionLabel(t.transaction_type)}</td><td>${new Date(t.created_at).toLocaleString('de-DE')}</td></tr>`)
  );
}

function renderFinanceSummary() {
  const container = document.getElementById('financeSummary');
  if (!container) return;

  const start = financePeriodStart(state.financePeriod);
  const end = financePeriodEnd(state.financePeriod, start);
  const periodRange = formatFinancePeriodRange(state.financePeriod, start, end);
  const transactions = financePeriodTransactions();
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
    .filter(t => ['market_fee', 'retail_cancel_fee'].includes(t.transaction_type))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0));

  const buildingRefunds = transactions
    .filter(t => t.transaction_type === 'building_refund')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const directResearchCosts = Math.abs(transactions
    .filter(t => t.transaction_type === 'research')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0));

  const buildingCosts = Math.abs(transactions
    .filter(t => t.transaction_type === 'construction')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0));

  const marketBuyCosts = Math.abs(transactions
    .filter(t => t.transaction_type === 'market_buy')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0));

  // Gekaufte Forschungseinheiten werden zusätzlich in "Forschung" sichtbar,
  // bleiben für Gewinn/Verlust aber ausschließlich unter "Marktkäufe" kostenwirksam.
  const researchMarketBuyCosts = state.marketTrades
    .filter(trade => {
      const executedAt = new Date(trade.executed_at);
      return executedAt >= start && executedAt <= end &&
        trade.products?.category === 'research' &&
        trade.products?.name === 'Forschungseinheit';
    })
    .reduce((sum, trade) => sum + Number(trade.total_value || 0), 0);

  const researchDisplayCosts = directResearchCosts + researchMarketBuyCosts;

  const revenue = netSales + fees + retailSales + buildingRefunds;

  // Produktionskosten = tatsächlich verbrauchte Beschaffungskosten + Personalkosten.
  const productionCosts = jobs.reduce(
    (sum, j) => sum + (Number(j.finished_unit_cost || 0) * Number(j.output_quantity || 0)),
    0
  );

  const excludedCostTypes = new Set([
    'production',
    'production_refund',
    'market_fee',
    'retail_cancel_fee',
    'market_buy',
    'research',
    'construction'
  ]);

  const otherCosts = Math.abs(transactions
    .filter(t => Number(t.amount || 0) < 0 && !excludedCostTypes.has(t.transaction_type))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0));

  // Forschungseinheiten aus Marktkäufen dürfen nicht doppelt abgezogen werden:
  // researchDisplayCosts ist nur Anzeige; kostenwirksam sind directResearchCosts + marketBuyCosts.
  const profit = revenue - productionCosts - directResearchCosts - fees - buildingCosts - marketBuyCosts - otherCosts;
  const profitClass = profit < 0 ? 'finance-negative' : 'finance-positive';

  const periodLabel =
    state.financePeriodOffset === 0
      ? (state.financePeriod === 'day' ? 'Heute' : state.financePeriod === 'month' ? 'Aktueller Monat' : 'Aktuelle Woche')
      : (state.financePeriod === 'day' ? 'Tag' : state.financePeriod === 'month' ? 'Monat' : 'Woche');

  container.innerHTML = `
    <div class="finance-summary-card finance-period-card"><span>Zeitraum</span><strong>${periodLabel}</strong><small>${periodRange}</small></div>
    <div class="finance-summary-card"><span>Einnahmen / Gewinne</span><strong>${money(revenue)}</strong></div>
    <div class="finance-summary-card finance-cost-card"><span>Produktionskosten</span><strong>-${money(productionCosts)}</strong></div>
    <div class="finance-summary-card finance-cost-card"><span>Forschung</span><strong>${researchDisplayCosts > 0 ? `-${money(researchDisplayCosts)}` : money(0)}</strong></div>
    <div class="finance-summary-card finance-cost-card"><span>Gebühren</span><strong>-${money(fees)}</strong></div>
    <div class="finance-summary-card finance-cost-card"><span>Baukosten</span><strong>${buildingCosts > 0 ? `-${money(buildingCosts)}` : money(0)}</strong></div>
    <div class="finance-summary-card finance-cost-card"><span>Marktkäufe</span><strong>${marketBuyCosts > 0 ? `-${money(marketBuyCosts)}` : money(0)}</strong></div>
    ${otherCosts > 0 ? `<div class="finance-summary-card finance-cost-card"><span>Sonstige Kosten</span><strong>-${money(otherCosts)}</strong></div>` : ''}
    <div class="finance-summary-card finance-profit-card ${profit < 0 ? 'finance-profit-loss' : 'finance-profit-gain'}"><span>Gewinn / Verlust</span><strong class="${profitClass}">${profit < 0 ? '-' : ''}${money(Math.abs(profit))}</strong></div>
  `;

  document.querySelectorAll('.finance-period-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === state.financePeriod);
  });

  const nextBtn = document.getElementById('financeNextPeriod');
  if (nextBtn) nextBtn.disabled = state.financePeriodOffset >= 0;

  renderFinanceTable();
}

function researchInventoryContext() {
  const product = state.products.find(p => p.category === 'research' && p.name === 'Forschungseinheit');
  const inventory = product ? state.inventory.find(i => i.product_id === product.id) : null;
  return {
    product,
    inventory,
    quantity: Number(inventory?.quantity || 0),
    averageUnitCost: Number(inventory?.average_unit_cost || 0)
  };
}

function renderResearch() {
  const ctx = researchInventoryContext();
  const qtyInput = document.getElementById('researchInvestmentAmount');
  const preview = document.getElementById('researchInvestmentPreview');
  const submit = document.getElementById('researchInvestmentBtn');
  const maxBtn = document.getElementById('researchInvestmentMaxBtn');
  if (!qtyInput || !preview || !submit) return;

  const availableWhole = Math.max(0, Math.floor(ctx.quantity));
  const requested = Math.max(0, Math.floor(Number(qtyInput.value || 0)));
  const investmentValue = requested * ctx.averageUnitCost;
  const minPatent = investmentValue * 0.70;
  const maxPatent = investmentValue * 1.10;
  const valid = !!ctx.product && requested >= 1 && requested <= availableWhole && ctx.averageUnitCost > 0;

  document.getElementById('researchUnitsAvailable').textContent = `${num(availableWhole)} Forschungseinheiten`;
  document.getElementById('researchUnitAverageCost').textContent = money(ctx.averageUnitCost);

  preview.innerHTML = `
    <div class="kv"><span>Einheiten</span><strong>${num(requested)}</strong></div>
    <div class="kv"><span>Investitionswert</span><strong>${money(investmentValue)}</strong></div>
    <div class="kv"><span>Möglicher Patentwert-Zuwachs</span><strong>${money(minPatent)} – ${money(maxPatent)}</strong></div>
    `;

  submit.disabled = !valid;
  if (maxBtn) maxBtn.disabled = availableWhole <= 0;
}

function currentCompanyBuildingValue() {
  return state.buildings
    .reduce((total, building) => {
      const type = state.buildingTypes.find(bt => bt.id === building.building_type_id);
      const baseCost = Number(type?.construction_cost || 0);
      const level = Math.max(1, Number(building.construction_target_level || building.level || 1));
      let value = baseCost;
      for (let lvl = 2; lvl <= level; lvl += 1) {
        value += Math.round((baseCost * buildingLevelMultiplier(lvl)) * 100) / 100;
      }
      return total + value;
    }, 0);
}

function companyRenameAvailability() {
  const changedAt = state.company?.last_name_change_at;
  if (!changedAt) return { allowed: true, availableAt: null };
  const availableAt = new Date(new Date(changedAt).getTime() + 14 * 24 * 60 * 60 * 1000);
  return { allowed: Date.now() >= availableAt.getTime(), availableAt };
}

window.renameCompanyFromCompanyTab = async function() {
  const availability = companyRenameAvailability();
  if (!availability.allowed) {
    await gameAlert(`Der Firmenname kann wieder ab ${availability.availableAt.toLocaleString('de-DE')} geändert werden.`);
    return;
  }

  const newName = await gamePrompt('Neuen Unternehmensnamen eingeben:', state.company?.name || '', 'Unternehmensnamen ändern');
  if (newName === null) return;
  const trimmedName = String(newName).trim();
  if (!trimmedName || trimmedName === state.company?.name) return;

  const confirmed = await gameConfirm(`Unternehmensnamen wirklich in „${trimmedName}“ ändern? Danach ist eine weitere Änderung 14 Tage lang gesperrt.`);
  if (!confirmed) return;

  const { data, error } = await sb.rpc('rename_company', {
    p_company_id: state.company.id,
    p_new_name: trimmedName
  });

  if (error) {
    await gameAlert(error.message);
    return;
  }

  if (data) state.company = data;
  await loadCompany();
};

function renderStorage() {
  const container = document.getElementById('storageInventoryTable');
  if (!container) return;

  const search = String(state.storageSearchFilter || '').trim().toLocaleLowerCase('de-DE');
  const type = state.storageTypeFilter || 'all';

  const materialRows = state.materials.map(material => {
    const inv = state.materialInventory.find(i => i.material_id === material.id);
    return {
      type: 'material',
      name: material.name,
      quantity: Number(inv?.quantity || 0),
      unit: material.unit || '–',
      averageCost: Number(inv?.average_unit_cost || 0)
    };
  });

  const productRows = state.inventory.map(inv => ({
    type: 'product',
    name: inv.products?.name || '–',
    quantity: Number(inv.quantity || 0),
    unit: 'Stück',
    averageCost: Number(inv.average_unit_cost || 0)
  }));

  const rows = [...materialRows, ...productRows]
    .filter(row => {
      const matchesType = type === 'all' || row.type === type;
      const matchesSearch = !search || row.name.toLocaleLowerCase('de-DE').includes(search);
      return matchesType && matchesSearch;
    })
    .sort((a,b) =>
      a.name.localeCompare(b.name, 'de-DE') ||
      a.type.localeCompare(b.type, 'de-DE')
    );

  container.innerHTML = renderTable(
    ['Artikel','Typ','Menge','Einheit','Ø Kosten'],
    rows.map(row => `<tr>
      <td>${row.name}</td>
      <td>${row.type === 'material' ? 'Rohstoff' : 'Produkt'}</td>
      <td>${num(row.quantity)}</td>
      <td>${row.unit}</td>
      <td>${money(row.averageCost)}</td>
    </tr>`)
  );
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
  document.getElementById('statEmployees').textContent = `${num(automaticEmployees)} Mitarbeiter`;
  document.getElementById('statValue').textContent = money(c.company_value);
  const statValueChange = document.getElementById('statValueChange');
  if (statValueChange) {
    const valueChange = Number(state.companyValueChange || 0);
    statValueChange.textContent = valueChange > 0
      ? `+${money(valueChange)}`
      : valueChange < 0
        ? `-${money(Math.abs(valueChange))}`
        : money(0);
    statValueChange.className = `company-value-change ${valueChange > 0 ? 'company-value-change-positive' : valueChange < 0 ? 'company-value-change-negative' : 'company-value-change-zero'}`;
  }
  const researchPatentValue = document.getElementById('researchPatentValue');
  if (researchPatentValue) researchPatentValue.textContent = money(c.patent_value || 0);
  renderResearch();

  const companyRows = [
    `<div class="kv"><span>Name</span><strong>${c.name}</strong></div>`,
    `<div class="kv"><span>Status</span><strong class="company-online-status presence-status"></strong></div>`,
    `<div class="kv"><span>Level</span><strong>${num(c.company_level)}</strong></div>`
  ].join('');
  document.getElementById('companySummary').innerHTML = companyRows;

  const companyDebt = Math.max(0, Number(state.companyDebt || 0));
  const companyBuildingValue = currentCompanyBuildingValue();
  const renameAvailability = companyRenameAvailability();
  const renameTitle = renameAvailability.allowed
    ? 'Unternehmensnamen ändern'
    : `Namensänderung wieder ab ${renameAvailability.availableAt.toLocaleString('de-DE')} möglich`;

  document.getElementById('companyDetails').innerHTML = renderTable(
    ['Unternehmen','Status','Level','Kontostand','Mitarbeiter','Unternehmenswert','Gebäudewert','Patentwert','Schulden'],
    [`<tr>
      <td><span class="company-name-edit-wrap"><strong>${c.name}</strong><button type="button" class="company-name-edit-btn" onclick="renameCompanyFromCompanyTab()" title="${renameTitle}" aria-label="Unternehmensnamen ändern" ${renameAvailability.allowed ? '' : 'disabled'}>✎</button></span></td>
      <td><span class="company-online-status presence-status"></span></td>
      <td>${num(c.company_level)}</td>
      <td class="${Number(c.cash_balance || 0) < 0 ? 'negative-balance' : ''}">${balanceMoney(Number(c.cash_balance || 0))}</td>
      <td>${num(automaticEmployees)} Mitarbeiter</td>
      <td title="Wird täglich um 01:00 Uhr neu berechnet">${money(c.company_value)}</td>
      <td>${money(companyBuildingValue)}</td>
      <td>${money(c.patent_value || 0)}</td>
      <td class="${companyDebt > 0 ? 'company-debt-negative' : 'company-debt-zero'}">${companyDebt > 0 ? `-${money(companyDebt)}` : money(0)}</td>
    </tr>`]
  );
  renderCompanyStatus();

  document.getElementById('recentTransactions').innerHTML = renderTable(['Betrag','Beschreibung','Zeit'], state.transactions.slice(0,8).map(t=>`<tr><td class="${transactionAmountClass(t.transaction_type)}">${money(t.amount)}</td><td>${t.description || transactionLabel(t.transaction_type)}</td><td>${new Date(t.created_at).toLocaleString('de-DE')}</td></tr>`));
  renderFinanceSummary();
  renderStorage();

  const opts = state.products.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  const productionProductSelect = document.getElementById('productionProduct');
  const previousProductionProduct = productionProductSelect.value;
  productionProductSelect.innerHTML = opts;
  if (state.products.some(p => p.id === previousProductionProduct)) {
    productionProductSelect.value = previousProductionProduct;
  }
  document.getElementById('sellProduct').innerHTML = opts;
  renderProductionRecipe();
  renderBuildings();
  renderRetailSale();
  renderMarket();
  renderContracts();

}


const storageSearchFilter = document.getElementById('storageSearchFilter');
const storageTypeFilter = document.getElementById('storageTypeFilter');
const storageFilterReset = document.getElementById('storageFilterReset');

storageSearchFilter?.addEventListener('input', event => {
  state.storageSearchFilter = event.target.value;
  renderStorage();
});

storageTypeFilter?.addEventListener('change', event => {
  state.storageTypeFilter = event.target.value;
  renderStorage();
});

storageFilterReset?.addEventListener('click', () => {
  state.storageSearchFilter = '';
  state.storageTypeFilter = 'all';
  if (storageSearchFilter) storageSearchFilter.value = '';
  if (storageTypeFilter) storageTypeFilter.value = 'all';
  renderStorage();
});

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

  const confirmed = await gameConfirm(
    'Unternehmen wirklich zurücksetzen? Alle Gebäude, Lagerbestände, laufenden Produktionen, Marktaktivitäten und Finanzdaten werden gelöscht. Firmenname und Account bleiben erhalten. Startkapital danach: 50.000 OC$.'
  );
  if (!confirmed) return;

  const secondConfirmed = await gameConfirm('Letzte Bestätigung: Unternehmensfortschritt jetzt vollständig zurücksetzen?');
  if (!secondConfirmed) return;

  const { error } = await sb.rpc('reset_company', { p_company_id: state.company.id });
  if (error) {
    gameAlert(error.message);
    return;
  }

  await loadCompany();
  gameAlert('Unternehmen wurde zurückgesetzt. Du startest wieder mit 50.000 OC$.');
});

document.getElementById('deleteCompanyBtn').addEventListener('click', async () => {
  if (!state.session) return;

  const confirmed = await gameConfirm(
    'Account wirklich löschen? Dein Unternehmen, der komplette Spielfortschritt und dein Login-Account werden dauerhaft gelöscht. Danach musst du dich neu registrieren.'
  );
  if (!confirmed) return;

  const typed = await gamePrompt('Zur Bestätigung bitte LÖSCHEN eingeben:');
  if (typed !== 'LÖSCHEN') {
    gameAlert('Löschen abgebrochen. Bestätigung war nicht korrekt.');
    return;
  }

  stopPresenceHeartbeat();
  stopNpcMarketHeartbeat();
  const { error } = await sb.rpc('delete_account');
  if (error) {
    gameAlert(error.message);
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
    if (!await gameConfirm('Produktion wirklich abbrechen? Bereits fertiggestellte Einheiten werden übernommen. Von den noch nicht produzierten Einheiten werden 90% der zugehörigen Produktionskosten und Materialien erstattet.')) return;
    const { error } = await sb.rpc('cancel_production', {
      p_company_id: state.company.id,
      p_job_id: plan.runningJob.id
    });
    if (error) gameAlert(error.message); else await loadCompany();
    return;
  }

  if (!plan.runnable) {
    renderProductionRecipe();
    return;
  }

  const { error } = await sb.rpc('start_production_v2',{
    p_company_id:state.company.id,
    p_product_id:document.getElementById('productionProduct').value,
    p_hours:plan.hours,
    p_input_text:document.getElementById('productionUnits').value,
    p_start_snapshot:{
      outputQty: plan.outputQty,
      hours: plan.hours,
      procurementCost: plan.procurementCost,
      baseProductionCost: plan.baseProductionCost,
      personnelCost: plan.personnelCost,
      productionCost: plan.productionCost
    }
  });
  if(error) gameAlert(error.message); else await loadCompany();
});
window.buyMissingProductionInput = async function(kind, itemId) {
  const plan = productionPlan();
  const input = plan.inputs.find(i =>
    (kind === 'material' && i.material_id === itemId) ||
    (kind === 'product' && i.component_product_id === itemId)
  );

  if (!input) return;

  let missing = Math.max(0, Number(input.required || 0) - Number(input.available || 0));
  if (missing <= 1e-9) {
    renderProductionRecipe();
    return;
  }

  const orders = marketOrdersForProductionInput(input);
  if (!orders.length) {
    gameAlert(`Aktuell gibt es keine passende Marktorder für ${input.name}.`);
    return;
  }

  let marketQty = 0;
  let estimatedCost = 0;
  let remaining = missing;
  for (const order of orders) {
    if (remaining <= 1e-9) break;
    const take = Math.min(remaining, Number(order.remaining_quantity || 0));
    marketQty += take;
    estimatedCost += take * Number(order.price_per_unit || 0);
    remaining -= take;
  }

  if (marketQty <= 1e-9) {
    gameAlert(`Aktuell ist keine Menge von ${input.name} am Markt verfügbar.`);
    return;
  }

  const unit = input.unit ? ` ${input.unit}` : '';
  const message = remaining > 1e-9
    ? `Es fehlen ${num(missing)}${unit} ${input.name}. Am Markt sind aktuell ${num(marketQty)}${unit} verfügbar. Diese Menge für ca. ${money(estimatedCost)} kaufen?`
    : `Fehlende ${num(missing)}${unit} ${input.name} für ca. ${money(estimatedCost)} kaufen?`;

  if (!await gameConfirm(message)) return;

  let toBuy = marketQty;
  for (const order of orders) {
    if (toBuy <= 1e-9) break;
    const take = Math.min(toBuy, Number(order.remaining_quantity || 0));
    if (take <= 1e-9) continue;

    const { error } = await sb.rpc('buy_market_order', {
      p_buyer_company_id: state.company.id,
      p_order_id: order.id,
      p_quantity: take
    });

    if (error) {
      gameAlert(error.message);
      break;
    }
    toBuy -= take;
  }

  await loadCompany();
};

window.claimProductionOutput = async function(jobId) {
  const job = state.productionJobs.find(j => j.id === jobId);
  if (!job) return;

  const claimable = productionClaimableQuantity(job);
  if (claimable <= 0) {
    renderProductionRecipe();
    return;
  }

  const { data, error } = await sb.rpc('claim_production_output', {
    p_company_id: state.company.id,
    p_job_id: jobId
  });

  if (error) {
    gameAlert(error.message);
    return;
  }

  const claimed = Number(data || 0);
  if (claimed > 0) {
    await loadCompany();
  } else {
    renderProductionRecipe();
  }
};

window.buildBuilding = async function(buildingTypeId) {
  const bt = state.buildingTypes.find(b => b.id === buildingTypeId);
  if (!bt) return;

  const buildHours = buildingConstructionHours(1);
  const finishText = buildingConstructionFinishText(buildHours);
  if (!await gameConfirm(`${bt.name} für ${money(bt.construction_cost)} bauen? Bauzeit: ${formatBuildingConstructionTime(buildHours)}. Voraussichtlich fertig am ${finishText}. Das Gebäude ist erst nach Fertigstellung verfügbar.`)) return;

  const { error } = await sb.rpc('build_building', {
    p_company_id: state.company.id,
    p_building_type_id: buildingTypeId
  });

  if (error) {
    gameAlert(error.message);
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

  const buildHours = buildingConstructionHours(nextLevel);
  const finishText = buildingConstructionFinishText(buildHours);

  if (!await gameConfirm(
    `${bt?.name || 'Gebäude'} auf Level ${nextLevel} aufstufen? ` +
    `Kosten: ${money(nextCost)}. Bauzeit: ${formatBuildingConstructionTime(buildHours)}. ` +
    `Voraussichtlich fertig am ${finishText}. Während des Ausbaus ist das Gebäude nicht nutzbar. ` +
    `Mitarbeiter und vorhandene Gebäudekapazität nach Fertigstellung: +${num(increase)}%.`
  )) return;

  const { error } = await sb.rpc('upgrade_building', {
    p_company_id: state.company.id,
    p_building_id: buildingId
  });

  if (error) {
    gameAlert(error.message);
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

  if (!await gameConfirm(`${bt.name} ${action}? ${warning}`)) return;

  const { error } = await sb.rpc('downgrade_building', {
    p_company_id: state.company.id,
    p_building_id: buildingId
  });

  if (error) {
    gameAlert(error.message);
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
  if(error) gameAlert(error.message); else await loadCompany();
});

document.getElementById('retailProduct').addEventListener('change', renderRetailSale);
document.getElementById('retailMaxBtn').addEventListener('click', () => {
  const ctx = retailSaleContext();
  const maxUnits = Math.max(0, Math.floor(ctx.available || 0));
  document.getElementById('retailQty').value = formatRetailQuantityInput(maxUnits);
  renderRetailSale();
});
document.getElementById('retail24Btn').addEventListener('click', () => {
  const ctx = retailSaleContext();
  const capacity24h = Math.max(0, Math.floor((ctx.unitsPerHour || 0) * 24));
  const available = Math.max(0, Math.floor(ctx.available || 0));
  document.getElementById('retailQty').value = formatRetailQuantityInput(Math.min(capacity24h, available));
  renderRetailSale();
});
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

  if (ctx.runningJob) {
    const progress = retailSaleProgress(ctx.runningJob);
    if (!await gameConfirm(`Verkauf wirklich abbrechen? Noch nicht verkaufte Ware wird zurück ins Lager gelegt. Abbruchgebühr: ${money(progress.cancellationFee)} (20% des erwarteten Erlöses).`)) return;

    const { error } = await sb.rpc('cancel_retail_sale', {
      p_company_id: state.company.id,
      p_job_id: ctx.runningJob.id
    });

    if (error) gameAlert(error.message);
    else await loadCompany();
    return;
  }

  const parsedQuantity = retailQuantityFromInput(document.getElementById('retailQty').value);
  const quantity = Number(parsedQuantity.units || 0);

  if (!ctx.product || !ctx.building || !Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
    renderRetailSale();
    return;
  }

  const saleHours = ctx.unitsPerHour > 0 ? quantity / ctx.unitsPerHour : 0;
  const { error } = await sb.rpc('start_retail_sale_v2', {
    p_company_id: state.company.id,
    p_product_id: ctx.product.id,
    p_quantity: quantity,
    p_input_text: document.getElementById('retailQty').value,
    p_start_snapshot: {
      quantity,
      hours: saleHours,
      unitPrice: ctx.price,
      totalValue: ctx.price * quantity,
      available: ctx.available,
      unitsPerHour: ctx.unitsPerHour,
      buildingTypeName: ctx.buildingType?.name || ''
    }
  });

  if (error) {
    gameAlert(error.message);
  } else {
    await loadCompany();
  }
});
window.collectRetailRevenue = async function(jobId) {
  const job = state.retailSaleJobs.find(j => j.id === jobId);
  if (!job) return;

  const progress = retailSaleProgress(job);
  if (progress.claimableUnits <= 0) {
    renderRetailSale();
    return;
  }

  const { data, error } = await sb.rpc('claim_retail_revenue', {
    p_company_id: state.company.id,
    p_job_id: jobId
  });

  if (error) {
    gameAlert(error.message);
    return;
  }

  if (Number(data || 0) > 0) await loadCompany();
  else renderRetailSale();
};

window.cancelOrder = async function(orderId) {
  if(!await gameConfirm('Verkaufsorder wirklich stornieren?')) return;
  const { error }=await sb.rpc('cancel_market_order',{p_order_id:orderId});
  if(error) gameAlert(error.message); else await loadCompany();
};

const marketSearchFilter = document.getElementById('marketSearchFilter');
const marketTypeFilter = document.getElementById('marketTypeFilter');
const marketBuyQty = document.getElementById('marketBuyQty');
const marketBuyCheapest = document.getElementById('marketBuyCheapest');
const marketFilterReset = document.getElementById('marketFilterReset');

marketBuyQty?.addEventListener('input', updateMarketBuyPreview);

marketBuyCheapest?.addEventListener('click', async () => {
  const selected = selectedMarketOrders().filter(o => o.company_id !== state.company.id);
  const qty = Number(marketBuyQty?.value || 0);

  if (!selected.length) {
    await gameAlert('Bitte wähle mindestens eine Marktposition aus.');
    return;
  }

  if (!Number.isFinite(qty) || qty <= 0) {
    await gameAlert('Bitte gib eine gültige Menge ein.');
    return;
  }

  const keys = [...new Set(selected.map(marketOrderItemKey))];
  if (keys.length !== 1) {
    await gameAlert('Es dürfen nur Positionen desselben Artikels ausgewählt werden.');
    return;
  }

  const sorted = [...selected].sort((a,b) => Number(a.price_per_unit || 0) - Number(b.price_per_unit || 0));
  const available = sorted.reduce((sum,o) => sum + Number(o.remaining_quantity || 0), 0);
  if (available < qty) {
    await gameAlert(`Die ausgewählten Positionen enthalten zusammen nur ${num(available)} Einheiten.`);
    return;
  }

  let remaining = qty;
  let total = 0;
  for (const order of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(order.remaining_quantity || 0));
    total += take * Number(order.price_per_unit || 0);
    remaining -= take;
  }

  const confirmed = await gameConfirm(`${num(qty)} × ${itemName(sorted[0])} aus ${selected.length} ausgewählten Marktposition(en) für insgesamt ${money(total)} kaufen?`);
  if (!confirmed) return;

  marketBuyCheapest.disabled = true;
  try {
    const { data, error } = await sb.rpc('buy_selected_market_orders', {
      p_buyer_company_id: state.company.id,
      p_order_ids: selected.map(o => o.id),
      p_quantity: qty
    });

    if (error) {
      await gameAlert(error.message);
      return;
    }

    state.selectedMarketOrderIds = [];
    await loadCompany();
    await gameAlert(`${num(data?.quantity || qty)} × ${itemName(sorted[0])} für ${money(data?.total_value || total)} gekauft. Durchschnittspreis: ${money(data?.average_unit_price || 0)} pro Einheit.`, 'Kauf abgeschlossen');
  } finally {
    updateMarketBuyPreview();
  }
});

marketSearchFilter?.addEventListener('input', e => {
  state.marketSearchFilter = e.target.value;
  state.selectedMarketOrderIds = [];
  renderMarket();
});

marketTypeFilter?.addEventListener('change', e => {
  state.marketTypeFilter = e.target.value;
  state.selectedMarketOrderIds = [];
  renderMarket();
});

marketFilterReset?.addEventListener('click', () => {
  state.marketSearchFilter = '';
  state.marketTypeFilter = 'all';
  state.selectedMarketOrderIds = [];
  if (marketSearchFilter) marketSearchFilter.value = '';
  if (marketTypeFilter) marketTypeFilter.value = 'all';
  if (marketBuyQty) marketBuyQty.value = '1';
  renderMarket();
});

document.querySelectorAll('.finance-period-btn').forEach(btn => btn.addEventListener('click', () => {
  state.financePeriod = btn.dataset.period;
  state.financePeriodOffset = 0;
  renderFinanceSummary();
}));

document.getElementById('financePrevPeriod')?.addEventListener('click', () => {
  state.financePeriodOffset -= 1;
  renderFinanceSummary();
});

document.getElementById('financeNextPeriod')?.addEventListener('click', () => {
  if (state.financePeriodOffset >= 0) return;
  state.financePeriodOffset += 1;
  renderFinanceSummary();
});

// Research investment
const researchInvestmentForm = document.getElementById('researchInvestmentForm');
const researchInvestmentAmount = document.getElementById('researchInvestmentAmount');
const researchInvestmentMaxBtn = document.getElementById('researchInvestmentMaxBtn');

researchInvestmentAmount?.addEventListener('input', () => {
  const whole = Math.max(0, Math.floor(Number(researchInvestmentAmount.value || 0)));
  if (String(whole) !== researchInvestmentAmount.value && researchInvestmentAmount.value !== '') {
    researchInvestmentAmount.value = String(whole);
  }
  renderResearch();
});

researchInvestmentMaxBtn?.addEventListener('click', () => {
  const ctx = researchInventoryContext();
  researchInvestmentAmount.value = String(Math.max(0, Math.floor(ctx.quantity)));
  renderResearch();
});

if (researchInvestmentForm) {
  researchInvestmentForm.addEventListener('submit', async e => {
    e.preventDefault();
    const ctx = researchInventoryContext();
    const quantity = Math.max(0, Math.floor(Number(researchInvestmentAmount.value || 0)));
    const investmentValue = quantity * ctx.averageUnitCost;

    if (!ctx.product || quantity < 1 || quantity > Math.floor(ctx.quantity) || ctx.averageUnitCost <= 0) {
      renderResearch();
      return;
    }

    if (!await gameConfirm(`${num(quantity)} Forschungseinheiten mit einem Einstandswert von ${money(investmentValue)} investieren?`)) return;

    const { data, error } = await sb.rpc('invest_research_units', {
      p_company_id: state.company.id,
      p_quantity: quantity
    });

    if (error) {
      gameAlert(error.message);
      return;
    }

    const gain = Number(data?.patent_gain || 0);
    gameAlert(`Forschung abgeschlossen: Patentwert +${money(gain)}.`);
    researchInvestmentAmount.value = '1';
    await loadCompany();
  });
}

// Contracts
['contractRole','contractPartner','contractItemType'].forEach(id => document.getElementById(id).addEventListener('change',updateContractGoods));
document.getElementById('contractForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const role=document.getElementById('contractRole').value;
  const partner=document.getElementById('contractPartner').value;
  if(!partner) { gameAlert('Es gibt noch kein anderes Spielerunternehmen für einen Vertrag.'); return; }
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
  if(error) gameAlert(error.message); else await loadCompany();
});
window.acceptContract=async id=>{ const {error}=await sb.rpc('accept_contract',{p_contract_id:id}); if(error) gameAlert(error.message); else await loadCompany(); };
window.fulfillContract=async id=>{ const {error}=await sb.rpc('fulfill_contract',{p_contract_id:id}); if(error) gameAlert(error.message); else await loadCompany(); };
window.cancelContract=async id=>{ const {error}=await sb.rpc('cancel_contract',{p_contract_id:id}); if(error) gameAlert(error.message); else await loadCompany(); };

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    touchPresence();
    runNpcMarketTickAndRefresh();
  }
});

init();
