-- Customer incidents, daily satisfaction cap and big-order reputation.
create table if not exists public.customer_complaints(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 sale_job_id uuid not null references public.retail_sale_jobs(id) on delete cascade,
 product_id uuid not null references public.products(id),
 quality_level integer not null,
 quantity numeric not null,
 status text not null default 'open' check(status in ('open','refunded','replaced','rejected','ignored')),
 opened_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '48 hours'),
 resolved_at timestamptz,
 unique(sale_job_id)
);
alter table public.customer_complaints enable row level security;
revoke all on public.customer_complaints from anon,authenticated;

create table if not exists private.customer_daily_gains(
 company_id uuid not null references public.companies(id) on delete cascade,
 local_day date not null,
 gained numeric not null default 0,
 primary key(company_id,local_day)
);

create or replace function private.adjust_customer_relations(p_company_id uuid,p_satisfaction numeric,p_loyalty numeric)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.company_customer_relations(company_id,satisfaction,loyalty)
 values(p_company_id,greatest(0,least(100,50+p_satisfaction)),greatest(0,least(100,40+p_loyalty)))
 on conflict(company_id) do update
 set satisfaction=greatest(0,least(100,public.company_customer_relations.satisfaction+p_satisfaction)),
     loyalty=greatest(0,least(100,public.company_customer_relations.loyalty+p_loyalty)),updated_at=now();
end $$;

create or replace function private.process_customer_sale(p_company_id uuid,p_job_id uuid,p_claimable numeric)
returns void language plpgsql security definer set search_path='' as $$
declare j public.retail_sale_jobs%rowtype;
v_bonus numeric;v_prior numeric;v_apply numeric;v_chance numeric;
begin
 select * into j from public.retail_sale_jobs where id=p_job_id;
 if j.id is null or j.company_id<>p_company_id or p_claimable<=0 then return; end if;
 v_bonus:= (0.2+case when j.quality_level>=5 then 0.5 when j.quality_level=4 then 0.3 else 0 end)*least(1,p_claimable/greatest(1,j.quantity));
 insert into private.customer_daily_gains(company_id,local_day,gained)
 values(p_company_id,(now() at time zone 'Europe/Berlin')::date,0)
 on conflict do nothing;
 select gained into v_prior from private.customer_daily_gains
 where company_id=p_company_id and local_day=(now() at time zone 'Europe/Berlin')::date for update;
 v_apply:=greatest(0,least(v_bonus,2-v_prior));
 if v_apply>0 then
  update private.customer_daily_gains set gained=gained+v_apply
  where company_id=p_company_id and local_day=(now() at time zone 'Europe/Berlin')::date;
  perform private.adjust_customer_relations(p_company_id,v_apply,0.1*least(1,p_claimable/greatest(1,j.quantity)));
 end if;
 -- Only first claim per sale can open a complaint; maximum two in a rolling week.
 if coalesce(j.claimed_quantity,0)=0 then
  v_chance:=case when j.quality_level<=1 then 0.12 when j.quality_level=2 then 0.09
                 when j.quality_level=3 then 0.06 when j.quality_level=4 then 0.03 else 0.01 end;
  if random()<v_chance and
      (select count(*) from public.customer_complaints where company_id=p_company_id
       and opened_at>=now()-interval '7 days')<2 then
    insert into public.customer_complaints(company_id,sale_job_id,product_id,quality_level,quantity)
    values(p_company_id,p_job_id,j.product_id,j.quality_level,least(250,j.quantity))
    on conflict(sale_job_id) do nothing;
  end if;
 end if;
end $$;

create or replace function public.resolve_customer_complaint(p_company_id uuid,p_complaint_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.customer_complaints%rowtype;j public.retail_sale_jobs%rowtype;
v_cash numeric;v_cost numeric;v_inv public.inventories%rowtype;
begin
 perform private.assert_company_owner(p_company_id);
 if p_action not in ('refund','replacement','reject') then raise exception 'Ungültige Reklamationsentscheidung'; end if;
 select * into c from public.customer_complaints where id=p_complaint_id and company_id=p_company_id for update;
 if c.id is null or c.status<>'open' then raise exception 'Reklamation nicht mehr offen'; end if;
 if c.expires_at<now() then raise exception 'Antwortfrist abgelaufen'; end if;
 select * into j from public.retail_sale_jobs where id=c.sale_job_id;
 if p_action='refund' then
   v_cost:=round(c.quantity*j.total_value/nullif(j.quantity,0),2);
   select cash_balance into v_cash from public.companies where id=p_company_id for update;
   if coalesce(v_cash,0)<v_cost then raise exception 'Nicht genügend Guthaben für Erstattung'; end if;
   update public.companies set cash_balance=cash_balance-v_cost,updated_at=now() where id=p_company_id;
   insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id)
   values(p_company_id,'operating_cost',-v_cost,'Kundenerstattung','retail_sale_job',j.id);
   perform private.adjust_customer_relations(p_company_id,1.5,0.3);
 elsif p_action='replacement' then
   select * into v_inv from public.inventories
   where company_id=p_company_id and product_id=c.product_id and quality_level>=c.quality_level and quantity>=c.quantity
   order by quality_level,id limit 1 for update;
   if v_inv.id is null then raise exception 'Nicht genügend geeigneter Lagerbestand für Ersatzlieferung'; end if;
   update public.inventories set quantity=quantity-c.quantity where id=v_inv.id;
   perform private.adjust_customer_relations(p_company_id,2,0.5);
 else
   perform private.adjust_customer_relations(p_company_id,-2,-0.5);
 end if;
 update public.customer_complaints set status=case p_action when 'refund' then 'refunded' when 'replacement' then 'replaced' else 'rejected' end,
 resolved_at=now() where id=c.id;
 return jsonb_build_object('action',p_action,'cost',coalesce(v_cost,0));
