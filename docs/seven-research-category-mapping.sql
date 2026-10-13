CREATE OR REPLACE FUNCTION private.category_research_unit_name(p_category text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
SELECT CASE
 WHEN p_category IN ('food','food_component') THEN 'Lebensmittel-Forschung'
 WHEN p_category='construction' THEN 'Bau-Forschung'
 WHEN p_category IN ('electronics','component') THEN 'Elektronik-Forschung'
 WHEN p_category IN ('automotive','machinery','logistics') THEN 'Automobil-Forschung'
 WHEN p_category='chemical' THEN 'Chemie-Forschung'
 WHEN p_category='textile' THEN 'Textil-Forschung'
 WHEN p_category='energy' THEN 'Energie-Forschung'
 ELSE NULL END
$$;
