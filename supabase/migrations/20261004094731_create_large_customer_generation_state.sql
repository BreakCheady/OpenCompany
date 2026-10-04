
create table if not exists private.large_customer_generation_state(
  id smallint primary key default 1 check(id=1),
  last_generation_date date
);
insert into private.large_customer_generation_state(id,last_generation_date)
values(1,null)
on conflict(id) do nothing;
