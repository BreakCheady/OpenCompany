-- OpenCompany 0.10.234: expand active market NPCs from 10 to 30 and make NPC activity industry-aware.

create table if not exists private.npc_industry_profiles (
  company_id uuid not null references public.companies(id) on delete cascade,
  category text not null,
  activity_weight numeric not null default 1 check (activity_weight > 0),
  can_sell boolean not null default true,
  can_buy boolean not null default true,
  primary key(company_id,category)
);
revoke all on private.npc_industry_profiles from public,anon,authenticated;

insert into public.companies(
  name,status,brand_reputation,company_level,cash_balance,company_value,
  company_type,company_code,patent_value,experience_points,ocb_balance
)
values
 ('VoltEdge Electronics','active',63,8,9000000,12000000,'npc','U81001',1200000,0,0),
 ('NovaByte Systems','active',58,7,8500000,10500000,'npc','U81002',900000,0,0),
 ('AutoWerk Dynamics','active',67,9,11000000,14500000,'npc','U81003',500000,0,0),
 ('RoadForge Mobility','active',61,8,10000000,13000000,'npc','U81004',350000,0,0),
 ('ChemNova Solutions','active',60,8,9200000,11500000,'npc','U81005',650000,0,0),
 ('Helix Industrial Chemicals','active',56,7,7800000,9800000,'npc','U81006',400000,0,0),
 ('BauWerk Materials','active',59,8,8600000,10800000,'npc','U81007',150000,0,0),
 ('CivicStone Industries','active',54,7,7600000,9300000,'npc','U81008',120000,0,0),
 ('FreshField Foods','active',65,8,8800000,11000000,'npc','U81009',180000,0,0),
 ('NordHarvest Foods','active',57,7,7900000,9700000,'npc','U81010',160000,0,0),
 ('LoomCraft Textiles','active',62,8,8300000,10200000,'npc','U81011',220000,0,0),
 ('UrbanThread Apparel','active',66,8,9100000,11400000,'npc','U81012',260000,0,0),
 ('GridNova Energy','active',69,9,12000000,15500000,'npc','U81013',1100000,0,0),
 ('Solaris Power Systems','active',64,8,10400000,13800000,'npc','U81014',950000,0,0),
 ('MechaCore Robotics','active',68,9,10800000,14600000,'npc','U81015',1400000,0,0),
 ('ForgeMotion Automation','active',60,8,9300000,12100000,'npc','U81016',850000,0,0),
 ('LabSphere Research','active',71,9,9700000,13200000,'npc','U81017',2100000,0,0),
 ('QuantumWorks Research','active',73,10,11200000,15800000,'npc','U81018',2800000,0,0),
 ('TransEuro Freight','active',58,8,8900000,11100000,'npc','U81019',100000,0,0),
 ('CargoLink Systems','active',55,7,8100000,9900000,'npc','U81020',100000,0,0)
on conflict(company_code) do update set name=excluded.name,status='active',company_type='npc';

insert into private.npc_market_profiles(company_id,price_factor,volume_factor,updated_at)
select c.id,
       round((0.82 + ((substring(c.company_code from 2)::integer % 17)::numeric * 0.01)),2),
       round((0.85 + ((substring(c.company_code from 2)::integer % 31)::numeric * 0.01)),2),
       now()
from public.companies c
where c.company_type='npc' and c.status='active' and c.company_code<>'U00000'
on conflict(company_id) do nothing;

delete from private.npc_industry_profiles
where company_id in (select id from public.companies where company_type='npc' and company_code<>'U00000');

