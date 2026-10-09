-- PA notification for decisions resumed after the global management cooldown.
do $patch$
declare v_def text;
v_old text:='   delete from private.management_decision_parked where decision_id=v_parked.decision_id;'||chr(10)||'   return;';
v_new text:='   delete from private.management_decision_parked where decision_id=v_parked.decision_id;'||chr(10)||
'   perform private.management_send_pa(p_company_id,'||chr(10)||
'     ''Boss, eine Managemententscheidung ist wieder aktiv: „''||'||chr(10)||
'     coalesce((select title from public.management_decisions where id=v_parked.decision_id),''Managemententscheidung'')||'||chr(10)||
'     ''“. Bitte entscheide rechtzeitig im Managementbereich.'');'||chr(10)||
'   return;';
begin
 select pg_get_functiondef('private.refresh_management_decisions(uuid)'::regprocedure) into v_def;
 if position('eine Managemententscheidung ist wieder aktiv' in v_def)>0 then return; end if;
 if position(v_old in v_def)=0 then raise exception 'Management reactivation function has changed'; end if;
 execute replace(v_def,v_old,v_new);
end $patch$;
