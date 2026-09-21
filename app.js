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
  marketQualityFilter: 'all',
  researchSelectedProductId: null,
  selectedMarketOrderIds: [],
  selectedBuildingId: null,
  selectedRetailBuildingId: null,
  buildingOverviewFilter: 'all',
  financePeriod: 'day',
  financePeriodOffset: 0,
  contracts: [],
  companyDirectory: [],
  companyDebt: 0,
  companyValueChange: 0,
  bondDashboard: null,
  recoveringPassword: false
};

let presenceTimer = null;
let productionRefreshTimer = null;
let productionClaimDisplayTimer = null;
let npcMarketTimer = null;
let npcMarketCountdownTimer = null;
let companyValueRefreshTimer = null;
let buildingConstructionTimer = null;
let companyBalancePollTimer = null;
let companyBalanceChannel = null;

const money = n => new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR', maximumFractionDigits:2 })
  .format(Number(n || 0)).replace('€','OC$');
const num = n => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(Number(n || 0));
const balanceMoney = n => `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Number(n || 0))} OC$`;


const qualityMultiplier = quality => 1 + Math.max(0, Number(quality || 1) - 1) * 0.05;
const researchRequirement = quality => Number(quality || 1) <= 1 ? 1000 : 2500 * (Number(quality || 1) - 1);
const productQuality = product => Math.max(1, Number(product?.quality_level || 1));
const minimumInputQuality = product => Math.max(1, productQuality(product) - 1);


const COMPANY_XP_TOTALS = [
  0,0,250,600,1050,1650,2450,3450,4700,6200,7950,9950,
  12450,15450,18950,22950,27450,32450,38450,45450,53450,
  62450,72450,83950,96950,111450,127450,145450,165450,
  187450,211450
];

function buildingSlotsForLevel(level) {
  return Math.min(16, 4 + 2 * Math.min(6, Math.floor(Math.max(0, Number(level || 0)) / 5)));
}

function xpProgressContext(company = state.company) {
  const level = Math.max(0, Math.min(30, Number(company?.company_level || 0)));
  const totalXp = Math.max(0, Number(company?.experience_points || 0));
  const currentBase = COMPANY_XP_TOTALS[level] || 0;
  const nextTotal = level >= 30 ? currentBase : COMPANY_XP_TOTALS[level + 1];
  const needed = Math.max(0, nextTotal - currentBase);
  const progress = level >= 30 ? needed : Math.max(0, totalXp - currentBase);
  return {
    level,
    totalXp,
    currentBase,
    nextTotal,
    needed,
    progress,
    percent: level >= 30 ? 100 : Math.max(0, Math.min(100, needed > 0 ? progress / needed * 100 : 0))
  };
}

function featureRequiredLevel(view) {
  return ({ contracts: 5, research: 5, loans: 10 })[view] || 0;
}

function featureUnlocked(view) {
  return Number(state.company?.company_level || 0) >= featureRequiredLevel(view);
}

function updateFeatureLocks() {
  document.querySelectorAll('.nav-item[data-view]').forEach(button => {
    const required = featureRequiredLevel(button.dataset.view);
    if (!required) return;
    const unlocked = featureUnlocked(button.dataset.view);
    button.classList.toggle('feature-locked', !unlocked);
    button.dataset.locked = unlocked ? 'false' : 'true';
    const baseLabel = button.dataset.baseLabel || button.textContent.replace(/\s*🔒.*$/, '');
    button.dataset.baseLabel = baseLabel;
    button.textContent = unlocked ? baseLabel : `${baseLabel} 🔒 L${required}`;
  });
}

function productInventoryLots(productId) {
  return state.inventory.filter(row => row.product_id === productId);
}
function materialInventoryLots(materialId) {
  return state.materialInventory.filter(row => row.material_id === materialId);
}
function inventoryLotSummary(rows, minQuality = 1) {
  const eligible = (rows || []).filter(row => Number(row.quality_level || 1) >= minQuality && Number(row.quantity || 0) > 0);
  const quantity = eligible.reduce((sum,row) => sum + Number(row.quantity || 0), 0);
  const value = eligible.reduce((sum,row) => sum + Number(row.quantity || 0) * Number(row.average_unit_cost || 0), 0);
  return { quantity, averageUnitCost: quantity > 0 ? value / quantity : 0, rows: eligible };
}
function productLot(productId, quality) {
  return state.inventory.find(row => row.product_id === productId && Number(row.quality_level || 1) === Number(quality || 1));
}
function availableProductQualities(productId) {
  return productInventoryLots(productId).filter(row => Number(row.quantity || 0) > 0).sort((a,b)=>Number(a.quality_level||1)-Number(b.quality_level||1));
}
function researchCategory(product) {
  const building = state.buildingTypes.find(bt => bt.id === product?.required_building_type_id);
  const name = building?.name || '';
  return ({
    'Elektronikfabrik':'Elektronik','Maschinenfabrik':'Maschinen','Autofabrik':'Automobil','Chemiefabrik':'Chemie',
    'Baufabrik':'Bau','Textilfabrik':'Textil','Lebensmittelfabrik':'Lebensmittel','Energietechnikfabrik':'Energietechnik',
    'Forschungsgebäude':'Forschung'
  })[name] || 'Sonstige';
}

function ownsProductProductionBuilding(product) {
  if (!product?.required_building_type_id) return false;
  return state.buildings.some(building => building.building_type_id === product.required_building_type_id);
}

function hasProductInventory(productId) {
  return productInventoryLots(productId).some(row => Number(row.quantity || 0) > 0);
}

function operationalProductVisible(product) {
  if (!product) return false;
  return hasProductInventory(product.id) || ownsProductProductionBuilding(product);
}

function operationalProducts() {
  return state.products.filter(operationalProductVisible);
}

function stockedProducts() {
  return state.products.filter(product => hasProductInventory(product.id));
}

function activeBuildingsOfType(buildingTypeId) {
  if (!buildingTypeId) return [];
  return state.buildings.filter(
    building => building.building_type_id === buildingTypeId && building.status === 'active'
  );
}

function buildingTypeHasFreeSlot(buildingTypeId, jobs) {
  const buildings = activeBuildingsOfType(buildingTypeId);
  if (!buildings.length) return false;

  return buildings.some(building =>
    !jobs.some(job => job.status === 'running' && job.building_id === building.id)
  );
}

function productionSelectableProducts() {
  const products = operationalProducts();
  const runningJobs = state.productionJobs.filter(job => job.status === 'running');
  const runningProductIds = new Set(runningJobs.map(job => job.product_id));

  return products.filter(product => {
    const buildingTypeId = product.required_building_type_id;
    const buildings = activeBuildingsOfType(buildingTypeId);

    // Bestehendes Verhalten beibehalten, wenn kein aktives Produktionsgebäude vorhanden ist.
    if (!buildings.length) return true;

    // Sobald mindestens ein Gebäude dieses Typs frei ist, sind wieder alle
    // grundsätzlich verfügbaren Produkte dieses Gebäudetyps auswählbar.
    if (buildingTypeHasFreeSlot(buildingTypeId, runningJobs)) return true;

    // Sind alle Gebäude dieses Typs belegt, nur die tatsächlich laufenden Produkte zeigen.
    return runningProductIds.has(product.id);
  });
}

function retailSelectableProducts() {
  const selectedBuilding = state.buildings.find(
    building => building.id === state.selectedRetailBuildingId && building.status === 'active'
  ) || null;

  if (selectedBuilding) {
    const runningJob = state.retailSaleJobs.find(
      job => job.building_id === selectedBuilding.id && job.status === 'running'
    ) || null;

    if (runningJob) {
      const runningProduct = state.products.find(product => product.id === runningJob.product_id);
      return runningProduct ? [runningProduct] : [];
    }

    return stockedProducts()
      .filter(product => product.required_retail_building_type_id === selectedBuilding.building_type_id)
      .sort((a,b) => a.name.localeCompare(b.name,'de-DE'));
  }

  return [];
}

function operationalProductIdentitySet() {
  return new Set(operationalProducts().map(product => `${product.name}::${product.category}`));
}

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
    research_investment: 'Forschungsinvestition',
    bond_investment: 'Anleiheninvestment',
    bond_proceeds: 'Kreditauszahlung',
    bond_repayment: 'Kredittilgung',
    bond_principal_income: 'Tilgungseingang',
    bond_interest_paid: 'Zinsabgabe',
    bond_interest_income: 'Zinserlös',
    bond_interest_state: 'Zinserlös vom Staat',
    bond_interest_missed: 'Zinsausfall',
    bond_default_compensation: 'Staatliche Kreditausfallentschädigung',
    bond_default_reset: 'Insolvenzverfahren'
  })[type] || type;
}

