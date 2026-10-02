create table if not exists public.company_public_profiles (
  company_id uuid primary key references public.companies(id) on delete cascade,
  slogan text not null default '',
  description text not null default '',
  logo_path text,
  updated_at timestamptz not null default now(),
  constraint company_public_profiles_slogan_length check (char_length(slogan) <= 120),
  constraint company_public_profiles_description_length check (char_length(description) <= 1000)
);

alter table public.company_public_profiles enable row level security;

drop policy if exists "company profiles are publicly readable" on public.company_public_profiles;
create policy "company profiles are publicly readable"
on public.company_public_profiles
for select
to anon, authenticated
using (true);

drop policy if exists "company owners can insert own public profile" on public.company_public_profiles;
create policy "company owners can insert own public profile"
on public.company_public_profiles
for insert
to authenticated
with check (
  exists (
    select 1
    from public.companies c
    where c.id = company_public_profiles.company_id
      and c.owner_user_id = (select auth.uid())
      and c.status = 'active'
      and c.company_type = 'player'
  )
);

drop policy if exists "company owners can update own public profile" on public.company_public_profiles;
create policy "company owners can update own public profile"
on public.company_public_profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.companies c
    where c.id = company_public_profiles.company_id
      and c.owner_user_id = (select auth.uid())
      and c.status = 'active'
      and c.company_type = 'player'
  )
)
with check (
  exists (
    select 1
    from public.companies c
    where c.id = company_public_profiles.company_id
      and c.owner_user_id = (select auth.uid())
      and c.status = 'active'
      and c.company_type = 'player'
  )
);

revoke all on public.company_public_profiles from anon, authenticated;
grant select on public.company_public_profiles to anon, authenticated;
grant insert(company_id,slogan,description,logo_path,updated_at) on public.company_public_profiles to authenticated;
grant update(slogan,description,logo_path,updated_at) on public.company_public_profiles to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'company-logos',
  'company-logos',
  true,
  2097152,
  array['image/png','image/jpeg','image/webp']::text[]
)
on conflict(id) do update
set public=true,
    file_size_limit=2097152,
    allowed_mime_types=array['image/png','image/jpeg','image/webp']::text[];

