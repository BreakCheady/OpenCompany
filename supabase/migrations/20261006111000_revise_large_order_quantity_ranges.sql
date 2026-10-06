-- OpenCompany 0.10.258: revised large-customer order quantity ranges
do $patch$
declare
  v_def text;
begin
  select pg_get_functiondef('private.generate_large_customer_order_if_due()'::regprocedure)
  into v_def;

  v_def := replace(v_def,
    'v_qty := 50000 + 5000 * floor(random()*51);',
    'v_qty := 75000 + 7500 * floor(random()*51);'
  );
  v_def := replace(v_def,
    'v_qty := 2500 + 500 * floor(random()*46);',
    'v_qty := 10000 + 1000 * floor(random()*41);'
  );
  v_def := replace(v_def,
    'v_qty := 5000 + 2500 * floor(random()*29);',
    'v_qty := 25000 + 5000 * floor(random()*26);'
  );
  v_def := replace(v_def,
    'v_qty := 10000 + 5000 * floor(random()*29);',
    'v_qty := 50000 + 5000 * floor(random()*41);'
  );

  execute v_def;
end
$patch$;