with assignments(company_name,category,weight,can_sell,can_buy) as (
  values
  ('Mercator Trading','food',1.00,true,true),
  ('Mercator Trading','food_component',1.00,true,true),
  ('Mercator Trading','textile',0.80,true,true),
  ('Mercator Trading','raw_materials',0.80,true,true),
  ('RawCore Industries','construction',1.15,true,true),
  ('RawCore Industries','chemical',0.85,true,true),
  ('RawCore Industries','raw_materials',1.25,true,true),
  ('Harbor Trade Group','logistics',1.20,true,true),
  ('Harbor Trade Group','raw_materials',0.95,true,true),
  ('Silicon Source Europe','electronics',1.15,true,true),
  ('Silicon Source Europe','component',1.00,true,true),
  ('Nordic Components','component',1.25,true,true),
  ('Nordic Components','electronics',0.80,true,true),
  ('Glassline Materials','construction',1.15,true,true),
  ('Glassline Materials','raw_materials',1.05,true,true),
  ('AlloyWorks Supply','automotive',1.05,true,true),
  ('AlloyWorks Supply','component',1.15,true,true),
  ('AlloyWorks Supply','raw_materials',1.00,true,true),
  ('Rheinland Logistics','logistics',1.25,true,true),
  ('Vertex Manufacturing','machinery',1.25,true,true),
  ('Vertex Manufacturing','component',0.75,true,true),
  ('Atlas Capital Partners','energy',0.95,true,true),
  ('Atlas Capital Partners','research',1.15,true,true),
  ('VoltEdge Electronics','electronics',1.25,true,true),
  ('VoltEdge Electronics','component',0.90,true,true),
  ('NovaByte Systems','electronics',1.20,true,true),
  ('NovaByte Systems','component',0.85,true,true),
  ('AutoWerk Dynamics','automotive',1.25,true,true),
  ('AutoWerk Dynamics','component',0.90,true,true),
  ('RoadForge Mobility','automotive',1.20,true,true),
  ('RoadForge Mobility','component',0.85,true,true),
  ('ChemNova Solutions','chemical',1.25,true,true),
  ('ChemNova Solutions','raw_materials',0.75,true,true),
  ('Helix Industrial Chemicals','chemical',1.20,true,true),
  ('Helix Industrial Chemicals','raw_materials',0.75,true,true),
  ('BauWerk Materials','construction',1.25,true,true),
  ('BauWerk Materials','raw_materials',0.90,true,true),
  ('CivicStone Industries','construction',1.20,true,true),
  ('CivicStone Industries','raw_materials',0.90,true,true),
  ('FreshField Foods','food',1.25,true,true),
  ('FreshField Foods','food_component',1.15,true,true),
  ('NordHarvest Foods','food',1.20,true,true),
  ('NordHarvest Foods','food_component',1.10,true,true),
  ('LoomCraft Textiles','textile',1.25,true,true),
  ('UrbanThread Apparel','textile',1.20,true,true),
  ('GridNova Energy','energy',1.25,true,true),
  ('GridNova Energy','component',0.75,true,true),
  ('Solaris Power Systems','energy',1.20,true,true),
  ('Solaris Power Systems','component',0.70,true,true),
  ('MechaCore Robotics','machinery',1.25,true,true),
  ('MechaCore Robotics','component',0.90,true,true),
  ('ForgeMotion Automation','machinery',1.20,true,true),
  ('ForgeMotion Automation','component',0.85,true,true),
  ('LabSphere Research','research',1.25,true,true),
  ('LabSphere Research','electronics',0.65,true,true),
  ('QuantumWorks Research','research',1.20,true,true),
  ('QuantumWorks Research','electronics',0.65,true,true),
  ('TransEuro Freight','logistics',1.25,true,true),
  ('CargoLink Systems','logistics',1.20,true,true)
)
insert into private.npc_industry_profiles(company_id,category,activity_weight,can_sell,can_buy)
select c.id,a.category,a.weight,a.can_sell,a.can_buy
from assignments a
join public.companies c on c.name=a.company_name and c.company_type='npc'
on conflict(company_id,category) do update set
 activity_weight=excluded.activity_weight,can_sell=excluded.can_sell,can_buy=excluded.can_buy;

insert into public.products(
  company_id,name,category,production_cost,suggested_retail_price,quality_score,status,
  required_building_type_id,required_retail_building_type_id,quality_level,
  research_units_progress,base_production_rate,base_retail_rate
)
select c.id,cat.name,cat.category,cat.production_cost,cat.suggested_retail_price,60,'active',
       prod_bt.id,retail_bt.id,1,0,cat.base_production_rate,cat.base_retail_rate
from public.companies c
join private.npc_industry_profiles ip on ip.company_id=c.id and ip.can_sell and ip.category<>'raw_materials'
join private.game_product_catalog cat on cat.category=ip.category
left join public.building_types prod_bt on prod_bt.code=cat.building_code
left join public.building_types retail_bt on retail_bt.code=cat.retail_building_code
where c.company_code between 'U81001' and 'U81020'
  and not exists(select 1 from public.products p where p.company_id=c.id and p.name=cat.name and p.category=cat.category);

create or replace function private.run_npc_intercompany_trade()
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_order public.market_orders%rowtype;
  v_category text; v_demand numeric; v_buyer uuid; v_qty numeric; v_total numeric; v_count integer:=0;
