-- Read model data for complaint rendering only from real claimed retail sales.
CREATE OR REPLACE FUNCTION public.get_company_management_health(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_rel public.company_customer_relations%rowtype;
BEGIN
 PERFORM private.assert_company_owner(p_company_id);
 SELECT * INTO v_rel FROM public.company_customer_relations WHERE company_id=p_company_id;
 RETURN jsonb_build_object(
 'satisfaction',coalesce(v_rel.satisfaction,50),'loyalty',coalesce(v_rel.loyalty,40),
 'machines',coalesce((SELECT jsonb_agg(jsonb_build_object('building_id',b.id,'condition',coalesce(m.condition_points,100)) ORDER BY b.id)
 FROM public.company_buildings b LEFT JOIN public.production_machine_health m ON m.building_id=b.id
 WHERE b.company_id=p_company_id AND b.status='active' AND b.building_type_id IN (SELECT id FROM public.building_types WHERE building_category IN ('production','research'))),'[]'::jsonb),
 'complaints',coalesce((SELECT jsonb_agg(jsonb_build_object(
 'id',c.id,'quantity',c.quantity,'quality',c.quality_level,'expires_at',c.expires_at,
 'product_name',p.name,'sale_job_id',j.id,'sale_quantity',j.quantity,
 'refund_cost',round(c.quantity*coalesce(j.total_value,0)/nullif(j.quantity,0),2),
 'replacement_cost',round(c.quantity*coalesce(i.average_unit_cost,0),2),
 'replacement_stock',coalesce(i.quantity,0),
 'situation','Ein Kunde meldet Probleme mit '||coalesce(p.name,'der Ware')||' in Qualitätsstufe Q'||c.quality_level||'. Die beanstandeten '||trunc(c.quantity)||' Einheiten stammen aus einem Verkauf deines Handelsgeschäfts.'
 ) ORDER BY c.opened_at)
 FROM public.customer_complaints c
 JOIN public.retail_sale_jobs j ON j.id=c.sale_job_id AND j.company_id=c.company_id AND j.product_id=c.product_id AND j.quality_level=c.quality_level
 JOIN public.products p ON p.id=c.product_id
 LEFT JOIN LATERAL (SELECT sum(quantity) quantity,min(average_unit_cost) average_unit_cost
 FROM public.inventories i WHERE i.company_id=c.company_id AND i.product_id=c.product_id AND i.quality_level>=c.quality_level) i ON true
 WHERE c.company_id=p_company_id AND c.status='open' AND j.claimed_quantity>0
 ),'[]'::jsonb));
END $function$;
