CREATE OR REPLACE FUNCTION private.ensure_category_research_units(p_company_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_created int;
BEGIN
 WITH seed AS (
 SELECT DISTINCT ON (p.company_id,p.category) p.company_id,p.category,
   private.category_research_unit_name(p.category) unit_name
 FROM public.products p WHERE p.company_id=p_company_id AND p.category<>'research'
 ORDER BY p.company_id,p.category,p.id
 ), generic AS (
 SELECT DISTINCT ON (company_id) * FROM public.products
 WHERE company_id=p_company_id AND name='Forschungseinheit' AND category='research'
 ORDER BY company_id,id
 ), added AS (
 INSERT INTO public.products (company_id,name,category,production_cost,suggested_retail_price,
 quality_score,status,required_building_type_id,required_retail_building_type_id,
 quality_level,research_units_progress,base_production_rate,base_retail_rate)
 SELECT s.company_id,s.unit_name,'research',g.production_cost,g.suggested_retail_price,
 g.quality_score,'active',g.required_building_type_id,g.required_retail_building_type_id,
 1,0,g.base_production_rate,g.base_retail_rate
 FROM seed s JOIN generic g ON g.company_id=s.company_id
 WHERE s.unit_name IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM public.products target
 WHERE target.company_id=s.company_id AND target.name=s.unit_name AND target.category='research'
 ) RETURNING id
 ) SELECT count(*) INTO v_created FROM added;
 RETURN v_created;
END $function$
;
UPDATE public.products SET status='discontinued' WHERE name='Forschungseinheit' AND category='research' AND status='active';
