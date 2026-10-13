-- Deployed 2026-10-13. Existing quality-2+ product upgrades reset to Q1.
UPDATE public.products SET quality_level=1,research_units_progress=0
WHERE (category='research' OR name='Transportcontainer') AND quality_level<>1;
CREATE OR REPLACE FUNCTION private.block_special_quality_upgrades()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
 IF (NEW.category='research' OR NEW.name='Transportcontainer') AND NEW.quality_level<>1 THEN
  RAISE EXCEPTION 'Nur Qualitätsstufe Q1 für Forschungseinheiten und Transportcontainer';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_block_special_quality_upgrades ON public.products;
CREATE TRIGGER trg_block_special_quality_upgrades BEFORE INSERT OR UPDATE OF quality_level,category,name
ON public.products FOR EACH ROW EXECUTE FUNCTION private.block_special_quality_upgrades();
CREATE OR REPLACE FUNCTION private.q1_only_trade_or_stock()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
 IF NEW.product_id IS NOT NULL AND NEW.quality_level<>1 AND EXISTS (
  SELECT 1 FROM public.products p WHERE p.id=NEW.product_id
  AND (p.category='research' OR p.name='Transportcontainer')) THEN
   RAISE EXCEPTION 'Forschungseinheiten und Transportcontainer sind ausschließlich Q1';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_q1_only_trade ON public.market_orders;
CREATE TRIGGER trg_q1_only_trade BEFORE INSERT OR UPDATE OF product_id,quality_level
ON public.market_orders FOR EACH ROW EXECUTE FUNCTION private.q1_only_trade_or_stock();
DROP TRIGGER IF EXISTS trg_q1_only_stock ON public.inventories;
CREATE TRIGGER trg_q1_only_stock BEFORE INSERT OR UPDATE OF product_id,quality_level
ON public.inventories FOR EACH ROW EXECUTE FUNCTION private.q1_only_trade_or_stock();
-- Retire historic Q2–Q5 sell listings; no user purchase history is deleted.
UPDATE public.market_orders o SET status='expired'
FROM public.products p WHERE p.id=o.product_id
 AND (p.category='research' OR p.name='Transportcontainer')
 AND o.quality_level<>1 AND o.order_type='sell'
 AND o.status IN ('open','partially_filled');
-- Reprice open NPC Q1 quotes with the new regulated pricing trigger.
UPDATE public.market_orders o SET price_per_unit=o.price_per_unit
FROM public.products p JOIN public.companies c ON c.id=p.company_id
WHERE p.id=o.product_id AND c.id=o.company_id AND c.company_type='npc'
 AND (p.category='research' OR p.name='Transportcontainer')
 AND o.quality_level=1 AND o.order_type='sell' AND o.status IN ('open','partially_filled');
