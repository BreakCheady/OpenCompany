-- Include current, category-specific research goods in the stock-exchange catalogue.
-- Replaces legacy universal Forschungseinheit and deduplicates goods across companies.
CREATE OR REPLACE FUNCTION public.get_market_product_catalog()
RETURNS TABLE(name text,category text,required_building_type_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
 SELECT catalog.name,catalog.category,catalog.required_building_type_id
 FROM (
 SELECT cat.name::text name,cat.category::text category,bt.id required_building_type_id
 FROM private.game_product_catalog cat
 LEFT JOIN public.building_types bt ON bt.code=cat.building_code
 WHERE NOT (cat.category='research' AND cat.name='Forschungseinheit')
 UNION
 SELECT DISTINCT p.name,p.category,p.required_building_type_id
 FROM public.products p
 WHERE p.category='research' AND p.status='active'
   AND p.name<>'Forschungseinheit'
 ) catalog
 ORDER BY catalog.category,catalog.name
$function$;
