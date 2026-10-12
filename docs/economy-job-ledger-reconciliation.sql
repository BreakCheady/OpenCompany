-- READ-ONLY cost ledger reconciliation against the actual production formula.
-- For each job: finished_unit_cost ~= (production_cash_cost + input_purchase_basis * economy_factor) / output_quantity.
-- The comparison works only where component consumptions have been recorded.
WITH inputs AS (
 SELECT job_id,COUNT(*) AS input_rows,
        SUM(quantity * average_unit_cost) AS cost
 FROM private.production_job_input_consumptions GROUP BY job_id
), reconciled AS (
 SELECT j.id,j.started_at,p.name,j.quality_level,
        j.output_quantity,j.finished_unit_cost,j.production_cash_cost,
        COALESCE(i.input_rows,0) AS input_rows,
        COALESCE(i.cost,0) AS input_basis,
        COALESCE(NULLIF(j.start_snapshot->>'economyProductionCostFactor','')::numeric,1) AS economy_factor,
        (j.production_cash_cost + COALESCE(i.cost,0)*
           COALESCE(NULLIF(j.start_snapshot->>'economyProductionCostFactor','')::numeric,1))
           / NULLIF(j.output_quantity,0) AS reconstructed_unit_cost
 FROM public.production_jobs j
 JOIN public.products p ON p.id=j.product_id
 LEFT JOIN inputs i ON i.job_id=j.id
 WHERE j.output_quantity>0 AND j.finished_unit_cost>0
)
SELECT name,quality_level,started_at,input_rows,output_quantity,
       round(finished_unit_cost,4) recorded_unit_cost,
       round(reconstructed_unit_cost,4) reconstructed_unit_cost,
       round(finished_unit_cost-reconstructed_unit_cost,4) difference,
       CASE
         WHEN abs(finished_unit_cost-reconstructed_unit_cost)<=0.01 THEN 'MATCH'
         WHEN input_rows=0 THEN 'HISTORICAL_INPUT_RECORD_MISSING'
         ELSE 'INVESTIGATE'
       END audit_status
FROM reconciled ORDER BY started_at DESC,name;
