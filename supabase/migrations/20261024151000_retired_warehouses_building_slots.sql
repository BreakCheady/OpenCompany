-- Server-side building slots must ignore retired storage warehouses.
-- Preserve warehouse records and all existing financial and inventory data.
create or replace function private.build_building_impl(p_company_id uuid,p_building_type_id uuid)
returns uuid language plpgsql security definer set search_path='' as $body$
declare v_cost numeric; v_id uuid; v_name text; v_hours integer; v_complete_at timestamptz; v_level integer; v_slots integer; v_used integer;
begin
 perform private.assert_company_owner(p_company_id);
 select company_level into v_level from public.companies where id=p_company_id for update;
 v_slots:=private.building_slots_for_level(v_level);
 select count(*) into v_used from public.company_buildings cb
 join public.building_types bt on bt.id=cb.building_type_id
 where cb.company_id=p_company_id and bt.code is distinct from 'storage_warehouse';
 if v_used>=v_slots then raise exception 'Keine freien Gebäudeplätze (%/% belegt)',v_used,v_slots; end if;
 select construction_cost,name into v_cost,v_name from public.building_types
 where id=p_building_type_id and code is distinct from 'storage_warehouse';
 if v_cost is null then raise exception 'Gebäudetyp nicht gefunden oder nicht mehr baubar'; end if;
 v_hours:=private.building_construction_hours(1); v_complete_at:=now()+make_interval(hours=>v_hours);
 update public.companies set cash_balance=cash_balance-v_cost,updated_at=now() where id=p_company_id;
 insert into public.company_buildings(company_id,building_type_id,level,status,built_at,construction_started_at,construction_complete_at,construction_target_level,xp_awarded)
 values(p_company_id,p_building_type_id,1,'inactive',now(),now(),v_complete_at,1,false) returning id into v_id;
 insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id)
 values(p_company_id,'construction',-v_cost,'Bau: '||v_name||' Level 1','building',v_id);
 perform private.handle_insolvency_if_needed(p_company_id); return v_id;
end; $body$;