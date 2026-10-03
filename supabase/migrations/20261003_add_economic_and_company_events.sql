
create table if not exists public.global_economic_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  name text not null,
  description text not null,
  effects jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','ended')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  ended_at timestamptz
);
alter table public.global_economic_events enable row level security;
drop policy if exists global_economic_events_read on public.global_economic_events;
create policy global_economic_events_read on public.global_economic_events
for select to authenticated using (true);
grant select on public.global_economic_events to authenticated;

create table if not exists private.global_event_state (
  id smallint primary key default 1 check (id=1),
  next_check_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table private.global_event_state enable row level security;

insert into private.global_event_state(id,next_check_at)
values(1,now()+interval '5 days'+random()*interval '5 days')
on conflict(id) do nothing;

create table if not exists public.company_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text not null,
  option_a_label text not null,
  option_b_label text not null,
  status text not null default 'pending' check (status in ('pending','resolved','expired')),
  selected_option text check (selected_option is null or selected_option in ('a','b')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '48 hours'),
  resolved_at timestamptz
);
alter table public.company_events enable row level security;
drop policy if exists company_events_read_own on public.company_events;
create policy company_events_read_own on public.company_events
for select to authenticated using (
  exists (
    select 1 from public.companies c
    where c.id=company_events.company_id
      and c.owner_user_id=(select auth.uid())
  )
);
grant select on public.company_events to authenticated;

create table if not exists private.company_event_state (
  company_id uuid primary key references public.companies(id) on delete cascade,
  next_check_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table private.company_event_state enable row level security;

create or replace function private.global_event_factor(p_key text)
returns numeric
language sql
stable
set search_path to ''
as $function$
  select coalesce(
    exp(sum(ln(greatest(0.01,coalesce((effects->>p_key)::numeric,1))))),
    1
  )
  from public.global_economic_events
  where status='active' and ends_at>now()
$function$;

revoke all on function private.global_event_factor(text) from public,anon,authenticated;

create or replace function private.economy_production_output_factor()
returns numeric
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (select production_output_factor from public.game_economy_state where id=1),
    1
  ) * private.global_event_factor('production_output_factor')
$function$;

revoke all on function private.economy_production_output_factor() from public,anon,authenticated;

create or replace function private.operating_cost_rate(
  p_building_code text,
  p_building_category text
)
returns numeric
language sql
stable
set search_path to ''
as $function$
  select (
    case
      when p_building_category='retail' then 0.03
      when p_building_category='research' then 0.08
      when p_building_code='food_factory' then 0.06
      when p_building_code='textile_factory' then 0.06
      when p_building_code='construction_factory' then 0.07
      when p_building_code='machinery_factory' then 0.07
      when p_building_code='auto_factory' then 0.09
      when p_building_code='electronics_factory' then 0.09
      when p_building_code='chemical_factory' then 0.10
      when p_building_code='energy_factory' then 0.12
      when p_building_category='production' then 0.07
      else 0
    end
  )::numeric * private.global_event_factor('operating_cost_factor')
$function$;

revoke all on function private.operating_cost_rate(text,text) from public,anon,authenticated;

create or replace function private.retail_effective_unit_revenue(
  p_unit_cost numeric,
  p_unit_price numeric
)
returns numeric
language sql
stable
set search_path to ''
as $function$
  select round(
    greatest(coalesce(p_unit_price,0),0)
    * private.retail_profit_factor(p_unit_cost,p_unit_price)
    * private.global_event_factor('retail_revenue_factor'),
    6
  )
$function$;

create or replace function private.run_global_events_if_due()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_state private.global_event_state%rowtype;
  v_active integer;
  v_roll numeric;
  v_pick integer;
  v_type text;
  v_name text;
  v_desc text;
  v_effects jsonb;
  v_days integer;
  v_id uuid;
  r record;
  v_ended integer:=0;
