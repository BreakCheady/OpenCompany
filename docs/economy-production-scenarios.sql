-- OpenCompany Q1-Q5 production scenario audit. READ ONLY.
-- Two lower-bound recipe + configured unit labor scenarios, NOT full cost.
-- Same-quality input assumption has not been validated against production engine.
-- NPC best asks ignore order depth and quality availability beyond exact match.
WITH RECURSIVE
qualities AS (SELECT generate_series(1,5) AS quality_level),
quotes AS (
 SELECT o.quality_level,o.material_id,o.product_id,min(o.price_per_unit) AS ask
 FROM public.market_orders o JOIN public.companies c ON c.id=o.company_id
 WHERE c.company_type='npc' AND o.order_type='sell'
   AND o.status IN ('open','partially_filled') AND o.remaining_quantity>0
   AND (o.expires_at IS NULL OR o.expires_at>now())
 GROUP BY o.quality_level,o.material_id,o.product_id
),
materials AS (
 SELECT m.name,q.quality_level,min(o.ask) ask
 FROM public.materials m CROSS JOIN qualities q
 LEFT JOIN quotes o ON o.material_id=m.id AND o.quality_level=q.quality_level
 WHERE m.status='active' GROUP BY m.name,q.quality_level
),
products AS (
 SELECT p.name,q.quality_level,min(o.ask) ask
 FROM public.products p CROSS JOIN qualities q
 LEFT JOIN quotes o ON o.product_id=p.id AND o.quality_level=q.quality_level
 GROUP BY p.name,q.quality_level
),
catalog AS (
 SELECT p.name,p.suggested_retail_price,bt.code building_code,
 bt.labor_cost_per_unit AS configured_unit_labor,
 bt.base_units_per_hour AS base_throughput,
 p.base_production_rate
 FROM private.game_product_catalog p
 LEFT JOIN public.building_types bt ON bt.code=p.building_code
),
expanded AS (
 SELECT c.name root,c.name part,q.quality_level,1::numeric multiplier,
 ARRAY[c.name]::text[] visited,0 depth
 FROM catalog c CROSS JOIN qualities q
 UNION ALL
 SELECT e.root,r.input_name,e.quality_level,e.multiplier*r.quantity_per_unit,
 e.visited||r.input_name,e.depth+1
 FROM expanded e JOIN private.game_recipe_catalog r ON r.product_name=e.part
 WHERE r.input_kind='product' AND NOT r.input_name=ANY(e.visited) AND e.depth<12
),
chain AS (
 SELECT e.root,e.quality_level,
 sum(e.multiplier*c.configured_unit_labor) AS chain_configured_labor,
 count(*) FILTER (WHERE c.configured_unit_labor IS NULL) missing_buildings,
 count(*) AS production_stages
 FROM expanded e LEFT JOIN catalog c ON c.name=e.part
 GROUP BY e.root,e.quality_level
),
raw_cost AS (
 SELECT e.root,e.quality_level,
 sum(e.multiplier*r.quantity_per_unit*m.ask) raw_cost,
 count(*) FILTER (WHERE m.ask IS NULL) missing_raw_asks,
 count(*) line_count
 FROM expanded e JOIN private.game_recipe_catalog r ON r.product_name=e.part AND r.input_kind='material'
 LEFT JOIN materials m ON m.name=r.input_name AND m.quality_level=e.quality_level
 GROUP BY e.root,e.quality_level
),
direct_cost AS (
 SELECT r.product_name root,q.quality_level,
 sum(r.quantity_per_unit*CASE WHEN r.input_kind='material' THEN m.ask ELSE p.ask END) direct_input_cost,
 count(*) FILTER (WHERE CASE WHEN r.input_kind='material' THEN m.ask ELSE p.ask END IS NULL) missing_direct_asks
 FROM private.game_recipe_catalog r CROSS JOIN qualities q
 LEFT JOIN materials m ON r.input_kind='material' AND m.name=r.input_name AND m.quality_level=q.quality_level
 LEFT JOIN products p ON r.input_kind='product' AND p.name=r.input_name AND p.quality_level=q.quality_level
 GROUP BY r.product_name,q.quality_level
)
SELECT c.name product_name,q.quality_level,c.building_code,c.suggested_retail_price,
 c.configured_unit_labor,c.base_throughput,c.base_production_rate,
 ch.production_stages,
 CASE WHEN rc.line_count>0 AND rc.missing_raw_asks=0 AND ch.missing_buildings=0
 THEN round(rc.raw_cost+ch.chain_configured_labor,2) END
 AS all_make_inputs_plus_configured_labor,
 CASE WHEN dc.root IS NOT NULL AND dc.missing_direct_asks=0 AND c.configured_unit_labor IS NOT NULL
 THEN round(dc.direct_input_cost+c.configured_unit_labor,2) END
 AS direct_buy_inputs_plus_configured_labor,
 CASE WHEN rc.line_count>0 AND rc.missing_raw_asks=0 AND ch.missing_buildings=0
 THEN round(c.suggested_retail_price-rc.raw_cost-ch.chain_configured_labor,2) END
 AS make_spread_vs_reference_before_other_costs,
 CASE WHEN dc.root IS NOT NULL AND dc.missing_direct_asks=0 AND c.configured_unit_labor IS NOT NULL
 THEN round(c.suggested_retail_price-dc.direct_input_cost-c.configured_unit_labor,2) END
 AS buy_spread_vs_reference_before_other_costs,
 CASE WHEN dc.root IS NULL THEN 'NO_RECIPE'
 WHEN rc.missing_raw_asks>0 OR dc.missing_direct_asks>0 THEN 'MISSING_ASK'
 WHEN ch.missing_buildings>0 THEN 'MISSING_BUILDING'
 ELSE 'MODELED' END AS audit_status
FROM catalog c CROSS JOIN qualities q
LEFT JOIN chain ch ON ch.root=c.name AND ch.quality_level=q.quality_level
LEFT JOIN raw_cost rc ON rc.root=c.name AND rc.quality_level=q.quality_level
LEFT JOIN direct_cost dc ON dc.root=c.name AND dc.quality_level=q.quality_level
ORDER BY c.name,q.quality_level;