drop policy if exists "company logo owners can insert" on storage.objects;
create policy "company logo owners can insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id='company-logos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "company logo owners can select own objects" on storage.objects;
create policy "company logo owners can select own objects"
on storage.objects
for select
to authenticated
using (
  bucket_id='company-logos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "company logo owners can update" on storage.objects;
create policy "company logo owners can update"
on storage.objects
for update
to authenticated
using (
  bucket_id='company-logos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
)
with check (
  bucket_id='company-logos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "company logo owners can delete" on storage.objects;
create policy "company logo owners can delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id='company-logos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

create or replace function public.get_public_company_profile(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_company public.companies%rowtype;
  v_latest_rank public.company_ranking_history%rowtype;
  v_total_players integer := 0;
  v_patent_rank integer;
  v_trade_rank integer;
  v_production_rank integer;
  v_building_value numeric := 0;
  v_debt numeric := 0;
  v_active_buildings integer := 0;
  v_employees bigint := 0;
  v_trade_volume_30d numeric := 0;
  v_production_volume_30d numeric := 0;
  v_building_summary jsonb := '[]'::jsonb;
  v_profile jsonb := '{}'::jsonb;
  v_current_offers jsonb := '[]'::jsonb;
begin
  select *
    into v_company
  from public.companies
  where id=p_company_id
    and status='active'
    and company_type='player';

  if v_company.id is null then
    raise exception 'Unternehmen nicht gefunden';
  end if;

  select *
    into v_latest_rank
  from public.company_ranking_history
  where company_id=p_company_id
  order by ranking_date desc
  limit 1;

  select count(*)
    into v_total_players
  from public.companies
  where status='active'
    and company_type='player';

  with ranked as (
    select c.id,
           dense_rank() over(order by coalesce(c.patent_value,0) desc, c.created_at asc, c.id asc) as rnk
    from public.companies c
    where c.status='active' and c.company_type='player'
  )
  select rnk::integer into v_patent_rank
  from ranked
  where id=p_company_id;

  with trade as (
    select c.id,
           coalesce(sum(case
             when ft.transaction_type in ('market_sale','retail_sale','contract_sale')
              and ft.amount > 0
              and ft.created_at >= now()-interval '30 days'
             then ft.amount else 0 end),0)::numeric as volume
    from public.companies c
    left join public.financial_transactions ft on ft.company_id=c.id
    where c.status='active' and c.company_type='player'
    group by c.id
  ),
  ranked as (
    select id, volume,
           dense_rank() over(order by volume desc, id asc) as rnk
    from trade
  )
  select volume, rnk::integer
    into v_trade_volume_30d, v_trade_rank
  from ranked
  where id=p_company_id;

  with production as (
    select c.id,
           coalesce(sum(case
             when j.status='completed'
              and coalesce(j.completed_at,j.finishes_at) >= now()-interval '30 days'
             then j.output_quantity else 0 end),0)::numeric as volume
    from public.companies c
    left join public.production_jobs j on j.company_id=c.id
    where c.status='active' and c.company_type='player'
    group by c.id
  ),
  ranked as (
    select id, volume,
           dense_rank() over(order by volume desc, id asc) as rnk
    from production
  )
  select volume, rnk::integer
    into v_production_volume_30d, v_production_rank
  from ranked
  where id=p_company_id;

  v_building_value := private.company_building_value(p_company_id);
  v_debt := private.company_total_loan_debt(p_company_id);

  select
    count(*)::integer,
    coalesce(sum(round(
      coalesce(bt.employees_per_building,0)::numeric
      * private.profile_operational_building_multiplier(greatest(coalesce(cb.level,1),1))
    )),0)::bigint
  into v_active_buildings, v_employees
  from public.company_buildings cb
  join public.building_types bt on bt.id=cb.building_type_id
  where cb.company_id=p_company_id
    and cb.status='active';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'name', q.name,
      'category', q.building_category,
      'count', q.building_count,
      'highest_level', q.highest_level
    )
    order by q.name
  ), '[]'::jsonb)
  into v_building_summary
  from (
    select
      bt.name,
      bt.building_category,
      count(*)::integer as building_count,
      max(greatest(coalesce(cb.level,1),1))::integer as highest_level
    from public.company_buildings cb
    join public.building_types bt on bt.id=cb.building_type_id
    where cb.company_id=p_company_id
      and cb.status='active'
    group by bt.name,bt.building_category
  ) q;

  select jsonb_build_object(
    'slogan', coalesce(cp.slogan,''),
    'description', coalesce(cp.description,''),
    'logo_path', cp.logo_path,
    'updated_at', cp.updated_at
  )
  into v_profile
  from public.company_public_profiles cp
  where cp.company_id=p_company_id;

  if v_profile is null then
    v_profile := jsonb_build_object(
      'slogan','',
      'description','',
      'logo_path',null,
      'updated_at',null
    );
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'item_type', q.item_type,
      'material_id', q.material_id,
      'product_id', q.product_id,
      'item_name', q.item_name,
      'product_category', q.product_category,
      'quality_level', q.quality_level,
      'remaining_quantity', q.remaining_quantity,
      'price_per_unit', q.price_per_unit,
      'created_at', q.created_at
    )
    order by q.created_at desc
  ), '[]'::jsonb)
  into v_current_offers
  from (
    select
      mo.id,
      case when mo.material_id is not null then 'material' else 'product' end as item_type,
      mo.material_id,
      mo.product_id,
      coalesce(m.name,p.name,'Unbekannt')::text as item_name,
      p.category::text as product_category,
      mo.quality_level,
      mo.remaining_quantity,
      mo.price_per_unit,
      mo.created_at
    from public.market_orders mo
    left join public.materials m on m.id=mo.material_id
    left join public.products p on p.id=mo.product_id
    where mo.company_id=p_company_id
      and mo.order_type='sell'
      and mo.status in ('open','partially_filled')
      and mo.remaining_quantity>0
    order by mo.created_at desc
    limit 30
  ) q;

  return jsonb_build_object(
    'id', v_company.id,
    'name', v_company.name,
    'company_code', v_company.company_code,
    'company_level', v_company.company_level,
    'status', v_company.status,
    'is_online', (v_company.last_seen_at is not null and v_company.last_seen_at > now()-interval '2 minutes'),
    'last_seen_at', v_company.last_seen_at,
    'created_at', v_company.created_at,
    'company_value', coalesce(v_company.company_value,0),
    'building_value', coalesce(v_building_value,0),
    'patent_value', coalesce(v_company.patent_value,0),
    'debt', coalesce(v_debt,0),
    'active_buildings', coalesce(v_active_buildings,0),
    'employees', coalesce(v_employees,0),
    'building_summary', v_building_summary,
    'profile', v_profile,
    'current_offers', v_current_offers,
    'ranking', jsonb_build_object(
      'company_value_rank', v_latest_rank.rank,
      'rank_change', coalesce(v_latest_rank.rank_change,0),
      'ranking_date', v_latest_rank.ranking_date,
      'patent_rank', v_patent_rank,
      'trade_rank_30d', v_trade_rank,
      'production_rank_30d', v_production_rank,
      'total_companies', v_total_players
    ),
    'activity', jsonb_build_object(
      'trade_volume_30d', coalesce(v_trade_volume_30d,0),
      'production_volume_30d', coalesce(v_production_volume_30d,0)
    )
  );
end
$function$;
