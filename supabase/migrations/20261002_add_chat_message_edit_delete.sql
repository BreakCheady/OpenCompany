alter table public.chat_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

drop policy if exists "company owners can update own chat messages" on public.chat_messages;

create policy "company owners can update own chat messages"
on public.chat_messages
for update
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.companies sender
    where sender.id = chat_messages.sender_company_id
      and sender.owner_user_id = (select auth.uid())
      and sender.status = 'active'
      and sender.company_type = 'player'
  )
)
with check (
  exists (
    select 1
    from public.companies sender
    where sender.id = chat_messages.sender_company_id
      and sender.owner_user_id = (select auth.uid())
      and sender.status = 'active'
      and sender.company_type = 'player'
  )
);

revoke update, delete, truncate, references, trigger
  on public.chat_messages
  from authenticated;

grant update(body, edited_at, deleted_at)
  on public.chat_messages
  to authenticated;
