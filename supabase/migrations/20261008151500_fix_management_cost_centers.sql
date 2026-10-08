-- OpenCompany 0.10.271: correct management cost-center presentation

do $patch$
declare
  v_def text;
begin
  select pg_get_functiondef('public.get_management_overview(uuid)'::regprocedure)
  into v_def;

  v_def := replace(
    v_def,
    'sum(case when amount>0 then amount else 0 end) income,' || E'\n' ||
    '      sum(case when amount<0 then abs(amount) else 0 end) costs',
    'sum(case when amount>0 and transaction_type<>''manager_saving'' then amount else 0 end)' ||
    ' + sum(case when transaction_type=''market_fee'' and amount<0 then abs(amount) else 0 end) income,' || E'\n' ||
    '      greatest(0,' ||
    'sum(case when amount<0 and transaction_type<>''market_fee'' then abs(amount) else 0 end)' ||
    '-sum(case when transaction_type=''manager_saving'' and amount>0 then amount else 0 end)) costs'
  );

  execute v_def;
end
$patch$;
