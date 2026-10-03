create or replace function private.next_economy_change_at(p_after timestamptz default now())
returns timestamptz
language sql
stable
set search_path to ''
as $function$
  with local_time as (
    select p_after at time zone 'Europe/Berlin' as local_now
  ),
  candidate as (
    select
      local_now,
      (
        local_now::date
        + ((7 - extract(isodow from local_now)::integer + 7) % 7)
        + time '12:00'
      )::timestamp as local_candidate
    from local_time
  )
  select (
    case
      when local_candidate <= local_now then local_candidate + interval '7 days'
      else local_candidate
    end
  ) at time zone 'Europe/Berlin'
  from candidate
$function$;

update public.game_economy_state
set effect_rate = 0.15,
    production_cost_factor = case phase when 'recession' then 0.85 when 'boom' then 1.15 else 1 end,
    production_output_factor = case phase when 'recession' then 1.15 when 'boom' then 0.85 else 1 end,
    retail_price_factor = case phase when 'recession' then 0.85 when 'boom' then 1.15 else 1 end,
    next_change_at = private.next_economy_change_at(now()),
    updated_at = now()
where id = 1;
