const config = window.OPENCOMPANY_CONFIG || {};
const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.includes('YOUR_');
const setupNotice = document.getElementById('setupNotice');
if (!configured) setupNotice.classList.remove('hidden');

const APP_URL = 'https://breakcheady.github.io/OpenCompany/';
const sb = configured ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
const state = { session: null, company: null, products: [], inventory: [], employees: [], transactions: [], marketOrders: [], recoveringPassword: false };

const money = n => new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR', maximumFractionDigits:2 }).format(Number(n || 0)).replace('€','OC$');
const num = n => new Intl.NumberFormat('de-DE').format(Number(n || 0));

function msg(el, text, type='') { el.textContent = text; el.className = `status ${type}`; }
function renderTable(headers, rows) {
  if (!rows.length) return '<p class="muted">Noch keine Daten.</p>';
  return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
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
  const errorBox = getCompanyLoadErrorBox();
  errorBox.textContent = '';
  errorBox.classList.add('hidden');
}

function showCompanyLoadError(error) {
  const errorBox = getCompanyLoadErrorBox();
  errorBox.textContent = `Unternehmensdaten konnten nicht geladen werden. ${error.message || 'Unbekannter Fehler'}`;
  errorBox.classList.remove('hidden');
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
  const errorBox = getGameDataErrorBox();
  errorBox.textContent = '';
  errorBox.classList.add('hidden');
}

function showGameDataError(errors) {
  const errorBox = getGameDataErrorBox();
  const details = errors
    .map(({ label, error }) => `${label}: ${error.message || 'Unbekannter Fehler'}`)
    .join(' | ');

  errorBox.textContent = `Spieldaten konnten nicht vollständig geladen werden. ${details}`;
  errorBox.classList.remove('hidden');
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
    console.error('Session konnte nicht geladen werden:', error);
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
    console.error('Fehler beim Laden der Unternehmensdaten:', error);
    showCompanyLoadError(error);
    return;
  }

  clearCompanyLoadError();

  state.company = data;
  document.getElementById('bootstrapView').classList.toggle('hidden', !!data);
  document.getElementById('gameView').classList.toggle('hidden', !data);
  if (data) await loadGameData();
}

async function loadGameData() {
  const cid = state.company.id;

  const results = await Promise.all([
    sb.from('products').select('*').eq('company_id', cid).order('name'),
    sb.from('inventories').select('*, products(name)').eq('company_id', cid),
    sb.from('employees').select('*').eq('company_id', cid).order('hired_at', {ascending:false}),
    sb.from('financial_transactions').select('*').eq('company_id', cid).order('created_at', {ascending:false}).limit(20),
    sb.from('market_orders').select('*, products(name), companies(name)').eq('status','open').order('created_at',{ascending:false}).limit(50),
    sb.from('share_classes').select('*').eq('company_id', cid).maybeSingle()
  ]);

  const labels = ['Produkte', 'Lager', 'Mitarbeiter', 'Finanzen', 'Marktorders', 'Aktienklasse'];
  const errors = results
    .map((result, index) => result.error ? { label: labels[index], error: result.error } : null)
    .filter(Boolean);

  if (errors.length) {
    console.error('Fehler beim Laden der Spieldaten:', errors);
    showGameDataError(errors);
    return;
  }

  clearGameDataError();

  const [products, inventory, employees, tx, orders, shareClass] = results;

  state.products = products.data;
  state.inventory = inventory.data;
  state.employees = employees.data;
  state.transactions = tx.data;
  state.marketOrders = orders.data;
  state.shareClass = shareClass.data;

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
  e.preventDefault();
  if (!sb) return;

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  const { error } = await sb.auth.signInWithPassword({ email, password });
  msg(document.getElementById('authMessage'), error ? error.message : 'Angemeldet.', error ? 'error' : 'success');
});

document.getElementById('signupForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!sb) return;

  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;

  const { error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: APP_URL }
  });

  msg(document.getElementById('authMessage'), error ? error.message : 'Account erstellt. Falls E-Mail-Bestätigung aktiv ist, bitte Postfach prüfen.', error ? 'error' : 'success');
});

document.getElementById('forgotPasswordBtn').addEventListener('click', async () => {
  if (!sb) return;

  const loginEmailInput = document.getElementById('loginEmail');
  const email = loginEmailInput.value.trim();

  if (!email) {
    msg(document.getElementById('authMessage'), 'Bitte gib zuerst deine E-Mail-Adresse im Login-Feld ein.', 'error');
    loginEmailInput.focus();
    return;
  }

  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
  msg(document.getElementById('authMessage'), error ? error.message : 'Passwort-Link wurde versendet. Bitte prüfe dein E-Mail-Postfach.', error ? 'error' : 'success');
});

document.getElementById('recoveryForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!sb) return;

  const password = document.getElementById('newPassword').value;
  const confirmation = document.getElementById('newPasswordConfirm').value;

  if (password !== confirmation) {
    msg(document.getElementById('recoveryMessage'), 'Die Passwörter stimmen nicht überein.', 'error');
    return;
  }

  const { error } = await sb.auth.updateUser({ password });

  if (error) {
    msg(document.getElementById('recoveryMessage'), error.message, 'error');
    return;
  }

  state.recoveringPassword = false;
  msg(document.getElementById('recoveryMessage'), 'Passwort erfolgreich geändert.', 'success');
  const { data: { session } } = await sb.auth.getSession();
  await handleSession(session);
  window.history.replaceState({}, document.title, APP_URL);
});

document.getElementById('logoutBtn').addEventListener('click', ()=>sb?.auth.signOut());

// Company bootstrap
document.getElementById('companyForm').addEventListener('submit', async e => {
  e.preventDefault();

  const name = document.getElementById('companyName').value.trim();
  const ticker = document.getElementById('companyTicker').value.trim().toUpperCase();

  const { error } = await sb.rpc('bootstrap_company', {
    p_name: name,
    p_ticker: ticker
  });

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

  const productId = document.getElementById('productionProduct').value;
  const quantity = Number(document.getElementById('productionQty').value);

  const { error } = await sb.rpc('produce_product', {
    p_company_id: state.company.id,
    p_product_id: productId,
    p_quantity: quantity
  });

  if (error) alert(error.message); else await loadGameData();
});

// Sell order
document.getElementById('sellOrderForm').addEventListener('submit', async e => {
  e.preventDefault();

  const productId = document.getElementById('sellProduct').value;
  const quantity = Number(document.getElementById('sellQty').value);
  const price = Number(document.getElementById('sellPrice').value);

  const { error } = await sb.rpc('place_sell_order', {
    p_company_id: state.company.id,
    p_product_id: productId,
    p_quantity: quantity,
    p_price: price
  });

  if (error) alert(error.message); else await loadGameData();
});

window.buyOrder = async function(orderId) {
  const qty = Number(prompt('Wie viele Einheiten möchtest du kaufen?', '1'));
  if (!Number.isFinite(qty) || qty <= 0) return;

  const { error } = await sb.rpc('buy_market_order', {
    p_buyer_company_id: state.company.id,
    p_order_id: orderId,
    p_quantity: qty
  });

  if (error) alert(error.message); else await loadGameData();
};

init();
