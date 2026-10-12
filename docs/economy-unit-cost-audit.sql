-- OpenCompany economy audit: READ ONLY; execute in Supabase SQL editor.
-- All comparisons use current Q1 NPC ask prices, not guaranteed execution prices.
-- Exclude expired offers. Reference prices are NOT guaranteed sell prices.
WITH offers AS (
 SELECT o.material_id,o.product_id,o.price_per_unit
 FROM public.market_orders o JOIN public.companies c ON c.id=o.company_id
 WHERE c.company_type='npc' AND o.order_type='sell'
 AND o.quality_level=1 AND o.status IN ('open','partially_filled')
 AND o.remaining_quantity>0 AND (o.expires_at IS NULL OR o.expires_at>now())
), material_asks AS (
 SELECT material_id,min(price_per_unit) ask FROM offers WHERE material_id IS NOT NULL GROUP BY material_id
),product_asks AS (
 SELECT p.name,p.category,min(o.price_per_unit) ask
 FROM offers o JOIN public.products p ON p.id=o.product_id
 WHERE o.product_id IS NOT NULL GROUP BY p.name,p.category
),input_costs AS (
 SELECT r.product_name,
 sum(r.quantity_per_unit * CASE WHEN r.input_kind='material'
 THEN (SELECT ma.ask FROM material_asks ma JOIN public.materials m ON m.id=ma.material_id WHERE m.name=r.input_name LIMIT 1)
 ELSE (SELECT min(pa.ask) FROM product_asks pa WHERE pa.name=r.input_name) END) q1_npc_input_cost,
 count(*) recipe_lines,
 count(*) FILTER(WHERE NOT EXISTS(
  SELECT 1 FROM material_asks ma JOIN public.materials m ON m.id=ma.material_id
  WHERE r.input_kind='material' AND m.name=r.input_name
 ) AND NOT EXISTS(
  SELECT 1 FROM product_asks pa WHERE r.input_kind<>'material' AND pa.name=r.input_name
 )) missing_prices
 FROM private.game_recipe_catalog r GROUP BY r.product_name
)
SELECT p.name,p.category,p.suggested_retail_price AS catalog_reference_price,
 round(ic.q1_npc_input_cost,2) AS q1_npc_inputs_only,
 round(pa.ask,2) AS q1_npc_seller_ask,
 ic.recipe_lines,ic.missing_prices,
 round((pa.ask*0.95-ic.q1_npc_input_cost),2) AS input_only_spread_after_5pct_fee
FROM private.game_product_catalog p LEFT JOIN input_costs ic ON ic.product_name=p.name
LEFT JOIN product_asks pa ON pa.name=p.name AND pa.category=p.category
ORDER BY input_only_spread_after_5pct_fee NULLS FIRST,p.name;

-- Historical finished_unit_cost samples reflect individual company jobs, not entire catalog economics.
SELECT p.name,j.quality_level,count(*) jobs,
 round(avg(j.finished_unit_cost),2) avg_finished_unit_cost,
 round(min(j.finished_unit_cost),2) minimum_finished_unit_cost,
 round(max(j.finished_unit_cost),2) maximum_finished_unit_cost
FROM public.production_jobs j JOIN public.products p ON p.id=j.product_id
WHERE j.finished_unit_cost>0 GROUP BY p.name,j.quality_level ORDER BY p.name,j.quality_level;

-- Raw-material mismatch compared with base_cost (verify economic semantics before changing anything).
SELECT m.name,m.base_cost,min(o.price_per_unit) npc_q1_ask,
 round(min(o.price_per_unit)/nullif(m.base_cost,0),3) ratio
FROM public.materials m JOIN offers o ON o.material_id=m.id
WHERE m.status='active' GROUP BY m.id,m.name,m.base_cost ORDER BY ratio,m.name;
