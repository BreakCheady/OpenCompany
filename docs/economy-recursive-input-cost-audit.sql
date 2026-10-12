-- OpenCompany: recursive Q1-Q5 input-cost audit (READ ONLY).
-- Scenario A: make every product subcomponent; buy raw materials at lowest ACTIVE NPC ask.
-- Scenario B: buy every immediate recipe input at lowest ACTIVE NPC ask.
-- Costs exclude production cash, labour, buildings, time, quality conversions and sale fees.
-- A NULL cost indicates missing recipes/quotes; never coalesce it to zero.
WITH RECURSIVE
qualities AS (SELECT generate_series(1,5)::int AS quality_level),
npc_quotes AS (
 SELECT o.quality_level,o.material_id,o.product_id,min(o.price_per_unit) AS ask
 FROM public.market_orders o JOIN public.companies c ON c.id=o.company_id
 WHERE c.company_type='npc' AND o.order_type='sell'
 AND o.status IN ('open','partially_filled') AND o.remaining_quantity>0
 AND (o.expires_at IS NULL OR o.expires_at>now())
 GROUP BY o.quality_level,o.material_id,o.product_id
),
raw_asks AS (
 SELECT m.name,q.quality_level,min(n.ask) AS ask
 FROM public.materials m CROSS JOIN qualities q
 LEFT JOIN npc_quotes n ON n.material_id=m.id AND n.quality_level=q.quality_level
 WHERE m.status='active' GROUP BY m.name,q.quality_level
),
part_asks AS (
 SELECT p.name,q.quality_level,min(n.ask) AS ask
 FROM public.products p CROSS JOIN qualities q
 LEFT JOIN npc_quotes n ON n.product_id=p.id AND n.quality_level=q.quality_level
 GROUP BY p.name,q.quality_level
),
expanded AS (
 SELECT p.name AS root,p.name AS part,q.quality_level,1::numeric AS multiplier,
 ARRAY[p.name]::text[] AS visited,0 AS depth
 FROM private.game_product_catalog p CROSS JOIN qualities q
 UNION ALL
 SELECT e.root,r.input_name,e.quality_level,
 e.multiplier*r.quantity_per_unit,e.visited||r.input_name,e.depth+1
 FROM expanded e JOIN private.game_recipe_catalog r ON r.product_name=e.part
 WHERE r.input_kind<>'material' AND NOT r.input_name=ANY(e.visited)
 AND e.depth<12
),
raw_requirements AS (
 SELECT e.root,e.quality_level,r.input_name,e.multiplier*r.quantity_per_unit AS required
 FROM expanded e JOIN private.game_recipe_catalog r ON r.product_name=e.part
 WHERE r.input_kind='material'
),
make_scenario AS (
 SELECT r.root,r.quality_level,
 sum(r.required * a.ask) AS raw_input_cost,
 count(*) FILTER (WHERE a.ask IS NULL) AS missing_asks
 FROM raw_requirements r LEFT JOIN raw_asks a
 ON a.name=r.input_name AND a.quality_level=r.quality_level
 GROUP BY r.root,r.quality_level
),
buy_scenario AS (
 SELECT r.product_name AS root,q.quality_level,
 sum(r.quantity_per_unit*CASE WHEN r.input_kind='material' THEN a.ask ELSE p.ask END) AS direct_input_cost,
 count(*) FILTER (WHERE CASE WHEN r.input_kind='material' THEN a.ask ELSE p.ask END IS NULL) AS missing_asks
 FROM private.game_recipe_catalog r CROSS JOIN qualities q
 LEFT JOIN raw_asks a ON r.input_kind='material' AND a.name=r.input_name AND a.quality_level=q.quality_level
 LEFT JOIN part_asks p ON r.input_kind<>'material' AND p.name=r.input_name AND p.quality_level=q.quality_level
 GROUP BY r.product_name,q.quality_level
)
SELECT catalog.name AS product_name, q.quality_level,
 CASE WHEN m.root IS NOT NULL AND m.missing_asks=0 THEN round(m.raw_input_cost,2) END AS all_make_raw_input_cost,
 CASE WHEN b.root IS NOT NULL AND b.missing_asks=0 THEN round(b.direct_input_cost,2) END AS all_buy_direct_input_cost,
 m.missing_asks AS all_make_missing_quotes,
 b.missing_asks AS all_buy_missing_quotes,
 CASE WHEN m.root IS NULL THEN 'NO_RECIPE'
 WHEN m.missing_asks>0 THEN 'MISSING_RAW_QUOTE' ELSE 'PRICED' END AS all_make_status,
 CASE WHEN b.root IS NULL THEN 'NO_RECIPE'
 WHEN b.missing_asks>0 THEN 'MISSING_DIRECT_QUOTE' ELSE 'PRICED' END AS all_buy_status
FROM private.game_product_catalog catalog CROSS JOIN qualities q
LEFT JOIN make_scenario m ON m.root=catalog.name AND m.quality_level=q.quality_level
LEFT JOIN buy_scenario b ON b.root=catalog.name AND b.quality_level=q.quality_level
ORDER BY catalog.name,q.quality_level;
