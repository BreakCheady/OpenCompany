-- READ ONLY: every active raw material, qualities 1-5.
-- Uses game material base_cost and deployed quality multiplier.
WITH scenarios AS (
 SELECT m.name,m.unit,q.quality_level,m.base_cost,
 round(m.base_cost*private.quality_multiplier(q.quality_level),4) modeled_quality_cost,
 private.market_balanced_quality_price(
 m.base_cost*private.quality_multiplier(q.quality_level),
 m.base_cost,q.quality_level) market_price
 FROM public.materials m CROSS JOIN generate_series(1,5) q(quality_level)
 WHERE m.status='active'
)
SELECT *,round(market_price*0.95-modeled_quality_cost,4) profit_after_market_fee,
 CASE WHEN market_price*0.95>modeled_quality_cost
 THEN 'PROFITABLE' ELSE 'BALANCE_ERROR' END assessment
FROM scenarios ORDER BY name,quality_level;
