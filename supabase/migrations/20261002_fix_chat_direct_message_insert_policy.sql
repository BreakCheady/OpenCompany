drop policy if exists "company owners can send chat messages" on public.chat_messages;

create policy "company owners can send chat messages"
on public.chat_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.companies sender
    where sender.id = chat_messages.sender_company_id
      and sender.owner_user_id = (select auth.uid())
      and sender.status = 'active'
      and sender.company_type = 'player'
  )
  and
  (
    (
      room_id is not null
      and recipient_company_id is null
      and exists (
        select 1
        from public.chat_rooms r
        where r.id = chat_messages.room_id
          and r.is_active = true
      )
    )
    or
    (
      room_id is null
      and recipient_company_id is not null
    )
  )
);
