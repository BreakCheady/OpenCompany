-- OpenCompany MVP schema for Supabase/PostgreSQL
create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  ticker text,
  status text not null default 'active' check (status in ('active','inactive','insolvent','liquidation','acquired')),
  brand_reputation numeric(8,2) not null default 50,
  company_level integer not null default 1,
  cash_balance numeric(18,2) not null default 50000,
  company_value numeric(18,2) not null default 100000,
  created_at timestamptz not null default now(),
  unique(owner_user_id),
  unique(ticker)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  category text not null default 'consumer_good',
  production_cost numeric(18,2) not null default 300,
  suggested_retail_price numeric(18,2) not null default 800,
  quality_score numeric(6,2) not null default 60,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.inventories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(18,2) not null default 0 check (quantity >= 0),
  average_unit_cost numeric(18,2) not null default 0,
  unique(company_id, product_id)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  profession text not null,
  salary numeric(18,2) not null check (salary >= 0),
  productivity numeric(6,2) not null default 100,
  hired_at timestamptz not null default now()
);

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transaction_type text not null,
  amount numeric(18,2) not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.market_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  order_type text not null default 'sell' check (order_type in ('buy','sell')),
  quantity numeric(18,2) not null check (quantity > 0),
  remaining_quantity numeric(18,2) not null check (remaining_quantity >= 0),
  price_per_unit numeric(18,2) not null check (price_per_unit > 0),
  status text not null default 'open' check (status in ('open','partially_filled','filled','cancelled','expired')),
  created_at timestamptz not null default now()
);

create table if not exists public.market_trades (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.market_orders(id),
  buyer_company_id uuid not null references public.companies(id),
  seller_company_id uuid not null references public.companies(id),
  product_id uuid not null references public.products(id),
  quantity numeric(18,2) not null,
  price_per_unit numeric(18,2) not null,
  total_value numeric(18,2) not null,
  executed_at timestamptz not null default now()
);

create table if not exists public.share_classes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  symbol text not null unique,
  issued_shares bigint not null default 1000000,
  voting_rights_per_share numeric(10,4) not null default 1
);

create table if not exists public.shareholdings (
  id uuid primary key default gen_random_uuid(),
  share_class_id uuid not null references public.share_classes(id) on delete cascade,
  holder_user_id uuid references auth.users(id) on delete cascade,
  quantity bigint not null check (quantity >= 0),
  average_purchase_price numeric(18,2) not null default 0,
  unique(share_class_id, holder_user_id)
);

-- RLS
alter table public.companies enable row level security;
alter table public.products enable row level security;
alter table public.inventories enable row level security;
alter table public.employees enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.market_orders enable row level security;
alter table public.market_trades enable row level security;
alter table public.share_classes enable row level security;
alter table public.shareholdings enable row level security;

-- Read policies
create policy "companies_select_own" on public.companies for select using (owner_user_id = auth.uid());
create policy "products_select_authenticated" on public.products for select to authenticated using (true);
create policy "inventories_select_own" on public.inventories for select using (exists (select 1 from public.companies c where c.id = company_id and c.owner_user_id = auth.uid()));
create policy "employees_select_own" on public.employees for select using (exists (select 1 from public.companies c where c.id = company_id and c.owner_user_id = auth.uid()));
create policy "transactions_select_own" on public.financial_transactions for select using (exists (select 1 from public.companies c where c.id = company_id and c.owner_user_id = auth.uid()));
create policy "market_orders_select_authenticated" on public.market_orders for select to authenticated using (true);
create policy "market_trades_select_authenticated" on public.market_trades for select to authenticated using (true);
create policy "share_classes_select_authenticated" on public.share_classes for select to authenticated using (true);
create policy "shareholdings_select_own" on public.shareholdings for select using (holder_user_id = auth.uid());

-- Helper function
create or replace function public.assert_company_owner(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.companies where id = p_company_id and owner_user_id = auth.uid()) then
    raise exception 'Keine Berechtigung für dieses Unternehmen';
  end if;
end;
$$;

