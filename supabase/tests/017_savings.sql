-- LOCAL disposable database only, with migrations 001-017 applied.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('17000000-0000-0000-0000-000000000001','savings-owner@example.test'),
 ('17000000-0000-0000-0000-000000000002','savings-partner@example.test'),
 ('17000000-0000-0000-0000-000000000003','savings-nonparticipant@example.test'),
 ('17000000-0000-0000-0000-000000000004','savings-outsider@example.test');
insert into public.households(id,name,created_by) values
 ('17000000-0000-0000-0000-000000000010','Savings test','17000000-0000-0000-0000-000000000001'),
 ('17000000-0000-0000-0000-000000000020','Other household','17000000-0000-0000-0000-000000000004');
insert into public.household_members(household_id,user_id) values
 ('17000000-0000-0000-0000-000000000010','17000000-0000-0000-0000-000000000002'),
 ('17000000-0000-0000-0000-000000000010','17000000-0000-0000-0000-000000000003');

create temporary table savings_financial_before as
select (select count(*) from public.expenses) expenses,
 (select count(*) from public.settlements) settlements,
 (select count(*) from public.common_fund_movements) fund,
 (select count(*) from public.recurring_expenses) recurring;

set local role authenticated;
select set_config('request.jwt.claim.sub','17000000-0000-0000-0000-000000000001',true);

do $$
declare
  v_personal uuid;
  v_shared uuid;
  v_fifty uuid;
  v_args jsonb;
  v_owner uuid := '17000000-0000-0000-0000-000000000001';
  v_partner uuid := '17000000-0000-0000-0000-000000000002';
  v_house uuid := '17000000-0000-0000-0000-000000000010';
  v_50 jsonb := '[{"user_id":"17000000-0000-0000-0000-000000000001","percentage":50},{"user_id":"17000000-0000-0000-0000-000000000002","percentage":50}]';
  v_30 jsonb := '[{"user_id":"17000000-0000-0000-0000-000000000001","percentage":30},{"user_id":"17000000-0000-0000-0000-000000000002","percentage":70}]';
begin
  v_personal := public.create_savings_goal(v_house,'Personal secret','personal',120000,null,v_50);
  assert (select owner_user_id from public.savings_goals where id=v_personal) = v_owner, 'A owner must come from auth';
  assert (select count(*) from public.savings_goal_participants where goal_id=v_personal)=1;
  perform public.add_savings_contribution(v_personal,45000,v_partner,'2026-09-06','personal');
  assert (select contributor_user_id from public.savings_movements where goal_id=v_personal)=v_owner, 'Personal contributor must be owner';

  v_fifty := public.create_savings_goal(v_house,'Shared 50/50','shared',null,null,v_50);
  v_shared := public.create_savings_goal(v_house,'Shared 30/70','shared',400000,'2027-06-01',v_30);
  assert (select sum(percentage) from public.savings_goal_participants where goal_id=v_fifty)=100, 'D';
  assert (select percentage from public.savings_goal_participants where goal_id=v_shared and user_id=v_owner)=30, 'E';
  perform public.update_savings_goal(v_fifty,'Editable before movement',null,null,v_30);
  assert (select percentage from public.savings_goal_participants where goal_id=v_fifty and user_id=v_owner)=30;
  perform set_config('savings.test_personal',v_personal::text,true);
  perform set_config('savings.test_shared',v_shared::text,true);

  for v_args in select * from (values
    ('[{"user_id":"17000000-0000-0000-0000-000000000001","percentage":30},{"user_id":"17000000-0000-0000-0000-000000000002","percentage":60}]'::jsonb),
    ('[{"user_id":"17000000-0000-0000-0000-000000000001","percentage":50},{"user_id":"17000000-0000-0000-0000-000000000004","percentage":50}]'::jsonb),
    ('[{"user_id":"17000000-0000-0000-0000-000000000001","percentage":50},{"user_id":"17000000-0000-0000-0000-000000000001","percentage":50}]'::jsonb),
    ('[{"user_id":"17000000-0000-0000-0000-000000000001","percentage":30.5},{"user_id":"17000000-0000-0000-0000-000000000002","percentage":69.5}]'::jsonb)
  ) as invalid(participants) loop
    begin
      perform public.create_savings_goal(v_house,'invalid','shared',null,null,v_args);
      raise exception 'Invalid allocation accepted: %',v_args;
    exception when sqlstate '22023' then null;
    end;
  end loop;

  perform public.add_savings_contribution(v_shared,30000,v_owner,'2026-09-05','Álvaro');
  perform public.add_savings_contribution(v_shared,20000,v_partner,'2026-09-06','Marta');
  assert (select sum(amount_cents) from public.savings_movements where goal_id=v_shared)=50000,'H-J: 500 EUR balance';
  assert (select sum(amount_cents) from public.savings_movements where goal_id=v_shared and contributor_user_id=v_owner)=30000,'K owner historical';
  perform public.withdraw_from_savings_goal(v_shared,10000,'2026-09-10','Retirada');
  assert (select sum(case when movement_type='contribution' then amount_cents else -amount_cents end)
    from public.savings_movements where goal_id=v_shared)=40000,'L balance 400';
  assert (select sum(amount_cents) from public.savings_movements where goal_id=v_shared and contributor_user_id=v_owner)=30000,'L owner historical unchanged';
  assert (select sum(amount_cents) from public.savings_movements where goal_id=v_shared and contributor_user_id=v_partner)=20000,'L partner historical unchanged';
  begin
    perform public.withdraw_from_savings_goal(v_shared,40001,'2026-09-10',null);
    raise exception 'M overdraft accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.update_savings_goal(v_shared,'Should not change',null,null,v_50);
    raise exception 'Participant change after movement accepted';
  exception when sqlstate '55000' then null;
  end;
  perform public.update_savings_goal(v_shared,'Renamed shared',500000,'2027-07-01',null);
  assert (select name from public.savings_goals where id=v_shared)='Renamed shared';
  perform public.set_savings_goal_archived(v_shared,true);
  assert (select archived_at from public.savings_goals where id=v_shared) is not null,'O archive';
  begin
    perform public.add_savings_contribution(v_shared,1,v_owner,'2026-09-10',null);
    raise exception 'Contribution to archived accepted';
  exception when sqlstate '55000' then null;
  end;
  perform public.set_savings_goal_archived(v_shared,false);
  assert (select archived_at from public.savings_goals where id=v_shared) is null,'P reactivate';
  assert (select count(*) from public.savings_movements where goal_id=v_shared)=3,'O/P movement retention';

  begin
    update public.savings_goals set name='DML' where id=v_shared;
    raise exception 'Q direct goal update accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.savings_goal_participants where goal_id=v_shared;
    raise exception 'Q direct participant delete accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.savings_movements(goal_id,movement_type,amount_cents,movement_date,created_by)
      values(v_shared,'withdrawal',1,'2026-09-10',v_owner);
    raise exception 'Q direct ledger insert accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B: partner sees the shared goals, not the personal goal, ids, counts or children.
