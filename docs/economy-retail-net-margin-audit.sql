-- READ-ONLY retail margin audit based on recorded job-start cost snapshot.
-- Each row represents accounting reference, not a recalculation of final payout.
-- Historical jobs without complete snapshots are INCOMPLETE, never zero cost.
WITH snapshot AS (
 SELECT j.id,j.company_id,j.product_id,j.quality_level,j.quantity,j.total_value,
        j.status,j.started_at,
        CASE WHEN j.start_snapshot->>'operatingCostBasis' ~ '^[0-9]+(\.[0-9]+)?$'
          THEN (j.start_snapshot->>'operatingCostBasis')::numeric END AS inventory_cost_basis,
        CASE WHEN j.start_snapshot->>'operatingCost' ~ '^[0-9]+(\.[0-9]+)?$'
          THEN (j.start_snapshot->>'operatingCost')::numeric END AS operating_cost,
        j.start_snapshot->>'unitPrice' AS quoted_unit_price
 FROM public.retail_sale_jobs j
)
SELECT p.name,s.quality_level,s.started_at,s.status,s.quantity,s.total_value,
       s.inventory_cost_basis,s.operating_cost,
       CASE WHEN s.inventory_cost_basis IS NULL OR s.operating_cost IS NULL
            THEN NULL
            ELSE round(s.total_value-s.inventory_cost_basis-s.operating_cost,2)
       END reference_contribution,
       CASE WHEN s.inventory_cost_basis IS NULL OR s.operating_cost IS NULL
            THEN 'INCOMPLETE_COST_SNAPSHOT'
            WHEN s.total_value<s.inventory_cost_basis+s.operating_cost
            THEN 'NEGATIVE_REFERENCE_CONTRIBUTION'
            ELSE 'NONNEGATIVE_REFERENCE_CONTRIBUTION'
       END audit_status
FROM snapshot s JOIN public.products p ON p.id=s.product_id
ORDER BY s.started_at DESC;