-- Create first company, product and shares
create or replace function public.bootstrap_company(p_name text, p_ticker text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_product uuid;
  v_share uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if exists (select 1 from public.companies where owner_user_id = auth.uid()) then raise exception 'Du besitzt bereits ein Unternehmen'; end if;

  insert into public.companies(owner_user_id, name, ticker)
  values (auth.uid(), trim(p_name), nullif(trim(p_ticker),''))
  returning id into v_company;

  insert into public.products(company_id, name, category, production_cost, suggested_retail_price)
  values (v_company, 'Nova Smartphone', 'electronics', 300, 800)
  returning id into v_product;

  insert into public.inventories(company_id, product_id, quantity, average_unit_cost)
  values (v_company, v_product, 0, 300);

  insert into public.financial_transactions(company_id, transaction_type, amount, description)
  values (v_company, 'founding_capital', 50000, 'Startkapital');

  insert into public.share_classes(company_id, symbol, issued_shares)
  values (v_company, coalesce(nullif(trim(p_ticker),''), 'OC' || substr(replace(v_company::text,'-',''),1,4)), 1000000)
  returning id into v_share;

  insert into public.shareholdings(share_class_id, holder_user_id, quantity, average_purchase_price)
  values (v_share, auth.uid(), 1000000, 0.10);

  return v_company;
end;
$$;

create or replace function public.hire_employee(
  p_company_id uuid,
  p_first_name text,
  p_last_name text,
  p_profession text,
  p_salary numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  perform public.assert_company_owner(p_company_id);
  insert into public.employees(company_id, first_name, last_name, profession, salary)
  values (p_company_id, p_first_name, p_last_name, p_profession, p_salary)
  returning id into v_id;
  insert into public.financial_transactions(company_id, transaction_type, amount, description)
  values (p_company_id, 'hiring', 0, 'Mitarbeiter eingestellt: ' || p_first_name || ' ' || p_last_name);
  return v_id;
end;
$$;

create or replace function public.produce_product(p_company_id uuid, p_product_id uuid, p_quantity numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost numeric;
  v_total numeric;
  v_cash numeric;
begin
  perform public.assert_company_owner(p_company_id);
  if p_quantity <= 0 then raise exception 'Menge muss größer als 0 sein'; end if;
  select production_cost into v_cost from public.products where id = p_product_id and company_id = p_company_id;
  if v_cost is null then raise exception 'Produkt nicht gefunden'; end if;
  v_total := v_cost * p_quantity;
  select cash_balance into v_cash from public.companies where id = p_company_id for update;
  if v_cash < v_total then raise exception 'Nicht genügend Kapital'; end if;

  update public.companies set cash_balance = cash_balance - v_total, company_value = company_value + (v_total * 0.25) where id = p_company_id;
  insert into public.inventories(company_id, product_id, quantity, average_unit_cost)
  values (p_company_id, p_product_id, p_quantity, v_cost)
  on conflict (company_id, product_id) do update set quantity = public.inventories.quantity + excluded.quantity, average_unit_cost = excluded.average_unit_cost;
  insert into public.financial_transactions(company_id, transaction_type, amount, description)
  values (p_company_id, 'production', -v_total, 'Produktion von ' || p_quantity || ' Einheiten');
end;
$$;

create or replace function public.place_sell_order(p_company_id uuid, p_product_id uuid, p_quantity numeric, p_price numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_inv numeric; v_id uuid;
begin
  perform public.assert_company_owner(p_company_id);
  if p_quantity <= 0 or p_price <= 0 then raise exception 'Ungültige Menge oder Preis'; end if;
  select quantity into v_inv from public.inventories where company_id = p_company_id and product_id = p_product_id for update;
  if coalesce(v_inv,0) < p_quantity then raise exception 'Nicht genügend Lagerbestand'; end if;
  update public.inventories set quantity = quantity - p_quantity where company_id = p_company_id and product_id = p_product_id;
  insert into public.market_orders(company_id, product_id, quantity, remaining_quantity, price_per_unit)
  values (p_company_id, p_product_id, p_quantity, p_quantity, p_price) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.buy_market_order(p_buyer_company_id uuid, p_order_id uuid, p_quantity numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.market_orders%rowtype;
  v_total numeric;
  v_cash numeric;
begin
  perform public.assert_company_owner(p_buyer_company_id);
  if p_quantity <= 0 then raise exception 'Menge muss größer als 0 sein'; end if;
  select * into v_order from public.market_orders where id = p_order_id for update;
  if v_order.id is null or v_order.status not in ('open','partially_filled') then raise exception 'Order nicht verfügbar'; end if;
  if v_order.company_id = p_buyer_company_id then raise exception 'Eigene Order kann nicht gekauft werden'; end if;
  if v_order.remaining_quantity < p_quantity then raise exception 'Nicht genügend Menge in der Order'; end if;
  v_total := p_quantity * v_order.price_per_unit;
  select cash_balance into v_cash from public.companies where id = p_buyer_company_id for update;
  if v_cash < v_total then raise exception 'Nicht genügend Kapital'; end if;

  update public.companies set cash_balance = cash_balance - v_total where id = p_buyer_company_id;
  update public.companies set cash_balance = cash_balance + v_total where id = v_order.company_id;
  insert into public.inventories(company_id, product_id, quantity, average_unit_cost)
  values (p_buyer_company_id, v_order.product_id, p_quantity, v_order.price_per_unit)
  on conflict (company_id, product_id) do update set quantity = public.inventories.quantity + excluded.quantity, average_unit_cost = excluded.average_unit_cost;

  update public.market_orders
  set remaining_quantity = remaining_quantity - p_quantity,
      status = case when remaining_quantity - p_quantity = 0 then 'filled' else 'partially_filled' end
  where id = p_order_id;

  insert into public.market_trades(order_id, buyer_company_id, seller_company_id, product_id, quantity, price_per_unit, total_value)
  values (p_order_id, p_buyer_company_id, v_order.company_id, v_order.product_id, p_quantity, v_order.price_per_unit, v_total);

  insert into public.financial_transactions(company_id, transaction_type, amount, description)
  values
    (p_buyer_company_id, 'market_purchase', -v_total, 'Marktkauf'),
    (v_order.company_id, 'market_sale', v_total, 'Marktverkauf');
end;
$$;

-- RPC permissions
revoke all on function public.bootstrap_company(text,text) from public;
revoke all on function public.hire_employee(uuid,text,text,text,numeric) from public;
revoke all on function public.produce_product(uuid,uuid,numeric) from public;
revoke all on function public.place_sell_order(uuid,uuid,numeric,numeric) from public;
revoke all on function public.buy_market_order(uuid,uuid,numeric) from public;
grant execute on function public.bootstrap_company(text,text) to authenticated;
grant execute on function public.hire_employee(uuid,text,text,text,numeric) to authenticated;
grant execute on function public.produce_product(uuid,uuid,numeric) to authenticated;
grant execute on function public.place_sell_order(uuid,uuid,numeric,numeric) to authenticated;
grant execute on function public.buy_market_order(uuid,uuid,numeric) to authenticated;