select set_config('request.jwt.claim.sub','17000000-0000-0000-0000-000000000002',true);
do $$
declare v_personal uuid := current_setting('savings.test_personal')::uuid;
begin
  assert not exists(select 1 from public.savings_goals where id=v_personal);
  assert not exists(select 1 from public.savings_goal_participants where goal_id=v_personal);
  assert not exists(select 1 from public.savings_movements where goal_id=v_personal);
  assert (select count(*) from public.savings_goals where household_id='17000000-0000-0000-0000-000000000010')=2;
  begin
    perform public.withdraw_from_savings_goal(v_personal,1,'2026-09-10',null);
    raise exception 'Personal mutation leaked access';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Nonparticipant in the SAME household sees no goals/participants/movements.
select set_config('request.jwt.claim.sub','17000000-0000-0000-0000-000000000003',true);
do $$ begin
  assert (select count(*) from public.savings_goals)=0;
  assert (select count(*) from public.savings_goal_participants)=0;
  assert (select count(*) from public.savings_movements)=0;
  begin
    perform public.set_savings_goal_archived(current_setting('savings.test_shared')::uuid,true);
    raise exception 'Nonparticipant archive allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- C: other household sees no rows and cannot create in this household.
select set_config('request.jwt.claim.sub','17000000-0000-0000-0000-000000000004',true);
do $$ begin
  assert (select count(*) from public.savings_goals)=0;
  assert (select count(*) from public.savings_goal_participants)=0;
  assert (select count(*) from public.savings_movements)=0;
  begin
    perform public.create_savings_goal('17000000-0000-0000-0000-000000000010','intrusion','personal',null,null,null);
    raise exception 'Cross household create accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin
    perform public.withdraw_from_savings_goal(current_setting('savings.test_shared')::uuid,1,'2026-09-10',null);
    raise exception 'R anon execution accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.savings_goals;
    raise exception 'R anon select accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
declare v_function record; v_table text;
begin
  for v_function in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('create_savings_goal','update_savings_goal','set_savings_goal_archived','add_savings_contribution','withdraw_from_savings_goal')
  loop
    assert not has_function_privilege('anon',v_function.oid,'execute');
    assert has_function_privilege('authenticated',v_function.oid,'execute');
    assert (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid=v_function.oid);
  end loop;
  foreach v_table in array array['savings_goals','savings_goal_participants','savings_movements'] loop
    assert not has_table_privilege('authenticated','public.'||v_table,'insert,update,delete');
  end loop;
  assert (select expenses from savings_financial_before)=(select count(*) from public.expenses);
  assert (select settlements from savings_financial_before)=(select count(*) from public.settlements);
  assert (select fund from savings_financial_before)=(select count(*) from public.common_fund_movements);
  assert (select recurring from savings_financial_before)=(select count(*) from public.recurring_expenses);
end $$;
rollback;
select 'SAVINGS_SQL_A_M_O_R_PASSED (N requires concurrent sessions)' as result;