begin
  for v_order in
    select o.* from public.market_orders o
    join public.companies seller on seller.id=o.company_id
    where seller.company_type='npc' and seller.company_code<>'U00000' and seller.status='active'
      and o.order_type='sell' and o.status in ('open','partially_filled')
      and coalesce(o.remaining_quantity,0)>0 and (o.expires_at is null or o.expires_at>now())
    order by random() limit 12
  loop
    if v_order.product_id is not null then
      select p.category into v_category from public.products p where p.id=v_order.product_id;
      select coalesce(md.demand_index,100) into v_demand from public.market_demand md where md.category=v_category;
      v_demand:=coalesce(v_demand,100);
    else
      v_category:='raw_materials'; v_demand:=100;
    end if;
    if random()>least(0.65,greatest(0.18,v_demand/250.0)) then continue; end if;

    select c.id into v_buyer
    from private.npc_industry_profiles ip join public.companies c on c.id=ip.company_id
    where ip.category=v_category and ip.can_buy and c.company_type='npc' and c.company_code<>'U00000'
      and c.status='active' and c.id<>v_order.company_id
      and c.cash_balance>greatest(250000,v_order.price_per_unit*5)
    order by random()/greatest(ip.activity_weight,0.1) limit 1;
    if v_buyer is null then continue; end if;

    v_qty:=least(v_order.remaining_quantity,
      case when v_order.material_id is not null then greatest(10,floor(20+random()*81))
           else greatest(2,floor(3+random()*23)) end);
    v_total:=round(v_qty*v_order.price_per_unit,2);
    if (select cash_balance from public.companies where id=v_buyer)<v_total then continue; end if;

    update public.companies set cash_balance=cash_balance-v_total where id=v_buyer;
    update public.companies set cash_balance=cash_balance+v_total where id=v_order.company_id;
    update public.market_orders
      set remaining_quantity=remaining_quantity-v_qty,
          status=case when remaining_quantity-v_qty<=0 then 'filled' else 'partially_filled' end
      where id=v_order.id;

    insert into public.market_trades(order_id,buyer_company_id,seller_company_id,product_id,material_id,quantity,price_per_unit,total_value,market_fee,quality_level)
    values(v_order.id,v_buyer,v_order.company_id,v_order.product_id,v_order.material_id,v_qty,v_order.price_per_unit,v_total,0,v_order.quality_level);
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function private.run_npc_intercompany_trade() from public,anon,authenticated;

create or replace function private.run_npc_market_tick_core()
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_state timestamptz; v_order public.market_orders%rowtype; v_qty numeric; v_total numeric;
  v_fee numeric; v_net numeric; v_npc uuid; v_count int:=0; v_roll numeric; v_category text;
begin
  select last_run into v_state from private.npc_market_state where key='main' for update;
  if v_state>now()-interval '2 minutes' then return 0; end if;
  update private.npc_market_state set last_run=now() where key='main';

  for v_order in
    select o.* from public.market_orders o
    join public.companies c on c.id=o.company_id
    join private.market_order_product_cost_basis cb on cb.order_id=o.id
    where o.order_type='sell' and o.status in ('open','partially_filled')
      and c.company_type='player' and cb.unit_cost>0 and o.price_per_unit<=cb.npc_max_price
    order by random() limit 8
  loop
    if v_order.product_id is not null then
      select p.category into v_category from public.products p where p.id=v_order.product_id;
    else v_category:='raw_materials'; end if;

    select c.id into v_npc
    from private.npc_industry_profiles ip join public.companies c on c.id=ip.company_id
    where ip.category=v_category and ip.can_buy and c.company_type='npc'
      and c.company_code<>'U00000' and c.status='active'
    order by random()/greatest(ip.activity_weight,0.1) limit 1;
    if v_npc is null then continue; end if;

    v_roll:=random();
    if v_order.remaining_quantity>=200 then
      v_qty:=case when v_roll<0.15 then 25 when v_roll<0.35 then 50 when v_roll<0.60 then 100 when v_roll<0.80 then 150 else 200 end;
    elsif v_order.remaining_quantity>=100 then
      v_qty:=case when v_roll<0.20 then 20 when v_roll<0.50 then 50 when v_roll<0.75 then 75 else 100 end;
    elsif v_order.remaining_quantity>=50 then
      v_qty:=case when v_roll<0.25 then 10 when v_roll<0.60 then 25 else 50 end;
    else
      v_qty:=least(v_order.remaining_quantity,greatest(2,(2+floor(random()*24))::numeric));
    end if;

    v_qty:=least(v_order.remaining_quantity,v_qty);
    v_total:=round(v_qty*v_order.price_per_unit,2);
    v_fee:=round(v_total*0.05*private.specialization_factor(v_order.company_id,'market_fee'),2);
    v_net:=v_total-v_fee;

    if (select cash_balance from public.companies where id=v_npc)>=v_total then
      update public.companies set cash_balance=cash_balance-v_total where id=v_npc;
      update public.companies set cash_balance=cash_balance+v_net where id=v_order.company_id;
      update public.market_orders set remaining_quantity=remaining_quantity-v_qty,
        status=case when remaining_quantity-v_qty<=0 then 'filled' else 'partially_filled' end where id=v_order.id;
      insert into public.market_trades(order_id,buyer_company_id,seller_company_id,product_id,material_id,quantity,price_per_unit,total_value,market_fee,quality_level)
      values(v_order.id,v_npc,v_order.company_id,v_order.product_id,v_order.material_id,v_qty,v_order.price_per_unit,v_total,v_fee,v_order.quality_level);
      insert into public.financial_transactions(company_id,transaction_type,amount,description,reference_type,reference_id)
      values(v_order.company_id,'market_sale',v_net,'Verkauf an NPC nach Marktgebühr','market_order',v_order.id),
            (v_order.company_id,'market_fee',-v_fee,'Marktgebühr','market_order',v_order.id);
      v_count:=v_count+1;
    end if;
  end loop;

  v_count:=v_count+private.run_npc_intercompany_trade();
  v_count:=v_count+private.ensure_npc_market_supply();
  return v_count;
