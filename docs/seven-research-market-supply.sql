CREATE OR REPLACE FUNCTION private.ensure_research_market_supply()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_item record; v_company uuid; v_product uuid; v_existing int; v_n int:=0; v_q int; v_i int; v_expires timestamptz;
BEGIN
 v_expires:=date_trunc('hour',now())+(floor(extract(minute from now())/15)*interval '15 minutes')+interval '15 minutes';
 FOR v_item IN SELECT DISTINCT name FROM public.products
 WHERE category='research' AND status='active' AND name=ANY(ARRAY[
 'Lebensmittel-Forschung','Bau-Forschung','Elektronik-Forschung','Automobil-Forschung',
 'Chemie-Forschung','Textil-Forschung','Energie-Forschung'])
 LOOP
 FOR v_q IN 1..5 LOOP
 SELECT count(*) INTO v_existing FROM public.market_orders o
 JOIN public.products p ON p.id=o.product_id
 JOIN public.companies c ON c.id=o.company_id
 WHERE p.name=v_item.name AND p.category='research' AND c.company_type='npc'
 AND o.order_type='sell' AND o.status IN ('open','partially_filled')
 AND o.quality_level=v_q AND o.remaining_quantity>0 AND (o.expires_at IS NULL OR o.expires_at>now())
 AND c.status='active';
 FOR v_i IN 1..greatest(0,4-v_existing) LOOP
 SELECT p.id,p.company_id INTO v_product,v_company FROM public.products p
 JOIN public.companies c ON c.id=p.company_id
 JOIN private.npc_industry_profiles ip ON ip.company_id=c.id AND ip.category='research' AND ip.can_sell
 WHERE p.name=v_item.name AND p.category='research' AND p.status='active'
 AND c.company_type='npc' AND c.status='active' AND c.company_code<>'U00000'
 ORDER BY random()/greatest(ip.activity_weight,0.1) LIMIT 1;
 IF v_product IS NULL THEN EXIT; END IF;
 INSERT INTO public.market_orders(company_id,product_id,order_type,quantity,remaining_quantity,price_per_unit,status,expires_at,quality_level)
 VALUES(v_company,v_product,'sell',80+v_i,80+v_i,1,'open',v_expires,v_q);
 v_n:=v_n+1;
 END LOOP;
 END LOOP;
 END LOOP;
 RETURN v_n;
END $function$
;
