-- OpenCompany: one PA reminder at 3h and 1h before an open management decision expires.
-- Idempotent across repeated cron runs, with no reminders for completed or expired decisions.
create table if not exists private.management_decision_deadline_reminders (
  decision_id uuid not null references public.management_decisions(id) on delete cascade,
  reminder_hours integer not null check (reminder_hours in (1,3)),
  sent_at timestamptz not null default now(),
  primary key (decision_id,reminder_hours)
);
revoke all on private.management_decision_deadline_reminders from public,anon,authenticated;

create or replace function private.send_management_decision_deadline_reminders()
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_decision record;
  v_threshold integer;
  v_inserted integer;
  v_sent integer:=0;
begin
  for v_decision in
    select d.id,d.company_id,d.title,d.expires_at
    from public.management_decisions d
    join public.companies c on c.id=d.company_id
    where d.status='open'
      and d.expires_at>now()
      and d.expires_at<=now()+interval '3 hours'
      and c.company_type='player'
      and c.owner_user_id is not null
    order by d.expires_at,d.id
    for update of d skip locked
  loop
    -- If a job resumes late, send only the most urgent reminder, not two at once.
    v_threshold:=case
      when v_decision.expires_at<=now()+interval '1 hour' then 1
      else 3
    end;

    insert into private.management_decision_deadline_reminders(decision_id,reminder_hours)
    values(v_decision.id,v_threshold)
    on conflict do nothing;
    get diagnostics v_inserted = row_count;

    if v_inserted>0 then
      perform private.management_send_pa(
        v_decision.company_id,
        'Boss, Erinnerung: Für die Managemententscheidung „'||v_decision.title
        ||'“ verbleiben nur noch '||v_threshold
        ||case when v_threshold=1 then ' Stunde' else ' Stunden' end
        ||' bis zum Ablauf. Bitte entscheide rechtzeitig im Managementbereich.'
      );
      v_sent:=v_sent+1;
    end if;
  end loop;
  return v_sent;
end
$function$;

revoke all on function private.send_management_decision_deadline_reminders() from public,anon,authenticated;

-- Five-minute sweep: expected alert arrives within five minutes after crossing a threshold.
select cron.schedule(
  'opencompany-management-deadline-reminders',
  '*/5 * * * *',
  'select private.send_management_decision_deadline_reminders();'
)
where not exists (
  select 1 from cron.job where jobname='opencompany-management-deadline-reminders'
);
