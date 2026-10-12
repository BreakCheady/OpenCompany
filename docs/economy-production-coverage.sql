-- OpenCompany economy coverage audit, read-only.
-- Compare catalog RETAIL (not net sales proceeds) with actual observed unit costs.
-- Observed jobs depend on companies, input quality, efficiency and economy phase.
-- No observed job means UNKNOWN profitability, never zero cost.
WITH catalog AS (
 SELECT p.name,p.quality_level,count(*) AS company_product_rows,
        min(p.suggested_retail_price) AS min_catalog_retail_price,
        max(p.suggested_retail_price) AS max_catalog_retail_price,
        count(*) FILTER(WHERE p.required_building_type_id IS NULL) AS missing_building_rows,
        count(*) FILTER(WHERE NOT EXISTS(
          SELECT 1 FROM public.production_recipe_inputs r WHERE r.product_id=p.id
        )) AS no_recipe_rows
 FROM public.products p GROUP BY p.name,p.quality_level
), observed AS (
 SELECT p.name,j.quality_level,count(*) AS observed_jobs,
        count(DISTINCT j.company_id) AS observed_companies,
        min(j.finished_unit_cost) AS min_unit_cost,
        max(j.finished_unit_cost) AS max_unit_cost,
        avg(j.finished_unit_cost) AS mean_unit_cost
 FROM public.production_jobs j JOIN public.products p ON p.id=j.product_id
 WHERE j.output_quantity>0 AND j.finished_unit_cost>0
 GROUP BY p.name,j.quality_level
)
SELECT c.name,c.quality_level,c.company_product_rows,
       c.min_catalog_retail_price,c.max_catalog_retail_price,
       coalesce(o.observed_jobs,0) AS observed_jobs,
       coalesce(o.observed_companies,0) AS observed_companies,
       round(o.min_unit_cost,2) AS min_observed_unit_cost,
       round(o.mean_unit_cost,2) AS mean_observed_unit_cost,
       round(o.max_unit_cost,2) AS max_observed_unit_cost,
       CASE
         WHEN o.observed_jobs IS NULL THEN 'NO_OBSERVED_JOB'
         WHEN c.min_catalog_retail_price<o.max_unit_cost
           THEN 'CATALOG_RETAIL_BELOW_SOME_OBSERVED_COST'
         ELSE 'CATALOG_RETAIL_ABOVE_OBSERVED_COST'
       END AS audit_status,
       c.missing_building_rows,c.no_recipe_rows
FROM catalog c LEFT JOIN observed o
 ON o.name=c.name AND o.quality_level=c.quality_level
ORDER BY c.name,c.quality_level;
