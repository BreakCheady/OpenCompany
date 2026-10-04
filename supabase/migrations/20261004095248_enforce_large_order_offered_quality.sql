
-- Large-order winners must deliver the quality they actually offered in their bid.
do $patch$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='deliver_large_customer_order'
  limit 1;
  select pg_get_functiondef(v_oid) into v_def;

  v_def:=replace(
    v_def,
    'quality_level>=o.minimum_quality',
    'quality_level>=greatest(o.minimum_quality,b.offered_quality)'
  );
  v_def:=replace(
    v_def,
    'i.quality_level>=o.minimum_quality',
    'i.quality_level>=greatest(o.minimum_quality,b.offered_quality)'
  );

  execute v_def;
end
$patch$;
