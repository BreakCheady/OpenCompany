-- 3,105 deterministic read-only sensitivity scenarios, no business transactions.
-- READ ONLY: all distinct instantiated product-quality combinations, 9 reference cases each.
-- Exact production outcomes and net margins require an isolated fully seeded database.
WITH RECURSIVE catalog AS (
 SELECT DISTINCT ON (name,quality_level)
 id,name,quality_level,suggested_retail_price
 FROM public.products p
 ORDER BY name,quality_level,
 (SELECT count(*) FROM public.production_recipe_inputs r WHERE r.product_id=p.id) DESC,
 p.created_at,p.id
), expanded AS (
 SELECT c.id root_id,c.id product_id,1::numeric qty,ARRAY[c.id] path,0 depth
 FROM catalog c
 UNION ALL
 SELECT x.root_id,r.component_product_id,x.qty*r.quantity_per_unit,
 x.path||r.component_product_id,x.depth+1
 FROM expanded x JOIN public.production_recipe_inputs r ON r.product_id=x.product_id
 WHERE r.component_product_id IS NOT NULL
 AND NOT r.component_product_id=ANY(x.path) AND x.depth<8
), stages AS (
 SELECT x.root_id,x.qty,coalesce(bt.labor_cost_per_unit,0) labor,
 CASE WHEN p.category='research' THEN coalesce(p.production_cost,0) ELSE 0 END research,
 coalesce((
  SELECT sum(r.quantity_per_unit*m.base_cost)
  FROM public.production_recipe_inputs r JOIN public.materials m ON m.id=r.material_id
  WHERE r.product_id=x.product_id
 ),0) materials,bt.code,bt.building_category
 FROM expanded x JOIN public.products p ON p.id=x.product_id
 LEFT JOIN public.building_types bt ON bt.id=p.required_building_type_id
), scenarios AS (
 SELECT root_id,m.factor material_factor,e.factor economy_factor,
 sum(qty*(materials*m.factor+labor+research)*e.factor*
   (1+private.operating_cost_rate(code,building_category)*
   private.operating_efficiency_factor(1))) modeled_unit_cost
 FROM stages CROSS JOIN
 (VALUES (0.75::numeric),(1::numeric),(1.25::numeric)) m(factor)
 CROSS JOIN
 (VALUES (0.85::numeric),(1::numeric),(1.2::numeric)) e(factor)
 GROUP BY root_id,m.factor,e.factor
)
SELECT c.name,c.quality_level,s.material_factor,s.economy_factor,retail.factor AS retail_price_factor,
 round(s.modeled_unit_cost,4) modeled_unit_cost,
 round(c.suggested_retail_price*retail.factor,4) scenario_retail_price,
 round(c.suggested_retail_price*retail.factor-s.modeled_unit_cost,4) reference_price_gap,
 CASE WHEN s.modeled_unit_cost>c.suggested_retail_price*retail.factor
 THEN 'PRICE_GAP_RISK' ELSE 'NO_REFERENCE_GAP' END assessment
FROM scenarios s JOIN catalog c ON c.id=s.root_id
CROSS JOIN (VALUES (0.85::numeric),(1::numeric),(1.15::numeric)) retail(factor)
ORDER BY c.name,c.quality_level,s.material_factor,s.economy_factor,retail.factor;
