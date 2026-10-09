-- Daily manager payroll at 05:00 Europe/Berlin, unpaid wage carryover, and severance.
create table if not exists private.management_payroll_balance(
 company_id uuid primary key references public.companies(id) on delete cascade,
 salary_arrears numeric(18,2) not null default 0 check(salary_arrears>=0),
 severance_arrears numeric(18,2) not null default 0 check(severance_arrears>=0),
 updated_at timestamptz not null default now()
);
create table if not exists private.management_daily_payroll_runs(
 company_id uuid not null references public.companies(id) on delete cascade,
 payroll_date date not null,
 gross_due numeric(18,2) not null,
 paid_salary numeric(18,2) not null,
 salary_arrears_remaining numeric(18,2) not null,
 processed_at timestamptz not null default now(),
 primary key(company_id,payroll_date)
);
-- Only days after migration are billed; prevents double billing a previously charged weekly period at rollout.
create table if not exists private.management_daily_payroll_settings(
 id boolean primary key default true check(id),
 first_payroll_date date not null
);
insert into private.management_daily_payroll_settings(id,first_payroll_date)
values(true,(now() at time zone 'Europe/Berlin')::date + 1)
on conflict(id) do nothing;

-- Disable old weekly deduction while retaining function compatibility with existing cycle code.
create or replace function private.run_management_weekly_salary(p_company_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 return;
end $$;

create or replace function private.management_pay_available(
 p_company_id uuid,p_requested numeric,p_type text,p_description text
)
returns numeric language plpgsql security definer set search_path='' as $$
declare v_cash numeric; v_paid numeric;
begin
 if p_requested<=0 then return 0; end if;
 select cash_balance into v_cash from public.companies where id=p_company_id for update;
 if not found then raise exception 'Company not found'; end if;
 v_paid:=least(round(p_requested,2),greatest(0,coalesce(v_cash,0)));
 if v_paid>0 then
  update public.companies set cash_balance=cash_balance-v_paid,updated_at=now() where id=p_company_id;
  insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,cost_center)
  values(p_company_id,p_type,-v_paid,p_description,'management','management');
 end if;
 return v_paid;
end $$;

create or replace function private.run_management_daily_payroll()
returns integer language plpgsql security definer set search_path='' as $$
declare
 c record; v_date date:=(now() at time zone 'Europe/Berlin')::date;
 v_start date; v_hour int:=extract(hour from (now() at time zone 'Europe/Berlin'));
 v_gross numeric; v_due numeric; v_paid numeric; v_rate numeric;
 v_salary_arrears numeric; v_severance_arrears numeric; v_sep_paid numeric;
 v_count int:=0;
begin
 if v_hour<5 then return 0; end if;
 select first_payroll_date into v_start from private.management_daily_payroll_settings where id=true;
 if v_start is null or v_date<v_start then return 0; end if;
 for c in select id from public.companies where company_type='player' and status='active' and owner_user_id is not null order by id loop
   perform pg_advisory_xact_lock(hashtext('daily-manager-payroll'),hashtext(c.id::text));
   if exists(select 1 from private.management_daily_payroll_runs where company_id=c.id and payroll_date=v_date) then continue; end if;
   insert into private.management_payroll_balance(company_id) values(c.id) on conflict do nothing;
   select salary_arrears,severance_arrears into v_salary_arrears,v_severance_arrears
   from private.management_payroll_balance where company_id=c.id for update;
   select coalesce(sum(weekly_salary/7),0) into v_gross
   from public.company_managers where company_id=c.id and status in ('active','training');
   v_rate:=private.manager_effect(c.id,'finance','personnel');
   v_due:=round(greatest(0,v_gross*(1-v_rate)),2);
   v_paid:=private.management_pay_available(c.id,v_due+v_salary_arrears,'manager_salary','Tägliche Managergehälter inkl. Rückstände');
   v_salary_arrears:=round(v_due+v_salary_arrears-v_paid,2);
   v_sep_paid:=private.management_pay_available(c.id,v_severance_arrears,'manager_severance','Offene Manager-Abfindungen');
   v_severance_arrears:=round(v_severance_arrears-v_sep_paid,2);
   update private.management_payroll_balance
   set salary_arrears=v_salary_arrears,severance_arrears=v_severance_arrears,updated_at=now()
   where company_id=c.id;
   insert into private.management_daily_payroll_runs(company_id,payroll_date,gross_due,paid_salary,salary_arrears_remaining)
   values(c.id,v_date,v_due,v_paid,v_salary_arrears);
   if v_salary_arrears>0 then
     perform private.management_send_pa(c.id,'Boss, die heutigen Managergehälter konnten nicht vollständig bezahlt werden. Offene Gehälter: '||to_char(v_salary_arrears,'FM999999999990.00')||' €. Der Betrag wird zur nächsten Tagesabrechnung addiert.');
   end if;
   v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

create or replace function public.dismiss_company_manager(p_company_id uuid,p_manager_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.company_managers%rowtype; v_fee numeric; v_paid numeric; v_remaining numeric;
begin
 perform private.assert_company_owner(p_company_id);
 select * into m from public.company_managers
 where id=p_manager_id and company_id=p_company_id and status in ('active','training') for update;
 if m.id is null then raise exception 'Manager nicht gefunden oder bereits ausgeschieden'; end if;
 v_fee:=round(m.weekly_salary/7*3,2);
 update public.company_managers set status='retired',retired_at=now(),training_ends_at=null,updated_at=now() where id=m.id;
 insert into private.management_payroll_balance(company_id) values(p_company_id) on conflict do nothing;
 update private.management_payroll_balance
 set severance_arrears=severance_arrears+v_fee,updated_at=now() where company_id=p_company_id;
 -- Settle as much severance as company cash permits; unpaid remainder remains legally due.
 v_paid:=private.management_pay_available(p_company_id,v_fee,'manager_severance','Abfindung: '||m.manager_name);
 v_remaining:=v_fee-v_paid;
 update private.management_payroll_balance set severance_arrears=severance_arrears-v_paid,updated_at=now()
 where company_id=p_company_id;
 return jsonb_build_object('manager',m.manager_name,'severance_due',v_fee,'paid',v_paid,'unpaid',v_remaining);
end $$;
revoke all on function public.dismiss_company_manager(uuid,uuid) from public,anon;
grant execute on function public.dismiss_company_manager(uuid,uuid) to authenticated;

-- Frequent checks do not charge repeatedly: one unique row per company and Berlin calendar day.
select cron.schedule('opencompany-daily-manager-payroll','*/5 * * * *',
 'select private.run_management_daily_payroll();')
where not exists(select 1 from cron.job where jobname='opencompany-daily-manager-payroll');