begin
  for r in
    update public.global_economic_events
    set status='ended',ended_at=now()
    where status='active' and ends_at<=now()
    returning name
  loop
    v_ended:=v_ended+1;
    insert into public.chat_messages(sender_company_id,recipient_company_id,body)
    select
      '00000000-0000-4000-8000-000000000001'::uuid,
      c.id,
      'Boss, das globale Wirtschaftsereignis „'||r.name||'“ ist beendet.'
    from public.companies c
    where c.company_type='player'
      and c.status='active'
      and c.owner_user_id is not null;
  end loop;

  select * into v_state
  from private.global_event_state
  where id=1
  for update;

  if v_state.next_check_at>now() then return v_ended; end if;

  select count(*) into v_active
  from public.global_economic_events
  where status='active' and ends_at>now();

  v_roll:=random();

  if v_active<2 and v_roll<0.65 then
    v_pick:=floor(random()*6)::integer;

    if v_pick=0 then
      v_type:='energy_crisis';
      v_name:='Energiekrise';
      v_desc:='Hohe Energiepreise verteuern Energie- und Betriebskosten.';
      v_effects:='{"operating_cost_factor":1.25}'::jsonb;
    elsif v_pick=1 then
      v_type:='cheap_energy';
      v_name:='Günstige Energie';
      v_desc:='Entspannte Energiemärkte senken Energie- und Betriebskosten.';
      v_effects:='{"operating_cost_factor":0.85}'::jsonb;
    elsif v_pick=2 then
      v_type:='consumer_boom';
      v_name:='Konsumboom';
      v_desc:='Die Konsumnachfrage ist außergewöhnlich stark.';
      v_effects:='{"retail_revenue_factor":1.15}'::jsonb;
    elsif v_pick=3 then
      v_type:='consumer_slump';
      v_name:='Konsumflaute';
      v_desc:='Die Konsumnachfrage ist vorübergehend schwächer.';
      v_effects:='{"retail_revenue_factor":0.90}'::jsonb;
    elsif v_pick=4 then
      v_type:='productivity_wave';
      v_name:='Produktivitätsschub';
      v_desc:='Verbesserte Abläufe steigern die Produktionsmenge.';
      v_effects:='{"production_output_factor":1.10}'::jsonb;
    else
      v_type:='supply_disruption';
      v_name:='Lieferkettenstörung';
      v_desc:='Störungen in Lieferketten reduzieren die Produktionsleistung.';
      v_effects:='{"production_output_factor":0.90}'::jsonb;
    end if;

    if not exists (
      select 1
      from public.global_economic_events
      where status='active'
        and event_type=v_type
        and ends_at>now()
    ) then
      v_days:=2+floor(random()*6)::integer;

      insert into public.global_economic_events(
        event_type,name,description,effects,ends_at
      )
      values(
        v_type,v_name,v_desc,v_effects,
        now()+make_interval(days=>v_days)
      )
      returning id into v_id;

      insert into public.chat_messages(sender_company_id,recipient_company_id,body)
      select
        '00000000-0000-4000-8000-000000000001'::uuid,
        c.id,
        'Boss, ein neues globales Wirtschaftsereignis ist gestartet: „'
        ||v_name||'“. '||v_desc||
        ' Voraussichtliche Dauer: '||v_days||' Tage.'
      from public.companies c
      where c.company_type='player'
        and c.status='active'
        and c.owner_user_id is not null;
    end if;
  end if;

  update private.global_event_state
  set next_check_at=now()+interval '5 days'+random()*interval '5 days',
      updated_at=now()
  where id=1;

  return v_ended+case when v_id is null then 0 else 1 end;
end
$function$;

revoke all on function private.run_global_events_if_due() from public,anon,authenticated;

create or replace function private.run_company_events_if_due()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c record;
  v_state private.company_event_state%rowtype;
  v_pick integer;
  v_created integer:=0;
  v_title text;
  v_desc text;
  v_a text;
  v_b text;
  v_type text;
begin
  update public.company_events
  set status='expired'
  where status='pending' and expires_at<=now();

  for c in
    select id
    from public.companies
    where company_type='player'
      and status='active'
      and owner_user_id is not null
  loop
    insert into private.company_event_state(company_id,next_check_at)
    values(c.id,now()+interval '5 days'+random()*interval '5 days')
    on conflict(company_id) do nothing;

    select * into v_state
    from private.company_event_state
    where company_id=c.id
    for update;

    if v_state.next_check_at>now() then continue; end if;

    if random()<0.60 and not exists(
      select 1
      from public.company_events
      where company_id=c.id
        and status='pending'
        and expires_at>now()
    ) then
      v_pick:=floor(random()*4)::integer;

      if v_pick=0 then
        v_type:='machine_issue';
        v_title:='Maschinenstörung';
        v_desc:='In einer Anlage wurde eine technische Störung festgestellt.';
        v_a:='Sofort reparieren · 1.500 OC$';
        v_b:='Provisorisch weiterarbeiten · −2 Reputation';
      elsif v_pick=1 then
        v_type:='employee_idea';
        v_title:='Verbesserungsvorschlag';
        v_desc:='Ein Team schlägt eine interne Prozessverbesserung vor.';
        v_a:='Projekt finanzieren · 1.000 OC$ / +2 Reputation';
        v_b:='Vorerst ablehnen';
      elsif v_pick=2 then
        v_type:='large_customer';
        v_title:='Großkundenchance';
        v_desc:='Ein Großkunde bietet eine kurzfristige Kooperation an.';
        v_a:='Annehmen · +2.000 OC$ / +1 Reputation';
        v_b:='Ablehnen';
      else
        v_type:='compliance_check';
        v_title:='Betriebsprüfung';
        v_desc:='Eine betriebliche Prüfung verlangt kurzfristige Maßnahmen.';
        v_a:='Maßnahmen sofort umsetzen · 750 OC$';
        v_b:='Verschieben · −1 Reputation';
      end if;

      insert into public.company_events(
        company_id,event_type,title,description,
        option_a_label,option_b_label
      )
      values(c.id,v_type,v_title,v_desc,v_a,v_b);

      insert into public.chat_messages(
        sender_company_id,recipient_company_id,body
      )
      values(
        '00000000-0000-4000-8000-000000000001'::uuid,
        c.id,
        'Boss, es gibt ein neues Unternehmensereignis: „'
        ||v_title||
        '“. Bitte entscheide innerhalb von 48 Stunden.'
      );

      v_created:=v_created+1;
    end if;

    update private.company_event_state
    set next_check_at=now()+interval '5 days'+random()*interval '5 days',
        updated_at=now()
    where company_id=c.id;
  end loop;

  return v_created;
