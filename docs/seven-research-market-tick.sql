CREATE OR REPLACE FUNCTION private.research_market_supply_on_tick()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF NEW.key='main' AND NEW.last_run IS DISTINCT FROM OLD.last_run THEN
   PERFORM private.ensure_research_market_supply();
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_research_market_supply_on_tick ON private.npc_market_state;
CREATE TRIGGER trg_research_market_supply_on_tick AFTER UPDATE OF last_run ON private.npc_market_state
FOR EACH ROW EXECUTE FUNCTION private.research_market_supply_on_tick();
SELECT private.ensure_research_market_supply();
