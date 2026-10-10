-- Every newly inserted complaint creates a distinct PA chat message.
create or replace function private.notify_new_customer_complaint()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.management_send_pa(
   new.company_id,
   'Boss, eine neue Kundenreklamation ist eingetroffen: '
   ||trunc(new.quantity)||' Einheiten in Q'||new.quality_level
   ||'. Bitte bearbeite sie innerhalb von 24 Stunden im Managementbereich (Reklamationen).'
 );
 return new;
end $$;
drop trigger if exists trg_notify_new_customer_complaint on public.customer_complaints;
create trigger trg_notify_new_customer_complaint
after insert on public.customer_complaints
for each row execute function private.notify_new_customer_complaint();

alter table public.customer_complaints
 alter column expires_at set default (now()+interval '24 hours');
update public.customer_complaints
set expires_at=least(expires_at,opened_at+interval '24 hours')
where status='open';
