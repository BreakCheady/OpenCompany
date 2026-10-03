create table if not exists private.building_maintenance_runs (
  run_date date primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table private.building_maintenance_runs enable row level security;

create table if not exists private.building_maintenance_state (
  building_id uuid primary key references public.company_buildings(id) on delete cascade,
  arrears numeric not null default 0 check (arrears >= 0),
  consecutive_missed_days integer not null default 0 check (consecutive_missed_days >= 0),
  suspended boolean not null default false,
  last_charge_date date,
  updated_at timestamptz not null default now()
);

alter table private.building_maintenance_state enable row level security;

create table if not exists private.building_maintenance_ledger (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  building_id uuid not null references public.company_buildings(id) on delete cascade,
  building_type_id uuid not null references public.building_types(id) on delete restrict,
  building_category text not null,
  due_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  arrears_after numeric not null default 0,
  missed_days_after integer not null default 0,
  suspended_after boolean not null default false,
  created_at timestamptz not null default now(),
  unique(run_date, building_id)
);

alter table private.building_maintenance_ledger enable row level security;

create or replace function private.building_maintenance_cost(
  p_category text,
  p_level integer
)
returns numeric
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_level integer := greatest(coalesce(p_level,1),1);
  v_cost numeric;
begin
  v_cost := case p_category
    when 'production' then case v_level
      when 1 then 350 when 2 then 525 when 3 then 750 when 4 then 1050 when 5 then 1450
      else round(1450 * power(1.5::numeric, v_level - 5), 2)
    end
    when 'retail' then case v_level
      when 1 then 250 when 2 then 375 when 3 then 540 when 4 then 760 when 5 then 1050
      else round(1050 * power(1.5::numeric, v_level - 5), 2)
    end
    when 'storage' then case v_level
      when 1 then 180 when 2 then 270 when 3 then 390 when 4 then 550 when 5 then 760
      else round(760 * power(1.5::numeric, v_level - 5), 2)
    end
    when 'research' then case v_level
      when 1 then 500 when 2 then 750 when 3 then 1080 when 4 then 1520 when 5 then 2100
      else round(2100 * power(1.5::numeric, v_level - 5), 2)
    end
    else 0
  end;

  return round(coalesce(v_cost,0),2);
end
$function$;

revoke all on function private.building_maintenance_cost(text,integer)
from public, anon, authenticated;

create or replace function private.run_building_maintenance_if_due()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_local timestamp := now() at time zone 'Europe/Berlin';
  v_today date := v_local::date;
  v_run_date date;
  c record;
  b record;
  s private.building_maintenance_state%rowtype;
  v_cash numeric;
  v_due_today numeric;
  v_total_due numeric;
  v_paid numeric;
  v_remaining numeric;
  v_missed integer;
  v_suspend boolean;
  v_company_paid numeric;
  v_company_arrears numeric;
  v_newly_suspended integer;
  v_reactivated integer;
  v_processed integer := 0;
  v_arrears_text text;
  v_message text;
begin
  if v_local::time < time '02:30' then
    return 0;
  end if;

  insert into private.building_maintenance_runs(run_date)
  values(v_today)
  on conflict(run_date) do nothing
  returning run_date into v_run_date;

  if v_run_date is null then
    return 0;
  end if;

  for c in
    select id
    from public.companies
    where company_type='player'
      and status='active'
      and owner_user_id is not null
    order by id
  loop
    select cash_balance
      into v_cash
    from public.companies
    where id=c.id
    for update;

    v_cash := greatest(coalesce(v_cash,0),0);
    v_company_paid := 0;
    v_company_arrears := 0;
    v_newly_suspended := 0;
    v_reactivated := 0;

    for b in
      select
        cb.id,
        cb.building_type_id,
        cb.level,
        cb.status,
        cb.construction_complete_at,
        bt.name as building_type_name,
        bt.building_category,
        coalesce(ms.suspended,false) as maintenance_suspended
      from public.company_buildings cb
      join public.building_types bt on bt.id=cb.building_type_id
      left join private.building_maintenance_state ms on ms.building_id=cb.id
      where cb.company_id=c.id
        and (
          cb.status='active'
          or coalesce(ms.suspended,false)
        )
        and (
          cb.construction_complete_at is null
          or cb.construction_complete_at <= now()
        )
      order by cb.built_at, cb.id
    loop
      insert into private.building_maintenance_state(
        building_id, last_charge_date
      )
      values(b.id, v_today - 1)
      on conflict(building_id) do nothing;

      select *
        into s
      from private.building_maintenance_state
      where building_id=b.id
      for update;

      if s.last_charge_date is not null and s.last_charge_date >= v_today then
        v_company_arrears := v_company_arrears + coalesce(s.arrears,0);
        continue;
      end if;

      v_due_today := case
        when s.suspended then 0
        else private.building_maintenance_cost(b.building_category,b.level)
      end;

      v_total_due := round(coalesce(s.arrears,0) + v_due_today,2);
      v_paid := least(v_cash, v_total_due);
      v_remaining := greatest(0, round(v_total_due-v_paid,2));

      v_cash := greatest(0, round(v_cash-v_paid,2));
      v_company_paid := v_company_paid + v_paid;

      if v_remaining > 0 then
        v_missed := coalesce(s.consecutive_missed_days,0)+1;
      else
        v_missed := 0;
      end if;

      v_suspend := coalesce(s.suspended,false);

      if not v_suspend and v_remaining > 0 and v_missed >= 3 then
        v_suspend := true;
        update public.company_buildings
        set status='inactive'
        where id=b.id
          and status='active';
        v_newly_suspended := v_newly_suspended+1;
      elsif v_suspend and v_remaining <= 0 then
        v_suspend := false;
        update public.company_buildings
        set status='active'
        where id=b.id
          and status='inactive'
          and (construction_complete_at is null or construction_complete_at <= now());
        v_reactivated := v_reactivated+1;
      end if;

      update private.building_maintenance_state
      set arrears=v_remaining,
          consecutive_missed_days=v_missed,
          suspended=v_suspend,
          last_charge_date=v_today,
          updated_at=now()
      where building_id=b.id;

      insert into private.building_maintenance_ledger(
        run_date, company_id, building_id, building_type_id,
        building_category, due_amount, paid_amount, arrears_after,
        missed_days_after, suspended_after
      )
      values(
        v_today,c.id,b.id,b.building_type_id,
        b.building_category,v_total_due,v_paid,v_remaining,
        v_missed,v_suspend
      )
      on conflict(run_date,building_id) do nothing;

      v_company_arrears := v_company_arrears + v_remaining;
    end loop;

    update public.companies
    set cash_balance=v_cash,
        updated_at=now()
    where id=c.id;

    insert into public.financial_transactions(
      company_id, transaction_type, amount, description, reference_type
    )
    select
      c.id,
      'building_maintenance',
      -sum(l.paid_amount),
      'Gebäudeunterhalt – ' || bt.name || ' (' || count(*)::text || ' Gebäude)',
      'building_maintenance'
    from private.building_maintenance_ledger l
    join public.building_types bt on bt.id=l.building_type_id
    where l.run_date=v_today
      and l.company_id=c.id
      and l.paid_amount>0
    group by bt.id,bt.name
    having sum(l.paid_amount)>0;

    if v_company_arrears > 0 then
      v_arrears_text := replace(
        trim(to_char(round(v_company_arrears,2),'FM999999999999990.00')),
        '.',
        ','
      );

      v_message :=
        'Boss, wir konnten den heutigen Gebäudeunterhalt nicht vollständig bezahlen. '
        || 'Es bestehen ' || v_arrears_text || ' OC$ offene Unterhaltskosten.';

      if v_newly_suspended > 0 then
        v_message := v_message || ' '
          || v_newly_suspended::text
          || case when v_newly_suspended=1
               then ' Gebäude wurde nach drei aufeinanderfolgenden Zahlungsausfällen deaktiviert.'
               else ' Gebäude wurden nach drei aufeinanderfolgenden Zahlungsausfällen deaktiviert.'
             end;
      else
        v_message := v_message
          || ' Bitte prüfe die Liquidität deines Unternehmens.';
      end if;

      insert into public.chat_messages(
        sender_company_id, recipient_company_id, body
      )
      values(
        '00000000-0000-4000-8000-000000000001'::uuid,
        c.id,
        v_message
      );
    elsif v_reactivated > 0 then
      insert into public.chat_messages(
        sender_company_id, recipient_company_id, body
      )
      values(
        '00000000-0000-4000-8000-000000000001'::uuid,
        c.id,
        'Boss, die offenen Gebäudeunterhaltskosten wurden vollständig beglichen. '
        || v_reactivated::text
        || case when v_reactivated=1
             then ' Gebäude wurde wieder aktiviert.'
             else ' Gebäude wurden wieder aktiviert.'
           end
      );
    end if;

    v_processed := v_processed+1;
  end loop;

  update private.building_maintenance_runs
  set completed_at=now()
  where run_date=v_today;

  return v_processed;
exception
  when others then
    delete from private.building_maintenance_runs
    where run_date=v_today
      and completed_at is null;
    raise;
end
$function$;

revoke all on function private.run_building_maintenance_if_due()
from public, anon, authenticated;

insert into private.building_maintenance_runs(run_date,started_at,completed_at)
values(
  (now() at time zone 'Europe/Berlin')::date,
  now(),
  now()
)
on conflict(run_date) do nothing;

select cron.schedule(
  'opencompany-building-maintenance',
  '*/30 * * * *',
  'select private.run_building_maintenance_if_due();'
)
where not exists (
  select 1 from cron.job where jobname='opencompany-building-maintenance'
);
