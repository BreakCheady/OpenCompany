-- Production reliability and customer relations, release 0.10.293.
create table if not exists public.company_customer_relations(
 company_id uuid primary key references public.companies(id) on delete cascade,
 satisfaction numeric not null default 50 check(satisfaction between 0 and 100),
 loyalty numeric not null default 40 check(loyalty between 0 and 100),
 updated_at timestamptz not null default now()
);
create table if not exists public.production_machine_health(
 building_id uuid primary key references public.company_buildings(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 condition_points numeric not null default 100 check(condition_points between 0 and 100),
 updated_at timestamptz not null default now()
);
alter table public.company_customer_relations enable row level security;
alter table public.production_machine_health enable row level security;
revoke all on public.company_customer_relations,public.production_machine_health from anon,authenticated;
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
 where b.company_id=p_company_id and b.status='active'),'[]'::jsonb));
end $$;
revoke all on function public.get_company_management_health(uuid) from public,anon;
grant execute on function public.get_company_management_health(uuid) to authenticated;

create or replace function public.maintain_production_machine(p_company_id uuid,p_building_id uuid,p_level text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_building public.company_buildings%rowtype; v_current numeric; v_repair numeric; v_cost numeric; v_cash numeric; v_new numeric;
begin
 perform private.assert_company_owner(p_company_id);
 if p_level not in ('small','standard','overhaul') then raise exception 'Unbekannte Wartung'; end if;
 select * into v_building from public.company_buildings where id=p_building_id and company_id=p_company_id and status='active' for update;
 if v_building.id is null then raise exception 'Gebäude nicht verfügbar'; end if;
 insert into public.production_machine_health(building_id,company_id) values(p_building_id,p_company_id) on conflict(building_id) do nothing;
 select condition_points into v_current from public.production_machine_health where building_id=p_building_id for update;
 v_repair:=case p_level when 'small' then 15 when 'standard' then 35 else 100 end;
 v_new:=least(100,v_current+v_repair);
 if v_new=v_current then raise exception 'Keine Wartung erforderlich'; end if;
 v_cost:=round((v_new-v_current)*greatest(1,v_building.level)*30,2);
 select cash_balance into v_cash from public.companies where id=p_company_id for update;
 if coalesce(v_cash,0)<v_cost then raise exception 'Nicht genügend Guthaben für Wartung'; end if;
 update public.companies set cash_balance=cash_balance-v_cost,updated_at=now() where id=p_company_id;
 update public.production_machine_health set condition_points=v_new,updated_at=now() where building_id=p_building_id;
 insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id)
 values(p_company_id,'operating_cost',-v_cost,'Maschinenwartung ('||p_level||')','building',p_building_id);
 return jsonb_build_object('condition',v_new,'cost',v_cost);
end $$;
revoke all on function public.maintain_production_machine(uuid,uuid,text) from public,anon;
grant execute on function public.maintain_production_machine(uuid,uuid,text) to authenticated;

