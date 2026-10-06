create or replace function private.notify_failed_large_order_status()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='failed' and old.status is distinct from new.status then
    insert into public.chat_messages(sender_company_id,recipient_company_id,body)
    select
      '00000000-0000-4000-8000-000000000001'::uuid,
      c.id,
      'Boss, die Deadline für den Großauftrag "'||new.item_name||'" von '||new.customer_name||
      '" wurde überschritten. Geliefert: '||trim(to_char(new.delivered_quantity,'FM999999999990.##'))||
      ' von '||trim(to_char(new.quantity,'FM999999999990.##'))||
      ' Einheiten. Der Auftrag gilt als nicht erfüllt.'
    from public.companies c
    where c.id=new.awarded_company_id
      and c.company_type='player'
      and c.owner_user_id is not null;
  end if;
  return new;
end
$$;
