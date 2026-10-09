create or replace function public.get_management_finance_budget_breakdown(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_company_owner(p_company_id);
 return private.management_finance_budget_breakdown(p_company_id);
end $$;
revoke all on function public.get_management_finance_budget_breakdown(uuid) from public,anon;
grant execute on function public.get_management_finance_budget_breakdown(uuid) to authenticated;
