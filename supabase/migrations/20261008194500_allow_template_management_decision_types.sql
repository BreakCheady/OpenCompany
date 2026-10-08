-- OpenCompany 0.10.281: allow template-driven management decision types
alter table public.management_decisions
  drop constraint if exists management_decisions_decision_type_check;

alter table public.management_decisions
  add constraint management_decisions_decision_type_check
  check (length(trim(decision_type))>0);
