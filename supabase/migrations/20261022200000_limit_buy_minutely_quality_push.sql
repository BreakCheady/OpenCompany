-- Consolidated limit-buy notifications per order, quality, and minute.
-- Applied to production on 2026-10-22; leaves trading and inventory accounting unchanged.
drop trigger if exists limit_buy_completion_push on public.market_limit_buy_orders;
create or replace function private.enqueue_limit_buy_minute_notifications()
returns integer language plpgsql security definer set search_path='' as $body$
declare v_inserted integer := 0;
begin
 insert into public.push_notification_queue(user_id,event_type,reference_id,title,body,url,status)
 select c.owner_user_id,'market_sale',
   extensions.uuid_generate_v5('b6429f29-ce6d-493e-ab99-4d6d4534dc6d'::uuid,
     f.limit_order_id::text || ':' || f.quality_level::text || ':' ||
     to_char(date_trunc('minute',f.created_at at time zone 'UTC'),'YYYY-MM-DD HH24:MI')),
   'Limitauftrag: Käufe zusammengefasst',
   format('%s Q%s: %s Einheiten zu Ø %s OC$/Einheit gekauft. Gesamtkosten: %s OC$.',
     coalesce(o.product_name,m.name,'Ware'),f.quality_level,sum(f.quantity),
     round(sum(f.total_value)/nullif(sum(f.quantity),0),2),
     round(sum(f.total_value),2)),
   '/#market','pending'
 from public.market_limit_buy_fills f
 join public.market_limit_buy_orders o on o.id=f.limit_order_id
 join public.companies c on c.id=o.company_id
 left join public.materials m on m.id=o.material_id
 where f.created_at >= '2026-10-22 17:15:00+00'::timestamptz
 and f.created_at < date_trunc('minute',now()) - interval '1 minute'
 group by c.owner_user_id,f.limit_order_id,f.quality_level,
 date_trunc('minute',f.created_at at time zone 'UTC'),o.product_name,m.name
 on conflict (user_id,event_type,reference_id) do nothing;
 get diagnostics v_inserted=row_count;
 return v_inserted;
end; $body$;
revoke all on function private.enqueue_limit_buy_minute_notifications() from public,anon,authenticated;
select cron.schedule('opencompany-limit-buy-push-minutely','* * * * *','select private.enqueue_limit_buy_minute_notifications();');
