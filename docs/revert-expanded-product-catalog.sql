-- Applied in production, 2026-10-13.
-- Withdraw the eleven unwanted blueprint products, keeping the category-specific
-- research goods introduced in V0.10.343.
DROP TRIGGER IF EXISTS trg_product_expansion_on_products ON public.products;
DROP TRIGGER IF EXISTS trg_product_expansion_on_recipes ON public.production_recipe_inputs;
DROP TRIGGER IF EXISTS trg_activate_cloned_product_recipe ON public.production_recipe_inputs;
DROP FUNCTION IF EXISTS private.provision_expanded_catalog_trigger();
DROP FUNCTION IF EXISTS private.activate_cloned_product_after_recipe();
DROP FUNCTION IF EXISTS private.ensure_expanded_product_catalog(uuid);
DELETE FROM public.products WHERE name=ANY(ARRAY[
'Sportcoupé','Industrie-Kühlmittel','Leistungsakku','Stahlbeton-Fertigteile',
'Sicherheitsdrohne','Schnellladestation','Sportgetränk','Hafermehl',
'Kühlcontainer','Montageroboter','Wanderschuhe']);
