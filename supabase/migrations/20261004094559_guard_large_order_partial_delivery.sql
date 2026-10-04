
-- Guard partial large-order deliveries against over-delivery.
do $patch$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='deliver_large_customer_order'
  limit 1;
  select pg_get_functiondef(v_oid) into v_def;
  if position('Liefermenge überschreitet die offene Restmenge' in v_def)=0 then
    v_def:=replace(
      v_def,
      'if o.delivery_deadline<=now() then raise exception ''Lieferfrist ist abgelaufen''; end if;',
      'if o.delivery_deadline<=now() then raise exception ''Lieferfrist ist abgelaufen''; end if;
  if p_quantity>o.quantity-o.delivered_quantity then
    raise exception ''Liefermenge überschreitet die offene Restmenge'';
  end if;'
    );
    execute v_def;
  end if;
end
$patch$;