-- Patch only known current server functions, preserving financial and inventory accounting.
do $patch$
declare f text;
begin
 select pg_get_functiondef('private.start_production_on_building_v2_impl(uuid,uuid,uuid,numeric,text,jsonb)'::regprocedure) into f;
 if position('v_machine_condition numeric' in f)=0 then
   f:=replace(f,' v_operating_cost numeric:=0;', ' v_operating_cost numeric:=0;'||chr(10)||
' v_machine_condition numeric; v_machine_mode text; v_machine_factor numeric; v_machine_wear numeric; v_disruption_chance numeric; v_disruption_hours numeric:=0;');
   f:=replace(f,' v_multiplier:=private.building_level_multiplier(v_building.level);',
' insert into public.production_machine_health(building_id,company_id) values(v_building.id,p_company_id) on conflict(building_id) do nothing;'||chr(10)||
' select condition_points into v_machine_condition from public.production_machine_health where building_id=v_building.id for update;'||chr(10)||
' if v_machine_condition<=0 then raise exception ''Maschine defekt – zuerst warten''; end if;'||chr(10)||
' v_machine_mode:=coalesce(p_start_snapshot->>''productionMode'',''normal'');'||chr(10)||
' if v_machine_mode not in (''gentle'',''normal'',''intensive'') then raise exception ''Ungültiger Produktionsmodus''; end if;'||chr(10)||
' v_machine_factor:=(case when v_machine_condition>=90 then 1.03 when v_machine_condition>=75 then 1 when v_machine_condition>=50 then 0.95 when v_machine_condition>=25 then 0.88 else 0.75 end)'||chr(10)||
' *(case v_machine_mode when ''gentle'' then 0.90 when ''intensive'' then 1.15 else 1 end);'||chr(10)||
' v_multiplier:=private.building_level_multiplier(v_building.level)*v_machine_factor;');
   f:=replace(f,' returning id into v_job;',
' returning id into v_job;'||chr(10)||
' v_disruption_chance:=case when v_machine_condition>=75 then 0.01 when v_machine_condition>=50 then 0.05 when v_machine_condition>=25 then 0.12 else 0.25 end;'||chr(10)||
' if v_machine_mode=''intensive'' then v_disruption_chance:=least(0.40,v_disruption_chance*1.5); end if;'||chr(10)||
' if random()<v_disruption_chance then v_disruption_hours:=2; end if;'||chr(10)||
' v_machine_wear:=least(100,round(p_hours/24.0*1.5*(case v_machine_mode when ''gentle'' then 0.6 when ''intensive'' then 1.75 else 1 end),3));'||chr(10)||
' update public.production_machine_health set condition_points=greatest(0,condition_points-v_machine_wear),updated_at=now() where building_id=v_building.id;'||chr(10)||
' if v_disruption_hours>0 then update public.production_jobs set finishes_at=finishes_at+interval ''2 hours'' where id=v_job; end if;');
   f:=replace(f,'''operatingCostBasis'',v_operating_basis', '''operatingCostBasis'',v_operating_basis,'||chr(10)||
'       ''machineMode'',v_machine_mode,''machineConditionAtStart'',v_machine_condition,''machineWear'',v_machine_wear,''machineDisruptionHours'',v_disruption_hours');
   if position('v_machine_condition numeric' in f)=0 or position('machineDisruptionHours' in f)=0 then raise exception 'Production patch failed'; end if;
   execute f;
 end if;
 select pg_get_functiondef('private.start_retail_sale_on_building_v2_impl(uuid,uuid,uuid,integer,numeric,numeric,text,jsonb)'::regprocedure) into f;
 if position('v_customer_factor numeric' in f)=0 then
   f:=replace(f,'  v_cash numeric;', '  v_cash numeric;'||chr(10)||'  v_customer_factor numeric; v_customer_satisfaction numeric;');
   f:=replace(f,'  v_units_per_hour:=greatest(', 
'  select satisfaction into v_customer_satisfaction from public.company_customer_relations where company_id=p_company_id;'||chr(10)||
'  v_customer_factor:=case when coalesce(v_customer_satisfaction,50)<20 then 0.75 when v_customer_satisfaction<40 then 0.85 when v_customer_satisfaction<60 then 1 when v_customer_satisfaction<80 then 1.05 when v_customer_satisfaction<95 then 1.10 else 1.15 end;'||chr(10)||
'  v_units_per_hour:=greatest(');
   f:=replace(f,"*private.manager_multiplier(p_company_id,'sales','sales_rate'))","*private.manager_multiplier(p_company_id,'sales','sales_rate')*v_customer_factor)");
   f:=replace(f,"    'quantity',p_quantity,","    'customerSatisfactionAtStart',coalesce(v_customer_satisfaction,50),'customerDemandFactor',v_customer_factor,"||chr(10)||
"    'quantity',p_quantity,");
   f:=replace(f,'  return v_job;', 
'  insert into public.company_customer_relations(company_id,satisfaction,loyalty)'||chr(10)||
'  values(p_company_id,least(100,50+0.2+(case when p_quality>=5 then 0.5 when p_quality=4 then 0.3 else 0 end)),40.1)'||chr(10)||
'  on conflict(company_id) do update set satisfaction=least(100,public.company_customer_relations.satisfaction+0.2+(case when p_quality>=5 then 0.5 when p_quality=4 then 0.3 else 0 end)),'||chr(10)||
'  loyalty=least(100,public.company_customer_relations.loyalty+0.1),updated_at=now();'||chr(10)||
'  return v_job;');
   if position('v_customer_factor numeric' in f)=0 then raise exception 'Retail patch failed'; end if;
   execute f;
 end if;
end $patch$;
