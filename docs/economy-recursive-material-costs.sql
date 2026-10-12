-- Complete recursive *material-only* bill of materials with no cost guessing.
-- The recursion expands intermediate products to active raw-material leaves.
-- Run read-only against production; prices and inventory are NOT mutated.
WITH RECURSIVE expanded AS (
 SELECT r.product_name root,r.input_kind,r.input_name,r.quantity_per_unit qty,
        1 depth, ARRAY[r.product_name] path
 FROM private.game_recipe_catalog r
 UNION ALL
 SELECT e.root,r.input_kind,r.input_name,e.qty*r.quantity_per_unit,
        e.depth+1,e.path||r.product_name
 FROM expanded e
 JOIN private.game_recipe_catalog r ON e.input_kind<>'material' AND r.product_name=e.input_name
 WHERE e.depth<8 AND NOT r.product_name=ANY(e.path)
), raw_costs AS (
 SELECT m.name,m.base_cost,
        min(o.price_per_unit) FILTER(WHERE c.company_type='npc'
          AND o.order_type='sell' AND o.quality_level=1
          AND o.status IN ('open','partially_filled')
          AND o.remaining_quantity>0
          AND (o.expires_at IS NULL OR o.expires_at>now())) npc_q1_price
 FROM public.materials m LEFT JOIN public.market_orders o ON o.material_id=m.id
 LEFT JOIN public.companies c ON c.id=o.company_id
 WHERE m.status='active' GROUP BY m.id,m.name,m.base_cost
), totals AS (
 SELECT e.root,
        sum(e.qty*rc.base_cost) FILTER(WHERE e.input_kind='material') raw_reference_cost,
        sum(e.qty*rc.npc_q1_price) FILTER(WHERE e.input_kind='material') raw_npc_purchase_cost,
        count(*) FILTER(WHERE e.input_kind='material') raw_input_paths,
        count(*) FILTER(WHERE e.input_kind='material' AND rc.npc_q1_price IS NULL) missing_ask_count,
        max(e.depth) max_input_depth
 FROM expanded e LEFT JOIN raw_costs rc ON e.input_kind='material' AND rc.name=e.input_name
 GROUP BY e.root
)
SELECT p.name,p.category,p.suggested_retail_price,t.raw_reference_cost,
       t.raw_npc_purchase_cost,t.raw_input_paths,t.missing_ask_count,t.max_input_depth,
       round(t.raw_npc_purchase_cost/nullif(p.suggested_retail_price,0),3) material_purchase_to_retail_ratio
FROM private.game_product_catalog p LEFT JOIN totals t ON t.root=p.name
ORDER BY material_purchase_to_retail_ratio DESC NULLS LAST,p.name;
