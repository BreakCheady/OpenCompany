drop policy if exists "company owners can send chat messages" on public.chat_messages;
create policy "company owners can send chat messages" on public.chat_messages
for insert to authenticated
with check(
  not private.user_is_blocked((select auth.uid()))
  and exists(
    select 1 from public.companies sender
    where sender.id=chat_messages.sender_company_id
      and sender.owner_user_id=(select auth.uid())
      and sender.status='active' and sender.company_type='player'
  )
  and (
    (
      room_id is not null and recipient_company_id is null
      and exists(
        select 1 from public.chat_rooms r
        where r.id=chat_messages.room_id and r.is_active=true
          and (r.access_level='public' or public.is_staff())
      )
    )
    or
    (
      room_id is null and recipient_company_id is not null
      and exists(
        select 1 from public.companies recipient
        where recipient.id=chat_messages.recipient_company_id
          and recipient.status='active' and recipient.company_type='player'
      )
    )
  )
);
