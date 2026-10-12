-- READ-ONLY raw material price scenarios; 32 inputs x 3 price factors.
SELECT m.name,m.unit,m.base_cost,scenario.factor AS material_price_factor,
       round(m.base_cost*scenario.factor,4) AS modeled_unit_price
FROM public.materials m
CROSS JOIN (VALUES (0.75::numeric),(1::numeric),(1.25::numeric)) scenario(factor)
WHERE m.status='active'
ORDER BY m.name,scenario.factor;