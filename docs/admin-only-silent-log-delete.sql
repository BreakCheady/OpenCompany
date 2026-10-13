-- Moderation-log records may be deleted only by admins, without generating another log entry.
CREATE OR REPLACE FUNCTION public.moderate_delete_message(p_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_actor uuid:=(select auth.uid()); v_sender uuid; v_is_log boolean;
BEGIN
 PERFORM private.assert_staff(false);
 SELECT m.sender_company_id,coalesce(r.slug='moderation-log',false)
 INTO v_sender,v_is_log
 FROM public.chat_messages m LEFT JOIN public.chat_rooms r ON r.id=m.room_id
 WHERE m.id=p_message_id AND m.deleted_at IS NULL FOR UPDATE OF m;
 IF v_sender IS NULL THEN RAISE EXCEPTION 'Nachricht nicht gefunden'; END IF;
 IF v_is_log THEN
  PERFORM private.assert_staff(true);
  UPDATE public.chat_messages SET deleted_at=now() WHERE id=p_message_id;
  RETURN;
 END IF;
 UPDATE public.chat_messages SET deleted_at=now() WHERE id=p_message_id;
 INSERT INTO public.moderation_actions(actor_user_id,action_type,target_company_id,target_message_id)
 VALUES(v_actor,'message_delete',v_sender,p_message_id);
END $function$;
