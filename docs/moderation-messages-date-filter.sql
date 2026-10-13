-- Search player messages by exact account/company code and optional inclusive UTC timestamp bounds.
CREATE OR REPLACE FUNCTION public.get_moderation_player_messages(
 p_identifier text,p_limit integer DEFAULT 150,p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL)
RETURNS TABLE(id uuid,sender_company_id uuid,sender_company_name text,body text,created_at timestamptz,room_name text,recipient_company_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_identifier text:=upper(trim(coalesce(p_identifier,'')));
BEGIN
 PERFORM private.assert_staff(false);
 IF v_identifier !~ '^[AU][0-9]{5,}$' THEN RETURN; END IF;
 IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to THEN RAISE EXCEPTION 'Zeitraum: Von liegt nach Bis'; END IF;
 RETURN QUERY
 SELECT m.id,m.sender_company_id,s.name::text,m.body::text,m.created_at,r.name::text,rc.name::text
 FROM public.chat_messages m JOIN public.companies s ON s.id=m.sender_company_id
 LEFT JOIN public.account_profiles ap ON ap.user_id=s.owner_user_id
 LEFT JOIN public.chat_rooms r ON r.id=m.room_id
 LEFT JOIN public.companies rc ON rc.id=m.recipient_company_id
 WHERE m.deleted_at IS NULL AND s.company_type='player'
 AND ((left(v_identifier,1)='A' AND upper(ap.account_code)=v_identifier)
 OR (left(v_identifier,1)='U' AND upper(s.company_code)=v_identifier))
 AND (p_from IS NULL OR m.created_at>=p_from)
 AND (p_to IS NULL OR m.created_at<=p_to)
 ORDER BY m.read_sequence DESC LIMIT least(greatest(coalesce(p_limit,150),1),300);
END $$;
REVOKE ALL ON FUNCTION public.get_moderation_player_messages(text,integer,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_moderation_player_messages(text,integer,timestamptz,timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_moderation_player_messages(text,integer) FROM authenticated,PUBLIC;
