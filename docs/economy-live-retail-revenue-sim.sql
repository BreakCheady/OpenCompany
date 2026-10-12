-- READ ONLY: executes the actual STABLE server-side retail revenue function.
-- Each scenario uses an observed production unit-cost as input, 3 cost changes
-- and 5 offer prices relative to a company-specific average price.
-- No retail jobs or transactions are created.
WITH observed AS (
  SELECT DISTINCT ON (j.company_id,j.product_id,j.quality_level)
    j.company_id,j.product_id,j.quality_level,j.finished_unit_cost,p.category
  FROM public.production_jobs j
  JOIN public.products p ON p.id=j.product_id
  WHERE j.finished_unit_cost>0
  ORDER BY j.company_id,j.product_id,j.quality_level,j.started_at DESC
), cases AS (
  SELECT j.*,cost_multiplier.factor AS cost_factor,
    price_multiplier.factor AS price_factor,
    private.retail_average_price(j.finished_unit_cost*cost_multiplier.factor,j.category)
      * private.specialization_factor(j.company_id,'retail_price_effect',j.category) AS average_price
  FROM observed j
  CROSS JOIN (VALUES (0.85::numeric),(1::numeric),(1.15::numeric)) cost_multiplier(factor)
  CROSS JOIN (VALUES (0.8::numeric),(0.95::numeric),(1::numeric),
                      (1.05::numeric),(1.15::numeric)) price_multiplier(factor)
), evaluated AS (
  SELECT c.*,
    round(c.average_price*c.price_factor,2) AS offered_price,
    private.retail_effective_unit_revenue_company(
      c.company_id,c.finished_unit_cost*c.cost_factor,
      round(c.average_price*c.price_factor,2),c.category
    ) AS effective_unit_revenue
  FROM cases c
)
SELECT product_id,quality_level,cost_factor,price_factor,offered_price,
       round(finished_unit_cost*cost_factor,4) modeled_inventory_cost,
       effective_unit_revenue,
       round(effective_unit_revenue-finished_unit_cost*cost_factor,4)
         AS contribution_before_retail_overhead,
       CASE WHEN effective_unit_revenue<=finished_unit_cost*cost_factor
            THEN 'NONPOSITIVE_BEFORE_OVERHEAD'
            ELSE 'POSITIVE_BEFORE_OVERHEAD' END assessment
FROM evaluated
ORDER BY product_id,quality_level,cost_factor,price_factor;