end $$;
revoke all on function public.resolve_customer_complaint(uuid,uuid,text) from public,anon;
grant execute on function public.resolve_customer_complaint(uuid,uuid,text) to authenticated;

create or replace function private.tick_customer_relations()
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.company_customer_relations r
 set satisfaction=case when satisfaction>50 then greatest(50,satisfaction-0.1)
                       when satisfaction<50 then least(50,satisfaction+0.1) else 50 end,
 loyalty=case when loyalty>40 then greatest(40,loyalty-0.1)
              when loyalty<40 then least(40,loyalty+0.1) else 40 end,
 updated_at=now()
 where updated_at<now()-interval '24 hours';
 update public.customer_complaints set status='ignored',resolved_at=now()
 where status='open' and expires_at<=now();
 -- Complaint penalty is applied exactly once on transition.
 -- The cron is idempotent as ignored complaints are excluded next time.
end $$;
-- Use an hourly job for timely expirations; daily drift is guarded by updated_at.
select cron.schedule('opencompany-customer-relations-hourly','15 * * * *','select private.tick_customer_relations();');

-- Apply customer effect only to claimable deliveries, and attach complaint generation.
do $patch$
declare f text;v_begin integer;v_end integer;
begin
 select pg_get_functiondef('private.claim_retail_revenue_impl(uuid,uuid)'::regprocedure) into f;
 v_begin:=position('  insert into public.company_customer_relations(' in f);
 v_end:=position('  return v_amount;' in f);
 if v_begin=0 or v_end<=v_begin then raise exception 'Unexpected retail claim function'; end if;
 f:=substring(f from 1 for v_begin-1)
    ||'  perform private.process_customer_sale(p_company_id,p_job_id,v_claimable);'||chr(10)
    ||substring(f from v_end);
 -- Read the previous claimed quantity before update for a one-time complaint check.
 f:=replace(f,'  update public.retail_sale_jobs'||chr(10)||'  set claimed_quantity',
   '  perform private.process_customer_sale(p_company_id,p_job_id,v_claimable);'||chr(10)||
   '  update public.retail_sale_jobs'||chr(10)||'  set claimed_quantity');
 f:=replace(f,'  perform private.process_customer_sale(p_company_id,p_job_id,v_claimable);'||chr(10)||'  return v_amount;',
   '  return v_amount;');
 execute f;
end $patch$;

-- Re-expose data in one existing authenticated RPC.
create or replace function public.get_company_management_health(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rel public.company_customer_relations%rowtype;
begin
 perform private.assert_company_owner(p_company_id);
 select * into v_rel from public.company_customer_relations where company_id=p_company_id;
 return jsonb_build_object(
 'satisfaction',coalesce(v_rel.satisfaction,50),'loyalty',coalesce(v_rel.loyalty,40),
 'machines',coalesce((select jsonb_agg(jsonb_build_object('building_id',b.id,'condition',coalesce(m.condition_points,100)) order by b.id)
 from public.company_buildings b left join public.production_machine_health m on m.building_id=b.id
 where b.company_id=p_company_id and b.status='active'),'[]'::jsonb),
 'complaints',coalesce((select jsonb_agg(jsonb_build_object('id',id,'quantity',quantity,'quality',quality_level,'expires_at',expires_at) order by opened_at)
 from public.customer_complaints where company_id=p_company_id and status='open'),'[]'::jsonb));
end $$;

-- Add large-order customer consequences, preventing duplicate effects.
create or replace function private.large_order_customer_relations()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.awarded_company_id is not null and new.status is distinct from old.status then
  if new.status='completed' then
   perform private.adjust_customer_relations(new.awarded_company_id,2+(case when new.completed_at<=new.delivery_deadline-interval '24 hours' then 1 else 0 end),0.7);
  elsif new.status in ('failed','defaulted') then
   perform private.adjust_customer_relations(new.awarded_company_id,-5,-1);
  end if;
 end if;
 return new;
end $$;
drop trigger if exists trg_large_order_customer_relations on public.large_customer_orders;
create trigger trg_large_order_customer_relations after update of status on public.large_customer_orders
for each row execute function private.large_order_customer_relations();
