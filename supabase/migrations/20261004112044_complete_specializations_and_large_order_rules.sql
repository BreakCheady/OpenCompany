-- OpenCompany 0.10.221: complete PDF specializations and large-order rules.
alter table public.company_specializations
  add column if not exists upgrade_target_level smallint check(upgrade_target_level between 2 and 3),
  add column if not exists upgrade_started_at timestamptz,
  add column if not exists upgrade_finishes_at timestamptz;

alter table public.large_customer_orders
  add column if not exists rush_bonus_rate numeric(6,4) not null default 0 check(rush_bonus_rate between 0 and 1);

create or replace function private.effective_specialization_level(p_level smallint,p_target smallint,p_finish timestamptz)
returns smallint language sql stable set search_path to '' as $$
  select case when p_target is not null and p_finish<=now() then p_target else p_level end
$$;
revoke all on function private.effective_specialization_level(smallint,smallint,timestamptz) from public,anon,authenticated;

create or replace function private.specialization_factor(p_company_id uuid,p_key text,p_category text default null)
returns numeric language sql stable set search_path to '' as $$
  select coalesce(exp(sum(ln(factor))),1)
  from (
    select case
      when specialization_code='production' and p_key='production_output' then 1+0.05*scale
      when specialization_code='production' and p_key='production_operating_cost' then 1-0.05*scale
      when specialization_code='retail' and p_key='retail_rate' then 1+0.07*scale
      when specialization_code='retail' and p_key='retail_price_effect' then 1+0.03*scale
      when specialization_code='logistics' and p_key='transport_container_use' then 1-0.10*scale
      when specialization_code='logistics' and p_key='logistics_penalty' then 1-(0.10+0.05*(lvl-1))
      when specialization_code='research' and p_key='research_operating_cost' then 1-0.08*scale
      when specialization_code='research' and p_key='patent_gain' then 1+0.05*scale
      when specialization_code='trading' and p_key='market_fee' then 1-0.10*lvl
      when specialization_code='contracts' and p_key='contract_penalty' then 1-0.10*lvl
      when specialization_code='industry_electronics' and p_category='electronics' and p_key in ('production_output','retail_rate') then 1+0.02*lvl
      when specialization_code='industry_electronics' and p_category='electronics' and p_key='production_operating_cost' then 1-0.02*lvl
      else 1 end factor
    from (
      select specialization_code,lvl,1+0.25*(lvl-1) as scale
      from (
        select specialization_code,private.effective_specialization_level(specialization_level,upgrade_target_level,upgrade_finishes_at) as lvl
        from public.company_specializations where company_id=p_company_id
      ) levels
    ) scaled
  ) effects
$$;

create or replace function private.complete_specialization_upgrades()
returns integer language plpgsql security definer set search_path to '' as $$
declare v_count integer;
begin
  update public.company_specializations
  set specialization_level=upgrade_target_level,upgrade_target_level=null,
      upgrade_started_at=null,upgrade_finishes_at=null,updated_at=now()
  where upgrade_target_level is not null and upgrade_finishes_at<=now();
  get diagnostics v_count=row_count;
  return v_count;
end
$$;
revoke all on function private.complete_specialization_upgrades() from public,anon,authenticated;

