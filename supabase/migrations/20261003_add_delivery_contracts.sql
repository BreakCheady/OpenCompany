
alter table public.contracts
  add column if not exists contract_kind text not null default 'one_time',
  add column if not exists interval_days integer,
  add column if not exists duration_days integer,
  add column if not exists delivery_time time without time zone,
  add column if not exists total_deliveries integer,
  add column if not exists completed_deliveries integer not null default 0,
  add column if not exists failed_deliveries integer not null default 0,
  add column if not exists next_delivery_at timestamptz,
  add column if not exists contract_end_at timestamptz,
  add column if not exists penalty_rate numeric not null default 0.10;

alter table public.contracts drop constraint if exists contracts_contract_kind_check;
alter table public.contracts add constraint contracts_contract_kind_check
  check (contract_kind in ('one_time','delivery'));

create or replace function private.create_delivery_contract_impl(
  p_seller_company_id uuid,
  p_buyer_company_id uuid,
  p_product_id uuid,
  p_material_id uuid,
  p_quality integer,
  p_quantity numeric,
  p_unit_price numeric,
  p_interval_days integer,
  p_duration_days integer,
  p_delivery_time time
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_total integer;
begin
  perform private.assert_company_owner(p_seller_company_id);

  if p_seller_company_id=p_buyer_company_id then raise exception 'Vertragspartner müssen verschieden sein'; end if;
  if ((p_product_id is not null)::int + (p_material_id is not null)::int)<>1 then raise exception 'Genau ein Gut auswählen'; end if;
  if p_quality<1 or p_quantity<=0 or p_unit_price<=0 then raise exception 'Ungültige Vertragsdaten'; end if;
  if p_interval_days not in (1,2,7) then raise exception 'Ungültiges Lieferintervall'; end if;
  if p_duration_days not in (3,7,14,30) then raise exception 'Ungültige Vertragslaufzeit'; end if;

  v_total:=greatest(1,ceil(p_duration_days::numeric/p_interval_days)::integer);

  insert into public.contracts(
    proposer_company_id,seller_company_id,buyer_company_id,product_id,material_id,
    quality_level,quantity,unit_price,status,contract_kind,interval_days,duration_days,
    delivery_time,total_deliveries,completed_deliveries,failed_deliveries,penalty_rate
  ) values(
    p_seller_company_id,p_seller_company_id,p_buyer_company_id,p_product_id,p_material_id,
    p_quality,p_quantity,p_unit_price,'proposed','delivery',p_interval_days,p_duration_days,
    coalesce(p_delivery_time,time '18:00'),v_total,0,0,0.10
  ) returning id into v_id;

  return v_id;
end
$function$;

revoke all on function private.create_delivery_contract_impl(uuid,uuid,uuid,uuid,integer,numeric,numeric,integer,integer,time) from public,anon;
grant execute on function private.create_delivery_contract_impl(uuid,uuid,uuid,uuid,integer,numeric,numeric,integer,integer,time) to authenticated;

create or replace function public.create_delivery_contract(
  p_seller_company_id uuid,
  p_buyer_company_id uuid,
  p_product_id uuid,
  p_material_id uuid,
  p_quality integer,
  p_quantity numeric,
  p_unit_price numeric,
  p_interval_days integer,
  p_duration_days integer,
  p_delivery_time time
)
returns uuid
language sql
security invoker
set search_path to ''
as $function$
 select private.create_delivery_contract_impl(
   p_seller_company_id,p_buyer_company_id,p_product_id,p_material_id,p_quality,p_quantity,
   p_unit_price,p_interval_days,p_duration_days,p_delivery_time
 )
$function$;

revoke all on function public.create_delivery_contract(uuid,uuid,uuid,uuid,integer,numeric,numeric,integer,integer,time) from public,anon;
grant execute on function public.create_delivery_contract(uuid,uuid,uuid,uuid,integer,numeric,numeric,integer,integer,time) to authenticated;

create or replace function private.accept_delivery_contract_impl(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v public.contracts%rowtype;
  v_local timestamp;
  v_first timestamp;
begin
  select ct.* into v
  from public.contracts ct
  join public.companies c on c.id=ct.buyer_company_id
  where ct.id=p_contract_id and c.owner_user_id=(select auth.uid())
  for update of ct;

  if v.id is null or v.status<>'proposed' or v.contract_kind<>'delivery' then
    raise exception 'Liefervertrag kann nicht angenommen werden';
  end if;

  v_local:=now() at time zone 'Europe/Berlin';
  v_first:=date_trunc('day',v_local)+coalesce(v.delivery_time,time '18:00');
  if v_first<=v_local then v_first:=v_first+interval '1 day'; end if;

  update public.contracts
  set status='accepted',
      accepted_at=now(),
      next_delivery_at=v_first at time zone 'Europe/Berlin',
      contract_end_at=(v_first+make_interval(days=>v.duration_days)) at time zone 'Europe/Berlin'
  where id=v.id;
end
$function$;

revoke all on function private.accept_delivery_contract_impl(uuid) from public,anon;
grant execute on function private.accept_delivery_contract_impl(uuid) to authenticated;

create or replace function public.accept_delivery_contract(p_contract_id uuid)
returns void
language sql
security invoker
set search_path to ''
as $function$
 select private.accept_delivery_contract_impl(p_contract_id)
$function$;

revoke all on function public.accept_delivery_contract(uuid) from public,anon;
grant execute on function public.accept_delivery_contract(uuid) to authenticated;

create or replace function private.run_delivery_contracts_if_due()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
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

      if v_containers<v.quantity then
        v_failure:='Der Verkäufer hatte nicht genügend Transportcontainer.';
        v_fail_party:=v.seller_company_id;
        v_other_party:=v.buyer_company_id;
      end if;
    end if;

    if v_failure is not null then
      v_penalty:=round(v_value*coalesce(v.penalty_rate,0.10),2);
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

revoke all on function private.run_delivery_contracts_if_due() from public,anon,authenticated;

select cron.schedule(
  'opencompany-delivery-contracts',
  '*/15 * * * *',
  'select private.run_delivery_contracts_if_due();'
)
where not exists (select 1 from cron.job where jobname='opencompany-delivery-contracts');
