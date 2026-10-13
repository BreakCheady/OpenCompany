CREATE OR REPLACE FUNCTION private.ensure_expanded_product_catalog(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE b record; v_source public.products%rowtype; v_target uuid; v_created integer:=0;
BEGIN
 FOR b IN SELECT * FROM (VALUES
  ('automotive','Sportwagen','Sportcoupé'),
  ('chemical','Batterieelektrolyt','Industrie-Kühlmittel'),
  ('component','Akkupack','Leistungsakku'),
  ('construction','Beton','Stahlbeton-Fertigteile'),
  ('electronics','Drohne','Sicherheitsdrohne'),
  ('energy','Ladesäule','Schnellladestation'),
  ('food','Energydrink','Sportgetränk'),
  ('food_component','Mehl','Hafermehl'),
  ('logistics','Transportcontainer','Kühlcontainer'),
  ('machinery','Industrie-Roboter','Montageroboter'),
  ('textile','Sneaker','Wanderschuhe')
 ) AS blueprint(category,template_name,new_name)
 LOOP
  SELECT * INTO v_source FROM public.products
  WHERE company_id=p_company_id AND name=b.template_name AND category=b.category
  ORDER BY CASE WHEN quality_level=1 THEN 0 ELSE 1 END,id LIMIT 1;
  IF v_source.id IS NULL THEN CONTINUE; END IF;
  SELECT id INTO v_target FROM public.products
  WHERE company_id=p_company_id AND name=b.new_name AND category=b.category LIMIT 1;
  IF v_target IS NULL THEN
   INSERT INTO public.products(company_id,name,category,production_cost,suggested_retail_price,
    quality_score,status,required_building_type_id,required_retail_building_type_id,
    quality_level,research_units_progress,base_production_rate,base_retail_rate)
   VALUES(p_company_id,b.new_name,b.category,v_source.production_cost*1.10,
    round(v_source.suggested_retail_price*1.16,2),v_source.quality_score,
    v_source.status,v_source.required_building_type_id,v_source.required_retail_building_type_id,
    1,0,greatest(0.01,round(v_source.base_production_rate*0.90,4)),
    greatest(0.01,round(v_source.base_retail_rate*0.90,4)))
   RETURNING id INTO v_target;
   v_created:=v_created+1;
  END IF;
  INSERT INTO public.production_recipe_inputs(product_id,material_id,component_product_id,quantity_per_unit)
  SELECT v_target,r.material_id,r.component_product_id,round(r.quantity_per_unit*1.10,4)
  FROM public.production_recipe_inputs r WHERE r.product_id=v_source.id
  AND NOT EXISTS (SELECT 1 FROM public.production_recipe_inputs old
   WHERE old.product_id=v_target
    AND old.material_id IS NOT DISTINCT FROM r.material_id
    AND old.component_product_id IS NOT DISTINCT FROM r.component_product_id);
 END LOOP;
 RETURN v_created;
END $$;
CREATE OR REPLACE FUNCTION private.provision_expanded_catalog_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_company uuid;v_name text;
BEGIN
 IF TG_TABLE_NAME='products' THEN v_company:=NEW.company_id;v_name:=NEW.name;
 ELSE SELECT company_id,name INTO v_company,v_name FROM public.products WHERE id=NEW.product_id; END IF;
 IF v_name IN ('Sportwagen','Batterieelektrolyt','Akkupack','Beton','Drohne','Ladesäule','Energydrink','Mehl','Transportcontainer','Industrie-Roboter','Sneaker') THEN
  PERFORM private.ensure_expanded_product_catalog(v_company);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_product_expansion_on_products ON public.products;
CREATE TRIGGER trg_product_expansion_on_products AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION private.provision_expanded_catalog_trigger();
DROP TRIGGER IF EXISTS trg_product_expansion_on_recipes ON public.production_recipe_inputs;
CREATE TRIGGER trg_product_expansion_on_recipes AFTER INSERT ON public.production_recipe_inputs
FOR EACH ROW EXECUTE FUNCTION private.provision_expanded_catalog_trigger();
SELECT private.ensure_expanded_product_catalog(company_id)
FROM (SELECT DISTINCT company_id FROM public.products) companies;
REVOKE ALL ON FUNCTION private.ensure_expanded_product_catalog(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.provision_expanded_catalog_trigger() FROM PUBLIC;