-- OpenCompany production rules-based quality balancing, 2026-10-13.
-- Reference unit costs do not depend on historical production jobs or inventories.
CREATE OR REPLACE FUNCTION private.simulated_product_quality_unit_cost(p_name text,p_quality integer)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO '' AS $function$
WITH RECURSIVE root AS (
 SELECT p.id FROM public.products p WHERE p.name=p_name AND p.quality_level=1
 ORDER BY (SELECT count(*) FROM public.production_recipe_inputs r WHERE r.product_id=p.id) DESC,p.created_at,p.id LIMIT 1
), chain AS (
 SELECT r.id product_id,greatest(1,least(5,coalesce(p_quality,1))) stage_quality,1::numeric qty,ARRAY[r.id] path
 FROM root r
 UNION ALL
 SELECT i.component_product_id,greatest(1,b.stage_quality-1),b.qty*i.quantity_per_unit,b.path||i.component_product_id
 FROM chain b JOIN public.production_recipe_inputs i ON i.product_id=b.product_id
 WHERE i.component_product_id IS NOT NULL AND NOT i.component_product_id=ANY(b.path) AND cardinality(b.path)<8
)
SELECT round(sum(b.qty*(
 coalesce(t.labor_cost_per_unit,0)
 + case when p.category='research' then coalesce(p.production_cost,0) else 0 end
 + coalesce((SELECT sum(i.quantity_per_unit*m.base_cost*private.quality_multiplier(greatest(1,b.stage_quality-1)))
 FROM public.production_recipe_inputs i JOIN public.materials m ON m.id=i.material_id
 WHERE i.product_id=b.product_id),0)
 )*private.economy_production_cost_factor()*(1+private.operating_cost_rate(t.code,t.building_category))),4)
FROM chain b JOIN public.products p ON p.id=b.product_id
LEFT JOIN public.building_types t ON t.id=p.required_building_type_id
$function$;

CREATE OR REPLACE FUNCTION private.market_balanced_quality_price(p_quality_cost numeric,p_base_quality_cost numeric,p_quality integer)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
 SELECT ceil(100*(
   greatest(coalesce(p_quality_cost,0.01),0.01)
   + greatest(
       greatest(coalesce(p_base_quality_cost,0.01),0.01)
         *0.14*(1+0.06*(least(5,greatest(1,coalesce(p_quality,1)))-1)),
       greatest(coalesce(p_quality_cost,0.01),0.01)*0.08
     )
   )/0.95)/100
$function$;

CREATE OR REPLACE FUNCTION private.enforce_balanced_npc_quality_quote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
 v_type text;
 v_cost numeric;
 v_base numeric;
 v_item text;
 v_material public.materials%rowtype;
BEGIN
 IF NEW.order_type <> 'sell' OR NEW.status NOT IN ('open','partially_filled') THEN RETURN NEW; END IF;
 SELECT company_type INTO v_type FROM public.companies WHERE id=NEW.company_id;
 IF v_type IS DISTINCT FROM 'npc' THEN RETURN NEW; END IF;
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
END
$function$;

DROP TRIGGER IF EXISTS trg_enforce_balanced_npc_quality_quote ON public.market_orders;
CREATE TRIGGER trg_enforce_balanced_npc_quality_quote
BEFORE INSERT OR UPDATE OF price_per_unit,quality_level,product_id,material_id,order_type,company_id
ON public.market_orders FOR EACH ROW
EXECUTE FUNCTION private.enforce_balanced_npc_quality_quote();
REVOKE ALL ON FUNCTION private.enforce_balanced_npc_quality_quote() FROM PUBLIC;
