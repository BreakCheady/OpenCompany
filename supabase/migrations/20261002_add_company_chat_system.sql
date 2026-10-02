create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  icon text not null default '💬',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.chat_rooms(id) on delete cascade,
  sender_company_id uuid not null references public.companies(id) on delete cascade,
  recipient_company_id uuid references public.companies(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint chat_messages_target_check check (
    (room_id is not null and recipient_company_id is null)
    or
    (room_id is null and recipient_company_id is not null)
  ),
  constraint chat_messages_body_length_check check (
    char_length(btrim(body)) between 1 and 1000
  ),
  constraint chat_messages_no_self_dm_check check (
    recipient_company_id is null or recipient_company_id <> sender_company_id
  )
);

create index if not exists chat_messages_room_created_idx
  on public.chat_messages(room_id, created_at desc)
  where room_id is not null;

create index if not exists chat_messages_sender_recipient_created_idx
  on public.chat_messages(sender_company_id, recipient_company_id, created_at desc)
  where recipient_company_id is not null;

create index if not exists chat_messages_recipient_sender_created_idx
  on public.chat_messages(recipient_company_id, sender_company_id, created_at desc)
  where recipient_company_id is not null;

alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "authenticated can read active chat rooms" on public.chat_rooms;
create policy "authenticated can read active chat rooms"
on public.chat_rooms
for select
to authenticated
using (is_active = true);

drop policy if exists "authenticated can read permitted chat messages" on public.chat_messages;
create policy "authenticated can read permitted chat messages"
on public.chat_messages
for select
to authenticated
using (
  (
    room_id is not null
    and exists (
      select 1
      from public.chat_rooms r
      where r.id = chat_messages.room_id
        and r.is_active = true
    )
  )
  or
  (
    recipient_company_id is not null
    and exists (
      select 1
      from public.companies self_company
      where self_company.owner_user_id = (select auth.uid())
        and self_company.id in (chat_messages.sender_company_id, chat_messages.recipient_company_id)
    )
  )
);

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
      and exists (
        select 1
        from public.companies recipient
        where recipient.id = chat_messages.recipient_company_id
          and recipient.status = 'active'
          and recipient.company_type = 'player'
      )
    )
  )
);

revoke all on public.chat_rooms from anon;
revoke all on public.chat_messages from anon;
grant select on public.chat_rooms to authenticated;
grant select, insert on public.chat_messages to authenticated;

insert into public.chat_rooms(slug,name,icon,sort_order,is_active)
values
  ('allgemein','Allgemein','💬',10,true),
  ('handel','Handel','💲',20,true),
  ('hilfe','Hilfe','❓',30,true),
  ('spielthemen','Spielthemen','🏢',40,true)
on conflict(slug) do update
set name=excluded.name,
    icon=excluded.icon,
    sort_order=excluded.sort_order,
    is_active=true;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end
$$;
