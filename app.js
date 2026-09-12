const config = window.OPENCOMPANY_CONFIG || {};
const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.includes('YOUR_');
const setupNotice = document.getElementById('setupNotice');
if (!configured) setupNotice.classList.remove('hidden');

const sb = configured ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
const state = { session: null, company: null, products: [], inventory: [], employees: [], transactions: [], marketOrders: [] };

const money = n => new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR', maximumFractionDigits:2 }).format(Number(n || 0)).replace('€','OC$');
const num = n => new Intl.NumberFormat('de-DE').format(Number(n || 0));

function msg(el, text, type='') { el.textContent = text; el.className = `status ${type}`; }
function renderTable(headers, rows) {
  if (!rows.length) return '<p class="muted">Noch keine Daten.</p>';
  return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
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
  const { data: { session } } = await sb.auth.getSession();
  await handleSession(session);
  sb.auth.onAuthStateChange((_event, session) => handleSession(session));
}

async function handleSession(session) {
  state.session = session;
  const loggedIn = !!session;
  document.getElementById('authView').classList.toggle('hidden', loggedIn);
  document.getElementById('logoutBtn').classList.toggle('hidden', !loggedIn);
  document.getElementById('sessionLabel').textContent = loggedIn ? session.user.email : 'Nicht angemeldet';
  if (!loggedIn) {
    document.getElementById('gameView').classList.add('hidden');
    document.getElementById('bootstrapView').classList.add('hidden');
    return;
  }
  await loadCompany();
}

async function loadCompany() {
  const { data, error } = await sb.from('companies').select('*').eq('owner_user_id', state.session.user.id).maybeSingle();
  if (error) return console.error(error);
  state.company = data;
  document.getElementById('bootstrapView').classList.toggle('hidden', !!data);
  document.getElementById('gameView').classList.toggle('hidden', !data);
  if (data) await loadGameData();
}

async function loadGameData() {
  const cid = state.company.id;
  const [products, inventory, employees, tx, orders, shareClass] = await Promise.all([
    sb.from('products').select('*').eq('company_id', cid).order('name'),
    sb.from('inventories').select('*, products(name)').eq('company_id', cid),
    sb.from('employees').select('*').eq('company_id', cid).order('hired_at', {ascending:false}),
    sb.from('financial_transactions').select('*').eq('company_id', cid).order('created_at', {ascending:false}).limit(20),
    sb.from('market_orders').select('*, products(name), companies(name)').eq('status','open').order('created_at',{ascending:false}).limit(50),
    sb.from('share_classes').select('*').eq('company_id', cid).maybeSingle()
  ]);
  state.products = products.data || [];
  state.inventory = inventory.data || [];
  state.employees = employees.data || [];
  state.transactions = tx.data || [];
  state.marketOrders = orders.data || [];
  state.shareClass = shareClass.data || null;
  renderAll();
}

