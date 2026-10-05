drop policy if exists chat_rooms_select_accessible on public.chat_rooms;
create policy chat_rooms_select_accessible on public.chat_rooms
for select to authenticated
using(is_active=true and (access_level='public' or public.is_staff()));

drop policy if exists "authenticated can read permitted chat messages" on public.chat_messages;
create policy "authenticated can read permitted chat messages" on public.chat_messages
for select to authenticated
using(
  (room_id is not null and exists(
    select 1 from public.chat_rooms r
    where r.id=chat_messages.room_id and r.is_active=true
      and (r.access_level='public' or public.is_staff())
  ))
  or
  (recipient_company_id is not null and exists(
    select 1 from public.companies self_company
    where self_company.owner_user_id=(select auth.uid())
      and self_company.id=any(array[chat_messages.sender_company_id,chat_messages.recipient_company_id])
  ))
);