function transactionAmountClass(type) {
  return [
    'market_fee','market_buy','production','construction','retail_cancel_fee','research',
    'bond_investment','bond_repayment','bond_interest_paid'
  ].includes(type) ? 'transaction-amount fee' : 'transaction-amount';
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

function companyValueChangeDisplay(currentValue, changeValue) {
  const current = Number(currentValue || 0);
  const change = Number(changeValue || 0);
  const previous = current - change;
  const percentage = previous !== 0 ? (change / Math.abs(previous)) * 100 : 0;

  const amountText = change > 0
    ? `+${money(change)}`
    : change < 0
      ? `-${money(Math.abs(change))}`
      : money(0);

  const percentageText = change > 0
    ? `+${percentage.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
    : change < 0
      ? `${percentage.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
      : '0,00%';

  return `${amountText} (${percentageText})`;
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
    changeEl.textContent = companyValueChangeDisplay(state.company.company_value, change);
    changeEl.className = `company-value-change ${change > 0 ? 'company-value-change-positive' : change < 0 ? 'company-value-change-negative' : 'company-value-change-zero'}`;
  }
}

function updateCompanyBalanceUI(balance) {
  const cashValue = Number(balance || 0);
  if (state.company) state.company.cash_balance = cashValue;

  const statCash = document.getElementById('statCash');
  if (statCash) {
    statCash.textContent = balanceMoney(cashValue);
    statCash.classList.toggle('negative-balance', cashValue < 0);
  }

  const companyCash = document.getElementById('companyCashBalance');
  if (companyCash) {
    companyCash.textContent = balanceMoney(cashValue);
    companyCash.classList.toggle('negative-balance', cashValue < 0);
  }
}

async function refreshCompanyBalance() {
  if (!sb || !state.company?.id || document.visibilityState === 'hidden') return;

  const { data, error } = await sb
    .from('companies')
    .select('cash_balance')
    .eq('id', state.company.id)
    .maybeSingle();

  if (error) {
    console.warn('Kontostand-Aktualisierung:', error.message);
    return;
  }

  if (data) updateCompanyBalanceUI(data.cash_balance);
}

function stopCompanyBalanceWatcher() {
  if (companyBalancePollTimer) clearInterval(companyBalancePollTimer);
  companyBalancePollTimer = null;

  if (companyBalanceChannel && sb) {
    sb.removeChannel(companyBalanceChannel);
  }
  companyBalanceChannel = null;
}

function startCompanyBalanceWatcher() {
  stopCompanyBalanceWatcher();
  if (!sb || !state.company?.id) return;

  const companyId = state.company.id;

  companyBalanceChannel = sb
    .channel(`company-balance-${companyId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'companies',
        filter: `id=eq.${companyId}`
      },
      payload => {
        if (payload?.new && Object.prototype.hasOwnProperty.call(payload.new, 'cash_balance')) {
          const previous = Number(state.company?.cash_balance || 0);
          const next = Number(payload.new.cash_balance || 0);
          if (next !== previous) updateCompanyBalanceUI(next);
        }
      }
    )
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Kontostand-Realtime nicht verfügbar – Sicherheitsabfrage bleibt aktiv.');
      }
    });

  refreshCompanyBalance();
  companyBalancePollTimer = setInterval(refreshCompanyBalance, 10000);
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

function nextMarketRefreshAt(now = new Date()) {
  const next = new Date(now);
  next.setSeconds(0, 0);
  const nextQuarter = (Math.floor(next.getMinutes() / 15) + 1) * 15;
  next.setMinutes(nextQuarter);
  return next;
}

function updateMarketRefreshTimer() {
  const el = document.getElementById('marketRefreshTimer');
  if (!el) return;

  const now = new Date();
  const next = nextMarketRefreshAt(now);
  const remainingSeconds = Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const countdown = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const nextTime = next.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });

  el.textContent = `${nextTime} Uhr · ${countdown} ${remainingSeconds < 60 ? 'Sekunden' : 'Minuten'}`;
}

function stopNpcMarketHeartbeat() {
  if (npcMarketTimer) clearTimeout(npcMarketTimer);
  npcMarketTimer = null;
  if (npcMarketCountdownTimer) clearInterval(npcMarketCountdownTimer);
  npcMarketCountdownTimer = null;
}

async function runNpcMarketTickAndRefresh() {
  if (!sb || !state.company?.id || document.visibilityState === 'hidden') return;

  const { error } = await sb.rpc('run_npc_market_tick');
  if (error) console.warn('NPC-Markt-Tick:', error.message);

  if (document.getElementById('market')?.classList.contains('active-view')) {
    await loadGameData();
  }
}

function scheduleNextNpcMarketRefresh() {
  const next = nextMarketRefreshAt();
  const delay = Math.max(250, next.getTime() - Date.now() + 250);

  npcMarketTimer = setTimeout(async () => {
    updateMarketRefreshTimer();
    await runNpcMarketTickAndRefresh();
    updateMarketRefreshTimer();
    scheduleNextNpcMarketRefresh();
  }, delay);
}

function startNpcMarketHeartbeat() {
  stopNpcMarketHeartbeat();
  updateMarketRefreshTimer();
  npcMarketCountdownTimer = setInterval(updateMarketRefreshTimer, 1000);
  scheduleNextNpcMarketRefresh();
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
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', async () => {
    const view = btn.dataset.view;
    const requiredLevel = featureRequiredLevel(view);
    if (requiredLevel && !featureUnlocked(view)) {
      await gameAlert(`${btn.dataset.baseLabel || btn.textContent.replace(/\s*🔒.*$/, '')} wird auf Unternehmenslevel ${requiredLevel} freigeschaltet.`);
      return;
    }

    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));
    document.getElementById(view).classList.add('active-view');
    document.getElementById('pageTitle').textContent = btn.dataset.baseLabel || btn.textContent;
  }));
}
bindNavigation();




const customSelectState = {
  openSelect: null,
  menu: null,
  focusedIndex: -1,
  observer: null
};

function customSelectLabel(select) {
  const option = select?.selectedOptions?.[0] || select?.options?.[select.selectedIndex] || null;
  return option?.textContent?.trim() || 'Bitte wählen';
}

function ensureCustomSelectMenu() {
  if (customSelectState.menu) return customSelectState.menu;

  const menu = document.createElement('div');
  menu.id = 'ocSelectMenu';
  menu.className = 'oc-select-menu hidden';
  menu.setAttribute('role', 'listbox');
  document.body.appendChild(menu);

  menu.addEventListener('click', event => {
    const optionButton = event.target.closest('.oc-select-option');
    if (!optionButton || optionButton.disabled) return;

    const select = customSelectState.openSelect;
    if (!select) return;

    const index = Number(optionButton.dataset.optionIndex);
    const option = select.options[index];
    if (!option || option.disabled) return;

    select.selectedIndex = index;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncCustomSelect(select);
    closeCustomSelect();
  });

  customSelectState.menu = menu;
  return menu;
}

function customSelectWrapper(select) {
  return select?.closest?.('.oc-select') || null;
}

function customSelectTrigger(select) {
  return customSelectWrapper(select)?.querySelector('.oc-select-trigger') || null;
}

function buildCustomSelectOptions(select) {
  const menu = ensureCustomSelectMenu();
  menu.innerHTML = '';
  menu.setAttribute('aria-label', select.getAttribute('aria-label') || select.id || 'Auswahl');

  let flatOptionIndex = 0;
  const children = Array.from(select.children);

  if (!select.options.length) {
    menu.innerHTML = '<div class="oc-select-empty">Keine Auswahl verfügbar</div>';
    return [];
  }

  const optionButtons = [];

  const appendOption = option => {
    const index = Array.from(select.options).indexOf(option);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'oc-select-option';
    button.dataset.optionIndex = String(index);
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', option.selected ? 'true' : 'false');
    button.disabled = option.disabled || select.disabled;
    button.innerHTML = `<span>${escapeHtml(option.textContent?.trim() || '')}</span><span class="oc-select-check">✓</span>`;
    if (option.selected) button.classList.add('selected');
    menu.appendChild(button);
    optionButtons.push(button);
    flatOptionIndex++;
  };

  children.forEach(child => {
    if (child.tagName === 'OPTGROUP') {
      const heading = document.createElement('div');
      heading.className = 'oc-select-group';
      heading.textContent = child.label || '';
      menu.appendChild(heading);
      Array.from(child.children).forEach(option => appendOption(option));
    } else if (child.tagName === 'OPTION') {
      appendOption(child);
    }
  });

  return optionButtons;
}

function positionCustomSelectMenu(select) {
  const trigger = customSelectTrigger(select);
  const menu = ensureCustomSelectMenu();
  if (!trigger || menu.classList.contains('hidden')) return;

  const rect = trigger.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const gap = 6;

  if (window.innerWidth <= 720) {
    menu.style.top = `${Math.min(rect.bottom + gap, viewportHeight - 80)}px`;
    menu.style.bottom = 'auto';
    menu.style.width = 'auto';
    return;
  }

  const width = Math.max(rect.width, 220);
  menu.style.width = `${Math.min(width, window.innerWidth - 20)}px`;
  menu.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - width - 10))}px`;

  const estimatedHeight = Math.min(menu.scrollHeight || 320, 420, viewportHeight * .52);
  const roomBelow = viewportHeight - rect.bottom - gap;
  const roomAbove = rect.top - gap;

  if (roomBelow >= Math.min(estimatedHeight, 180) || roomBelow >= roomAbove) {
    menu.style.top = `${rect.bottom + gap}px`;
    menu.style.bottom = 'auto';
  } else {
    menu.style.top = 'auto';
    menu.style.bottom = `${viewportHeight - rect.top + gap}px`;
  }
}

function openCustomSelect(select) {
  if (!select || select.disabled) return;

  if (customSelectState.openSelect && customSelectState.openSelect !== select) {
    closeCustomSelect();
  }

  syncCustomSelect(select);
  customSelectState.openSelect = select;

  const trigger = customSelectTrigger(select);
  const menu = ensureCustomSelectMenu();
  const buttons = buildCustomSelectOptions(select);

  trigger?.setAttribute('aria-expanded', 'true');
  menu.classList.remove('hidden');
  positionCustomSelectMenu(select);

  const selectedButtonIndex = buttons.findIndex(button => button.classList.contains('selected') && !button.disabled);
  customSelectState.focusedIndex = selectedButtonIndex >= 0
    ? selectedButtonIndex
    : buttons.findIndex(button => !button.disabled);

  buttons.forEach((button, i) => button.classList.toggle('focused', i === customSelectState.focusedIndex));
  buttons[customSelectState.focusedIndex]?.scrollIntoView({ block: 'nearest' });
}

function closeCustomSelect() {
  const select = customSelectState.openSelect;
  const trigger = customSelectTrigger(select);
  trigger?.setAttribute('aria-expanded', 'false');

  const menu = ensureCustomSelectMenu();
  menu.classList.add('hidden');
  menu.style.top = '';
  menu.style.bottom = '';
  menu.style.left = '';
  menu.style.width = '';

  customSelectState.openSelect = null;
  customSelectState.focusedIndex = -1;
}

function moveCustomSelectFocus(direction) {
  const menu = ensureCustomSelectMenu();
  const buttons = Array.from(menu.querySelectorAll('.oc-select-option'));
  if (!buttons.length) return;

  let index = customSelectState.focusedIndex;
  for (let tries = 0; tries < buttons.length; tries++) {
    index = (index + direction + buttons.length) % buttons.length;
    if (!buttons[index].disabled) break;
  }

  customSelectState.focusedIndex = index;
  buttons.forEach((button, i) => button.classList.toggle('focused', i === index));
  buttons[index]?.scrollIntoView({ block: 'nearest' });
}

function syncCustomSelect(select) {
  if (!select || !select.classList?.contains('oc-select-native')) return;

  const trigger = customSelectTrigger(select);
  if (!trigger) return;

  const text = trigger.querySelector('.oc-select-trigger-text');
  if (text) text.textContent = customSelectLabel(select);

  trigger.disabled = select.disabled;
  trigger.setAttribute('aria-disabled', select.disabled ? 'true' : 'false');

  if (customSelectState.openSelect === select) {
    buildCustomSelectOptions(select);
    positionCustomSelectMenu(select);
  }
}

function enhanceCustomSelect(select) {
  if (!select || select.dataset.ocSelectEnhanced === '1') {
    if (select) syncCustomSelect(select);
    return;
  }

  select.dataset.ocSelectEnhanced = '1';
  select.classList.add('oc-select-native');

  const wrapper = document.createElement('div');
  wrapper.className = 'oc-select';

  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'oc-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = '<span class="oc-select-trigger-text"></span><span class="oc-select-chevron" aria-hidden="true"></span>';
  wrapper.appendChild(trigger);

  trigger.addEventListener('click', event => {
    event.preventDefault();
    if (customSelectState.openSelect === select) closeCustomSelect();
    else openCustomSelect(select);
  });

  trigger.addEventListener('keydown', event => {
    if (select.disabled) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (customSelectState.openSelect !== select) openCustomSelect(select);
      else moveCustomSelectFocus(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (customSelectState.openSelect !== select) {
        openCustomSelect(select);
      } else {
        const button = ensureCustomSelectMenu().querySelectorAll('.oc-select-option')[customSelectState.focusedIndex];
        button?.click();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeCustomSelect();
    }
  });

  select.addEventListener('change', () => syncCustomSelect(select));

  const observer = new MutationObserver(() => syncCustomSelect(select));
  observer.observe(select, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'selected', 'label']
  });

  syncCustomSelect(select);
}

function enhanceAllCustomSelects(root = document) {
  root.querySelectorAll?.('select').forEach(enhanceCustomSelect);
}

document.addEventListener('click', event => {
  if (!customSelectState.openSelect) return;
  const wrapper = customSelectWrapper(customSelectState.openSelect);
  const menu = ensureCustomSelectMenu();
  if (wrapper?.contains(event.target) || menu.contains(event.target)) return;
  closeCustomSelect();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && customSelectState.openSelect) closeCustomSelect();
});

window.addEventListener('resize', () => {
  if (customSelectState.openSelect) positionCustomSelectMenu(customSelectState.openSelect);
});

window.addEventListener('scroll', () => {
  if (customSelectState.openSelect) closeCustomSelect();
}, true);

function setAccountStatus(text, type='') {
  const el = document.getElementById('accountStatus');
  if (!el) return;
  msg(el, text, type);
}

function renderAccountSettings() {
  const emailEl = document.getElementById('accountEmail');
  const emailInput = document.getElementById('accountNewEmail');
  const userEmail = state.session?.user?.email || '';

  if (emailEl) emailEl.textContent = userEmail || 'Keine E-Mail hinterlegt';
  if (emailInput && !emailInput.value) emailInput.value = userEmail;
}

function setAccountEditMode(editing) {
  const summary = document.getElementById('accountDataSummary');
  const form = document.getElementById('accountEditForm');
  if (!summary || !form) return;

  summary.classList.toggle('hidden', editing);
  form.classList.toggle('hidden', !editing);

  if (editing) {
    const emailInput = document.getElementById('accountNewEmail');
    const passwordInput = document.getElementById('accountNewPassword');
    const confirmInput = document.getElementById('accountNewPasswordConfirm');

    if (emailInput) emailInput.value = state.session?.user?.email || '';
    if (passwordInput) passwordInput.value = '';
    if (confirmInput) confirmInput.value = '';
    setAccountStatus('');
    emailInput?.focus();
  }
}

async function updateAccountData(event) {
  event.preventDefault();

  const emailInput = document.getElementById('accountNewEmail');
  const passwordInput = document.getElementById('accountNewPassword');
  const confirmInput = document.getElementById('accountNewPasswordConfirm');
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');

  const currentEmail = state.session?.user?.email || '';
  const newEmail = String(emailInput?.value || '').trim();
  const newPassword = String(passwordInput?.value || '');
  const confirmPassword = String(confirmInput?.value || '');

  const emailChanged = !!newEmail && newEmail.toLowerCase() !== currentEmail.toLowerCase();
  const passwordChanged = newPassword.length > 0;

  if (!emailChanged && !passwordChanged) {
    setAccountStatus('Es wurden keine Änderungen vorgenommen.', 'error');
    return;
  }

  if (passwordChanged && newPassword !== confirmPassword) {
    setAccountStatus('Die beiden Passwörter stimmen nicht überein.', 'error');
    return;
  }

  if (passwordChanged && newPassword.length < 6) {
    setAccountStatus('Das neue Passwort muss mindestens 6 Zeichen lang sein.', 'error');
    return;
  }

  const updates = {};
  if (emailChanged) updates.email = newEmail;
  if (passwordChanged) updates.password = newPassword;

  if (submitButton) submitButton.disabled = true;
  setAccountStatus('Account-Daten werden geändert …');

  try {
    const { data, error } = await sb.auth.updateUser(updates);
    if (error) throw error;

    if (data?.user) {
      state.session = {
        ...state.session,
        user: data.user
      };
    }

    const { data: refreshed } = await sb.auth.getSession();
    if (refreshed?.session) state.session = refreshed.session;

    renderAccountSettings();

    if (emailChanged) {
      setAccountStatus(
        'Änderung gespeichert. Falls E-Mail-Bestätigung aktiviert ist, bestätige bitte die neue Adresse über die zugesandte E-Mail.',
        'success'
      );
    } else {
      setAccountStatus('Passwort erfolgreich geändert.', 'success');
    }

    if (passwordInput) passwordInput.value = '';
    if (confirmInput) confirmInput.value = '';

    setTimeout(() => setAccountEditMode(false), 1800);
  } catch (error) {
    setAccountStatus(error?.message || 'Account-Daten konnten nicht geändert werden.', 'error');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function setPushStatus(text, type='') {
  const el = document.getElementById('pushStatus');
  if (!el) return;
  msg(el, text, type);
}

async function getPushRegistration() {
  if (!pushSupported()) return null;
  await navigator.serviceWorker.register('service-worker.js');
  return navigator.serviceWorker.ready;
}

async function savePushPreferences(enabled = true) {
  if (!sb || !state.session?.user?.id) return;

  const { error } = await sb.from('push_preferences').upsert({
    user_id: state.session.user.id,
    production_enabled: enabled,
    retail_enabled: enabled,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });

  if (error) {
    setPushStatus(`Einstellungen konnten nicht gespeichert werden: ${error.message}`, 'error');
  }
}

async function enablePushNotifications() {
  if (!pushSupported()) {
    setPushStatus('Dieser Browser unterstützt keine Push-Benachrichtigungen.', 'error');
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    setPushStatus(
      permission === 'denied'
        ? 'Benachrichtigungen sind im Browser blockiert.'
        : 'Benachrichtigungen wurden nicht aktiviert.',
      'error'
    );
    return false;
  }

  const { data: configData, error: configError } = await sb
    .from('push_config')
    .select('vapid_public_key')
    .eq('singleton', true)
    .maybeSingle();

  if (configError || !configData?.vapid_public_key) {
    setPushStatus('Push-Konfiguration konnte nicht geladen werden.', 'error');
    return false;
  }

  const registration = await getPushRegistration();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(configData.vapid_public_key)
    });
  }

  const json = subscription.toJSON();
  const { error: saveError } = await sb.from('push_subscriptions').upsert({
    user_id: state.session.user.id,
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent,
    enabled: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'endpoint' });

  if (saveError) {
    setPushStatus(`Push-Abo konnte nicht gespeichert werden: ${saveError.message}`, 'error');
    return false;
  }

  await savePushPreferences(true);
  setPushStatus('Push-Benachrichtigungen sind auf diesem Gerät aktiv.', 'success');
  return true;
}

