-- OpenCompany 0.10.281: decision-center read RPC must not start a second management cycle
create or replace function public.get_management_decision_center(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile jsonb;
  v_history jsonb;
  v_effects jsonb;
begin
  perform private.assert_company_owner(p_company_id);

  insert into public.management_profiles(company_id) values(p_company_id)
  on conflict(company_id) do nothing;

  select to_jsonb(p) into v_profile
  from public.management_profiles p where p.company_id=p_company_id;

  select coalesce(jsonb_agg(to_jsonb(d) order by d.resolved_at desc),'[]'::jsonb)
  into v_history
  from (
    select * from public.management_decisions
    where company_id=p_company_id and status='resolved'
    order by resolved_at desc nulls last
    limit 25
  ) d;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'effect_key',e.effect_key,'effect_value',e.effect_value,
    'description',e.description,'starts_at',e.starts_at,'ends_at',e.ends_at
  ) order by e.ends_at),'[]'::jsonb)
  into v_effects
  from public.management_decision_effects e
  where e.company_id=p_company_id and e.starts_at<=now() and e.ends_at>now();

  return jsonb_build_object(
    'profile',coalesce(v_profile,'{}'::jsonb),
    'history',v_history,
    'effects',v_effects,
    'metrics',private.management_decision_metrics(p_company_id)
  );
end
$$;
