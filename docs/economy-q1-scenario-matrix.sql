-- READ-ONLY OpenCompany Q1 cost sensitivity matrix.
-- Nine scenarios per Q1 product: 3 material prices x 3 economy factors.
-- Cost includes recursive material, labor, research and operating overhead.
-- This is NOT an exact live production or realized net-sales simulation.
WITH RECURSIVE canonical AS (
 SELECT DISTINCT ON (name) id,name,category,production_cost,suggested_retail_price,required_building_type_id
 FROM public.products p WHERE quality_level=1
 ORDER BY name,(SELECT count(*) FROM public.production_recipe_inputs r WHERE r.product_id=p.id) DESC,p.created_at,p.id
), walk AS (
 SELECT name root,id product_id,1::numeric qty,ARRAY[id] path,0 depth FROM canonical
 UNION ALL
 SELECT w.root,r.component_product_id,w.qty*r.quantity_per_unit,w.path||r.component_product_id,w.depth+1
 FROM walk w JOIN public.production_recipe_inputs r ON r.product_id=w.product_id
 WHERE r.component_product_id IS NOT NULL AND NOT r.component_product_id=ANY(w.path) AND w.depth<8
), stages AS (
 SELECT w.root,w.qty,p.category,p.production_cost,bt.labor_cost_per_unit,bt.code,bt.building_category,
 coalesce((SELECT sum(r.quantity_per_unit*m.base_cost) FROM public.production_recipe_inputs r JOIN public.materials m ON m.id=r.material_id WHERE r.product_id=w.product_id),0) materials
 FROM walk w JOIN public.products p ON p.id=w.product_id LEFT JOIN public.building_types bt ON bt.id=p.required_building_type_id
), scenario AS (
 SELECT root, m.factor material_multiplier,e.factor economy_multiplier,
 sum(qty * ((materials*m.factor + coalesce(labor_cost_per_unit,0) + case when category='research' then production_cost else 0 end)
 *e.factor + (materials*m.factor+coalesce(labor_cost_per_unit,0)+case when category='research' then production_cost else 0 end)
 *private.operating_cost_rate(code,building_category)*private.operating_efficiency_factor(1)*e.factor)) modeled_unit_cost
 FROM stages CROSS JOIN (values (0.75::numeric),(1::numeric),(1.25::numeric)) m(factor)
 CROSS JOIN (values (0.85::numeric),(1::numeric),(1.2::numeric)) e(factor)
 GROUP BY root,m.factor,e.factor
)
SELECT s.root product_name,s.material_multiplier,s.economy_multiplier,
 round(s.modeled_unit_cost,4) modeled_unit_cost,
 c.suggested_retail_price,
 round(c.suggested_retail_price-s.modeled_unit_cost,4) reference_gross_gap,
 CASE WHEN c.suggested_retail_price<s.modeled_unit_cost
 THEN 'REVIEW_PRICE_BELOW_MODELED_COST' ELSE 'NO_REFERENCE_GAP' END assessment
FROM scenario s JOIN canonical c ON c.name=s.root
ORDER BY s.root,s.material_multiplier,s.economy_multiplier;
