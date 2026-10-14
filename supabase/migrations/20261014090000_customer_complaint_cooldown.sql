-- Each company waits a persisted random 48..72 hours after a complaint.
-- Existing latest complaints receive their own seeded cooldown, including unresolved ones.
CREATE TABLE IF NOT EXISTS private.customer_complaint_cooldowns(
 company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
 available_at timestamptz NOT NULL
);
INSERT INTO private.customer_complaint_cooldowns(company_id,available_at)
SELECT DISTINCT ON (company_id) company_id,
       opened_at+(48+floor(random()*25))*interval '1 hour'
FROM public.customer_complaints
ORDER BY company_id,opened_at DESC
ON CONFLICT(company_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.process_customer_sale(p_company_id uuid, p_job_id uuid, p_claimable numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.retail_sale_jobs%rowtype;
v_bonus numeric;v_prior numeric;v_apply numeric;v_chance numeric;
v_cooldown_until timestamptz;v_complaint_id uuid;
begin
 select * into j from public.retail_sale_jobs where id=p_job_id;
 if j.id is null or j.company_id<>p_company_id or p_claimable<=0 then return; end if;
 v_bonus:= (0.2+case when j.quality_level>=5 then 0.5 when j.quality_level=4 then 0.3 else 0 end)*least(1,p_claimable/greatest(1,j.quantity));
 insert into private.customer_daily_gains(company_id,local_day,gained)
 values(p_company_id,(now() at time zone 'Europe/Berlin')::date,0)
 on conflict do nothing;
 select gained into v_prior from private.customer_daily_gains
 where company_id=p_company_id and local_day=(now() at time zone 'Europe/Berlin')::date for update;
 v_apply:=greatest(0,least(v_bonus,2-v_prior));
 if v_apply>0 then
  update private.customer_daily_gains set gained=gained+v_apply
  where company_id=p_company_id and local_day=(now() at time zone 'Europe/Berlin')::date;
  perform private.adjust_customer_relations(p_company_id,v_apply,0.1*least(1,p_claimable/greatest(1,j.quantity)));
 end if;
 -- Only first claim per sale can open a complaint; maximum two in a rolling week.
 if coalesce(j.claimed_quantity,0)=0 then
  v_chance:=case when j.quality_level<=1 then 0.12 when j.quality_level=2 then 0.09
                 when j.quality_level=3 then 0.06 when j.quality_level=4 then 0.03 else 0.01 end;
  if random()<v_chance then
    -- Serialize complaints for the same company to avoid parallel claims bypassing cooldown.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text,731472));
    select available_at into v_cooldown_until
      from private.customer_complaint_cooldowns where company_id=p_company_id for update;
    if coalesce(v_cooldown_until,'-infinity'::timestamptz)<=now()
      and (select count(*) from public.customer_complaints
           where company_id=p_company_id and opened_at>=now()-interval '7 days')<2
      and not exists (select 1 from public.customer_complaints
           where company_id=p_company_id and opened_at>now()-interval '48 hours')
    then
      insert into public.customer_complaints(company_id,sale_job_id,product_id,quality_level,quantity)
      values(p_company_id,p_job_id,j.product_id,j.quality_level,least(1+floor(random()*500),greatest(1,floor(j.quantity))))
      on conflict(sale_job_id) do nothing
      returning id into v_complaint_id;
      if v_complaint_id is not null then
        insert into private.customer_complaint_cooldowns(company_id,available_at)
        values(p_company_id,now()+(48+floor(random()*25))*interval '1 hour')
        on conflict(company_id) do update set available_at=excluded.available_at;
      end if;
    end if;
  end if;
 end if;
end $function$


