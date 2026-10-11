-- Disposable local database only, with migrations 001-018 applied. Rolls back all fixtures.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('18000000-0000-0000-0000-000000000001','settlement-payer@example.test'),
 ('18000000-0000-0000-0000-000000000002','settlement-recipient@example.test'),
 ('18000000-0000-0000-0000-000000000003','settlement-third@example.test'),
 ('18000000-0000-0000-0000-000000000004','settlement-outsider@example.test');
insert into public.households(id,name,created_by) values
 ('18000000-0000-0000-0000-000000000010','Settlement test','18000000-0000-0000-0000-000000000001'),
 ('18000000-0000-0000-0000-000000000020','Other household','18000000-0000-0000-0000-000000000004');
insert into public.household_members(household_id,user_id) values
 ('18000000-0000-0000-0000-000000000010','18000000-0000-0000-0000-000000000002'),
 ('18000000-0000-0000-0000-000000000010','18000000-0000-0000-0000-000000000003');

create function pg_temp.expect_error(p_sql text,p_state text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'Expected %, got % for %',p_state,sqlstate,p_sql;
  end;
  raise exception 'Expected %, command unexpectedly succeeded: %',p_state,p_sql;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000001',true);
do $$
declare
  h uuid := '18000000-0000-0000-0000-000000000010';
  a uuid := '18000000-0000-0000-0000-000000000001';
  b uuid := '18000000-0000-0000-0000-000000000002';
  c uuid := '18000000-0000-0000-0000-000000000003';
  outsider uuid := '18000000-0000-0000-0000-000000000004';
  sid uuid;
  value numeric;
begin
  sid := public.create_settlement(h,a,b,20,'2026-10-11','partial payment');
  assert (select created_by from public.settlements where id=sid)=a, 'Payer must be actual recorder';
  assert (select amount from public.settlements where id=sid)=20;
  perform set_config('settlement.test_id',sid::text,true);

  -- Receiver records the SAME economic direction, with receiver attribution.
  perform set_config('request.jwt.claim.sub',b::text,true);
  sid := public.create_settlement(h,a,b,80,'2026-10-11','remaining balance');
  assert (select created_by from public.settlements where id=sid)=b, 'Receiver must be actual recorder';
  assert (select from_user_id=a and to_user_id=b from public.settlements where id=sid), 'Receiving must never reverse payer/recipient';
  assert (select sum(amount) from public.settlements where household_id=h)=100;
  perform public.update_settlement(sid,a,b,75,'2026-10-12','receiver edit');
  assert (select updated_by from public.settlements where id=sid)=b;
  perform public.delete_settlement(sid);
  assert not exists (select 1 from public.settlements where id=sid), 'Soft-deleted payments must be hidden by existing RLS';

  -- A household member cannot create/edit/delete another pair's payment,
  -- or take over an existing payment by assigning themselves as recipient.
  sid := current_setting('settlement.test_id')::uuid;
  perform set_config('request.jwt.claim.sub',c::text,true);
  perform pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,10,current_date,null)',h,a,b),'42501');
  perform pg_temp.expect_error(format('select public.update_settlement(%L,%L,%L,10,current_date,null)',sid,a,b),'42501');
  perform pg_temp.expect_error(format('select public.update_settlement(%L,%L,%L,10,current_date,null)',sid,a,c),'42501');
  perform pg_temp.expect_error(format('select public.delete_settlement(%L)',sid),'42501');

  perform set_config('request.jwt.claim.sub',outsider::text,true);
  perform pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,10,current_date,null)',h,a,b),'42501');
  perform pg_temp.expect_error(format('select public.update_settlement(%L,%L,%L,10,current_date,null)',sid,a,b),'42501');
  perform pg_temp.expect_error(format('select public.delete_settlement(%L)',sid),'42501');

  perform set_config('request.jwt.claim.sub',a::text,true);
  -- An existing participant may not reassign the payment to two third parties.
  perform pg_temp.expect_error(format('select public.update_settlement(%L,%L,%L,10,current_date,null)',sid,b,c),'42501');
  perform pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,10,current_date,null)',h,a,outsider),'22023');
  perform pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,10,current_date,null)',h,a,a),'22023');
  perform pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,10,null,null)',h,a,b),'22023');
  foreach value in array array[0,-1,null,'NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric,1.001] loop
    perform pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,%L,current_date,null)',h,a,b,value),'22023');
    perform pg_temp.expect_error(format('select public.update_settlement(%L,%L,%L,%L,current_date,null)',sid,a,b,value),'22023');
  end loop;
  perform pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,10000000000,current_date,null)',h,a,b),'22003');
  perform pg_temp.expect_error(format('select public.update_settlement(%L,%L,%L,10000000000,current_date,null)',sid,a,b),'22003');

  -- Direct DML stays denied even to a legitimate participant.
  perform pg_temp.expect_error(format('insert into public.settlements(household_id,from_user_id,to_user_id,amount,settlement_date,created_by) values(%L,%L,%L,10,current_date,%L)',h,a,b,a),'42501');
  perform pg_temp.expect_error(format('update public.settlements set amount=1 where id=%L',sid),'42501');
  perform pg_temp.expect_error(format('delete from public.settlements where id=%L',sid),'42501');
  perform public.update_settlement(sid,a,b,21,'2026-10-11','payer edit');
  assert (select amount=21 and updated_by=a from public.settlements where id=sid);
  perform public.delete_settlement(sid);
  assert not exists (select 1 from public.settlements where id=sid), 'Soft-deleted payments must be hidden by existing RLS';

  perform set_config('request.jwt.claim.sub','',true);
  perform pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,10,current_date,null)',h,a,b),'42501');
end;
$$;
reset role;
set local role anon;
select pg_temp.expect_error('select public.create_settlement(null,null,null,10,current_date,null)','42501');
reset role;
do $$ begin
  assert (select count(*) from public.settlements where household_id='18000000-0000-0000-0000-000000000010' and deleted_at is not null)=2, 'Both participant deletions must be soft deletions';
end $$;
rollback;
