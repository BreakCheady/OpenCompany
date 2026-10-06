create or replace function private.award_due_large_customer_orders()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  o public.large_customer_orders%rowtype;
  b public.large_customer_bids%rowtype;
  v_min_price numeric;
  v_fastest_hours integer;
  v_best uuid;
  v_best_score numeric;
  v_score numeric;
  v_count integer:=0;
  v_deadline_text text;
begin
  for o in
    select * from public.large_customer_orders
    where status='bidding' and bidding_ends_at<=now()
    order by bidding_ends_at
    for update skip locked
  loop
    select min(price_per_unit),min(delivery_hours)
      into v_min_price,v_fastest_hours
    from public.large_customer_bids
    where order_id=o.id and status='submitted';

    if v_min_price is null then
      update public.large_customer_orders set status='cancelled' where id=o.id;
      continue;
    end if;

    v_best:=null;
    v_best_score:=-1;

    for b in
      select * from public.large_customer_bids
      where order_id=o.id and status='submitted'
      order by created_at,id
    loop
      v_score:=50*(v_min_price/nullif(b.price_per_unit,0))
        +25*least(1,b.offered_quality::numeric/5)
        +25*least(1,v_fastest_hours::numeric/nullif(b.delivery_hours,0));

      update public.large_customer_bids set score=round(v_score,4) where id=b.id;

      if v_score>v_best_score then
        v_best_score:=v_score;
        v_best:=b.id;
      end if;
    end loop;

    select * into b from public.large_customer_bids where id=v_best;

    update public.large_customer_bids
    set status=case when id=v_best then 'won' else 'lost' end
    where order_id=o.id and status='submitted';

    update public.large_customer_orders
    set status='awarded',
        winning_bid_id=v_best,
        awarded_company_id=b.company_id,
        awarded_at=now(),
        delivery_deadline=now()+make_interval(hours=>b.delivery_hours)
    where id=o.id
    returning * into o;

    v_deadline_text:=to_char(o.delivery_deadline at time zone 'Europe/Berlin','DD.MM.YYYY HH24:MI');

    insert into public.chat_messages(sender_company_id,recipient_company_id,body)
    select '00000000-0000-4000-8000-000000000001'::uuid,c.id,
      'Boss, Glückwunsch: Du hast den Großauftrag "'||o.item_name||'" von '||o.customer_name||
      ' gewonnen. Auftragsmenge: '||trim(to_char(o.quantity,'FM999999999990.##'))||
      ' Einheiten. Zuschlag: '||trim(to_char(b.price_per_unit,'FM999999999990.00'))||
      ' OC$ je Einheit. Deadline: '||v_deadline_text||' Uhr.'
    from public.companies c
    where c.id=b.company_id
      and c.company_type='player'
      and c.owner_user_id is not null;

    insert into public.chat_messages(sender_company_id,recipient_company_id,body)
    select '00000000-0000-4000-8000-000000000001'::uuid,c.id,
      'Boss, der Großauftrag "'||o.item_name||'" von '||o.customer_name||
      ' wurde vergeben. Dein Gebot hat diesmal leider nicht den Zuschlag erhalten.'
    from public.large_customer_bids lb
    join public.companies c on c.id=lb.company_id
    where lb.order_id=o.id
      and lb.status='lost'
      and c.company_type='player'
      and c.owner_user_id is not null;

    v_count:=v_count+1;
  end loop;

  return v_count;
end
$$;

revoke all on function private.award_due_large_customer_orders() from public,anon,authenticated;
