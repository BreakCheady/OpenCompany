CREATE OR REPLACE FUNCTION private.enforce_balanced_npc_quality_quote()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_type text;v_cost numeric;v_base numeric;v_item text;v_category text;v_material public.materials%rowtype;
BEGIN
 IF NEW.order_type <> 'sell' OR NEW.status NOT IN ('open','partially_filled') THEN RETURN NEW; END IF;
 SELECT company_type INTO v_type FROM public.companies WHERE id=NEW.company_id;
 IF v_type IS DISTINCT FROM 'npc' THEN RETURN NEW; END IF;
 IF NEW.product_id IS NOT NULL THEN
   SELECT name,category INTO v_item,v_category FROM public.products WHERE id=NEW.product_id;
   IF v_category='research' OR v_item='Transportcontainer' THEN
     NEW.quality_level:=1;
     IF v_category='research' THEN NEW.price_per_unit:=round(27::numeric+random()::numeric*3,2);
     ELSE NEW.price_per_unit:=round(54::numeric+random()::numeric*4,2); END IF;
     RETURN NEW;
   END IF;
 END IF;
 IF NEW.material_id IS NOT NULL THEN
   SELECT * INTO v_material FROM public.materials WHERE id=NEW.material_id;
   IF v_material.id IS NULL THEN RAISE EXCEPTION 'Rohstoffpreis: Unbekannter Rohstoff'; END IF;
   v_base:=greatest(v_material.base_cost,0.01);
   v_cost:=v_base*private.quality_multiplier(NEW.quality_level);
 ELSE
   SELECT name INTO v_item FROM public.products WHERE id=NEW.product_id;
   IF v_item IS NULL THEN RAISE EXCEPTION 'Produktpreis: Unbekanntes Produkt'; END IF;
   v_base:=private.simulated_product_quality_unit_cost(v_item,1);
   v_cost:=private.simulated_product_quality_unit_cost(v_item,NEW.quality_level);
   IF v_base IS NULL OR v_cost IS NULL OR v_base<=0 OR v_cost<=0 THEN
     RAISE EXCEPTION 'Für dieses Produkt fehlen berechenbare Rezeptkosten';
   END IF;
 END IF;
 NEW.price_per_unit:=private.market_balanced_quality_price(v_cost,v_base,NEW.quality_level);
 RETURN NEW;
END $function$
;
