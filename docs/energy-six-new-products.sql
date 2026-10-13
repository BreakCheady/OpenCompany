-- Six original energy-industry goods; dedicated material recipes.
CREATE OR REPLACE FUNCTION private.seed_six_energy_goods(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $seed$
DECLARE v_base public.products%rowtype; v_rec record; v_product_id uuid; v_count int:=0;
BEGIN
 SELECT * INTO v_base FROM public.products
 WHERE company_id=p_company_id AND category='energy'
   AND name IN ('Solarmodul','Ladesäule','Solarzelle')
 ORDER BY CASE WHEN name='Solarmodul' THEN 0 ELSE 1 END,id LIMIT 1;
 IF v_base.id IS NULL THEN RETURN 0; END IF;
 FOR v_rec IN SELECT * FROM (VALUES ('Windkraftgenerator',1.2,1,680),('Transformator',4,3,320),('Notstromaggregat',2.5,2,460),('Wärmepumpe',3,2,540),('Biogasanlage',0.8,0.7,1100),('Batteriespeicher',2,1.5,900)) AS x(name,production_rate,retail_rate,retail_price)
 LOOP
 SELECT id INTO v_product_id FROM public.products
 WHERE company_id=p_company_id AND category='energy' AND name=v_rec.name LIMIT 1;
 IF v_product_id IS NULL THEN
 INSERT INTO public.products(company_id,name,category,production_cost,suggested_retail_price,
 quality_score,status,required_building_type_id,required_retail_building_type_id,
 quality_level,research_units_progress,base_production_rate,base_retail_rate)
 VALUES(p_company_id,v_rec.name,'energy',0,v_rec.retail_price,
 60,'active',v_base.required_building_type_id,v_base.required_retail_building_type_id,
 1,0,v_rec.production_rate,v_rec.retail_rate)
 RETURNING id INTO v_product_id;
 v_count:=v_count+1;
 END IF;
 INSERT INTO public.production_recipe_inputs(product_id,material_id,quantity_per_unit)
 SELECT v_product_id,m.id,r.quantity
 FROM (VALUES ('Windkraftgenerator','Stahl',18),('Windkraftgenerator','Kupfer',8),('Windkraftgenerator','Aluminium',6),('Windkraftgenerator','Glas',2),('Transformator','Kupfer',8),('Transformator','Stahl',7),('Transformator','Aluminium',2),('Notstromaggregat','Stahl',10),('Notstromaggregat','Kupfer',4),('Notstromaggregat','Erdöl',3),('Notstromaggregat','Kautschuk',2),('Wärmepumpe','Kupfer',7),('Wärmepumpe','Aluminium',6),('Wärmepumpe','Stahl',4),('Wärmepumpe','Chemikalien',2),('Biogasanlage','Stahl',24),('Biogasanlage','Kupfer',9),('Biogasanlage','Glas',5),('Biogasanlage','Kautschuk',4),('Batteriespeicher','Lithium',8),('Batteriespeicher','Kupfer',7),('Batteriespeicher','Aluminium',10),('Batteriespeicher','Silizium',3)) AS r(product_name,material_name,quantity)
 JOIN public.materials m ON m.name=r.material_name
 WHERE r.product_name=v_rec.name
 AND NOT EXISTS (SELECT 1 FROM public.production_recipe_inputs existing
  WHERE existing.product_id=v_product_id AND existing.material_id=m.id);
 END LOOP;
 RETURN v_count;
END $seed$;
CREATE OR REPLACE FUNCTION private.seed_six_energy_goods_on_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $trigger$
BEGIN
 PERFORM private.seed_six_energy_goods(NEW.company_id);
 RETURN NEW;
END $trigger$;
DROP TRIGGER IF EXISTS trg_seed_six_energy_goods ON public.products;
CREATE TRIGGER trg_seed_six_energy_goods AFTER INSERT ON public.products
FOR EACH ROW WHEN (NEW.category='energy' AND NEW.name IN ('Solarmodul','Solarzelle','Ladesäule'))
EXECUTE FUNCTION private.seed_six_energy_goods_on_product();
INSERT INTO private.game_product_catalog(name,category,production_cost,suggested_retail_price,
 building_code,retail_building_code,base_production_rate,base_retail_rate)
SELECT x.name,'energy',0,x.retail_price,bt.code,rbt.code,x.production_rate,x.retail_rate
FROM (VALUES ('Windkraftgenerator',1.2,1,680),('Transformator',4,3,320),('Notstromaggregat',2.5,2,460),('Wärmepumpe',3,2,540),('Biogasanlage',0.8,0.7,1100),('Batteriespeicher',2,1.5,900)) x(name,production_rate,retail_rate,retail_price)
CROSS JOIN LATERAL (
 SELECT p.required_building_type_id,p.required_retail_building_type_id
 FROM public.products p WHERE p.category='energy' AND p.name='Solarmodul' LIMIT 1
) base
JOIN public.building_types bt ON bt.id=base.required_building_type_id
LEFT JOIN public.building_types rbt ON rbt.id=base.required_retail_building_type_id
WHERE NOT EXISTS (SELECT 1 FROM private.game_product_catalog p WHERE p.name=x.name AND p.category='energy');
SELECT private.seed_six_energy_goods(company_id)
FROM (SELECT DISTINCT company_id FROM public.products WHERE category='energy') owners;
