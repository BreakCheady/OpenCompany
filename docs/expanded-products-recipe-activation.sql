UPDATE public.products p
SET status='development'
WHERE p.name IN ('Sportcoupé','Industrie-Kühlmittel','Leistungsakku','Stahlbeton-Fertigteile',
'Sicherheitsdrohne','Schnellladestation','Sportgetränk','Hafermehl','Kühlcontainer',
'Montageroboter','Wanderschuhe') AND p.status='active'
AND NOT EXISTS(SELECT 1 FROM public.production_recipe_inputs r WHERE r.product_id=p.id);
CREATE OR REPLACE FUNCTION private.activate_cloned_product_after_recipe()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 UPDATE public.products p SET status='active'
 WHERE p.id=NEW.product_id AND p.status='development'
 AND p.name IN ('Sportcoupé','Industrie-Kühlmittel','Leistungsakku','Stahlbeton-Fertigteile',
 'Sicherheitsdrohne','Schnellladestation','Sportgetränk','Hafermehl','Kühlcontainer',
 'Montageroboter','Wanderschuhe')
 AND EXISTS(SELECT 1 FROM public.production_recipe_inputs r WHERE r.product_id=p.id);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_activate_cloned_product_recipe ON public.production_recipe_inputs;
CREATE TRIGGER trg_activate_cloned_product_recipe AFTER INSERT ON public.production_recipe_inputs
FOR EACH ROW EXECUTE FUNCTION private.activate_cloned_product_after_recipe();