end $$;
revoke all on function private.run_npc_market_tick_core() from public,anon,authenticated;

create or replace function private.ensure_npc_market_supply()
returns integer language plpgsql security definer set search_path='' as $
declare
  v_material public.materials%rowtype;
  v_catalog record;
  v_profile_company_id uuid;
  v_volume_factor numeric;
  v_price_factor numeric;
  v_product_id uuid;
  v_existing integer;
  v_needed integer;
  v_i integer;
  v_qty numeric;
  v_price numeric;
  v_base_price numeric;
  v_quality integer;
  v_count integer:=0;
  v_quarter_end timestamptz;
begin
  v_quarter_end:=date_trunc('hour',now())
    +(floor(extract(minute from now())/15)*interval '15 minutes')
    +interval '15 minutes';

  update public.market_orders o set status='expired'
  where o.order_type='sell' and o.status in ('open','partially_filled')
    and o.expires_at is not null and o.expires_at<=now()
    and exists(select 1 from public.companies c where c.id=o.company_id and c.company_type='npc');

  for v_material in select * from public.materials where status='active' order by name
  loop
    v_base_price:=greatest(0.01,round(v_material.base_cost*0.60,2));
    for v_quality in 1..5 loop
      select count(*) into v_existing
      from public.market_orders o join public.companies c on c.id=o.company_id
      where c.company_type='npc' and c.company_code<>'U00000' and c.status='active'
        and o.order_type='sell' and o.material_id=v_material.id and o.quality_level=v_quality
        and o.status in ('open','partially_filled') and coalesce(o.remaining_quantity,0)>0
        and (o.expires_at is null or o.expires_at>now());

      v_needed:=greatest(0,4-v_existing);
      for v_i in 1..v_needed loop
        v_profile_company_id:=null;
        select mp.company_id,mp.volume_factor,mp.price_factor
        into v_profile_company_id,v_volume_factor,v_price_factor
        from private.npc_market_profiles mp
        join public.companies c on c.id=mp.company_id
        join private.npc_industry_profiles ip on ip.company_id=c.id and ip.category='raw_materials' and ip.can_sell
        where c.company_type='npc' and c.company_code<>'U00000' and c.status='active'
        order by random()/greatest(ip.activity_weight,0.1) limit 1;

        exit when v_profile_company_id is null;
        v_qty:=greatest(50,floor((180::numeric+random()::numeric*821)*coalesce(v_volume_factor,1)));
        while exists(
          select 1 from public.market_orders o join public.companies c on c.id=o.company_id
          where c.company_type='npc' and o.material_id=v_material.id and o.quality_level=v_quality
            and o.order_type='sell' and o.status in ('open','partially_filled') and o.remaining_quantity=v_qty
        ) loop v_qty:=v_qty+1; end loop;

        v_price:=greatest(0.01,round(v_base_price*(1+((v_quality-1)::numeric*0.03))*coalesce(v_price_factor,1)*(0.985+random()::numeric*0.03),2));
        while exists(
          select 1 from public.market_orders o join public.companies c on c.id=o.company_id
          where c.company_type='npc' and o.material_id=v_material.id and o.quality_level=v_quality
            and o.order_type='sell' and o.status in ('open','partially_filled') and o.price_per_unit=v_price
        ) loop v_price:=v_price+0.01; end loop;

        insert into public.market_orders(company_id,material_id,order_type,quantity,remaining_quantity,price_per_unit,status,expires_at,quality_level)
        values(v_profile_company_id,v_material.id,'sell',v_qty,v_qty,v_price,'open',v_quarter_end,v_quality);
        v_count:=v_count+1;
      end loop;
    end loop;
  end loop;

  for v_catalog in
    select name,category,suggested_retail_price from private.game_product_catalog order by category,name
  loop
    if v_catalog.name='Transportcontainer' then
      v_base_price:=10.00;
    else
      v_base_price:=greatest(0.01,round(coalesce(
        private.npc_product_cost_basis(v_catalog.name,v_catalog.category,1,v_catalog.suggested_retail_price),
        greatest(coalesce(v_catalog.suggested_retail_price,0)/2,0.01)
      )*2.00,2));
    end if;

    for v_quality in 1..5 loop
      select count(*) into v_existing
      from public.market_orders o
      join public.companies c on c.id=o.company_id
      join public.products p on p.id=o.product_id
      where c.company_type='npc' and c.company_code<>'U00000' and c.status='active'
        and p.status='active' and p.name=v_catalog.name and p.category=v_catalog.category
        and o.order_type='sell' and o.quality_level=v_quality
        and o.status in ('open','partially_filled') and coalesce(o.remaining_quantity,0)>0
        and (o.expires_at is null or o.expires_at>now());

      v_needed:=greatest(0,4-v_existing);
      for v_i in 1..v_needed loop
        v_product_id:=null; v_profile_company_id:=null;
        select p.id,mp.company_id,mp.volume_factor,mp.price_factor
        into v_product_id,v_profile_company_id,v_volume_factor,v_price_factor
        from public.products p
        join public.companies c on c.id=p.company_id
        join private.npc_market_profiles mp on mp.company_id=c.id
        join private.npc_industry_profiles ip on ip.company_id=c.id and ip.category=v_catalog.category and ip.can_sell
        where c.company_type='npc' and c.company_code<>'U00000' and c.status='active'
          and p.status='active' and p.name=v_catalog.name and p.category=v_catalog.category
        order by random()/greatest(ip.activity_weight,0.1) limit 1;

        exit when v_product_id is null or v_profile_company_id is null;
        v_qty:=case when v_catalog.name='Transportcontainer'
          then floor(100::numeric+random()::numeric*401)
          else greatest(10,floor((25::numeric+random()::numeric*226)*coalesce(v_volume_factor,1))) end;

        while exists(
          select 1 from public.market_orders o
          join public.companies c on c.id=o.company_id
          join public.products p on p.id=o.product_id
          where c.company_type='npc' and p.name=v_catalog.name and p.category=v_catalog.category
            and o.quality_level=v_quality and o.order_type='sell'
            and o.status in ('open','partially_filled') and o.remaining_quantity=v_qty
        ) loop v_qty:=v_qty+1; end loop;

        v_price:=greatest(0.01,round(v_base_price*(1+((v_quality-1)::numeric*0.03))*coalesce(v_price_factor,1)*(0.985+random()::numeric*0.03),2));
        while exists(
          select 1 from public.market_orders o
          join public.companies c on c.id=o.company_id
          join public.products p on p.id=o.product_id
          where c.company_type='npc' and p.name=v_catalog.name and p.category=v_catalog.category
            and o.quality_level=v_quality and o.order_type='sell'
            and o.status in ('open','partially_filled') and o.price_per_unit=v_price
        ) loop v_price:=v_price+0.01; end loop;

        insert into public.market_orders(company_id,product_id,order_type,quantity,remaining_quantity,price_per_unit,status,expires_at,quality_level)
        values(v_profile_company_id,v_product_id,'sell',v_qty,v_qty,v_price,'open',
          case when v_catalog.name='Transportcontainer' then null else v_quarter_end end,v_quality);
        v_count:=v_count+1;
      end loop;
    end loop;
  end loop;
  return v_count;
end $;
revoke all on function private.ensure_npc_market_supply() from public,anon,authenticated;

select private.ensure_npc_market_supply();
