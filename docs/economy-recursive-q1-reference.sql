-- READ-ONLY reference scenario for all Q1 products.
-- Material base_cost and labor are scenario inputs, not actual purchase costs.
-- Excludes overhead, economy, retail fees, sourcing and quality effects.
WITH RECURSIVE canonical AS (
 SELECT DISTINCT ON (name) id,name,category,production_cost,suggested_retail_price,required_building_type_id
 FROM public.products p WHERE quality_level=1
 ORDER BY name,(SELECT count(*) FROM public.production_recipe_inputs r WHERE r.product_id=p.id) DESC,p.created_at,p.id
), walk AS (
 SELECT c.name AS root_name,c.id AS product_id,1::numeric AS multiplicity,
        ARRAY[c.id] AS path,0 AS depth FROM canonical c
 UNION ALL
 SELECT w.root_name,r.component_product_id,
        w.multiplicity*r.quantity_per_unit,w.path||r.component_product_id,w.depth+1
 FROM walk w JOIN public.production_recipe_inputs r ON r.product_id=w.product_id
 WHERE r.component_product_id IS NOT NULL
   AND NOT (r.component_product_id=ANY(w.path)) AND w.depth<8
), costs AS (
 SELECT w.root_name,
  sum(w.multiplicity*coalesce(bt.labor_cost_per_unit,0)) AS labor_reference,
  sum(w.multiplicity*(CASE WHEN p.category='research' THEN coalesce(p.production_cost,0) ELSE 0 END)) AS research_reference,
  sum(w.multiplicity*coalesce((
    SELECT sum(r.quantity_per_unit*m.base_cost)
    FROM public.production_recipe_inputs r JOIN public.materials m ON m.id=r.material_id
    WHERE r.product_id=w.product_id
  ),0)) AS material_reference,
  max(w.depth) max_dependency_depth,count(*) expanded_nodes
 FROM walk w JOIN public.products p ON p.id=w.product_id
 LEFT JOIN public.building_types bt ON bt.id=p.required_building_type_id
 GROUP BY w.root_name
)
SELECT c.name,c.suggested_retail_price,
 round(k.material_reference,4) material_reference,
 round(k.labor_reference,4) labor_reference,
 round(k.research_reference,4) research_cash_reference,
 round(k.material_reference+k.labor_reference+k.research_reference,4) reference_unit_cost_before_overheads,
 round(c.suggested_retail_price-(k.material_reference+k.labor_reference+k.research_reference),4) reference_price_difference_before_overheads,
 CASE WHEN c.suggested_retail_price <
    k.material_reference+k.labor_reference+k.research_reference
    THEN 'REVIEW_REFERENCE_PRICE_GAP' ELSE 'NO_REFERENCE_GAP_DETECTED' END status,
 k.max_dependency_depth,k.expanded_nodes
FROM canonical c JOIN costs k ON k.root_name=c.name
ORDER BY reference_price_difference_before_overheads,c.name;