create or replace function public.get_company_specializations(p_company_id uuid)
returns table(slot_no smallint,specialization_code text,specialization_level smallint,activated_at timestamptz,switch_available_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select cs.slot_no,cs.specialization_code,
    private.effective_specialization_level(cs.specialization_level,cs.upgrade_target_level,cs.upgrade_finishes_at),
    cs.activated_at,cs.switch_available_at
  from public.company_specializations cs where cs.company_id=p_company_id order by cs.slot_no
$$;
revoke all on function public.get_company_specializations(uuid) from public;
grant execute on function public.get_company_specializations(uuid) to anon,authenticated;

create or replace function public.get_company_specialization_progress(p_company_id uuid)
returns table(slot_no smallint,specialization_code text,specialization_level smallint,activated_at timestamptz,switch_available_at timestamptz,upgrade_target_level smallint,upgrade_started_at timestamptz,upgrade_finishes_at timestamptz)
language plpgsql stable security definer set search_path to '' as $$
begin
  perform private.assert_company_owner(p_company_id);
  return query select cs.slot_no,cs.specialization_code,
    private.effective_specialization_level(cs.specialization_level,cs.upgrade_target_level,cs.upgrade_finishes_at),
    cs.activated_at,cs.switch_available_at,
    case when cs.upgrade_finishes_at>now() then cs.upgrade_target_level else null::smallint end,
    case when cs.upgrade_finishes_at>now() then cs.upgrade_started_at else null::timestamptz end,
    case when cs.upgrade_finishes_at>now() then cs.upgrade_finishes_at else null::timestamptz end
  from public.company_specializations cs where cs.company_id=p_company_id order by cs.slot_no;
end
$$;
revoke all on function public.get_company_specialization_progress(uuid) from public,anon;
grant execute on function public.get_company_specialization_progress(uuid) to authenticated;

create or replace function public.upgrade_company_specialization(p_company_id uuid,p_slot_no smallint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v public.company_specializations%rowtype; v_cash numeric; v_target smallint; v_cost numeric; v_hours integer;
begin
  perform private.assert_company_owner(p_company_id);
  if p_slot_no is null or p_slot_no not in (1,2) then raise exception 'Ungültiger Spezialisierungsplatz'; end if;
  select cash_balance into v_cash from public.companies where id=p_company_id for update;
  select * into v from public.company_specializations where company_id=p_company_id and slot_no=p_slot_no for update;
  if v.id is null then raise exception 'Bitte zuerst eine Spezialisierung auswählen'; end if;
  if v.upgrade_target_level is not null and v.upgrade_finishes_at>now() then raise exception 'Der Ausbau läuft bereits'; end if;
  v.specialization_level:=private.effective_specialization_level(v.specialization_level,v.upgrade_target_level,v.upgrade_finishes_at);
  if v.specialization_level>=3 then raise exception 'Die maximale Spezialisierungsstufe ist erreicht'; end if;
  v_target:=v.specialization_level+1;
  v_cost:=case when v_target=2 then 50000 else 100000 end;
  v_hours:=case when v_target=2 then 24 else 48 end;
  if v_cash<v_cost then raise exception 'Für den Ausbau werden % OC$ benötigt',v_cost; end if;
  update public.companies set cash_balance=cash_balance-v_cost,updated_at=now() where id=p_company_id;
  update public.company_specializations set specialization_level=v.specialization_level,
    upgrade_target_level=v_target,upgrade_started_at=now(),upgrade_finishes_at=now()+make_interval(hours=>v_hours),updated_at=now()
  where id=v.id;
  insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id)
  values(p_company_id,'specialization_upgrade',-v_cost,'Spezialisierung ausbauen: Stufe '||v_target,'company_specialization',v.id);
  return jsonb_build_object('target_level',v_target,'cost',v_cost,'finishes_at',now()+make_interval(hours=>v_hours));
end
$$;
revoke all on function public.upgrade_company_specialization(uuid,smallint) from public,anon;
grant execute on function public.upgrade_company_specialization(uuid,smallint) to authenticated;

create or replace function public.get_company_trade_analysis(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_result jsonb;
begin
  perform private.assert_company_owner(p_company_id);
  if not exists(select 1 from public.company_specializations where company_id=p_company_id and specialization_code='trading') then
    return jsonb_build_object('enabled',false);
  end if;
  with own_trades as (
    select t.*,coalesce(m.name,p.name,'Ware') as item_name,coalesce(p.category,'raw') as category
    from public.market_trades t
    left join public.products p on p.id=t.product_id
    left join public.materials m on m.id=t.material_id
    where (t.buyer_company_id=p_company_id or t.seller_company_id=p_company_id)
      and t.executed_at>=now()-interval '30 days'
  ), per_item as (
    select item_name,category,quality_level,
      coalesce(sum(quantity) filter(where buyer_company_id=p_company_id),0) as bought_units,
      sum(total_value) filter(where buyer_company_id=p_company_id)/nullif(sum(quantity) filter(where buyer_company_id=p_company_id),0) as average_buy,
      coalesce(sum(quantity) filter(where seller_company_id=p_company_id),0) as sold_units,
      sum(total_value) filter(where seller_company_id=p_company_id)/nullif(sum(quantity) filter(where seller_company_id=p_company_id),0) as average_sell,
      coalesce(sum(greatest(round(total_value*0.05,2)-market_fee,0)) filter(where seller_company_id=p_company_id),0) as fee_saved
    from own_trades group by item_name,category,quality_level
  )
  select jsonb_build_object('enabled',true,'days',30,
    'trade_count',(select count(*) from own_trades),
    'purchase_value',(select coalesce(sum(total_value) filter(where buyer_company_id=p_company_id),0) from own_trades),
    'sales_value',(select coalesce(sum(total_value) filter(where seller_company_id=p_company_id),0) from own_trades),
    'fee_saved',(select coalesce(sum(fee_saved),0) from per_item),
    'items',coalesce((select jsonb_agg(to_jsonb(x) order by item_name,quality_level) from per_item x),'[]'::jsonb)) into v_result;
  return v_result;
end
$$;
revoke all on function public.get_company_trade_analysis(uuid) from public,anon;
grant execute on function public.get_company_trade_analysis(uuid) to authenticated;

create or replace function private.is_large_customer_generation_time(p_at timestamptz)
returns boolean language sql immutable set search_path to '' as $$
  select date_trunc('minute',p_at at time zone 'Europe/Berlin')::time=time '06:00'
$$;
revoke all on function private.is_large_customer_generation_time(timestamptz) from public,anon,authenticated;

select cron.schedule('opencompany-specialization-upgrades','*/5 * * * *','select private.complete_specialization_upgrades();');
select cron.schedule('opencompany-large-customer-hourly','* * * * *','select private.award_due_large_customer_orders(); select private.fail_overdue_large_customer_orders();');
-- Both UTC slots are checked; the Europe/Berlin guard chooses the correct DST slot.
select cron.schedule('opencompany-large-customer-generation','0 4,5 * * *','select private.generate_large_customer_order_if_due();');

CREATE OR REPLACE FUNCTION public.set_company_specialization(p_company_id uuid, p_slot_no smallint, p_specialization_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_level integer;
  v_existing public.company_specializations%rowtype;
  v_cash numeric;
  v_required integer;
begin
  perform private.assert_company_owner(p_company_id);
  if p_slot_no is null or p_slot_no not in (1,2) then raise exception 'Ungültiger Spezialisierungsplatz'; end if;

  if p_specialization_code is null or p_specialization_code not in ('production','retail','logistics','research','trading','contracts','industry_electronics') then
    raise exception 'Ungültige Spezialisierung';
  end if;
  if exists(
    select 1 from public.company_specializations
    where company_id=p_company_id
      and specialization_code=p_specialization_code
      and slot_no<>p_slot_no
  ) then
    raise exception 'Diese Spezialisierung ist bereits aktiv';
  end if;

  select company_level,cash_balance into v_level,v_cash
  from public.companies where id=p_company_id for update;

  v_required:=case when p_slot_no=1 then 8 else 15 end;
  if v_level<v_required then
    raise exception 'Spezialisierungsplatz wird auf Level % freigeschaltet',v_required;
  end if;

  select * into v_existing
  from public.company_specializations
  where company_id=p_company_id and slot_no=p_slot_no
  for update;

  if v_existing.id is not null and v_existing.specialization_code=p_specialization_code then
    return jsonb_build_object('status','unchanged');
  end if;

  if v_existing.id is not null then
    if v_existing.upgrade_target_level is not null and v_existing.upgrade_finishes_at>now() then
      raise exception 'Während des Ausbaus ist kein Spezialisierungswechsel möglich';
    end if;
    if v_existing.switch_available_at is not null and v_existing.switch_available_at>now() then
      raise exception 'Spezialisierung kann erst ab % gewechselt werden',v_existing.switch_available_at;
    end if;
    if v_cash<100000 then
      raise exception 'Für die Umstrukturierung werden 100.000 OC$ benötigt';
    end if;
    update public.companies
    set cash_balance=cash_balance-100000,updated_at=now()
    where id=p_company_id;
    insert into public.financial_transactions(
      company_id,transaction_type,amount,description,reference_type,reference_id
    )
    values(
      p_company_id,'specialization_change',-100000,
      'Umstrukturierung: Spezialisierung gewechselt','company_specialization',v_existing.id
    );
  end if;

  insert into public.company_specializations(
    company_id,slot_no,specialization_code,specialization_level,activated_at,switch_available_at,updated_at
  )
  values(p_company_id,p_slot_no,p_specialization_code,1,now(),now()+interval '14 days',now())
  on conflict(company_id,slot_no) do update set
    specialization_code=excluded.specialization_code,
    specialization_level=1,
    upgrade_target_level=null,upgrade_started_at=null,upgrade_finishes_at=null,
    activated_at=now(),
    switch_available_at=now()+interval '14 days',
    updated_at=now();

  return jsonb_build_object('status','ok','switch_available_at',now()+interval '14 days');
end
$function$;

CREATE OR REPLACE FUNCTION private.buy_market_order_impl(p_buyer_company_id uuid, p_order_id uuid, p_quantity numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_order public.market_orders%rowtype; v_total numeric; v_fee numeric; v_net numeric; v_target_product_id uuid; v_source_product public.products%rowtype; v_item_name text;
begin
 perform private.assert_company_owner(p_buyer_company_id); if p_quantity<=0 then raise exception 'Menge muss größer als 0 sein'; end if;
 select * into v_order from public.market_orders where id=p_order_id for update;
 if v_order.id is null or v_order.order_type<>'sell' or v_order.status not in ('open','partially_filled') then raise exception 'Order nicht verfügbar'; end if;
 if v_order.company_id=p_buyer_company_id then raise exception 'Eigene Order kann nicht gekauft werden'; end if; if v_order.remaining_quantity<p_quantity then raise exception 'Nicht genügend Menge verfügbar'; end if;
 if v_order.material_id is not null then select name into v_item_name from public.materials where id=v_order.material_id; else select * into v_source_product from public.products where id=v_order.product_id; v_item_name:=v_source_product.name; end if;
 v_total:=round(p_quantity*v_order.price_per_unit,2); v_fee:=round(v_total*0.05*private.specialization_factor(v_order.company_id,'market_fee'),2); v_net:=v_total-v_fee;
 update public.companies set cash_balance=cash_balance-v_total,updated_at=now() where id=p_buyer_company_id; update public.companies set cash_balance=cash_balance+v_net,updated_at=now() where id=v_order.company_id;
 if v_order.material_id is not null then
   insert into public.material_inventories(company_id,material_id,quality_level,quantity,average_unit_cost) values(p_buyer_company_id,v_order.material_id,v_order.quality_level,p_quantity,v_order.price_per_unit)
   on conflict(company_id,material_id,quality_level) do update set average_unit_cost=case when public.material_inventories.quantity+excluded.quantity=0 then excluded.average_unit_cost else ((public.material_inventories.quantity*public.material_inventories.average_unit_cost)+(excluded.quantity*excluded.average_unit_cost))/(public.material_inventories.quantity+excluded.quantity) end,quantity=public.material_inventories.quantity+excluded.quantity;
 else
   select id into v_target_product_id from public.products where company_id=p_buyer_company_id and name=v_source_product.name and category=v_source_product.category and status='active' order by id limit 1;
   if v_target_product_id is null then raise exception 'Passendes Produkt ist für dein Unternehmen nicht verfügbar'; end if;
   insert into public.inventories(company_id,product_id,quality_level,quantity,average_unit_cost) values(p_buyer_company_id,v_target_product_id,v_order.quality_level,p_quantity,v_order.price_per_unit)
   on conflict(company_id,product_id,quality_level) do update set average_unit_cost=case when public.inventories.quantity+excluded.quantity=0 then excluded.average_unit_cost else ((public.inventories.quantity*public.inventories.average_unit_cost)+(excluded.quantity*excluded.average_unit_cost))/(public.inventories.quantity+excluded.quantity) end,quantity=public.inventories.quantity+excluded.quantity;
 end if;
 update public.market_orders set remaining_quantity=remaining_quantity-p_quantity,status=case when remaining_quantity-p_quantity<=0 then 'filled' else 'partially_filled' end where id=p_order_id;
 insert into public.market_trades(order_id,buyer_company_id,seller_company_id,product_id,material_id,quantity,price_per_unit,total_value,market_fee,quality_level) values(p_order_id,p_buyer_company_id,v_order.company_id,v_target_product_id,v_order.material_id,p_quantity,v_order.price_per_unit,v_total,v_fee,v_order.quality_level);
 insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id) values
 (p_buyer_company_id,'market_buy',-v_total,'Marktkauf: '||coalesce(v_item_name,'Artikel')||' Q'||v_order.quality_level,'market_order',p_order_id),
 (v_order.company_id,'market_sale',v_net,'Marktverkauf Q'||v_order.quality_level||' nach Marktgebühr','market_order',p_order_id),
 (v_order.company_id,'market_fee',-v_fee,'Marktgebühr','market_order',p_order_id);
 perform private.handle_insolvency_if_needed(p_buyer_company_id);
end $function$;

CREATE OR REPLACE FUNCTION private.run_npc_market_tick_core()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_state timestamptz;
  v_order public.market_orders%rowtype;
  v_qty numeric;
  v_total numeric;
  v_fee numeric;
  v_net numeric;
  v_npc uuid;
  v_count int := 0;
  v_roll numeric;
begin
  select last_run into v_state
  from private.npc_market_state
  where key='main'
  for update;

  if v_state > now()-interval '2 minutes' then return 0; end if;

  update private.npc_market_state set last_run=now() where key='main';

  for v_order in
    select o.*
    from public.market_orders o
    join public.companies c on c.id=o.company_id
    join private.market_order_product_cost_basis cb on cb.order_id=o.id
    where o.order_type='sell'
      and o.status in ('open','partially_filled')
      and c.company_type='player'
      and cb.unit_cost>0
      and o.price_per_unit<=cb.npc_max_price
    order by random()
    limit 8
  loop
    select id into v_npc
    from public.companies
    where company_type='npc' and status='active'
    order by random()
    limit 1;

    exit when v_npc is null;

    v_roll := random();

    if v_order.remaining_quantity >= 200 then
      v_qty := case
        when v_roll < 0.15 then 25
        when v_roll < 0.35 then 50
        when v_roll < 0.60 then 100
        when v_roll < 0.80 then 150
        else 200
      end;
    elsif v_order.remaining_quantity >= 100 then
      v_qty := case
        when v_roll < 0.20 then 20
        when v_roll < 0.50 then 50
        when v_roll < 0.75 then 75
        else 100
      end;
    elsif v_order.remaining_quantity >= 50 then
      v_qty := case
        when v_roll < 0.25 then 10
        when v_roll < 0.60 then 25
        else 50
      end;
    else
      v_qty := least(
        v_order.remaining_quantity,
        greatest(2,(2+floor(random()*24))::numeric)
      );
    end if;

    v_qty := least(v_order.remaining_quantity,v_qty);
    v_total:=round(v_qty*v_order.price_per_unit,2);
    v_fee:=round(v_total*0.05*private.specialization_factor(v_order.company_id,'market_fee'),2);
    v_net:=v_total-v_fee;

    if (select cash_balance from public.companies where id=v_npc)>=v_total then
      update public.companies set cash_balance=cash_balance-v_total where id=v_npc;
      update public.companies set cash_balance=cash_balance+v_net where id=v_order.company_id;

      update public.market_orders
      set remaining_quantity=remaining_quantity-v_qty,
          status=case when remaining_quantity-v_qty<=0 then 'filled' else 'partially_filled' end
      where id=v_order.id;

      insert into public.market_trades(
        order_id,buyer_company_id,seller_company_id,product_id,material_id,
        quantity,price_per_unit,total_value,market_fee,quality_level
      )
      values(
        v_order.id,v_npc,v_order.company_id,v_order.product_id,v_order.material_id,
        v_qty,v_order.price_per_unit,v_total,v_fee,v_order.quality_level
      );

      insert into public.financial_transactions(
        company_id,transaction_type,amount,description,reference_type,reference_id
      )
      values
      (v_order.company_id,'market_sale',v_net,'Verkauf an NPC nach Marktgebühr','market_order',v_order.id),
      (v_order.company_id,'market_fee',-v_fee,'Marktgebühr','market_order',v_order.id);

      v_count:=v_count+1;
    end if;
  end loop;

  v_count:=v_count+private.ensure_npc_market_supply();
  return v_count;
end
$function$;

CREATE OR REPLACE FUNCTION private.run_delivery_contracts_if_due()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.contracts%rowtype;
  v_value numeric;
  v_seller_qty numeric;
  v_buyer_cash numeric;
  v_fail_cash numeric;
  v_containers numeric;
  v_failure text;
  v_fail_party uuid;
  v_other_party uuid;
  v_penalty numeric;
  v_paid_penalty numeric;
  v_buyer_product uuid;
  v_seller_product public.products%rowtype;
  v_new_fail integer;
  v_count integer:=0;
begin
  for v in
    select * from public.contracts
    where contract_kind='delivery'
      and status='accepted'
      and next_delivery_at is not null
      and next_delivery_at<=now()
    order by next_delivery_at
    for update skip locked
  loop
    v_value:=round(v.quantity*v.unit_price,2);
    v_failure:=null;
    v_fail_party:=null;
    v_other_party:=null;

    select cash_balance into v_buyer_cash from public.companies where id=v.buyer_company_id for update;

    if coalesce(v_buyer_cash,0)<v_value then
      v_failure:='Der Käufer konnte die Lieferung nicht bezahlen.';
      v_fail_party:=v.buyer_company_id;
      v_other_party:=v.seller_company_id;
    elsif v.material_id is not null then
      select quantity into v_seller_qty
      from public.material_inventories
      where company_id=v.seller_company_id and material_id=v.material_id and quality_level=v.quality_level
      for update;
      if coalesce(v_seller_qty,0)<v.quantity then
        v_failure:='Der Verkäufer hatte nicht genügend Ware für die vereinbarte Lieferung.';
        v_fail_party:=v.seller_company_id;
        v_other_party:=v.buyer_company_id;
      end if;
    else
      select quantity into v_seller_qty
      from public.inventories
      where company_id=v.seller_company_id and product_id=v.product_id and quality_level=v.quality_level
      for update;
      if coalesce(v_seller_qty,0)<v.quantity then
        v_failure:='Der Verkäufer hatte nicht genügend Ware für die vereinbarte Lieferung.';
        v_fail_party:=v.seller_company_id;
        v_other_party:=v.buyer_company_id;
      else
        select * into v_seller_product from public.products where id=v.product_id;
        select id into v_buyer_product
        from public.products
        where company_id=v.buyer_company_id
          and name=v_seller_product.name
          and category=v_seller_product.category
          and status='active'
        limit 1;
        if v_buyer_product is null then
          v_failure:='Das Produkt ist beim Käufer nicht verfügbar.';
          v_fail_party:=v.seller_company_id;
          v_other_party:=v.buyer_company_id;
        end if;
      end if;
    end if;

    if v_failure is null then
      select coalesce(sum(i.quantity),0) into v_containers
      from public.inventories i
      join public.products p on p.id=i.product_id
      where i.company_id=v.seller_company_id
        and p.company_id=v.seller_company_id
        and p.status='active'
        and p.name='Transportcontainer';

      if v_containers<v.quantity*private.specialization_factor(v.seller_company_id,'transport_container_use') then
        v_failure:='Der Verkäufer hatte nicht genügend Transportcontainer.';
        v_fail_party:=v.seller_company_id;
        v_other_party:=v.buyer_company_id;
      end if;
    end if;

    if v_failure is not null then
      v_penalty:=round(v_value*coalesce(v.penalty_rate,0.10)
        *private.specialization_factor(v_fail_party,'contract_penalty')
        *case when v_failure='Der Verkäufer hatte nicht genügend Transportcontainer.'
          then private.specialization_factor(v_fail_party,'logistics_penalty') else 1 end,2);
      select cash_balance into v_fail_cash from public.companies where id=v_fail_party for update;
      v_paid_penalty:=least(greatest(coalesce(v_fail_cash,0),0),v_penalty);

      if v_paid_penalty>0 then
        update public.companies set cash_balance=cash_balance-v_paid_penalty,updated_at=now() where id=v_fail_party;
        update public.companies set cash_balance=cash_balance+v_paid_penalty,updated_at=now() where id=v_other_party;

        insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id)
        values
          (v_fail_party,'contract_penalty',-v_paid_penalty,'Vertragsstrafe Liefervertrag','contract',v.id),
          (v_other_party,'contract_penalty_income',v_paid_penalty,'Vertragsstrafe Liefervertrag erhalten','contract',v.id);
      end if;

      v_new_fail:=v.failed_deliveries+1;

      update public.contracts
      set failed_deliveries=v_new_fail,
          status=case when v_new_fail>=3 then 'cancelled' else status end,
          next_delivery_at=case when v_new_fail>=3 then null else next_delivery_at+make_interval(days=>interval_days) end
      where id=v.id;

      insert into public.chat_messages(sender_company_id,recipient_company_id,body)
      values
        ('00000000-0000-4000-8000-000000000001'::uuid,v.seller_company_id,
         'Boss, eine Lieferung aus einem Liefervertrag ist fehlgeschlagen. '||v_failure||
         ' Fehlversuche: '||v_new_fail||' / 3.'||case when v_new_fail>=3 then ' Der Liefervertrag wurde automatisch beendet.' else '' end),
        ('00000000-0000-4000-8000-000000000001'::uuid,v.buyer_company_id,
         'Boss, eine Lieferung aus einem Liefervertrag ist fehlgeschlagen. '||v_failure||
         ' Fehlversuche: '||v_new_fail||' / 3.'||case when v_new_fail>=3 then ' Der Liefervertrag wurde automatisch beendet.' else '' end);

      v_count:=v_count+1;
      continue;
    end if;

    if v.material_id is not null then
      update public.material_inventories
      set quantity=quantity-v.quantity
      where company_id=v.seller_company_id and material_id=v.material_id and quality_level=v.quality_level;

      insert into public.material_inventories(company_id,material_id,quality_level,quantity,average_unit_cost)
      values(v.buyer_company_id,v.material_id,v.quality_level,v.quantity,v.unit_price)
      on conflict(company_id,material_id,quality_level) do update
      set average_unit_cost=
        ((public.material_inventories.quantity*public.material_inventories.average_unit_cost)
         +(excluded.quantity*excluded.average_unit_cost))
        /(public.material_inventories.quantity+excluded.quantity),
        quantity=public.material_inventories.quantity+excluded.quantity;
    else
      update public.inventories
      set quantity=quantity-v.quantity
      where company_id=v.seller_company_id and product_id=v.product_id and quality_level=v.quality_level;

      insert into public.inventories(company_id,product_id,quality_level,quantity,average_unit_cost)
      values(v.buyer_company_id,v_buyer_product,v.quality_level,v.quantity,v.unit_price)
      on conflict(company_id,product_id,quality_level) do update
      set average_unit_cost=
        ((public.inventories.quantity*public.inventories.average_unit_cost)
         +(excluded.quantity*excluded.average_unit_cost))
        /(public.inventories.quantity+excluded.quantity),
        quantity=public.inventories.quantity+excluded.quantity;
    end if;

    perform private.consume_transport_containers(v.seller_company_id,v.quantity,'contract',v.id);

    update public.companies set cash_balance=cash_balance-v_value,updated_at=now() where id=v.buyer_company_id;
    update public.companies set cash_balance=cash_balance+v_value,updated_at=now() where id=v.seller_company_id;

    insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id)
    values
      (v.buyer_company_id,'contract_buy',-v_value,'Liefervertrag: Lieferung '||(v.completed_deliveries+1)||' / '||v.total_deliveries,'contract',v.id),
      (v.seller_company_id,'contract_sale',v_value,'Liefervertrag: Lieferung '||(v.completed_deliveries+1)||' / '||v.total_deliveries,'contract',v.id);

    update public.contracts
    set completed_deliveries=completed_deliveries+1,
        status=case when completed_deliveries+1>=total_deliveries then 'fulfilled' else status end,
        fulfilled_at=case when completed_deliveries+1>=total_deliveries then now() else fulfilled_at end,
        next_delivery_at=case when completed_deliveries+1>=total_deliveries then null else next_delivery_at+make_interval(days=>interval_days) end
    where id=v.id;

    insert into public.chat_messages(sender_company_id,recipient_company_id,body)
    values
      ('00000000-0000-4000-8000-000000000001'::uuid,v.seller_company_id,
       'Boss, Lieferung '||(v.completed_deliveries+1)||' / '||v.total_deliveries||' aus dem Liefervertrag wurde erfolgreich ausgeführt.'),
      ('00000000-0000-4000-8000-000000000001'::uuid,v.buyer_company_id,
       'Boss, Lieferung '||(v.completed_deliveries+1)||' / '||v.total_deliveries||' aus dem Liefervertrag wurde erfolgreich ausgeführt.');

    v_count:=v_count+1;
  end loop;

  return v_count;
end
$function$;

CREATE OR REPLACE FUNCTION private.award_due_large_customer_orders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.large_customer_orders%rowtype;
  b public.large_customer_bids%rowtype;
  v_min_price numeric;
  v_fastest_hours integer;
  v_best uuid;
  v_best_score numeric;
  v_score numeric;
  v_count integer:=0;
begin
  for o in select * from public.large_customer_orders where status='bidding' and bidding_ends_at<=now() order by bidding_ends_at for update skip locked
  loop
    select min(price_per_unit),min(delivery_hours) into v_min_price,v_fastest_hours from public.large_customer_bids where order_id=o.id and status='submitted';

    if v_min_price is null then
      update public.large_customer_orders set status='cancelled' where id=o.id;
      continue;
    end if;

    v_best:=null; v_best_score:=-1;
    for b in select * from public.large_customer_bids where order_id=o.id and status='submitted' order by created_at,id
    loop
      v_score :=
        50*(v_min_price/nullif(b.price_per_unit,0))
        +25*least(1,b.offered_quality::numeric/5)
        +25*least(1,v_fastest_hours::numeric/nullif(b.delivery_hours,0));
      update public.large_customer_bids set score=round(v_score,4) where id=b.id;
      if v_score>v_best_score then v_best_score:=v_score; v_best:=b.id; end if;
    end loop;

    select * into b from public.large_customer_bids where id=v_best;
    update public.large_customer_bids set status=case when id=v_best then 'won' else 'lost' end where order_id=o.id and status='submitted';
    update public.large_customer_orders set
      status='awarded',winning_bid_id=v_best,awarded_company_id=b.company_id,awarded_at=now(),
      delivery_deadline=now()+make_interval(hours=>b.delivery_hours)
    where id=o.id;

    v_count:=v_count+1;
  end loop;
  return v_count;
end
$function$;

CREATE OR REPLACE FUNCTION private.generate_large_customer_order_if_due()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=(now() at time zone 'Europe/Berlin')::date;
  v_hour integer:=extract(hour from (now() at time zone 'Europe/Berlin'))::integer;
  v_last_date date;
  v_count integer;
  v_cat text;
  v_demand numeric;
  v_product record;
  v_material record;
  v_type text;
  v_qty numeric;
  v_quality integer;
  v_customer text;
  v_item_kind text;
  v_slot integer;
begin
  select last_generation_date into v_last_date from private.large_customer_generation_state where id=1 for update;
  if not private.is_large_customer_generation_time(now()) or v_last_date=v_today then return 0; end if;

  select count(*) into v_count from public.large_customer_orders where status in ('bidding','awarded');
  if v_count>=3 then
    update private.large_customer_generation_state set last_generation_date=v_today where id=1;
    return 0;
  end if;

  for v_slot in 1..(3-v_count) loop

  select md.category,md.demand_index into v_cat,v_demand
  from public.market_demand md
  left join public.get_market_price_indices() idx
    on idx.index_kind='product' and idx.index_code=md.category
  where md.category<>'research'
  order by
    md.demand_index desc,
    abs(coalesce(idx.index_value,100)-100) desc,
    random()
  limit 1;

  v_type := (array['raw_material','production','quality','rush'])[1+floor(random()*4)::int];
  v_quality := case when v_type='quality' then 5 else 2+floor(random()*2)::int end;
  v_customer := (array['Nova Retail Group','Nordstern Industrie','Helios Handelsgruppe','Atlas Procurement','Vela Commerce'])[1+floor(random()*5)::int];

  if v_type='raw_material' then
    select * into v_material from public.materials where status='active' order by random() limit 1;
    v_item_kind:='material';
    v_qty:=500+100*floor(random()*16);
    insert into public.large_customer_orders(
      customer_name,order_type,item_kind,item_name,material_id,quantity,minimum_quality,
      bidding_ends_at,delivery_hours,early_bonus_hours,early_bonus_rate,rush_bonus_rate
    ) values(
      v_customer,v_type,v_item_kind,v_material.name,v_material.id,v_qty,v_quality,
      now()+interval '24 hours',48,24,0.10,0
    );
  else
    select name,category into v_product
    from public.products
    where status='active' and company_id=(select id from public.companies where company_type='player' order by created_at limit 1)
      and category=v_cat and category<>'research'
    order by random() limit 1;
    if v_product.name is null then
      select name,category into v_product
      from public.products
      where status='active' and company_id=(select id from public.companies where company_type='player' order by created_at limit 1)
        and category<>'research'
      order by random() limit 1;
    end if;
    v_item_kind:='product';
    v_qty:=case when v_type='rush' then 300+100*floor(random()*5) else 500+100*floor(random()*16) end;
    insert into public.large_customer_orders(
      customer_name,order_type,item_kind,item_name,product_category,quantity,minimum_quality,
      bidding_ends_at,delivery_hours,early_bonus_hours,early_bonus_rate,rush_bonus_rate
    ) values(
      v_customer,v_type,v_item_kind,v_product.name,v_product.category,v_qty,v_quality,
      now()+interval '24 hours',case when v_type='rush' then 12 else 48 end,
      case when v_type='rush' then null else 24 end,case when v_type='rush' then 0 else 0.10 end,
      case when v_type='rush' then 0.20 else 0 end
    );
  end if;

  end loop;
  update private.large_customer_generation_state set last_generation_date=v_today where id=1;
  return 3-v_count;
end
$function$;

CREATE OR REPLACE FUNCTION public.deliver_large_customer_order(p_company_id uuid, p_order_id uuid, p_quantity numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.large_customer_orders%rowtype;
  b public.large_customer_bids%rowtype;
  v_remaining numeric;
  v_take numeric;
  v_inv record;
  v_product_id uuid;
  v_total numeric;
  v_bonus numeric:=0;
  v_reward numeric:=0;
  v_completed boolean:=false;
begin
  perform private.assert_company_owner(p_company_id);
  if p_quantity<=0 then raise exception 'Liefermenge muss größer als 0 sein'; end if;

  select * into o from public.large_customer_orders where id=p_order_id and awarded_company_id=p_company_id for update;
  if o.id is null or o.status<>'awarded' then raise exception 'Auftrag ist nicht lieferbar'; end if;
  if o.delivery_deadline<=now() then raise exception 'Lieferfrist ist abgelaufen'; end if;
  if p_quantity>o.quantity-o.delivered_quantity then
    raise exception 'Liefermenge überschreitet die offene Restmenge';
  end if;

  select * into b from public.large_customer_bids where id=o.winning_bid_id;
  v_remaining:=least(p_quantity,o.quantity-o.delivered_quantity);
  if v_remaining<=0 then raise exception 'Auftrag ist bereits vollständig geliefert'; end if;

  if o.item_kind='material' then
    for v_inv in
      select * from public.material_inventories
      where company_id=p_company_id and material_id=o.material_id and quality_level>=greatest(o.minimum_quality,b.offered_quality) and quantity>0
      order by quality_level,average_unit_cost,id
      for update
    loop
      exit when v_remaining<=0;
      v_take:=least(v_remaining,v_inv.quantity);
      update public.material_inventories set quantity=quantity-v_take where id=v_inv.id;
      insert into public.large_customer_deliveries(order_id,company_id,quantity,quality_level)
      values(o.id,p_company_id,v_take,v_inv.quality_level);
      v_remaining:=v_remaining-v_take;
    end loop;
  else
    for v_inv in
      select i.*
      from public.inventories i
      join public.products p on p.id=i.product_id
      where i.company_id=p_company_id and p.name=o.item_name
        and (o.product_category is null or p.category=o.product_category)
        and i.quality_level>=greatest(o.minimum_quality,b.offered_quality) and i.quantity>0
      order by i.quality_level,i.average_unit_cost,i.id
      for update of i
    loop
      exit when v_remaining<=0;
      v_take:=least(v_remaining,v_inv.quantity);
      update public.inventories set quantity=quantity-v_take where id=v_inv.id;
      insert into public.large_customer_deliveries(order_id,company_id,quantity,quality_level)
      values(o.id,p_company_id,v_take,v_inv.quality_level);
      v_remaining:=v_remaining-v_take;
    end loop;
  end if;

  if v_remaining>0 then raise exception 'Nicht genügend passender Bestand für die gewünschte Lieferung'; end if;

  update public.large_customer_orders
  set delivered_quantity=delivered_quantity+p_quantity
  where id=o.id
  returning * into o;

  if o.delivered_quantity>=o.quantity then
    v_total:=round(o.quantity*b.price_per_unit,2);
    v_bonus:=round(v_total*o.rush_bonus_rate,2);
    if o.early_bonus_hours is not null and now()<=o.awarded_at+make_interval(hours=>o.early_bonus_hours) then
      v_bonus:=v_bonus+round(v_total*o.early_bonus_rate,2);
    end if;
    v_reward:=v_total+v_bonus;

    update public.companies set cash_balance=cash_balance+v_reward,updated_at=now() where id=p_company_id;
    update public.large_customer_orders set status='completed',completed_at=now() where id=o.id;
    insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id)
    values(p_company_id,'large_customer_order',v_reward,'Großkundenauftrag abgeschlossen: '||o.item_name,'large_customer_order',o.id);
    perform private.add_company_volume_xp(p_company_id,'large_customer_order',v_total,50,85,'Großkundenauftrag');
    v_completed:=true;
  end if;

  return jsonb_build_object('delivered',p_quantity,'total_delivered',o.delivered_quantity,'completed',v_completed,'reward',v_reward);
end
$function$;
