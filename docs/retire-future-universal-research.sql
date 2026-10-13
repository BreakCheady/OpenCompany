CREATE OR REPLACE FUNCTION private.provision_category_research_units_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF NEW.category<>'research' OR (NEW.name='Forschungseinheit' AND NEW.category='research') THEN
  PERFORM private.ensure_category_research_units(NEW.company_id);
 END IF;
 IF NEW.name='Forschungseinheit' AND NEW.category='research' THEN
  UPDATE public.products SET status='discontinued' WHERE id=NEW.id AND status<>'discontinued';
 END IF;
 RETURN NEW;
END $$;