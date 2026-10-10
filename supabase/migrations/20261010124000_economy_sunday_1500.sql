-- Weekly economy phase review: Sunday 15:00 Europe/Berlin (DST-aware).
create or replace function private.next_economy_change_at(p_after timestamptz default now())
returns timestamptz language sql stable set search_path='' as $$
  with local_time as (
    select p_after at time zone 'Europe/Berlin' as local_now
  ), candidate as (
    select local_now,
      (local_now::date + ((7-extract(isodow from local_now)::integer+7)%7) + time '15:00')::timestamp as local_candidate
    from local_time
  )
  select (case when local_candidate<=local_now then local_candidate+interval '7 days'
               else local_candidate end) at time zone 'Europe/Berlin'
  from candidate
$$;

-- Reschedule the already planned transition; no early transition and no phase change.
update public.game_economy_state
set next_change_at=private.next_economy_change_at(now()),updated_at=now()
where id=1;