async function disablePushNotifications() {
  if (!pushSupported() || !state.session?.user?.id) return;

  const registration = await getPushRegistration();
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await sb.from('push_subscriptions')
      .delete()
      .eq('user_id', state.session.user.id)
      .eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  }

  await savePushPreferences(false);
  setPushStatus('Push-Benachrichtigungen sind auf diesem Gerät deaktiviert.');
}

async function loadPushSettings() {
  const pushToggle = document.getElementById('pushEnabled');
  if (!pushToggle || !state.session?.user?.id) return;

  if (!pushSupported()) {
    pushToggle.checked = false;
    pushToggle.disabled = true;
    setPushStatus('Dieser Browser unterstützt keine Push-Benachrichtigungen.', 'error');
    return;
  }

  const registration = await getPushRegistration();
  const subscription = await registration.pushManager.getSubscription();
  const active = Notification.permission === 'granted' && !!subscription;
  pushToggle.checked = active;

  if (active) {
    await savePushPreferences(true);
  }

  if (Notification.permission === 'denied') {
    setPushStatus('Benachrichtigungen sind im Browser blockiert.', 'error');
  } else if (active) {
    setPushStatus('Push-Benachrichtigungen sind auf diesem Gerät aktiv.', 'success');
  } else {
    setPushStatus('Push-Benachrichtigungen sind auf diesem Gerät nicht aktiviert.');
  }
}

function openViewFromHash() {
  const view = location.hash.replace(/^#/, '');
  if (!view) return;
  const btn = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (btn && state.company) btn.click();
}

async function init() {
  enhanceAllCustomSelects(document);
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
    stopCompanyBalanceWatcher();
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

    const dailyXp = await sb.rpc('claim_daily_login_xp', { p_company_id: data.id });
    if (dailyXp.error) console.warn('Tägliche XP:', dailyXp.error.message);

    const completedBuildings = await sb.rpc('complete_due_buildings', { p_company_id: data.id });
    if (completedBuildings.error) console.warn('Gebäudebau:', completedBuildings.error.message);
    const completedJobs = await sb.rpc('complete_due_production_jobs', { p_company_id: data.id });
    if (completedJobs.error) console.warn('Produktionsabschluss:', completedJobs.error.message);
    const completedRetailSales = await sb.rpc('complete_due_retail_sales', { p_company_id: data.id });
    if (completedRetailSales.error) console.warn('Handelsabschluss:', completedRetailSales.error.message);

    const refreshed = await sb.from('companies').select('*').eq('id', data.id).single();
    if (!refreshed.error && refreshed.data) state.company = refreshed.data;

    startCompanyBalanceWatcher();
    await loadGameData();
    await loadPushSettings();
    renderAccountSettings();
    openViewFromHash();
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
    sb.from('market_trades').select('id,buyer_company_id,seller_company_id,product_id,material_id,quantity,price_per_unit,total_value,quality_level,executed_at,products(name,category)').eq('buyer_company_id',cid).order('executed_at',{ascending:false}).limit(500),
    sb.from('contracts').select('*').or(`seller_company_id.eq.${cid},buyer_company_id.eq.${cid}`).order('created_at',{ascending:false}),
    sb.rpc('list_companies'),
    sb.rpc('get_company_debt', { p_company_id: cid }),
    sb.rpc('get_bond_dashboard', { p_company_id: cid }),
    sb.from('company_valuation_history').select('valuation_date,company_value,previous_company_value,change_amount,calculated_at').eq('company_id',cid).order('valuation_date',{ascending:false}).limit(1)
  ]);

  const labels = ['Produkte','Alle Produkte','Produktlager','Materialien','Materiallager','Rezepte','Gebäudetypen','Gebäude','Produktionen','Handelsverkäufe','Finanzen','Marktorders','Marktkäufe','Verträge','Firmenverzeichnis','Kreditschulden','Anleihen','Unternehmenswert-Verlauf'];
  const errors = results.map((r,i)=>r.error ? { label: labels[i], error:r.error } : null).filter(Boolean);
  if (errors.length) {
    console.error(errors);
    showGameDataError(errors);
    return;
  }
  clearGameDataError();

  const [products, allProducts, inventory, materials, materialInventory, recipes, buildingTypes, buildings, productionJobs, retailSaleJobs, tx, orders, marketTrades, contracts, directory, companyDebt, bondDashboard, valuationHistory] = results;
  state.products = products.data;
  state.allProducts = allProducts.data;
  state.inventory = inventory.data;
  state.materials = materials.data;
  state.materialInventory = materialInventory.data;
  state.recipes = recipes.data.filter(r => state.products.some(p => p.id === r.product_id));
  state.buildingTypes = buildingTypes.data;
  state.buildings = buildings.data;
  if (state.selectedBuildingId && !state.buildings.some(b => b.id === state.selectedBuildingId)) state.selectedBuildingId = null;
  if (state.selectedRetailBuildingId && !state.buildings.some(b => b.id === state.selectedRetailBuildingId)) state.selectedRetailBuildingId = null;
  state.productionJobs = productionJobs.data;
  state.retailSaleJobs = retailSaleJobs.data;
  state.transactions = tx.data;
  state.marketOrders = orders.data;
  state.marketTrades = marketTrades.data || [];
  state.contracts = contracts.data;
  state.companyDirectory = directory.data || [];
  state.companyDebt = Number(companyDebt.data || 0);
  state.bondDashboard = bondDashboard.data || null;
  state.companyValueChange = Number(valuationHistory.data?.[0]?.change_amount || 0);
  renderAll();
}

function currentProductionContext() {
  const selectedBuilding = state.buildings.find(
    building => building.id === state.selectedBuildingId && building.status === 'active'
  ) || null;

  const runningJob = selectedBuilding
    ? state.productionJobs.find(job => job.building_id === selectedBuilding.id && job.status === 'running') || null
    : null;

  const selectedProductId = document.getElementById('productionProduct')?.value || '';
  const productId = runningJob?.product_id || selectedProductId;
  const product = state.products.find(p => p.id === productId) || null;
  const buildingType = selectedBuilding
    ? state.buildingTypes.find(type => type.id === selectedBuilding.building_type_id) || null
    : null;

  const buildingCanProduce = !!selectedBuilding
    && !!product
    && product.required_building_type_id === selectedBuilding.building_type_id
    && buildingType?.building_category !== 'retail';

  const building = buildingCanProduce ? selectedBuilding : null;
  const multiplier = building ? buildingLevelMultiplier(building.level) : 1;
  const baseProductRate = Number(product?.base_production_rate || 0);
  const unitsPerHour = buildingType && building && baseProductRate > 0
    ? Math.max(1, Math.floor(baseProductRate * multiplier))
    : 0;

  return {
    productId, product, buildingType, building, multiplier, unitsPerHour,
    runningJob,
    freeBuilding: building && !runningJob ? building : null,
    matchingBuildingCount: building ? 1 : 0,
    baseProductRate,
    qualityLevel: productQuality(product),
    minInputQuality: minimumInputQuality(product)
  };
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
  const requiredQuality = Number(input.minQuality || 1);
  const component = input.component_product_id ? state.products.find(p => p.id === input.component_product_id) : null;
  return state.marketOrders
    .filter(order => {
      if (order.order_type !== 'sell' || !['open','partially_filled'].includes(order.status) || order.company_id === state.company?.id || Number(order.remaining_quantity || 0) <= 0) return false;
      if (Number(order.quality_level || 1) < requiredQuality) return false;
      if (input.material_id) return order.material_id === input.material_id;
      if (component && order.product_id) {
        const marketProduct = state.allProducts.find(p => p.id === order.product_id);
        return marketProduct?.name === component.name && marketProduct?.category === component.category;
      }
      return false;
    })
    .sort((a,b)=>Number(a.price_per_unit||0)-Number(b.price_per_unit||0));
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
    const minQuality = minimumInputQuality(ctx.product);
    if (r.material_id) {
      const m = state.materials.find(x => x.id === r.material_id);
      const summary = inventoryLotSummary(materialInventoryLots(r.material_id), minQuality);
      name = m?.name || '–';
      unit = m?.unit || '';
      available = summary.quantity;
      averageUnitCost = summary.averageUnitCost;
    } else {
      const p = state.products.find(x => x.id === r.component_product_id);
      const summary = inventoryLotSummary(productInventoryLots(r.component_product_id), minQuality);
      name = p?.name || '–';
      available = summary.quantity;
      averageUnitCost = summary.averageUnitCost;
    }

    const required = Number(r.quantity_per_unit || 0) * outputQty;
    const enough = available + 1e-9 >= required;
    const input = { ...r, name, unit, available, averageUnitCost, required, enough, minQuality };
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
    productSelect.disabled = true;
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
    `<div class="kv"><span>Produktqualität</span><strong>Q${runningJob ? Number(runningJob.quality_level || 1) : productQuality(plan.product)} (+${Math.round((qualityMultiplier(runningJob ? runningJob.quality_level : productQuality(plan.product))-1)*100)}% Wert)</strong></div>`,
    `<div class="kv"><span>Mindestqualität Inputs</span><strong>Q${runningJob ? Math.max(1, Number(runningJob.quality_level || 1)-1) : minimumInputQuality(plan.product)}</strong></div>`,
    `<div class="kv"><span>Gebäudelevel</span><strong>${building ? `Level ${building.level}` : 'Nicht gebaut'}</strong></div>`,
    `<div class="kv"><span>Produkt-Basisrate</span><strong>${plan.product ? `${num(plan.product.base_production_rate || 0)} Einheiten / Std.` : '–'}</strong></div>`,
    `<div class="kv"><span>Produktionsrate</span><strong>${building ? `${num(unitsPerHour)} Einheiten / Std.` : '–'}</strong></div>`,
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
      <td>Q${input.minQuality}+</td>
      <td>${num(input.quantity_per_unit)} ${input.unit}</td>
      <td class="material-amount ${input.enough ? '' : 'missing'}">${num(input.required)} ${input.unit}</td>
      <td class="material-amount ${input.enough ? '' : 'missing'}">${num(input.available)} ${input.unit}</td>
      <td>${buyButton}</td>
    </tr>`;
  });

  document.getElementById('productionRecipe').innerHTML = rows.length
    ? renderTable(['Typ','Input','Qualität','Bedarf je Einheit','Benötigt','Bestand','Aktion'], rows)
    : (plan.product?.category === 'research'
      ? '<div class="research-production-note">Keine Rohstoffe benötigt. Forschungseinheiten benötigen ausschließlich Geld: 12 OC$ Grundkosten + 14 OC$ Personalkosten pro Einheit.</div>'
      : renderTable(['Typ','Input','Qualität','Bedarf je Einheit','Benötigt','Bestand','Aktion'], rows));

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
  const slots = buildingSlotsForLevel(state.company?.company_level);
  const used = state.buildings.length;
  const noFreeSlot = used >= slots;

  const rows = state.buildingTypes
    .filter(bt => selectedCategory === 'all' || bt.building_category === selectedCategory)
    .map(bt => {
      const cost = Number(bt.construction_cost || 0);
      const buildHours = buildingConstructionHours(1);
      const count = state.buildings.filter(b => b.building_type_id === bt.id).length;

      return `<tr>
        <td>${bt.name}</td>
        <td>${buildingCategoryLabel(bt.building_category)}</td>
        <td>${count}</td>
        <td><span class="building-construction-cost">-${money(Math.abs(cost))}</span></td>
        <td>${formatBuildingConstructionTime(buildHours)}</td>
        <td>
          <button
            class="building-catalog-build-btn"
            ${noFreeSlot ? 'disabled' : ''}
            onclick="buildBuilding('${bt.id}')"
          >${noFreeSlot ? 'Keine Plätze' : 'Bauen'}</button>
        </td>
      </tr>`;
    });

  table.innerHTML = renderTable(
    ['Gebäude', 'Kategorie', 'Anzahl', 'Baukosten', 'Bauzeit', 'Aktion'],
    rows
  );
}

function buildingDisplayNumber(building) {
  const siblings = state.buildings
    .filter(b => b.building_type_id === building.building_type_id)
    .sort((a,b) => new Date(a.built_at || 0) - new Date(b.built_at || 0) || String(a.id).localeCompare(String(b.id)));
  return Math.max(1, siblings.findIndex(b => b.id === building.id) + 1);
}

function buildingJobProgress(job) {
  if (!job?.started_at || !job?.finishes_at) return 0;
  const start = new Date(job.started_at).getTime();
  const end = new Date(job.finishes_at).getTime();
  return end > start ? Math.max(0, Math.min(100, (Date.now()-start)/(end-start)*100)) : 0;
}

function renderBuildings() {
  const slots = buildingSlotsForLevel(state.company?.company_level);
  const usedSlots = state.buildings.length;
  const slotsEl = document.getElementById('buildingSlotsSummary');
  if (slotsEl) {
    slotsEl.innerHTML = `<span>Gebäudeplätze</span><strong>${usedSlots} / ${slots}</strong>`;
    slotsEl.classList.toggle('building-slots-over', usedSlots > slots);
  }

  const selectable = state.buildings.filter(building => {
    const type = state.buildingTypes.find(bt => bt.id === building.building_type_id);
    return building.status === 'active' && type?.building_category !== 'retail';
  });
  if (!state.buildings.some(b => b.id === state.selectedBuildingId) && selectable.length) {
    state.selectedBuildingId = selectable[0].id;
  }

  const filter = state.buildingOverviewFilter || 'all';
  const html = state.buildings
    .filter(building => {
      const type = state.buildingTypes.find(bt => bt.id === building.building_type_id);
      return filter === 'all' || type?.building_category === filter;
    })
    .map(building => {
      const bt = state.buildingTypes.find(type => type.id === building.building_type_id);
      if (!bt) return '';

      const number = buildingDisplayNumber(building);
      const selected = state.selectedBuildingId === building.id || state.selectedRetailBuildingId === building.id;
      const underConstruction = building.status === 'inactive' && !!building.construction_complete_at;
      const prodJob = state.productionJobs.find(j => j.building_id === building.id && j.status === 'running') || null;
      const retailJob = state.retailSaleJobs.find(j => j.building_id === building.id && j.status === 'running') || null;
      const job = prodJob || retailJob;
      const product = job ? state.products.find(p => p.id === job.product_id) : null;
      const inUse = !!job;
      const isRetail = bt.building_category === 'retail';
      const level = Number(building.level || 1);

      let statusClass = 'free', statusText = 'Frei';
      if (underConstruction) { statusClass='building'; statusText='Im Bau / Ausbau'; }
      else if (prodJob) { statusClass='running'; statusText='Produktion läuft'; }
      else if (retailJob) { statusClass='running'; statusText='Verkauf läuft'; }

      let jobHtml = '';
      if (job) {
        const finish = new Date(job.finishes_at);
        const progress = buildingJobProgress(job);
        const detail = prodJob
          ? `${num(Math.max(0, Number(job.output_quantity||0)-Number(job.claimed_quantity||0)))} Einheiten offen`
          : `${num(Math.max(0, Number(job.quantity||0)-retailSoldQuantity(job)))} Einheiten offen`;
        jobHtml = `<div class="building-card-job">
          <strong>${product?.name || 'Auftrag'} · Q${Number(job.quality_level || 1)}</strong>
          <span class="building-card-meta">${detail}</span>
          <div class="building-card-progress"><span style="width:${progress}%"></span></div>
          <span class="building-card-meta">Ende ${finish.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} Uhr</span>
        </div>`;
      }

      let actions = '';
      if (underConstruction) {
        actions = `<button type="button" class="ghost" onclick="event.stopPropagation();cancelBuildingConstruction('${building.id}','${bt.id}')">Bau abbrechen</button>`;
      } else if (isRetail) {
        actions = `<button type="button" onclick="event.stopPropagation();openRetailBuilding('${building.id}')">${inUse ? 'Verkauf öffnen' : 'Im Handel verwenden'}</button>`;
        if (!inUse) actions += `<button type="button" class="ghost" onclick="event.stopPropagation();upgradeBuilding('${building.id}','${bt.id}')">Ausbauen</button>
          <button type="button" class="ghost" onclick="event.stopPropagation();downgradeBuilding('${building.id}','${bt.id}')">${level<=1?'Abreißen':'Abstufen'}</button>`;
      } else {
        actions = `<button type="button" onclick="event.stopPropagation();selectBuildingCard('${building.id}')">${inUse ? 'Auftrag öffnen' : 'Auswählen'}</button>`;
        if (!inUse) actions += `<button type="button" class="ghost" onclick="event.stopPropagation();upgradeBuilding('${building.id}','${bt.id}')">Ausbauen</button>
          <button type="button" class="ghost" onclick="event.stopPropagation();downgradeBuilding('${building.id}','${bt.id}')">${level<=1?'Abreißen':'Abstufen'}</button>`;
      }

      const click = underConstruction ? '' : (isRetail ? `onclick="openRetailBuilding('${building.id}')"` : `onclick="selectBuildingCard('${building.id}')"`);
      return `<div class="building-card ${selected?'selected':''} ${underConstruction?'under-construction':''}" ${click}>
        <div class="building-card-head"><div>
          <div class="building-card-title">${bt.name} #${number}</div>
          <div class="building-card-meta">Level ${level} · ${buildingCategoryLabel(bt.building_category)}</div>
        </div></div>
        <span class="building-card-status ${statusClass}">${statusText}</span>
        ${jobHtml}
        <div class="building-card-actions">${actions}</div>
      </div>`;
    }).filter(Boolean).join('');

  const cards = document.getElementById('buildingCards');
  if (cards) cards.innerHTML = html || '<div class="production-building-empty">In dieser Kategorie sind noch keine Gebäude vorhanden.</div>';

  document.querySelectorAll('.building-overview-filter').forEach(button => {
    button.classList.toggle('active', button.dataset.buildingFilter === filter);
  });

  const selected = state.buildings.find(b => b.id === state.selectedBuildingId) || null;
  const selectedType = selected ? state.buildingTypes.find(bt => bt.id === selected.building_type_id) : null;
  const isRetailSelected = selectedType?.building_category === 'retail';

  const productionControl = document.getElementById('productionControlPanel');
  const retailControl = document.getElementById('retailControlPanel');
  if (productionControl) productionControl.classList.toggle('hidden', !selected || isRetailSelected);
  if (retailControl) retailControl.classList.toggle('hidden', !selected || !isRetailSelected);

  const heading = document.getElementById('productionSelectedHeading');
  const hint = document.getElementById('productionSelectedHint');
  if (heading && hint && selected && selectedType && !isRetailSelected) {
    heading.textContent = `${selectedType.name} #${buildingDisplayNumber(selected)} · Produktion`;
    const running = state.productionJobs.find(j => j.building_id === selected.id && j.status === 'running');
    hint.textContent = running
      ? 'Dieses Gebäude hat bereits einen laufenden Produktionsauftrag.'
      : 'Dieses Gebäude ist frei. Wähle ein Produkt und starte die Produktion.';
  }

  const retailHeading = document.getElementById('retailSelectedHeading');
  const retailHint = document.getElementById('retailSelectedHint');
  if (retailHeading && retailHint && selected && selectedType && isRetailSelected) {
    retailHeading.textContent = `${selectedType.name} #${buildingDisplayNumber(selected)} · Handelsverkauf`;
    const running = state.retailSaleJobs.find(j => j.building_id === selected.id && j.status === 'running');
    retailHint.textContent = running
      ? 'Dieses Geschäft hat bereits einen laufenden Verkaufsauftrag.'
      : 'Dieses Geschäft ist frei. Wähle Produkt, Preis und Menge.';
  }

  renderBuildingCatalog();
}

