-- Concrete large-customer-order decisions for OpenCompany.
-- Requires 20261008200000_add_deep_management_commitments.sql.
-- No changes to an awarded order occur until an option is actually selected.

create or replace function private.bind_large_order_management_decision()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_order public.large_customer_orders%rowtype;
  v_bid public.large_customer_bids%rowtype;
  v_remaining numeric;
  v_contract_value numeric;
  v_renegotiation_fee numeric;
  v_option jsonb;
  v_options jsonb:='[]'::jsonb;
begin
  if new.template_key<>'large_order_delivery_crisis' then return new; end if;

  -- Bind one real, outstanding contract to the decision snapshot.
  select * into v_order
  from public.large_customer_orders
  where awarded_company_id=new.company_id
    and status='awarded'
    and delivered_quantity<quantity
    and delivery_deadline>now()
    and delivery_deadline<=now()+interval '24 hours'
  order by delivery_deadline,id limit 1;
  if v_order.id is null then
    raise exception 'No eligible large customer order remains';
  end if;

  select * into v_bid from public.large_customer_bids
  where id=v_order.winning_bid_id and company_id=new.company_id and order_id=v_order.id
    and status='won';
  if v_bid.id is null then
    raise exception 'Winning bid unavailable for the selected large customer order';
  end if;

  v_remaining:=greatest(0,v_order.quantity-v_order.delivered_quantity);
  v_contract_value:=round(v_remaining*v_bid.price_per_unit,2);
  v_renegotiation_fee:=round(v_contract_value*0.04,2);

  new.title:='Lieferentscheidung: '||v_order.customer_name;
  new.description:='Für '||v_order.item_name||' stehen noch '||v_remaining
    ||' Einheiten aus. Der Liefertermin rückt näher. Soll die Frist gegen eine Vertragsgebühr angepasst oder der Auftrag priorisiert werden?';
  new.context:=coalesce(new.context,'{}'::jsonb)||jsonb_build_object(
    'order_id',v_order.id,
    'order_customer',v_order.customer_name,
    'order_item',v_order.item_name,
    'order_remaining',v_remaining,
    'order_deadline',v_order.delivery_deadline,
    'order_remaining_value',v_contract_value,
    'order_renegotiation_fee',v_renegotiation_fee
  );
  for v_option in select value from jsonb_array_elements(new.options) loop
    if v_option->>'key'='renegotiate' then
      v_option:=jsonb_set(v_option,'{effects,cash_min}',to_jsonb(-v_renegotiation_fee),true);
      v_option:=jsonb_set(v_option,'{effects,cash_max}',to_jsonb(-v_renegotiation_fee),true);
    end if;
    v_options:=v_options||jsonb_build_array(v_option);
  end loop;
  new.options:=v_options;
  return new;
end $$;

drop trigger if exists trg_bind_large_order_management_decision on public.management_decisions;
create trigger trg_bind_large_order_management_decision
before insert on public.management_decisions
for each row execute function private.bind_large_order_management_decision();

-- Apply the contract-specific part of the selected option in the same transaction
-- that books its cash and profile effects. If the contract changed in the meantime,
-- reject the choice instead of charging for an unavailable extension.
create or replace function private.apply_large_order_management_decision()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_order_id uuid;
  v_deadline timestamptz;
begin
  if new.template_key<>'large_order_delivery_crisis'
     or old.status='resolved'
     or new.status<>'resolved'
     or new.chosen_option_key is null
  then return new; end if;

  v_order_id:=(new.context->>'order_id')::uuid;
  if v_order_id is null then raise exception 'Order binding missing'; end if;

  if new.chosen_option_key='renegotiate' then
    update public.large_customer_orders
    set delivery_deadline=delivery_deadline+interval '24 hours'
    where id=v_order_id and awarded_company_id=new.company_id
      and status='awarded' and delivery_deadline>now()
      and delivered_quantity<quantity
    returning delivery_deadline into v_deadline;
    if v_deadline is null then
      raise exception 'The selected contract is no longer eligible for an extension';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_apply_large_order_management_decision on public.management_decisions;
create trigger trg_apply_large_order_management_decision
after update of status on public.management_decisions
for each row execute function private.apply_large_order_management_decision();

insert into private.management_decision_templates (
  template_key,decision_level,severity,title,description,conditions,context_keys,options,
  manager_prompts,default_option_key,cooldown_hours,expires_hours,weight,trigger_enabled,enabled
) values (
 'large_order_delivery_crisis','tactical','critical',
 'Großauftrag: Liefertermin gefährdet',
 'Ein konkret zugeordneter Großauftrag nähert sich dem Liefertermin.',
 '[{"metric":"large_order_due_24h","op":">=","value":1}]'::jsonb,
 ARRAY['cash_balance','cashflow','large_order_due_24h'],
 $options$[
  {"key":"renegotiate","label":"Lieferfrist um 24 Stunden verlängern","summary":"4 % des noch offenen Auftragswerts als verbindliche Nachverhandlungsgebühr zahlen.","view":"contracts","impact":"Der konkret betroffene Großauftrag erhält 24 Stunden zusätzliche Lieferfrist. Die Gebühr wird sofort gebucht.","effects":{"cash_min":0,"cash_max":0,"reputation_delta":-2},"style":{"discipline":3,"risk":-3}},
  {"key":"prioritize","label":"Produktion und Logistik priorisieren","summary":"Diesen Lieferengpass ohne Friständerung bearbeiten und Mehrkosten akzeptieren.","view":"production","impact":"Produktionsleistung steigt für 24 Stunden; Produktions- und Frachtkosten steigen ebenfalls.","effects":{"temporary":[{"key":"production_output","min":0.08,"max":0.14,"hours":24},{"key":"production_cost","min":0.05,"max":0.09,"hours":24},{"key":"freight_cost","min":0.06,"max":0.12,"hours":24}]},"style":{"growth":3,"risk":4}},
  {"key":"accept","label":"Lieferfrist unverändert lassen","summary":"Liquidität sichern und mögliche Vertragsfolgen akzeptieren.","view":"finance","impact":"Keine zusätzlichen Kosten, aber kein Schutz vor dem bereits vorhandenen Lieferfristrisiko.","effects":{},"style":{"discipline":2,"risk":5}}
 ]$options$::jsonb,
 '{"logistics":"Eine echte Fristverlängerung entlastet den Auftrag. Ohne sie bleibt die Lieferpflicht unverändert.","finance":"Die Nachverhandlungsgebühr richtet sich nach der aktuell offenen Auftragssumme."}'::jsonb,
 'prioritize',72,12,7,true,true
)
on conflict(template_key) do update set
 decision_level=excluded.decision_level,severity=excluded.severity,title=excluded.title,
 description=excluded.description,conditions=excluded.conditions,
 context_keys=excluded.context_keys,options=excluded.options,manager_prompts=excluded.manager_prompts,
 default_option_key=excluded.default_option_key,cooldown_hours=excluded.cooldown_hours,
 expires_hours=excluded.expires_hours,weight=excluded.weight,
 trigger_enabled=excluded.trigger_enabled,enabled=excluded.enabled,updated_at=now();
