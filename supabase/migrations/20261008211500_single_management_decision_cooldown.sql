-- Only one active management decision per company. Resolutions open a 12–24h pause.
create table if not exists private.management_decision_pacing (
 company_id uuid primary key references public.companies(id) on delete cascade,
 next_decision_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists private.management_decision_parked (
 decision_id uuid primary key references public.management_decisions(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 remaining_hours numeric not null default 24,
 parked_at timestamptz not null default now()
);
create index if not exists management_parked_company_idx on private.management_decision_parked(company_id,parked_at);

create or replace function private.management_pacing_after_resolution()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if old.status <> 'resolved' and new.status='resolved' then
   insert into private.management_decision_pacing(company_id,next_decision_at,updated_at)
   values(new.company_id,now()+((12+random()*12)*interval '1 hour'),now())
   on conflict(company_id) do update
   set next_decision_at=greatest(private.management_decision_pacing.next_decision_at,excluded.next_decision_at),
       updated_at=now();
 end if;
 return new;
end $$;
drop trigger if exists trg_management_pacing_resolution on public.management_decisions;
create trigger trg_management_pacing_resolution after update of status on public.management_decisions
for each row execute function private.management_pacing_after_resolution();

-- Park already-open excess decisions without choosing options or changing economic effects.
with ranked as (
 select id,company_id,expires_at,row_number() over(partition by company_id order by created_at,id) as position
 from public.management_decisions where status='open'
), parked as (
 insert into private.management_decision_parked(decision_id,company_id,remaining_hours)
 select id,company_id,least(24,greatest(1,extract(epoch from (coalesce(expires_at,now()+interval '24 hours')-now()))/3600))
 from ranked where position>1
 on conflict(decision_id) do nothing returning decision_id
)
update public.management_decisions set status='snoozed',snoozed_until=null,expires_at=null
where id in(select decision_id from parked);

-- Enforce the invariant even for calls that bypass the scheduler.
create or replace function private.guard_management_decision_creation()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_until timestamptz;
begin
 if new.status<>'open' then return new; end if;
 perform pg_advisory_xact_lock(hashtext('management-decision'),hashtext(new.company_id::text));
 select next_decision_at into v_until from private.management_decision_pacing where company_id=new.company_id;
 if v_until is not null and v_until>now() then
   raise exception 'Managemententscheidung: Abklingzeit bis %',v_until;
 end if;
 if exists(select 1 from public.management_decisions where company_id=new.company_id and status='open' and id<>new.id) then
   raise exception 'Pro Unternehmen ist maximal eine offene Managemententscheidung erlaubt';
 end if;
 return new;
end $$;
drop trigger if exists trg_guard_management_decision_creation on public.management_decisions;
create trigger trg_guard_management_decision_creation
before insert or update of status on public.management_decisions
for each row execute function private.guard_management_decision_creation();

-- Replaces the previous two-slot scheduler; queued follow-ups retain their priority.
create or replace function private.refresh_management_decisions(p_company_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare
 v_metrics jsonb;
 t private.management_decision_templates%rowtype;
 f private.management_decision_followups%rowtype;
 v_parked private.management_decision_parked%rowtype;
 v_id uuid;
begin
 perform pg_advisory_xact_lock(hashtext('management-decision'),hashtext(p_company_id::text));
 insert into public.management_profiles(company_id) values(p_company_id) on conflict(company_id) do nothing;
 perform private.expire_management_decisions(p_company_id);
 if exists(select 1 from public.management_decisions where company_id=p_company_id and status='open') then return; end if;
 if exists(select 1 from private.management_decision_pacing where company_id=p_company_id and next_decision_at>now()) then return; end if;

 select * into v_parked from private.management_decision_parked
 where company_id=p_company_id order by parked_at,decision_id limit 1 for update skip locked;
 if v_parked.decision_id is not null then
   -- Remove the parking row before reactivation; any failure rolls back both.
   update public.management_decisions
   set status='open',expires_at=now()+(v_parked.remaining_hours*interval '1 hour'),snoozed_until=null
   where id=v_parked.decision_id and company_id=p_company_id and status='snoozed';
   delete from private.management_decision_parked where decision_id=v_parked.decision_id;
   return;
 end if;

 for f in select * from private.management_decision_followups
   where company_id=p_company_id and status='pending' and due_at<=now()
   order by due_at for update skip locked
 loop
   v_id:=private.create_management_decision(p_company_id,f.template_key,f.parent_decision_id);
   if v_id is not null then
     update private.management_decision_followups set status='created' where id=f.id;
     return;
   end if;
 end loop;

 v_metrics:=private.management_decision_metrics(p_company_id);
 select x.* into t
 from private.management_decision_templates x
 where x.enabled=true and x.trigger_enabled=true
   and private.management_conditions_match(v_metrics,x.conditions)
   and not exists (
     select 1 from public.management_decisions d
     where d.company_id=p_company_id and d.template_key=x.template_key
       and d.created_at>now()-(x.cooldown_hours*interval '1 hour')
   )
 order by (-ln(greatest(random(),0.000001))/greatest(x.weight,0.01)) limit 1;
 if t.template_key is not null then
   perform private.create_management_decision(p_company_id,t.template_key,null);
 end if;
end $$;
