-- OpenCompany 0.10.270: fix large-customer order generation at 18:00 Europe/Berlin

create or replace function private.is_large_customer_generation_time(p_at timestamp with time zone)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select (p_at at time zone 'Europe/Berlin')::time >= time '18:00'
$function$;

select cron.alter_job(
  21,
  schedule => '0 16,17 * * *'
);
