-- READ ONLY: all 94 catalog products x Q1..Q5 x building levels 1..5.
-- Neutral machine/economy/manager factors; actual production and sales not posted.
WITH catalog AS (
 SELECT DISTINCT name,base_production_rate FROM public.products
), costs AS (
 SELECT c.name,c.base_production_rate,q.q quality_level,
 private.simulated_product_quality_unit_cost(c.name,q.q) unit_cost,
 private.simulated_product_quality_unit_cost(c.name,1) q1_unit_cost
 FROM catalog c CROSS JOIN generate_series(1,5) q(q)
), prices AS (
 SELECT *,private.market_balanced_quality_price(unit_cost,q1_unit_cost,quality_level) market_price
 FROM costs
)
SELECT p.name,p.quality_level,building.level AS building_level,
 private.building_level_multiplier(building.level) building_multiplier,
 (floor(greatest(0.01,floor(p.base_production_rate*private.building_level_multiplier(building.level))*private.economy_production_output_factor())*24)/24) units_per_hour,
 24 AS production_hours,p.unit_cost,p.market_price,
 round((p.market_price*0.95-p.unit_cost),4) profit_per_unit_after_fee,
 round((p.market_price*0.95-p.unit_cost)*
  (floor(greatest(0.01,floor(p.base_production_rate*private.building_level_multiplier(building.level))*private.economy_production_output_factor())*24)/24),4) profit_per_hour_after_fee
FROM prices p CROSS JOIN generate_series(1,5) building(level)
ORDER BY p.name,p.quality_level,building.level;
