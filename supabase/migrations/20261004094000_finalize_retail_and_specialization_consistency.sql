
-- Final consistency fixes for OpenCompany 0.10.220.

create or replace function private.retail_effective_unit_revenue_company(
  p_company_id uuid,p_unit_cost numeric,p_unit_price numeric,p_category text
)
returns numeric
language plpgsql
stable
set search_path to ''
as $$
declare
  v_avg numeric;
  v_min numeric;
  v_max numeric;
  v_peak_low numeric;
  v_peak_high numeric;
  v_factor numeric;
begin
  v_avg := private.retail_average_price(p_unit_cost,p_category)
    * private.specialization_factor(p_company_id,'retail_price_effect',p_category);
  v_min := round(v_avg*0.75,2);
  v_max := round(v_avg*1.20,2);
  v_peak_low := round(v_avg*0.95,2);
  v_peak_high := round(v_avg*1.05,2);

  if p_unit_price is null or v_avg<=0 or p_unit_price<=v_min or p_unit_price>=v_max then
    return 0;
  elsif p_unit_price<v_peak_low then
    v_factor := (p_unit_price-v_min)/nullif(v_peak_low-v_min,0);
  elsif p_unit_price<=v_peak_high then
    v_factor := 1;
  else
    v_factor := (v_max-p_unit_price)/nullif(v_max-v_peak_high,0);
  end if;

  return round(
    greatest(coalesce(p_unit_price,0),0)
    * greatest(0,least(1,coalesce(v_factor,0)))
    * private.global_event_factor('retail_revenue_factor'),
    6
  );
end
$$;
revoke all on function private.retail_effective_unit_revenue_company(uuid,numeric,numeric,text) from public,anon,authenticated;

do $patch$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='start_retail_sale_on_building_v2_impl'
  limit 1;
  select pg_get_functiondef(v_oid) into v_def;
  v_def := replace(
    v_def,
    'v_effective_unit:=private.retail_effective_unit_revenue(v_inventory.average_unit_cost,p_unit_price,v_product.category);',
    'v_effective_unit:=private.retail_effective_unit_revenue_company(p_company_id,v_inventory.average_unit_cost,p_unit_price,v_product.category);'
  );
  execute v_def;
end
$patch$;

-- A company cannot stack the same specialization in both slots.
create unique index if not exists company_specializations_company_code_unique
  on public.company_specializations(company_id,specialization_code);

create or replace function public.set_company_specialization(
  p_company_id uuid,p_slot_no smallint,p_specialization_code text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_level integer;
  v_existing public.company_specializations%rowtype;
  v_cash numeric;
  v_required integer;
begin
  perform private.assert_company_owner(p_company_id);
  if p_slot_no not in (1,2) then raise exception 'Ungültiger Spezialisierungsplatz'; end if;

  if p_specialization_code in ('trading','contracts') then
    raise exception 'Für diese Spezialisierung ist in der Vorgabe noch kein exakter Bonuswert festgelegt';
  end if;
  if p_specialization_code not in ('production','retail','logistics','research','industry_electronics') then
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
    activated_at=now(),
    switch_available_at=now()+interval '14 days',
    updated_at=now();

  return jsonb_build_object('status','ok','switch_available_at',now()+interval '14 days');
end
$$;
revoke all on function public.set_company_specialization(uuid,smallint,text) from public,anon;
grant execute on function public.set_company_specialization(uuid,smallint,text) to authenticated;
