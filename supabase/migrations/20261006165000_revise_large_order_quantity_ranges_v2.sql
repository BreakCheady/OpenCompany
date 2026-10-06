-- OpenCompany 0.10.268: revise large-customer order quantity ranges

do $patch$
declare
  v_def text;
begin
  select pg_get_functiondef('private.generate_large_customer_order_if_due()'::regprocedure)
  into v_def;

  v_def := replace(v_def,
    'v_qty := 50000 + 5000 * floor(random()*51);',
    'v_qty := 25000 + 5000 * floor(random()*21);'
  );
  v_def := replace(v_def,
    'v_qty := 25000 + 5000 * floor(random()*26);',
    'v_qty := 15000 + 3000 * floor(random()*21);'
  );
  v_def := replace(v_def,
    'v_qty := 50000 + 10000 * floor(random()*26);',
    'v_qty := 20000 + 4000 * floor(random()*21);'
  );

  execute v_def;
end
$patch$;
