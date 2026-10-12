-- OpenCompany: historical job cost calibration, READ ONLY.
-- Never interpret cash cost plus finished unit cost as additive: the latter is a recorded total.
-- Group at exact product/quality/building-type granularity; no imputation for missing jobs.
WITH samples AS (
 SELECT p.name product_name,j.quality_level,bt.code building_code,
 j.finished_unit_cost,j.production_cash_cost/nullif(j.output_quantity,0) cash_per_unit,
 j.hours/nullif(j.output_quantity,0) hours_per_unit,j.units_per_hour,
 bt.labor_cost_per_unit,bt.base_units_per_hour,
 j.output_quantity,
 j.start_snapshot
 FROM public.production_jobs j
 JOIN public.products p ON p.id=j.product_id
 LEFT JOIN public.company_buildings b ON b.id=j.building_id
 LEFT JOIN public.building_types bt ON bt.id=b.building_type_id
 WHERE j.finished_unit_cost>0
)
SELECT product_name,quality_level,building_code,
 count(*) job_count,
 round(avg(finished_unit_cost),2) mean_recorded_unit_cost,
 round(avg(cash_per_unit),2) mean_cash_per_unit,
 round(avg(finished_unit_cost-cash_per_unit),2) mean_recorded_non_cash_component,
 round(avg(hours_per_unit),4) mean_hours_per_unit,
 round(avg(units_per_hour),3) mean_units_per_hour,
 min(labor_cost_per_unit) building_labor_cost_per_unit,
 min(base_units_per_hour) building_base_units_per_hour,
 count(*) FILTER (WHERE output_quantity<=0 OR cash_per_unit IS NULL OR hours_per_unit IS NULL) invalid_unit_denominators,
 count(*) FILTER (WHERE building_code IS NULL) missing_building_matches,
 count(*) FILTER (WHERE cash_per_unit>finished_unit_cost) cash_exceeds_recorded_cost
FROM samples
GROUP BY product_name,quality_level,building_code
ORDER BY product_name,quality_level,building_code;
