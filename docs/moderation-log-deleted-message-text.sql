-- Applied to production. For future message deletions, log the deleted message body rather than its UUID.
DO $$
DECLARE v_def text;
BEGIN
 v_def:=pg_get_functiondef('private.write_moderation_log_message()'::regprocedure);
 IF position('Gelöschter Text:' in v_def)>0 THEN RETURN; END IF;
 IF position('v_body:=v_body || '' · Nachricht: '' || new.target_message_id::text;' in v_def)=0 THEN
  RAISE EXCEPTION 'Unexpected moderation log formatter; refusing migration';
 END IF;
 v_def:=replace(v_def,
  'v_body:=v_body || '' · Nachricht: '' || new.target_message_id::text;',
  'select m.body into v_reason from public.chat_messages m where m.id=new.target_message_id;'
  ||chr(10)||'    v_body:=v_body || '' · Gelöschter Text: '' || coalesce(''"'' || v_reason || ''"'',''[Text nicht mehr verfügbar]'');');
 EXECUTE v_def;
END $$;