window.selectBuildingCard = function(buildingId) {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || building.status !== 'active') return;
  const type = state.buildingTypes.find(bt => bt.id === building.building_type_id);
  if (type?.building_category === 'retail') return openRetailBuilding(buildingId);

  state.selectedBuildingId = buildingId;
  state.selectedRetailBuildingId = null;
  updateProductionProductsForSelectedBuilding();
  renderBuildings();
  renderProductionRecipe();
};

window.openRetailBuilding = function(buildingId) {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || building.status !== 'active') return;
  const type = state.buildingTypes.find(bt => bt.id === building.building_type_id);
  if (type?.building_category !== 'retail') return;

  state.selectedBuildingId = buildingId;
  state.selectedRetailBuildingId = buildingId;
  updateProductionProductsForSelectedBuilding();
  renderBuildings();
  renderRetailSale();

  document.querySelector('.nav-item[data-view="production"]')?.click();
};

function retailSaleContext() {
  const productId = document.getElementById('retailProduct')?.value;
  const product = state.products.find(p => p.id === productId);
  const quality = Number(document.getElementById('retailQuality')?.value || 1);
  const inventory = productLot(productId, quality);
  const buildingType = state.buildingTypes.find(bt => bt.id === product?.required_retail_building_type_id);

  let building = state.buildings.find(
    b => b.id === state.selectedRetailBuildingId && b.status === 'active'
  ) || null;

  if (building && product && building.building_type_id !== product.required_retail_building_type_id) building = null;

  const runningJob = building
    ? state.retailSaleJobs.find(job => job.building_id === building.id && job.status === 'running') || null
    : null;

  const multiplier = building ? buildingLevelMultiplier(building.level) : 1;
  const baseProductRetailRate = Number(product?.base_retail_rate || 0);
  const baseUnitsPerHour = buildingType && building && baseProductRetailRate > 0
    ? Math.max(1, Math.floor(baseProductRetailRate * multiplier))
    : 0;

  const productionCost = Number(inventory?.average_unit_cost || 0);
  const referencePrice = productionCost * 2 * qualityMultiplier(quality);
  const priceInput = document.getElementById('retailPrice');
  const enteredPrice = Number(priceInput?.value || 0);
  const price = enteredPrice > 0 ? enteredPrice : referencePrice;
  const priceRatio = referencePrice > 0 ? price / referencePrice : 1;
  const demandFactor = Math.max(0.10, Math.min(2.00, 1 - 0.375 * (priceRatio - 1)));
  const unitsPerHour = baseUnitsPerHour > 0 ? Math.max(1, Math.floor(baseUnitsPerHour * demandFactor)) : 0;

  return {
    product, inventory, buildingType, building, runningJob,
    baseProductRetailRate, baseUnitsPerHour, unitsPerHour,
    available: Number(inventory?.quantity || 0),
    productionCost, quality, referencePrice, price, demandFactor
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
        units: Math.floor(ctx.unitsPerHour * hours)
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

function rememberRetailQuantityExpression(input, rawValue, parsed) {
  if (!input) return;
  if (parsed?.matchedHours || parsed?.matchedTime) {
    input.dataset.quantityMode = parsed.matchedTime ? 'time' : 'hours';
    input.dataset.quantityExpression = String(rawValue ?? '').trim();
  } else {
    input.dataset.quantityMode = 'fixed';
    delete input.dataset.quantityExpression;
  }
}

function recalculateRetailQuantityFromRememberedExpression() {
  const qtyInput = document.getElementById('retailQty');
  if (!qtyInput?.dataset.quantityExpression) return false;

  const parsed = retailQuantityFromInput(qtyInput.dataset.quantityExpression);
  if (!(parsed.matchedHours || parsed.matchedTime)) {
    delete qtyInput.dataset.quantityMode;
    delete qtyInput.dataset.quantityExpression;
    return false;
  }

  const ctx = retailSaleContext();
  const available = Math.max(0, Math.floor(ctx.available || 0));
  const maxUnits24h = Math.max(0, Math.floor((ctx.unitsPerHour || 0) * 24));
  qtyInput.value = formatRetailQuantityInput(Math.min(parsed.units, available, maxUnits24h));
  return true;
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
  const qualitySelect = document.getElementById('retailQuality');
  const priceInput = document.getElementById('retailPrice');
  const maxBtn = document.getElementById('retailMaxBtn');
  const h24Btn = document.getElementById('retail24Btn');
  if (!select || !details || !button || !qtyInput) return;

  const runningRetailJobs = state.retailSaleJobs.filter(job => job.status === 'running');
  const retailProducts = retailSelectableProducts();
  const previous = select.value;

  select.innerHTML = retailProducts.length
    ? retailProducts.map(p => {
        const hasRunning = runningRetailJobs.some(job => job.product_id === p.id);
        return `<option value="${p.id}">${p.name}${hasRunning && !hasProductInventory(p.id) ? ' – Verkauf läuft' : ''}</option>`;
      }).join('')
    : '<option value="">Keine Handelsprodukte verfügbar</option>';

  if (retailProducts.some(p => p.id === previous)) select.value = previous;

  const retailLots = availableProductQualities(select.value);
  const previousQuality = qualitySelect?.value;
  const selectedRunningJob = state.selectedRetailBuildingId
    ? state.retailSaleJobs.find(job => job.status === 'running' && job.building_id === state.selectedRetailBuildingId)
    : state.retailSaleJobs.find(job => job.status === 'running' && job.product_id === select.value);
  if (qualitySelect) {
    const runningQuality = Number(selectedRunningJob?.quality_level || 1);
    qualitySelect.innerHTML = retailLots.length
      ? retailLots.map(l => `<option value="${Number(l.quality_level || 1)}">Q${Number(l.quality_level || 1)} – ${num(l.quantity)} verfügbar</option>`).join('')
      : selectedRunningJob
        ? `<option value="${runningQuality}">Q${runningQuality} – Verkauf läuft</option>`
        : '<option value="1">Q1 – 0 verfügbar</option>';
    if (selectedRunningJob && !retailLots.length) {
      qualitySelect.value = String(runningQuality);
    } else if (retailLots.some(l => String(l.quality_level) === String(previousQuality))) {
      qualitySelect.value = previousQuality;
    }
  }

  let ctx = retailSaleContext();

  if (priceInput && !priceInput.dataset.manualPrice && ctx.referencePrice > 0 && !ctx.runningJob) {
    priceInput.value = ctx.referencePrice.toFixed(2);
    ctx = retailSaleContext();
  }

  // Während eines laufenden Verkaufs bleibt der komplette Startzustand sichtbar.
  if (ctx.runningJob) {
    select.dataset.runningJobId = ctx.runningJob.id;
    select.value = ctx.runningJob.product_id;
    if (qualitySelect) qualitySelect.value = String(ctx.runningJob.quality_level || 1);
    qtyInput.value = ctx.runningJob.start_input_text || formatRetailQuantityInput(ctx.runningJob.quantity);
    const runningSnapshot = ctx.runningJob.start_snapshot || {};
    if (priceInput) priceInput.value = Number(runningSnapshot.unitPrice ?? (Number(ctx.runningJob.total_value || 0) / Number(ctx.runningJob.quantity || 1))).toFixed(2);
    ctx = retailSaleContext();
  } else if (select.dataset.runningJobId) {
    delete select.dataset.runningJobId;
    qtyInput.value = '1';
    delete qtyInput.dataset.quantityMode;
    delete qtyInput.dataset.quantityExpression;
    if (priceInput) {
      delete priceInput.dataset.manualPrice;
      const resetCtx = retailSaleContext();
      if (resetCtx.referencePrice > 0) priceInput.value = resetCtx.referencePrice.toFixed(2);
    }
    ctx = retailSaleContext();
  }

  const parsedQty = retailQuantityFromInput(qtyInput.value);
  const qty = Number(parsedQty.units || 0);
  const wholeUnits = Number.isInteger(qty);
  const hasStock = ctx.product && qty > 0 && wholeUnits && ctx.available + 1e-9 >= qty;
  const saleHours = ctx.unitsPerHour > 0 ? qty / ctx.unitsPerHour : 0;
  const within24h = saleHours > 0 && saleHours <= 24;
  const hasPrice = ctx.productionCost > 0 && Number(ctx.price || 0) > 0;
  const ready = !!ctx.product && !!ctx.building && !ctx.runningJob && hasStock && hasPrice && within24h;

  button.classList.remove('retail-cancel-mode');
  select.disabled = !!ctx.runningJob;
  if (qualitySelect) qualitySelect.disabled = !!ctx.runningJob;
  if (priceInput) priceInput.disabled = !!ctx.runningJob;
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

  const expectedRevenue = ctx.price * Math.max(0, qty);
  const cancellationFee = expectedRevenue * 0.20;
  details.innerHTML = ctx.product ? [
    `<div class="kv"><span>Verkaufsgebäude</span><strong>${ctx.buildingType?.name || '–'}</strong></div>`,
    `<div class="kv"><span>Gebäudestatus</span><strong class="${ctx.building ? 'retail-ready' : 'missing-building-warning'}">${ctx.building ? 'Bereit' : 'Benötigtes Gebäude fehlt'}</strong></div>`,
    `<div class="kv"><span>Produkt-Basisverkaufsrate</span><strong>${ctx.product ? `${num(ctx.product.base_retail_rate || 0)} Einheiten / Std.` : '–'}</strong></div>`,
    `<div class="kv"><span>Verkaufsrate</span><strong>${ctx.building ? `${num(ctx.unitsPerHour)} Einheiten / Std.` : '–'}</strong></div>`,
    `<div class="kv"><span>Qualität</span><strong>Q${ctx.quality} (+${Math.round((qualityMultiplier(ctx.quality)-1)*100)}% Wert)</strong></div>`,
    `<div class="kv"><span>Verfügbarer Bestand</span><strong>${num(ctx.available)} Einheiten</strong></div>`,
    `<div class="kv"><span>Ausgewählte Menge</span><strong>${qty > 0 ? `${num(qty)} Einheiten` : '–'}</strong></div>`,
    `<div class="kv"><span>Referenzpreis</span><strong>${money(ctx.referencePrice)} / Einheit</strong></div>`,
    `<div class="kv"><span>Gewählter Verkaufspreis</span><strong>${money(ctx.price)} / Einheit</strong></div>`,
    `<div class="kv"><span>Preisbedingte Nachfrage</span><strong>${Math.round(ctx.demandFactor * 100)}%</strong></div>`,
    `<div class="kv"><span>Verkaufsdauer</span><strong>${ctx.building && saleHours > 0 ? formatProductionDuration(saleHours) : '–'}</strong></div>`,
    `<div class="kv"><span>Voraussichtliches Ende</span><strong>${ctx.building && saleHours > 0 ? formatProductionFinish(saleHours) : '–'}</strong></div>`,
    `<div class="kv"><span>Erwarteter Erlös</span><strong class="retail-revenue-positive">${money(expectedRevenue)}</strong></div>`,
    `<div class="kv"><span>Abbruchgebühr</span><strong class="retail-cancel-fee">${expectedRevenue > 0 ? `-${money(cancellationFee)}` : money(0)}</strong></div>`
  ].join('') : '<p class="muted">Es befinden sich keine Produkte für den Handelsverkauf im Lager.</p>';

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
  } else if (!within24h) {
    button.textContent = 'Maximal 24 Std. Verkaufsdauer';
  } else {
    button.textContent = 'Im Handel verkaufen';
  }

  startProductionClaimDisplayTimer();
  scheduleProductionRefresh();
}

function filteredMarketOrders() {
  const search = String(state.marketSearchFilter || '').trim().toLocaleLowerCase('de-DE');
  const type = state.marketTypeFilter || 'all';
  const quality = state.marketQualityFilter || 'all';

  const visibleProductKeys = operationalProductIdentitySet();

  let orders = state.marketOrders.filter(o => {
    const matchesType =
      type === 'all' ||
      (type === 'material' && !!o.material_id) ||
      (type === 'product' && !!o.product_id);

    if (o.product_id && o.company_id !== state.company?.id) {
      const orderProduct = state.allProducts.find(p => p.id === o.product_id);
      const key = orderProduct ? `${orderProduct.name}::${orderProduct.category}` : '';
      if (!visibleProductKeys.has(key)) return false;
    }

    const orderQuality = Number(o.quality_level || 1);
    const matchesQuality = quality === 'all' || (quality === '5' ? orderQuality >= 5 : orderQuality === Number(quality));
    if (!matchesType || !matchesQuality) return false;
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
  if (order.material_id) return `material:${order.material_id}:q${Number(order.quality_level || 1)}`;
  const product = state.allProducts.find(p => p.id === order.product_id);
  return product ? `product:${product.name}:${product.category}:q${Number(order.quality_level || 1)}` : `product:${order.product_id}:q${Number(order.quality_level || 1)}`;
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
      gameAlert('Mehrfachauswahl ist nur für denselben Artikel in derselben Qualität möglich.');
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
    ['Firma','Gut','Art','Qualität','Menge','Preis','Gebühr','Aktion'],
    orders.map(o => {
      const selected = state.selectedMarketOrderIds.includes(o.id);
      return `<tr class="market-order-row ${selected ? 'selected' : ''}" data-order-id="${o.id}" tabindex="0" aria-selected="${selected}">
        <td>${companyName(o.company_id)}</td>
        <td>${itemName(o)}</td>
        <td>${o.material_id ? 'Rohstoff' : 'Produkt'}</td>
        <td><strong>Q${Number(o.quality_level || 1)}</strong></td>
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
    ['Verkäufer','Käufer','Gut','Qualität','Menge','Preis','Status','Aktion'],
    state.contracts.map(c => {
      let action = '–';
      if (c.status === 'proposed' && c.proposer_company_id !== cid) action = `<button onclick="acceptContract('${c.id}')">Annehmen</button>`;
      else if (c.status === 'accepted') action = `<button onclick="fulfillContract('${c.id}')">Erfüllen</button>`;
      if (['proposed','accepted'].includes(c.status)) action += ` <button class="ghost" onclick="cancelContract('${c.id}')">Stornieren</button>`;
      return `<tr><td>${companyName(c.seller_company_id)}</td><td>${companyName(c.buyer_company_id)}</td><td>${contractItemName(c)}</td><td>Q${Number(c.quality_level || 1)}</td><td>${num(c.quantity)}</td><td>${money(c.unit_price)}</td><td>${contractStatus(c.status)}</td><td>${action}</td></tr>`;
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
  const itemSelect = document.getElementById('contractItem');
  let opts = [];

  if (type === 'material') {
    const materials = role === 'sell'
      ? state.materials.filter(material =>
          state.materialInventory.some(inv =>
            inv.material_id === material.id && Number(inv.quantity || 0) > 0
          )
        )
      : state.materials;

    opts = materials
      .sort((a,b)=>a.name.localeCompare(b.name,'de-DE'))
      .map(m => `<option value="${m.id}">${m.name}</option>`);
  } else if (role === 'sell') {
    opts = stockedProducts()
      .sort((a,b)=>a.name.localeCompare(b.name,'de-DE'))
      .map(p => `<option value="${p.id}">${p.name}</option>`);
  } else {
    const visibleKeys = operationalProductIdentitySet();
    opts = state.allProducts
      .filter(p => p.company_id === partnerId && visibleKeys.has(`${p.name}::${p.category}`))
      .sort((a,b)=>a.name.localeCompare(b.name,'de-DE'))
      .map(p => `<option value="${p.id}">${p.name}</option>`);
  }

  itemSelect.innerHTML = opts.length
    ? opts.join('')
    : `<option value="">${role === 'sell' ? 'Keine passenden Bestände im Lager' : 'Keine passenden Produkte verfügbar'}</option>`;

  updateContractQualityOptions();
}

function updateContractQualityOptions() {
  const role = document.getElementById('contractRole')?.value;
  const type = document.getElementById('contractItemType')?.value;
  const itemId = document.getElementById('contractItem')?.value;
  const qualitySelect = document.getElementById('contractQuality');
  if (!qualitySelect) return;

  const previous = qualitySelect.value;

  if (role === 'sell' && itemId) {
    const lots = type === 'material'
      ? materialInventoryLots(itemId)
      : productInventoryLots(itemId);

    const qualities = [...new Set(
      lots
        .filter(lot => Number(lot.quantity || 0) > 0)
        .map(lot => Number(lot.quality_level || 1))
    )].sort((a,b)=>a-b);

    qualitySelect.innerHTML = qualities.length
      ? qualities.map(q => `<option value="${q}">Q${q}</option>`).join('')
      : '<option value="">Keine Qualität auf Lager</option>';

    if (qualities.some(q => String(q) === String(previous))) {
      qualitySelect.value = previous;
    }
    return;
  }

  qualitySelect.innerHTML = [1,2,3,4,5,6]
    .map(q => `<option value="${q}">Q${q}</option>`)
    .join('');
  if ([1,2,3,4,5,6].some(q => String(q) === String(previous))) {
    qualitySelect.value = previous;
  }
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

  const bondInterestIncome = transactions
    .filter(t => ['bond_interest_income','bond_interest_state'].includes(t.transaction_type))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const bondInterestPaid = Math.abs(transactions
    .filter(t => t.transaction_type === 'bond_interest_paid')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0));

  const netBondInterest = bondInterestIncome - bondInterestPaid;

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

  const revenue = netSales + fees + retailSales + buildingRefunds + bondInterestIncome;

  // Produktionskosten = direkte Produktionskosten ohne erneute Beschaffungskosten.
  // Material- und Vorproduktkäufe werden separat unter "Marktkäufe" erfasst.
  const productionCosts = jobs.reduce(
    (sum, j) => sum + Number(j.production_cash_cost || 0),
    0
  );

  const excludedCostTypes = new Set([
    'production',
    'production_refund',
    'market_fee',
    'retail_cancel_fee',
    'market_buy',
    'research',
    'construction',
    'bond_investment',
    'bond_repayment',
    'bond_interest_paid'
  ]);

  const otherCosts = Math.abs(transactions
    .filter(t => Number(t.amount || 0) < 0 && !excludedCostTypes.has(t.transaction_type))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0));

  // Forschungseinheiten aus Marktkäufen dürfen nicht doppelt abgezogen werden:
  // researchDisplayCosts ist nur Anzeige; kostenwirksam sind directResearchCosts + marketBuyCosts.
  const profit = revenue - productionCosts - directResearchCosts - fees - buildingCosts - marketBuyCosts - bondInterestPaid - otherCosts;
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
    <div class="finance-summary-card ${netBondInterest < 0 ? 'finance-cost-card' : ''}">
      <span>Zinsen</span>
      <strong class="${netBondInterest < 0 ? 'finance-negative' : netBondInterest > 0 ? 'finance-positive' : ''}">
        ${netBondInterest < 0 ? '-' : netBondInterest > 0 ? '+' : ''}${money(Math.abs(netBondInterest))}
      </strong>
    </div>
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


function bondStatusLabel(status) {
  return ({
    open:'Offen',
    funded:'Voll finanziert',
    closed:'Beendet',
    active:'Aktiv',
    repaid:'Getilgt',
    auto_repaid:'Automatisch getilgt',
    defaulted:'Ausgefallen',
    cancelled:'Storniert'
  })[status] || status || '–';
}

function formatBondDate(value) {
  if (!value) return '–';
  return new Date(value).toLocaleString('de-DE', {
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
  }) + ' Uhr';
}

function updateBondRequestPreview() {
  const countInput = document.getElementById('bondRequestCount');
  const preview = document.getElementById('bondRequestAmountPreview');
  if (!countInput || !preview) return;
  const count = Math.max(0, Math.floor(Number(countInput.value || 0)));
  preview.textContent = money(count * 5000);
}

function renderBonds() {
  const dashboard = state.bondDashboard;
  const container = document.getElementById('bondFinanceContent');
  if (!container) return;

  if (!dashboard) {
    container.innerHTML = '<p class="muted">Anleihedaten konnten nicht geladen werden.</p>';
    return;
  }

  const unlocked = Number(state.company?.company_level || 0) >= 10;
  const buildingValue = Number(dashboard.building_value || 0);
  const creditLimit = Number(dashboard.credit_limit || 0);
  const outstanding = Number(dashboard.outstanding_principal || 0);
  const reserved = Number(dashboard.reserved_requests || 0);
  const available = Number(dashboard.available_credit || 0);
  const defaultDays = Number(dashboard.default_days || 0);

  const warning = defaultDays > 0
    ? `<div class="bond-warning"><strong>⚠ Zinsausfall: ${defaultDays} von 3 Tagen.</strong><span>Nach dem dritten aufeinanderfolgenden Ausfall wird das Unternehmen zurückgesetzt.</span></div>`
    : '';

  const overview = `
    <div class="bond-overview">
      <div class="finance-summary-card"><span>Gebäudewert</span><strong>${money(buildingValue)}</strong></div>
      <div class="finance-summary-card"><span>Kreditlimit (99%)</span><strong>${money(creditLimit)}</strong></div>
      <div class="finance-summary-card"><span>Offene Kreditsumme</span><strong>${money(outstanding)}</strong></div>
      <div class="finance-summary-card"><span>Reservierte Anfragen</span><strong>${money(reserved)}</strong></div>
      <div class="finance-summary-card"><span>Noch verfügbar</span><strong>${money(available)}</strong></div>
    </div>`;

  if (!unlocked) {
    container.innerHTML = `${warning}${overview}<div class="bond-locked"><strong>🔒 Anleihen werden auf Unternehmenslevel 10 freigeschaltet.</strong></div>`;
    return;
  }

  const myRequests = dashboard.my_requests || [];
  const openRequests = dashboard.open_requests || [];
  const borrowed = dashboard.my_borrowed_positions || [];
  const investments = dashboard.my_investments || [];

  const myRequestRows = myRequests.map(r => `<tr>
    <td>${money(r.requested_amount)}</td>
    <td>${money(r.funded_amount)}</td>
    <td>${money(r.remaining_amount)}</td>
    <td>${num(r.daily_interest_rate)}%</td>
    <td>${bondStatusLabel(r.status)}</td>
    <td>${formatBondDate(r.created_at)}</td>
  </tr>`);

  const marketRows = openRequests.map(r => `<tr>
    <td>${r.borrower_name}${r.borrower_type === 'npc' ? ' (NPC)' : ''}</td>
    <td>${money(r.requested_amount)}</td>
    <td>${money(r.remaining_amount)}</td>
    <td>${num(r.daily_interest_rate)}% / Tag</td>
    <td>
      <div class="bond-inline-action">
        <input type="number" id="bondInvest-${r.id}" min="0.01" step="0.01" max="${Number(r.remaining_amount || 0)}" placeholder="OC$">
        <button type="button" onclick="investBondRequest('${r.id}')">Bereitstellen</button>
      </div>
    </td>
  </tr>`);

  const now = Date.now();
  const borrowedRows = borrowed.map(i => {
    const active = i.status === 'active';
    const matured = active && new Date(i.matures_at).getTime() <= now;
    return `<tr>
      <td>${i.lender_name}${i.lender_type === 'npc' ? ' (NPC)' : ''}</td>
      <td>${money(i.original_principal)}</td>
      <td>${money(i.outstanding_principal)}</td>
      <td>${num(i.daily_interest_rate)}%</td>
      <td>${money(i.total_received)} / ${money(i.target_received)}</td>
      <td>${formatBondDate(i.matures_at)}</td>
      <td>${bondStatusLabel(i.status)}</td>
      <td>
        ${active ? `<div class="bond-inline-action">
          <input type="number" id="bondRepay-${i.id}" min="0.01" step="0.01" max="${Number(i.outstanding_principal || 0)}" placeholder="OC$" ${matured ? '' : 'disabled'}>
          <button type="button" onclick="repayBondInvestment('${i.id}')" ${matured ? '' : 'disabled'}>${matured ? 'Tilgen' : '14 Tage'}</button>
        </div>` : '–'}
      </td>
    </tr>`;
  });

  const investmentRows = investments.map(i => `<tr>
    <td>${i.borrower_name}${i.borrower_type === 'npc' ? ' (NPC)' : ''}</td>
    <td>${money(i.original_principal)}</td>
    <td>${money(i.outstanding_principal)}</td>
    <td>${num(i.daily_interest_rate)}%</td>
    <td class="finance-positive">+${money(i.interest_received)}</td>
    <td>${money(i.total_received)} / ${money(i.target_received)}</td>
    <td>${bondStatusLabel(i.status)}</td>
  </tr>`);

  container.innerHTML = `
    ${warning}
    ${overview}
    <div class="bond-grid">
      <section class="bond-section">
        <h3>Anleihen anfragen</h3>
        <p class="muted">1 Anleihe = 5.000 OC$. Mindestzins 0,50% täglich. Das Kreditlimit entspricht 99% des Gebäudewerts, abgerundet auf 5.000 OC$.</p>
        <form id="bondRequestForm" class="bond-request-form">
          <label>Anzahl Anleihen
            <input type="number" id="bondRequestCount" min="1" step="1" value="1">
          </label>
          <label>Täglicher Zinssatz
            <input type="number" id="bondRequestRate" min="0.50" step="0.01" value="0.50">
          </label>
          <div class="kv bond-request-preview"><span>Anfragevolumen</span><strong id="bondRequestAmountPreview">${money(5000)}</strong></div>
          <button type="submit">Kredit anfragen</button>
        </form>
      </section>

      <section class="bond-section">
        <h3>Meine Kreditanfragen</h3>
        <div class="table-wrap">${renderTable(['Anfrage','Finanziert','Rest','Zins','Status','Erstellt'], myRequestRows)}</div>
      </section>
    </div>

    <section class="bond-section">
      <h3>Offene Anleihen anderer Unternehmen</h3>
      <div class="table-wrap">${renderTable(['Unternehmen','Anfrage','Noch offen','Zins','Investition'], marketRows)}</div>
    </section>

    <section class="bond-section">
      <h3>Meine aufgenommenen Kredite</h3>
      <div class="table-wrap">${renderTable(['Kreditgeber','Ursprünglich','Restschuld','Zins','Erhalten / Ziel','Tilgbar ab','Status','Tilgung'], borrowedRows)}</div>
    </section>

    <section class="bond-section">
      <h3>Meine Anleiheinvestitionen</h3>
      <div class="table-wrap">${renderTable(['Kreditnehmer','Investiert','Restforderung','Zins','Zinserlöse','Erhalten / Ziel','Status'], investmentRows)}</div>
    </section>
  `;

  const requestForm = document.getElementById('bondRequestForm');
  const requestCount = document.getElementById('bondRequestCount');
  requestCount?.addEventListener('input', () => {
    const whole = Math.max(0, Math.floor(Number(requestCount.value || 0)));
    if (requestCount.value !== '' && String(whole) !== requestCount.value) requestCount.value = String(whole);
    updateBondRequestPreview();
  });

  requestForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const count = Math.floor(Number(document.getElementById('bondRequestCount')?.value || 0));
    const rate = Number(document.getElementById('bondRequestRate')?.value || 0);
    if (count < 1 || rate < 0.50) {
      gameAlert('Bitte mindestens 1 Anleihe und mindestens 0,50% Tageszins angeben.');
      return;
    }

    const total = count * 5000;
    if (total > available) {
      gameAlert(`Dein verfügbarer Kreditspielraum beträgt aktuell ${money(available)}.`);
      return;
    }

    if (!await gameConfirm(`${count} Anleihe${count === 1 ? '' : 'n'} über ${money(total)} zu ${num(rate)}% Tageszins anfragen?`)) return;
    const { error } = await sb.rpc('create_bond_request', {
      p_company_id: state.company.id,
      p_bond_count: count,
      p_daily_interest_rate: rate
    });
    if (error) gameAlert(error.message); else await loadCompany();
  });
}

window.investBondRequest = async function(requestId) {
  const input = document.getElementById(`bondInvest-${requestId}`);
  const amount = Number(input?.value || 0);
  if (amount <= 0) {
    gameAlert('Bitte einen Betrag größer als 0 OC$ eingeben.');
    return;
  }
  if (!await gameConfirm(`${money(amount)} für diese Anleihe bereitstellen? Der Betrag wird sofort von deinem Kontostand abgebucht.`)) return;

  const { error } = await sb.rpc('invest_in_bond_request', {
    p_investor_company_id: state.company.id,
    p_request_id: requestId,
    p_amount: amount
  });
  if (error) gameAlert(error.message); else await loadCompany();
};

window.repayBondInvestment = async function(investmentId) {
  const input = document.getElementById(`bondRepay-${investmentId}`);
  const amount = Number(input?.value || 0);
  if (amount <= 0) {
    gameAlert('Bitte einen Tilgungsbetrag größer als 0 OC$ eingeben.');
    return;
  }
  if (!await gameConfirm(`${money(amount)} auf diesen Kreditanteil tilgen?`)) return;

  const { error } = await sb.rpc('repay_bond_investment', {
    p_company_id: state.company.id,
    p_investment_id: investmentId,
    p_amount: amount
  });
  if (error) gameAlert(error.message); else await loadCompany();
};

function researchInventoryContext() {
  const product = state.products.find(p => p.category === 'research' && p.name === 'Forschungseinheit');
  const summary = product ? inventoryLotSummary(productInventoryLots(product.id), 1) : {quantity:0,averageUnitCost:0};
  return { product, quantity:summary.quantity, averageUnitCost:summary.averageUnitCost };
}

function researchInvestmentValue(quantity, researchProduct) {
  if (!researchProduct || quantity <= 0) return 0;
  let remaining = Math.max(0, Number(quantity || 0));
  let value = 0;
  const lots = productInventoryLots(researchProduct.id)
    .filter(row => Number(row.quantity || 0) > 0)
    .sort((a,b) => Number(a.quality_level || 1) - Number(b.quality_level || 1) || String(a.id).localeCompare(String(b.id)));

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(lot.quantity || 0));
    value += take * Number(lot.average_unit_cost || 0);
    remaining -= take;
  }
  return value;
}

function renderResearch() {
  const ctx = researchInventoryContext();
  const productSelect = document.getElementById('researchProduct');
  const qtyInput = document.getElementById('researchInvestmentAmount');
  const preview = document.getElementById('researchInvestmentPreview');
  const table = document.getElementById('researchProductTable');
  const submit = document.getElementById('researchInvestmentBtn');
  const maxBtn = document.getElementById('researchInvestmentMaxBtn');
  if (!productSelect || !qtyInput || !preview || !submit || !table) return;

  const researchProducts = [...state.products].sort((a,b)=>researchCategory(a).localeCompare(researchCategory(b),'de-DE')||a.name.localeCompare(b.name,'de-DE'));
  const previous = state.researchSelectedProductId || productSelect.value;
  const groups = new Map();
  for (const product of researchProducts) {
    const category = researchCategory(product);
    if (!groups.has(category)) groups.set(category,[]);
    groups.get(category).push(product);
  }
  productSelect.innerHTML=[...groups.entries()].map(([category,products])=>`<optgroup label="${category}">${products.map(p=>`<option value="${p.id}">${p.name} – Q${productQuality(p)}</option>`).join('')}</optgroup>`).join('');
  if (researchProducts.some(p=>p.id===previous)) productSelect.value=previous;
  if (!productSelect.value && researchProducts[0]) productSelect.value=researchProducts[0].id;
  state.researchSelectedProductId=productSelect.value;

  const selected=state.products.find(p=>p.id===productSelect.value);
  const quality=productQuality(selected);
  const requirement=researchRequirement(quality);
  const progress=Number(selected?.research_units_progress||0);
  const remaining=Math.max(0,requirement-progress);
  const availableWhole=Math.max(0,Math.floor(ctx.quantity));
  const requested=Math.max(0,Math.floor(Number(qtyInput.value||0)));
  const maxInvestment=Math.min(availableWhole,Math.floor(remaining));
  const valid=!!selected && requested>=1 && requested<=maxInvestment;
  const investmentValue=researchInvestmentValue(Math.min(requested,availableWhole),ctx.product);
  const patentMin=investmentValue*0.80;
  const patentMax=investmentValue*1.10;

  document.getElementById('researchUnitsAvailable').textContent=`${num(availableWhole)} Forschungseinheiten`;
  document.getElementById('researchUnitAverageCost').textContent=money(ctx.averageUnitCost);
  preview.innerHTML=selected ? `
    <div class="kv"><span>Produkt</span><strong>${selected.name}</strong></div>
    <div class="kv"><span>Aktuelle Qualität</span><strong>Q${quality}</strong></div>
    <div class="kv"><span>Wertbonus</span><strong>+${Math.round((qualityMultiplier(quality)-1)*100)}%</strong></div>
    <div class="kv"><span>Fortschritt zu Q${quality+1}</span><strong>${num(progress)} / ${num(requirement)}</strong></div>
    <div class="kv"><span>Noch benötigt</span><strong>${num(remaining)} Forschungseinheiten</strong></div>
    <div class="kv"><span>Geplante Investition</span><strong>${num(requested)} Forschungseinheiten</strong></div>
    <div class="kv"><span>Patentwertsteigerung</span><strong>${requested > 0 ? `${money(patentMin)} – ${money(patentMax)}` : money(0)}</strong></div>` : '';
  submit.disabled=!valid;
  if (maxBtn) maxBtn.disabled=maxInvestment<=0;

  table.innerHTML=renderTable(['Kategorie','Produkt','Qualität','Wertbonus','Fortschritt','Nächste Stufe','Aktion'],researchProducts.map(p=>{
    const q=productQuality(p), req=researchRequirement(q), prog=Number(p.research_units_progress||0);
    return `<tr><td>${researchCategory(p)}</td><td>${p.name}</td><td><strong>Q${q}</strong></td><td>+${Math.round((qualityMultiplier(q)-1)*100)}%</td><td>${num(prog)} / ${num(req)}</td><td>Q${q+1}</td><td><button type="button" class="ghost" onclick="selectResearchProduct('${p.id}')">Auswählen</button></td></tr>`;
  }));
}
window.selectResearchProduct=function(productId){ state.researchSelectedProductId=productId; const select=document.getElementById('researchProduct'); if(select) select.value=productId; document.getElementById('researchInvestmentAmount').value='1'; renderResearch(); };

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

function currentStorageValue() {
  const materialValue = state.materialInventory.reduce((sum, inv) => {
    const quantity = Number(inv.quantity || 0);
    const averageCost = Number(inv.average_unit_cost || 0);
    const quality = Number(inv.quality_level || 1);
    return sum + quantity * averageCost * qualityMultiplier(quality);
  }, 0);

  const productValue = state.inventory.reduce((sum, inv) => {
    const quantity = Number(inv.quantity || 0);
    const averageCost = Number(inv.average_unit_cost || 0);
    const quality = Number(inv.quality_level || 1);
    return sum + quantity * averageCost * qualityMultiplier(quality);
  }, 0);

  return materialValue + productValue;
}

function renderStorage() {
  const container = document.getElementById('storageInventoryTable');
  if (!container) return;

  const storageTotalValue = document.getElementById('storageTotalValue');
  if (storageTotalValue) storageTotalValue.textContent = money(currentStorageValue());
  const search = String(state.storageSearchFilter || '').trim().toLocaleLowerCase('de-DE');
  const type = state.storageTypeFilter || 'all';

  const materialRows = state.materialInventory
    .filter(inv => Number(inv.quantity || 0) > 0)
    .map(inv => {
      const material = state.materials.find(m => m.id === inv.material_id);
      return { type:'material', name:material?.name || '–', quality:Number(inv.quality_level||1), quantity:Number(inv.quantity||0), unit:material?.unit || '–', averageCost:Number(inv.average_unit_cost||0) };
    });
  const productRows = state.inventory
    .filter(inv => Number(inv.quantity || 0) > 0)
    .map(inv => ({ type:'product', name:inv.products?.name || state.products.find(p=>p.id===inv.product_id)?.name || '–', quality:Number(inv.quality_level||1), quantity:Number(inv.quantity||0), unit:'Stück', averageCost:Number(inv.average_unit_cost||0) }));
  const rows=[...materialRows,...productRows].filter(row => (type==='all'||row.type===type) && (!search||row.name.toLocaleLowerCase('de-DE').includes(search))).sort((a,b)=>a.name.localeCompare(b.name,'de-DE')||a.quality-b.quality||a.type.localeCompare(b.type,'de-DE'));
  container.innerHTML=renderTable(['Artikel','Typ','Qualität','Menge','Einheit','Ø Kosten'],rows.map(row=>`<tr><td>${row.name}</td><td>${row.type==='material'?'Rohstoff':'Produkt'}</td><td>Q${row.quality}</td><td>${num(row.quantity)}</td><td>${row.unit}</td><td>${money(row.averageCost)}</td></tr>`));
}

function productOptionsGroupedByBuilding(products) {
  const groups = new Map();

  (products || []).forEach(product => {
    const building = state.buildingTypes.find(
      bt => bt.id === product.required_building_type_id
    );
    const label = building?.name || 'Sonstige';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(product);
  });

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'de-DE'))
    .map(([label, items]) => {
      const options = items
        .sort((a, b) => a.name.localeCompare(b.name, 'de-DE'))
        .map(product => `<option value="${product.id}">${product.name} (Q${productQuality(product)})</option>`)
        .join('');
      return `<optgroup label="${label}">${options}</optgroup>`;
    })
    .join('');
}

function updateProductionProductsForSelectedBuilding() {
  const select = document.getElementById('productionProduct');
  if (!select) return;

  const building = state.buildings.find(b => b.id === state.selectedBuildingId) || null;
  const type = building ? state.buildingTypes.find(bt => bt.id === building.building_type_id) : null;
  const runningJob = building
    ? state.productionJobs.find(j => j.building_id === building.id && j.status === 'running') || null
    : null;

  let products = [];
  if (building && building.status === 'active' && type?.building_category !== 'retail') {
    if (runningJob) {
      const p = state.products.find(product => product.id === runningJob.product_id);
      if (p) products = [p];
    } else {
      products = operationalProducts().filter(
        product => product.required_building_type_id === building.building_type_id
      );
    }
  }

  const previous = select.value;
  select.innerHTML = products.length
    ? products.sort((a,b)=>a.name.localeCompare(b.name,'de-DE'))
      .map(product => `<option value="${product.id}">${product.name} (Q${productQuality(product)})</option>`).join('')
    : '<option value="">Kein Produkt verfügbar</option>';

  if (runningJob) select.value = runningJob.product_id;
  else if (products.some(product => product.id === previous)) select.value = previous;
}

function renderAll() {
  const c = state.company;
  updateFeatureLocks();
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
    statValueChange.textContent = companyValueChangeDisplay(c.company_value, valueChange);
    statValueChange.className = `company-value-change ${valueChange > 0 ? 'company-value-change-positive' : valueChange < 0 ? 'company-value-change-negative' : 'company-value-change-zero'}`;
  }
  renderResearch();

  const xpCtx = xpProgressContext(c);
  const slotCount = buildingSlotsForLevel(c.company_level);
  const usedSlotCount = state.buildings.length;

  const companyRows = [
    `<div class="kv"><span>Name</span><strong>${c.name}</strong></div>`,
    `<div class="kv"><span>Status</span><strong class="company-online-status presence-status"></strong></div>`,
    `<div class="kv"><span>Level</span><strong>${num(c.company_level)}</strong></div>`,
    `<div class="kv"><span>Erfahrung</span><strong>${xpCtx.level >= 30 ? `${num(xpCtx.totalXp)} XP · Max-Level` : `${num(xpCtx.progress)} / ${num(xpCtx.needed)} XP`}</strong></div>`,
    `<div class="xp-progress"><span style="width:${xpCtx.percent}%"></span></div>`,
    `<div class="kv"><span>Gebäudeplätze</span><strong>${usedSlotCount} / ${slotCount}</strong></div>`
  ].join('');
  document.getElementById('companySummary').innerHTML = companyRows;

  const companyDebt = Math.max(0, Number(state.companyDebt || 0));
  const companyBuildingValue = currentCompanyBuildingValue();
  const renameAvailability = companyRenameAvailability();
  const renameTitle = renameAvailability.allowed
    ? 'Unternehmensnamen ändern'
    : `Namensänderung wieder ab ${renameAvailability.availableAt.toLocaleString('de-DE')} möglich`;

  document.getElementById('companyDetails').innerHTML = renderTable(
    ['Unternehmen','Status','Level','XP','Gebäudeplätze','Kontostand','Mitarbeiter','Unternehmenswert','Gebäudewert','Patentwert','Schulden'],
    [`<tr>
      <td><span class="company-name-edit-wrap"><strong>${c.name}</strong><button type="button" class="company-name-edit-btn" onclick="renameCompanyFromCompanyTab()" title="${renameTitle}" aria-label="Unternehmensnamen ändern" ${renameAvailability.allowed ? '' : 'disabled'}>✎</button></span></td>
      <td><span class="company-online-status presence-status"></span></td>
      <td>${num(c.company_level)}</td>
      <td>${xpCtx.level >= 30 ? `${num(xpCtx.totalXp)} XP` : `${num(xpCtx.progress)} / ${num(xpCtx.needed)}`}</td>
      <td>${usedSlotCount} / ${slotCount}</td>
      <td id="companyCashBalance" class="${Number(c.cash_balance || 0) < 0 ? 'negative-balance' : ''}">${balanceMoney(Number(c.cash_balance || 0))}</td>
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
  renderBonds();
  renderStorage();

  renderBuildings();
  updateProductionProductsForSelectedBuilding();
  updateSellItemOptions();
  renderProductionRecipe();
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
  stopCompanyBalanceWatcher();
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
    'Unternehmen wirklich zurücksetzen? Alle Gebäude, Lagerbestände, laufenden Produktionen, Marktaktivitäten und Finanzdaten werden gelöscht. Firmenname und Account bleiben erhalten. Startkapital danach: 100.000 OC$. Zusätzlich erhältst du eine Elektronikfabrik und ein Elektronikgeschäft.'
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

  const { error } = await sb.rpc('start_production_on_building_v2',{
    p_company_id:state.company.id,
    p_building_id:plan.building.id,
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

window.cancelBuildingConstruction = async function(buildingId, buildingTypeId) {
  const building = state.buildings.find(b => b.id === buildingId);
  const bt = state.buildingTypes.find(b => b.id === buildingTypeId);
  if (!building || !bt) return;

  const targetLevel = Math.max(
    1,
    Number(building.construction_target_level || building.level || 1)
  );
  const isNewBuild = Number(building.level || 1) === 1 && targetLevel === 1;
  const constructionCost = targetLevel === 1
    ? Number(bt.construction_cost || 0)
    : Number(bt.construction_cost || 0) * buildingLevelMultiplier(targetLevel);
  const refund = constructionCost * 0.95;

  const actionText = isNewBuild
    ? `den Bau von ${bt.name} abbrechen`
    : `den Ausbau von ${bt.name} auf Level ${targetLevel} abbrechen`;

  const consequenceText = isNewBuild
    ? 'Das unfertige Gebäude wird entfernt.'
    : `Das Gebäude bleibt auf Level ${building.level}.`;

  if (!await gameConfirm(
    `${actionText}? Du erhältst ${money(refund)} zurück (95% der Kosten dieser Baustufe). ${consequenceText}`
  )) return;

  const { data, error } = await sb.rpc('cancel_building_construction', {
    p_company_id: state.company.id,
    p_building_id: buildingId
  });

  if (error) {
    await gameAlert(error.message);
    return;
  }

  await gameAlert(`Bau abgebrochen. Erstattung: ${money(Number(data?.refund || refund))}.`);
  await loadCompany();
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

document.querySelectorAll('.building-overview-filter').forEach(button => {
  button.addEventListener('click', () => {
    state.buildingOverviewFilter = button.dataset.buildingFilter || 'all';
    renderBuildings();
  });
  enhanceAllCustomSelects(document);
  document.querySelectorAll('select.oc-select-native').forEach(syncCustomSelect);
});

// Market
function sellOrderContext() {
  const type = document.getElementById('sellItemType')?.value || 'product';
  const itemId = document.getElementById('sellProduct')?.value;
  const quality = Number(document.getElementById('sellQuality')?.value || 1);
  const quantity = Math.max(0, Number(document.getElementById('sellQty')?.value || 0));
  const price = Math.max(0, Number(document.getElementById('sellPrice')?.value || 0));

  if (type === 'material') {
    const item = state.materials.find(m => m.id === itemId);
    const lot = materialInventoryLots(itemId).find(l => Number(l.quality_level || 1) === quality);
    const referencePrice = Number(item?.base_cost || 0) * qualityMultiplier(quality);
    return { type, item, lot, quality, quantity, price, referencePrice };
  }

  const item = state.products.find(p => p.id === itemId);
  const lot = productLot(itemId, quality);
  const referencePrice = Number(item?.suggested_retail_price || 0) * qualityMultiplier(quality);
  return { type, item, lot, quality, quantity, price, referencePrice };
}

function renderSellOrderPreview() {
  const preview = document.getElementById('sellOrderPreview');
  if (!preview) return;

  const ctx = sellOrderContext();
  if (!ctx.item) {
    preview.innerHTML = '<p class="muted">Kein passender Lagerbestand für eine Marktorder vorhanden.</p>';
    return;
  }

  const gross = ctx.quantity * ctx.price;
  const fee = gross * 0.05;
  const net = gross - fee;
  const withinNpcLimit = ctx.referencePrice > 0 && ctx.price > 0 && ctx.price <= ctx.referencePrice + 1e-9;

  preview.innerHTML = `
    <div class="kv"><span>Gewählter Orderpreis</span><strong>${money(ctx.price)} / Einheit</strong></div>
    <div class="kv"><span>Bruttoerlös</span><strong>${money(gross)}</strong></div>
    <div class="kv"><span>Marktgebühr (5%)</span><strong class="retail-cancel-fee">${fee > 0 ? `-${money(fee)}` : money(0)}</strong></div>
    <div class="kv"><span>Nettoerlös</span><strong class="retail-revenue-positive">${money(net)}</strong></div>
  `;
}

function updateSellQualityOptions() {
  const type = document.getElementById('sellItemType')?.value || 'product';
  const itemId = document.getElementById('sellProduct')?.value;
  const qualitySelect = document.getElementById('sellQuality');
  const priceInput = document.getElementById('sellPrice');
  if (!qualitySelect) return;

  const lots = type === 'material'
    ? materialInventoryLots(itemId).filter(l => Number(l.quantity || 0) > 0)
    : availableProductQualities(itemId);

  const previous = qualitySelect.value;
  qualitySelect.innerHTML = lots.length
    ? lots
        .sort((a,b) => Number(a.quality_level || 1) - Number(b.quality_level || 1))
        .map(l => `<option value="${Number(l.quality_level || 1)}">Q${Number(l.quality_level || 1)} – ${num(l.quantity)} verfügbar</option>`)
        .join('')
    : '<option value="1">Q1 – 0 verfügbar</option>';

  if (lots.some(l => String(l.quality_level) === String(previous))) {
    qualitySelect.value = previous;
  }

  const ctx = sellOrderContext();
  if (priceInput && ctx.referencePrice > 0) {
    priceInput.value = ctx.referencePrice.toFixed(2);
  }
  renderSellOrderPreview();
}

function updateSellItemOptions() {
  const type = document.getElementById('sellItemType')?.value || 'product';
  const select = document.getElementById('sellProduct');
  if (!select) return;

  const previous = select.value;

  if (type === 'material') {
    const availableMaterials = state.materials
      .filter(material => materialInventoryLots(material.id).some(l => Number(l.quantity || 0) > 0))
      .sort((a,b) => a.name.localeCompare(b.name, 'de-DE'));

    select.innerHTML = availableMaterials.length
      ? availableMaterials.map(m => `<option value="${m.id}">${m.name}</option>`).join('')
      : '<option value="">Keine Rohstoffe im Lager</option>';

    if (availableMaterials.some(m => m.id === previous)) select.value = previous;
  } else {
    const products = stockedProducts();
    select.innerHTML = productOptionsGroupedByBuilding(products) || '<option value="">Keine Produkte im Lager</option>';
    if (products.some(p => p.id === previous)) select.value = previous;
  }

  updateSellQualityOptions();
}

document.getElementById('sellOrderForm').addEventListener('submit', async e => {
  e.preventDefault();

  const ctx = sellOrderContext();
  if (!ctx.item || !ctx.lot || ctx.quantity <= 0 || ctx.price <= 0) {
    renderSellOrderPreview();
    return;
  }

  const args = ctx.type === 'material'
    ? {
        p_company_id: state.company.id,
        p_material_id: ctx.item.id,
        p_quality: ctx.quality,
        p_quantity: ctx.quantity,
        p_price: ctx.price
      }
    : {
        p_company_id: state.company.id,
        p_product_id: ctx.item.id,
        p_quality: ctx.quality,
        p_quantity: ctx.quantity,
        p_price: ctx.price
      };

  const rpc = ctx.type === 'material'
    ? 'place_material_sell_order_quality'
    : 'place_sell_order_quality';

  const { error } = await sb.rpc(rpc, args);
  if (error) gameAlert(error.message);
  else await loadCompany();
});

document.getElementById('sellItemType')?.addEventListener('change', updateSellItemOptions);
document.getElementById('sellProduct')?.addEventListener('change', updateSellQualityOptions);
document.getElementById('sellQuality')?.addEventListener('change', updateSellQualityOptions);
document.getElementById('sellQty')?.addEventListener('input', renderSellOrderPreview);
document.getElementById('sellPrice')?.addEventListener('input', renderSellOrderPreview);

document.getElementById('retailProduct').addEventListener('change', () => {
  const priceInput = document.getElementById('retailPrice');
  if (priceInput) delete priceInput.dataset.manualPrice;
  renderRetailSale();
  recalculateRetailQuantityFromRememberedExpression();
  renderRetailSale();
});
document.getElementById('retailQuality')?.addEventListener('change', () => {
  const priceInput = document.getElementById('retailPrice');
  if (priceInput) delete priceInput.dataset.manualPrice;
  renderRetailSale();
  recalculateRetailQuantityFromRememberedExpression();
  renderRetailSale();
});
document.getElementById('retailPrice')?.addEventListener('input', event => {
  event.target.dataset.manualPrice = '1';

  const qtyInput = document.getElementById('retailQty');
  const hadRememberedExpression = !!qtyInput?.dataset.quantityExpression;

  if (hadRememberedExpression) {
    recalculateRetailQuantityFromRememberedExpression();
  } else if (qtyInput) {
    const ctx = retailSaleContext();
    const requested = Math.max(0, Math.floor(Number(qtyInput.value || 0)));
    const available = Math.max(0, Math.floor(ctx.available || 0));
    const maxUnits24h = Math.max(0, Math.floor((ctx.unitsPerHour || 0) * 24));
    qtyInput.value = formatRetailQuantityInput(Math.min(requested, available, maxUnits24h));
    qtyInput.dataset.quantityMode = 'fixed';
  }

  // Preisänderungen können die Nachfrage und damit die Verkaufsrate verändern.
  // Die Menge wird deshalb automatisch auf maximal 24 Stunden Verkaufsdauer begrenzt.
  renderRetailSale();
});
document.getElementById('retailMaxBtn').addEventListener('click', () => {
  const ctx = retailSaleContext();
  const maxUnits = Math.max(0, Math.floor(ctx.available || 0));
  const qtyInput = document.getElementById('retailQty');
  qtyInput.dataset.quantityMode = 'fixed';
  delete qtyInput.dataset.quantityExpression;
  qtyInput.value = formatRetailQuantityInput(maxUnits);
  renderRetailSale();
});
document.getElementById('retail24Btn').addEventListener('click', () => {
  const ctx = retailSaleContext();
  const capacity24h = Math.max(0, Math.floor((ctx.unitsPerHour || 0) * 24));
  const available = Math.max(0, Math.floor(ctx.available || 0));
  const qtyInput = document.getElementById('retailQty');
  qtyInput.dataset.quantityMode = 'fixed';
  delete qtyInput.dataset.quantityExpression;
  qtyInput.value = formatRetailQuantityInput(Math.min(capacity24h, available));
  renderRetailSale();
});
document.getElementById('retailQty').addEventListener('input', e => {
  const rawValue = e.target.value;
  const parsed = retailQuantityFromInput(rawValue);
  rememberRetailQuantityExpression(e.target, rawValue, parsed);
  if (parsed.matchedHours || parsed.matchedTime) {
    const ctx = retailSaleContext();
    const available = Math.max(0, Math.floor(ctx.available || 0));
    e.target.value = formatRetailQuantityInput(Math.min(parsed.units, available));
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
  if (saleHours <= 0 || saleHours > 24) {
    await gameAlert('Die maximale Verkaufsdauer beträgt 24 Stunden.');
    renderRetailSale();
    return;
  }

  const { error } = await sb.rpc('start_retail_sale_on_building_v2', {
    p_company_id: state.company.id,
    p_building_id: ctx.building.id,
    p_product_id: ctx.product.id,
    p_quality: ctx.quality,
    p_quantity: quantity,
    p_unit_price: ctx.price,
    p_input_text: document.getElementById('retailQty').dataset.quantityExpression || document.getElementById('retailQty').value,
    p_start_snapshot: {
      quantity,
      quality: ctx.quality,
      hours: saleHours,
      unitPrice: ctx.price,
      referencePrice: ctx.referencePrice,
      demandFactor: ctx.demandFactor,
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
window.cancelRetailSale = async function(jobId) {
  const job = state.retailSaleJobs.find(j => j.id === jobId && j.status === 'running');
  if (!job) return;

  const progress = retailSaleProgress(job);
  if (!await gameConfirm(`Verkauf wirklich abbrechen? Noch nicht verkaufte Ware wird zurück ins Lager gelegt. Abbruchgebühr: ${money(progress.cancellationFee)} (20% des erwarteten Erlöses).`)) return;

  const { error } = await sb.rpc('cancel_retail_sale', {
    p_company_id: state.company.id,
    p_job_id: job.id
  });

  if (error) gameAlert(error.message);
  else await loadCompany();
};

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
const marketQualityFilter = document.getElementById('marketQualityFilter');
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

marketQualityFilter?.addEventListener('change', e => {
  state.marketQualityFilter = e.target.value;
  state.selectedMarketOrderIds = [];
  renderMarket();
});

marketFilterReset?.addEventListener('click', () => {
  state.marketSearchFilter = '';
  state.marketTypeFilter = 'all';
  state.marketQualityFilter = 'all';
  state.selectedMarketOrderIds = [];
  if (marketSearchFilter) marketSearchFilter.value = '';
  if (marketTypeFilter) marketTypeFilter.value = 'all';
  if (marketQualityFilter) marketQualityFilter.value = 'all';
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
const researchProduct = document.getElementById('researchProduct');

researchProduct?.addEventListener('change', () => {
  state.researchSelectedProductId = researchProduct.value;
  researchInvestmentAmount.value = '1';
  renderResearch();
});

researchInvestmentAmount?.addEventListener('input', () => {
  const whole = Math.max(0, Math.floor(Number(researchInvestmentAmount.value || 0)));
  if (String(whole) !== researchInvestmentAmount.value && researchInvestmentAmount.value !== '') {
    researchInvestmentAmount.value = String(whole);
  }
  renderResearch();
});

researchInvestmentMaxBtn?.addEventListener('click', () => {
  const ctx = researchInventoryContext();
  const target=state.products.find(p=>p.id===researchProduct?.value);
  const remaining=Math.max(0,researchRequirement(productQuality(target))-Number(target?.research_units_progress||0));
  researchInvestmentAmount.value = String(Math.max(0, Math.min(Math.floor(ctx.quantity),Math.floor(remaining))));
  renderResearch();
});

if (researchInvestmentForm) {
  researchInvestmentForm.addEventListener('submit', async e => {
    e.preventDefault();
    const ctx = researchInventoryContext();
    const target = state.products.find(p => p.id === researchProduct?.value);
    const quantity = Math.max(0, Math.floor(Number(researchInvestmentAmount.value || 0)));
    const requirement = researchRequirement(productQuality(target));
    const remaining = Math.max(0, requirement - Number(target?.research_units_progress || 0));

    if (!ctx.product || !target || quantity < 1 || quantity > Math.floor(ctx.quantity) || quantity > remaining) {
      renderResearch();
      return;
    }

    if (!await gameConfirm(`${num(quantity)} Forschungseinheiten in „${target.name}“ investieren?`)) return;

    const { data, error } = await sb.rpc('invest_product_research', {
      p_company_id: state.company.id,
      p_product_id: target.id,
      p_quantity: quantity
    });

    if (error) {
      gameAlert(error.message);
      return;
    }

    gameAlert(data?.upgraded ? `${target.name} hat Qualität Q${Number(data.quality_level || productQuality(target)+1)} erreicht.` : `${num(quantity)} Forschungseinheiten wurden in ${target.name} investiert.`);
    researchInvestmentAmount.value = '1';
    await loadCompany();
  });
}

// Contracts
['contractRole','contractPartner','contractItemType'].forEach(id => document.getElementById(id).addEventListener('change',updateContractGoods));
document.getElementById('contractItem')?.addEventListener('change', updateContractQualityOptions);
document.getElementById('contractForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const role=document.getElementById('contractRole').value;
  const partner=document.getElementById('contractPartner').value;
  if(!partner) { gameAlert('Es gibt noch kein anderes Spielerunternehmen für einen Vertrag.'); return; }
  const type=document.getElementById('contractItemType').value;
  const item=document.getElementById('contractItem').value;
  if(!item) {
    gameAlert(role==='sell' ? 'Für diesen Verkauf ist kein passender Lagerbestand vorhanden.' : 'Bitte wähle ein Gut aus.');
    return;
  }
  const seller=role==='sell' ? state.company.id : partner;
  const buyer=role==='sell' ? partner : state.company.id;
  const { error }=await sb.rpc('create_contract_quality',{
    p_proposer_company_id:state.company.id,
    p_seller_company_id:seller,
    p_buyer_company_id:buyer,
    p_product_id:type==='product' ? item : null,
    p_material_id:type==='material' ? item : null,
    p_quality:Number(document.getElementById('contractQuality').value || 1),
    p_quantity:Number(document.getElementById('contractQty').value),
    p_unit_price:Number(document.getElementById('contractPrice').value)
  });
  if(error) gameAlert(error.message); else await loadCompany();
});
window.acceptContract=async id=>{ const {error}=await sb.rpc('accept_contract',{p_contract_id:id}); if(error) gameAlert(error.message); else await loadCompany(); };
window.fulfillContract=async id=>{ const {error}=await sb.rpc('fulfill_contract',{p_contract_id:id}); if(error) gameAlert(error.message); else await loadCompany(); };
window.cancelContract=async id=>{ const {error}=await sb.rpc('cancel_contract',{p_contract_id:id}); if(error) gameAlert(error.message); else await loadCompany(); };



document.addEventListener('click', event => {
  const button = event.target.closest('.password-toggle');
  if (!button) return;

  const input = document.getElementById(button.dataset.passwordTarget || '');
  if (!input) return;

  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-label', show ? 'Passwort verbergen' : 'Passwort anzeigen');
  button.setAttribute('title', show ? 'Passwort verbergen' : 'Passwort anzeigen');
  button.textContent = show ? '🙈' : '👁';
});

document.getElementById('accountEditBtn')?.addEventListener('click', () => {
  setAccountEditMode(true);
});

document.getElementById('accountEditCancelBtn')?.addEventListener('click', () => {
  setAccountEditMode(false);
});

document.getElementById('accountEditForm')?.addEventListener('submit', updateAccountData);

document.getElementById('pushEnabled')?.addEventListener('change', async event => {
  const enabled = event.target.checked;
  event.target.disabled = true;
  try {
    if (enabled) {
      const ok = await enablePushNotifications();
      event.target.checked = ok;
    } else {
      await disablePushNotifications();
    }
  } catch (error) {
    console.error('Push:', error);
    event.target.checked = !enabled;
    setPushStatus(`Push-Benachrichtigungen konnten nicht geändert werden: ${error.message || error}`, 'error');
  } finally {
    event.target.disabled = false;
  }
});

window.addEventListener('hashchange', openViewFromHash);

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    touchPresence();
    refreshCompanyBalance();
    updateMarketRefreshTimer();
    if (document.getElementById('market')?.classList.contains('active-view')) {
      await loadGameData();
    }
  }
});


const customSelectDocumentObserver = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach(node => {
      if (!(node instanceof Element)) return;
      if (node.matches?.('select')) enhanceCustomSelect(node);
      enhanceAllCustomSelects(node);
    });
  }
});
customSelectDocumentObserver.observe(document.documentElement, { childList: true, subtree: true });


init();