end
$function$;

revoke all on function private.run_company_events_if_due() from public,anon,authenticated;

create or replace function private.resolve_company_event_impl(
  p_event_id uuid,
  p_option text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v public.company_events%rowtype;
  v_cash numeric;
  v_cash_delta numeric:=0;
  v_rep_delta numeric:=0;
begin
  if p_option not in ('a','b') then raise exception 'Ungültige Auswahl'; end if;

  select e.* into v
  from public.company_events e
  join public.companies c on c.id=e.company_id
  where e.id=p_event_id
    and c.owner_user_id=(select auth.uid())
  for update of e;

  if v.id is null then raise exception 'Ereignis nicht gefunden'; end if;
  if v.status<>'pending' or v.expires_at<=now() then
    raise exception 'Ereignis ist nicht mehr aktiv';
  end if;

  select cash_balance into v_cash
  from public.companies
  where id=v.company_id
  for update;

  if v.event_type='machine_issue' then
    if p_option='a' then v_cash_delta:=-1500; else v_rep_delta:=-2; end if;
  elsif v.event_type='employee_idea' then
    if p_option='a' then v_cash_delta:=-1000; v_rep_delta:=2; end if;
  elsif v.event_type='large_customer' then
    if p_option='a' then v_cash_delta:=2000; v_rep_delta:=1; end if;
  elsif v.event_type='compliance_check' then
    if p_option='a' then v_cash_delta:=-750; else v_rep_delta:=-1; end if;
  end if;

  if v_cash_delta<0 and v_cash<abs(v_cash_delta) then
    raise exception 'Nicht genügend Guthaben für diese Entscheidung';
  end if;

  update public.companies
  set cash_balance=cash_balance+v_cash_delta,
      brand_reputation=greatest(0,least(100,brand_reputation+v_rep_delta)),
      updated_at=now()
  where id=v.company_id;

  if v_cash_delta<>0 then
    insert into public.financial_transactions(
      company_id,transaction_type,amount,description,
      reference_type,reference_id
    )
    values(
      v.company_id,
      'company_event',
      v_cash_delta,
      'Unternehmensereignis: '||v.title,
      'company_event',
      v.id
    );
  end if;

  update public.company_events
  set status='resolved',
      selected_option=p_option,
      resolved_at=now()
  where id=v.id;

  return jsonb_build_object(
    'cash_delta',v_cash_delta,
    'reputation_delta',v_rep_delta,
    'status','resolved'
  );
end
$function$;

revoke all on function private.resolve_company_event_impl(uuid,text) from public,anon;
grant execute on function private.resolve_company_event_impl(uuid,text) to authenticated;

create or replace function public.resolve_company_event(
  p_event_id uuid,
  p_option text
)
returns jsonb
language sql
security invoker
set search_path to ''
as $function$
  select private.resolve_company_event_impl(p_event_id,p_option)
$function$;

revoke all on function public.resolve_company_event(uuid,text) from public,anon;
grant execute on function public.resolve_company_event(uuid,text) to authenticated;

select cron.schedule(
  'opencompany-global-events',
  '0 * * * *',
  'select private.run_global_events_if_due();'
)
where not exists (
  select 1 from cron.job where jobname='opencompany-global-events'
);

select cron.schedule(
  'opencompany-company-events',
  '0 * * * *',
  'select private.run_company_events_if_due();'
)
where not exists (
  select 1 from cron.job where jobname='opencompany-company-events'
);