function renderAll() {
  const c = state.company;
  document.getElementById('statCompany').textContent = c.name;
  document.getElementById('statCash').textContent = money(c.cash_balance);
  document.getElementById('statEmployees').textContent = num(state.employees.length);
  document.getElementById('statValue').textContent = money(c.company_value);
  document.getElementById('companySummary').innerHTML = [
    ['Name', c.name], ['Ticker', c.ticker || '–'], ['Status', c.status], ['Reputation', num(c.brand_reputation)], ['Level', num(c.company_level)]
  ].map(([k,v])=>`<div class="kv"><span>${k}</span><strong>${v}</strong></div>`).join('');
  document.getElementById('companyDetails').innerHTML = document.getElementById('companySummary').innerHTML;

  document.getElementById('recentTransactions').innerHTML = renderTable(['Typ','Betrag','Beschreibung','Zeit'], state.transactions.slice(0,8).map(t=>`<tr><td><span class="badge">${t.transaction_type}</span></td><td>${money(t.amount)}</td><td>${t.description || ''}</td><td>${new Date(t.created_at).toLocaleString('de-DE')}</td></tr>`));
  document.getElementById('financeTable').innerHTML = renderTable(['Typ','Betrag','Beschreibung','Zeit'], state.transactions.map(t=>`<tr><td>${t.transaction_type}</td><td>${money(t.amount)}</td><td>${t.description || ''}</td><td>${new Date(t.created_at).toLocaleString('de-DE')}</td></tr>`));
  document.getElementById('employeesTable').innerHTML = renderTable(['Name','Beruf','Gehalt','Produktivität'], state.employees.map(e=>`<tr><td>${e.first_name} ${e.last_name}</td><td>${e.profession}</td><td>${money(e.salary)}</td><td>${e.productivity}%</td></tr>`));
  document.getElementById('inventoryTable').innerHTML = renderTable(['Produkt','Menge','Ø Kosten'], state.inventory.map(i=>`<tr><td>${i.products?.name || '–'}</td><td>${num(i.quantity)}</td><td>${money(i.average_unit_cost)}</td></tr>`));
  document.getElementById('marketOrders').innerHTML = renderTable(['Firma','Produkt','Menge','Preis','Aktion'], state.marketOrders.map(o=>`<tr><td>${o.companies?.name || '–'}</td><td>${o.products?.name || '–'}</td><td>${num(o.remaining_quantity)}</td><td>${money(o.price_per_unit)}</td><td>${o.company_id === c.id ? 'Eigene Order' : `<button onclick="buyOrder('${o.id}')">Kaufen</button>`}</td></tr>`));

  const opts = state.products.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('productionProduct').innerHTML = opts;
  document.getElementById('sellProduct').innerHTML = opts;
  document.getElementById('stockInfo').innerHTML = state.shareClass ? `<div class="kv"><span>Symbol</span><strong>${state.shareClass.symbol}</strong></div><div class="kv"><span>Ausgegebene Aktien</span><strong>${num(state.shareClass.issued_shares)}</strong></div>` : '<p class="muted">Keine Aktienklasse gefunden.</p>';
}

// Auth
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault(); if (!sb) return;
  const { error } = await sb.auth.signInWithPassword({ email: loginEmail.value, password: loginPassword.value });
  msg(document.getElementById('authMessage'), error ? error.message : 'Angemeldet.', error ? 'error' : 'success');
});
document.getElementById('signupForm').addEventListener('submit', async e => {
  e.preventDefault(); if (!sb) return;
  const { error } = await sb.auth.signUp({ email: signupEmail.value, password: signupPassword.value });
  msg(document.getElementById('authMessage'), error ? error.message : 'Account erstellt. Falls E-Mail-Bestätigung aktiv ist, bitte Postfach prüfen.', error ? 'error' : 'success');
});
document.getElementById('logoutBtn').addEventListener('click', ()=>sb?.auth.signOut());

// Company bootstrap
document.getElementById('companyForm').addEventListener('submit', async e => {
  e.preventDefault();
  const { data, error } = await sb.rpc('bootstrap_company', { p_name: companyName.value.trim(), p_ticker: companyTicker.value.trim().toUpperCase() });
  msg(document.getElementById('companyMessage'), error ? error.message : 'Unternehmen gegründet.', error ? 'error' : 'success');
  if (!error) await loadCompany();
});

// Hire employee
document.getElementById('hireBtn').addEventListener('click', async () => {
  const names = [['Lena','Hoffmann'],['Jonas','Weber'],['Mia','Schulz'],['Noah','Fischer'],['Emma','Koch']];
  const pick = names[Math.floor(Math.random()*names.length)];
  const { error } = await sb.rpc('hire_employee', { p_company_id: state.company.id, p_first_name: pick[0], p_last_name: pick[1], p_profession: 'Produktionsmitarbeiter', p_salary: 3200 });
  if (error) alert(error.message); else await loadGameData();
});

// Production
document.getElementById('productionForm').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await sb.rpc('produce_product', { p_company_id: state.company.id, p_product_id: productionProduct.value, p_quantity: Number(productionQty.value) });
  if (error) alert(error.message); else await loadGameData();
});

// Sell order
document.getElementById('sellOrderForm').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await sb.rpc('place_sell_order', { p_company_id: state.company.id, p_product_id: sellProduct.value, p_quantity: Number(sellQty.value), p_price: Number(sellPrice.value) });
  if (error) alert(error.message); else await loadGameData();
});

window.buyOrder = async function(orderId) {
  const qty = Number(prompt('Wie viele Einheiten möchtest du kaufen?', '1'));
  if (!Number.isFinite(qty) || qty <= 0) return;
  const { error } = await sb.rpc('buy_market_order', { p_buyer_company_id: state.company.id, p_order_id: orderId, p_quantity: qty });
  if (error) alert(error.message); else await loadGameData();
}

init();
