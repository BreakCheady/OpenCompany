-- Do not create a catch-up tender outside 06:00 on the deployment day.
-- The first automatic generation happens on the next eligible 06:00 run.
update private.large_customer_generation_state
set last_generation_date=current_date
where id=1 and last_generation_date is null;
