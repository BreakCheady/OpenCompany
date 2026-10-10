create or replace function private.notify_new_customer_complaint()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.management_send_pa(new.company_id,'Boss, eine neue Reklamation ist eingetroffen.');
 return new;
end $$;