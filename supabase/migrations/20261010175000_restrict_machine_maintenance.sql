-- Limit maintenance to machines and expose only production / research equipment.
do $patch$
declare f text;
begin
 select pg_get_functiondef('public.get_company_management_health(uuid)'::regprocedure) into f;
 if position('b.building_type_id in' in f)=0 then
 f:=replace(f,
  'where b.company_id=p_company_id and b.status=''active''',
  'where b.company_id=p_company_id and b.status=''active'' and b.building_type_id in (select id from public.building_types where building_category in (''production'',''research''))');
 execute f;
 end if;
 select pg_get_functiondef('public.maintain_production_machine(uuid,uuid,text)'::regprocedure) into f;
 if position('Produktionsgebäude oder Forschung' in f)=0 then
 f:=replace(f,' if v_building.id is null then raise exception ''Gebäude nicht verfügbar''; end if;',
  ' if v_building.id is null then raise exception ''Gebäude nicht verfügbar''; end if;'||chr(10)||
  ' if not exists(select 1 from public.building_types where id=v_building.building_type_id and building_category in (''production'',''research'')) then raise exception ''Wartung nur für Produktionsgebäude oder Forschung''; end if;');
 execute f;
 end if;
end $patch$;
