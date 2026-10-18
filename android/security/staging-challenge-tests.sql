-- Staging only. Transaction rolls back all test challenges.
begin;
do $$
declare
  uid uuid := gen_random_uuid();
  x int;
  rejected boolean := false;
  first_used boolean;
  second_used boolean;
  key_hash text;
begin
  for x in 1..5 loop
    key_hash := md5(uid::text || x::text) || md5(x::text || uid::text);
    perform public.issue_test_challenge(uid,key_hash);
  end loop;
  begin
    perform public.issue_test_challenge(uid,repeat('f',64));
  exception when others then
    rejected := position('rate_limited' in SQLERRM) > 0;
  end;
  if not rejected then raise exception 'expected rate limit on sixth request'; end if;

  first_used := public.consume_test_challenge(uid,
    md5(uid::text || '1') || md5('1' || uid::text));
  second_used := public.consume_test_challenge(uid,
    md5(uid::text || '1') || md5('1' || uid::text));
  if first_used is distinct from true or second_used is distinct from false then
    raise exception 'replay test failed';
  end if;
  if has_function_privilege('anon','public.issue_test_challenge(uuid,text)','EXECUTE')
    or has_function_privilege('authenticated','public.issue_test_challenge(uuid,text)','EXECUTE')
    or has_function_privilege('anon','public.cleanup_expired_test_challenges()','EXECUTE') then
    raise exception 'staging challenge RPC exposed';
  end if;
  raise notice 'challenge rate limit, replay and privileges passed';
end $$;
rollback;
