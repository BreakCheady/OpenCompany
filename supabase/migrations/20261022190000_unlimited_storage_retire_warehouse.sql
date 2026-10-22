-- Unlimited storage without overflow fees; inventory valuation is deliberately untouched.
drop trigger if exists storage_capacity_before_inventory on public.inventories;
drop trigger if exists storage_capacity_before_material_inventory on public.material_inventories;
drop trigger if exists storage_capacity_after_inventory on public.inventories;
drop trigger if exists storage_capacity_after_material_inventory on public.material_inventories;
drop trigger if exists storage_capacity_building_guard on public.company_buildings;
create or replace function private.run_storage_daily_if_due() returns integer
language sql security definer set search_path='' as $body$ select 0::integer; $body$;
create or replace function private.storage_status_impl(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $body$
declare v_quantity numeric; v_value numeric;
begin
 perform private.assert_company_owner(p_company_id);
 v_quantity:=private.storage_total_quantity(p_company_id);
 v_value:=private.storage_total_value(p_company_id);
 return jsonb_build_object('warehouse_level',0,'warehouse_present',false,
 'capacity',0,'hard_limit',0,'total_quantity',v_quantity,'usage_percent',0,
 'overflow_quantity',0,'billable_overflow_quantity',0,'storage_value',v_value,
 'estimated_storage_fee',0,'estimated_overflow_fee',0,'warning_count',0,
 'warning_decay_started_at',null,'warning_decay_at',null,'unlimited_capacity',true);
end; $body$;
-- Preserve historical records but block all new warehouse construction.
create or replace function private.prevent_multiple_storage_warehouses()
returns trigger language plpgsql security definer set search_path='' as $body$
begin
 if exists(select 1 from public.building_types b where b.id=new.building_type_id and b.code='storage_warehouse') then
   raise exception 'Lagergebäude wurden aus OpenCompany entfernt';
 end if;
 return new;
end; $body$;
