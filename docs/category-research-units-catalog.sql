CREATE OR REPLACE FUNCTION private.category_research_unit_name(p_category text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE p_category
 WHEN 'automotive' THEN 'Fahrzeug-Forschung'
 WHEN 'chemical' THEN 'Chemie-Forschung'
 WHEN 'component' THEN 'Komponenten-Forschung'
 WHEN 'construction' THEN 'Bau-Forschung'
 WHEN 'electronics' THEN 'Elektronik-Forschung'
 WHEN 'energy' THEN 'Energie-Forschung'
 WHEN 'food' THEN 'Lebensmittel-Forschung'
 WHEN 'food_component' THEN 'Lebensmittelzutaten-Forschung'
 WHEN 'logistics' THEN 'Logistik-Forschung'
 WHEN 'machinery' THEN 'Maschinenbau-Forschung'
 WHEN 'textile' THEN 'Textil-Forschung'
 ELSE NULL END
$function$
;

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
 g.quality_score,g.status,g.required_building_type_id,g.required_retail_building_type_id,
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

CREATE OR REPLACE FUNCTION private.provision_category_research_units_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NEW.category<>'research' OR (NEW.name='Forschungseinheit' AND NEW.category='research') THEN
  PERFORM private.ensure_category_research_units(NEW.company_id);
 END IF;
 RETURN NEW;
END $function$
;

DROP TRIGGER IF EXISTS trg_provision_category_research_units ON public.products;
CREATE TRIGGER trg_provision_category_research_units AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION private.provision_category_research_units_trigger();
SELECT private.ensure_category_research_units(company_id)
FROM (SELECT DISTINCT company_id FROM public.products) companies;
REVOKE ALL ON FUNCTION private.ensure_category_research_units(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.provision_category_research_units_trigger() FROM PUBLIC;
