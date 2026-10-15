-- Purge only expired, unreferenced NPC market quotes on a 15-minute cadence.
-- Preserve player orders, filled orders, trade history and cost-basis references.
CREATE OR REPLACE FUNCTION private.cleanup_expired_npc_market_offers(p_limit integer DEFAULT 20000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_deleted integer;
BEGIN
  WITH candidates AS MATERIALIZED (
    SELECT o.id
    FROM public.market_orders o
    JOIN public.companies c ON c.id=o.company_id
    WHERE c.company_type='npc'
      AND o.status='expired'
      AND o.created_at < now()-interval '1 hour'
      AND NOT EXISTS (SELECT 1 FROM public.market_trades t WHERE t.order_id=o.id)
      AND NOT EXISTS (SELECT 1 FROM private.market_order_product_cost_basis b WHERE b.order_id=o.id)
    ORDER BY o.created_at,o.id
    LIMIT greatest(0,least(coalesce(p_limit,20000),50000))
  ), deleted AS (
    DELETE FROM public.market_orders o USING candidates v
    WHERE o.id=v.id
    RETURNING o.id
  )
  SELECT count(*) INTO v_deleted FROM deleted;
  RETURN v_deleted;
END $function$;
REVOKE ALL ON FUNCTION private.cleanup_expired_npc_market_offers(integer) FROM PUBLIC;
SELECT cron.schedule(
  'opencompany-expired-npc-orders-cleanup',
  '5,20,35,50 * * * *',
  'SELECT private.cleanup_expired_npc_market_offers(20000);'
);
