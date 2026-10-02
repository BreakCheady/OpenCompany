revoke all on public.company_private_notes from authenticated;

grant select, insert, update, delete
  on public.company_private_notes
  to authenticated;

create index if not exists company_private_notes_target_company_idx
  on public.company_private_notes(target_company_id);
