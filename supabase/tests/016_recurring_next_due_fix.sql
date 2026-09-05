-- LOCAL TEST DATABASE ONLY. Requires migrations 001-016.
-- Fixtures and the deterministic clock are rolled back at the end.
\set ON_ERROR_STOP on
begin;

create or replace function private.current_recurring_civil_date()
returns date language sql stable set search_path = ''
as $$ select coalesce(nullif(current_setting('amedias.test_today', true), '')::date, date '2026-09-06') $$;

insert into auth.users(id, email) values
  ('16000000-0000-0000-0000-000000000001', 'recurrence16@example.test');
insert into public.households(id, name, created_by) values
  ('16000000-0000-0000-0000-000000000002', 'Recurrence 016 test', '16000000-0000-0000-0000-000000000001');

do $$
declare
  v_case record;
  v_id uuid;
  v_occ uuid;
  v_expense uuid;
  v_category uuid;
  v_before jsonb;
  v_expense_before jsonb;
  v_owner uuid := '16000000-0000-0000-0000-000000000001';
  v_household uuid := '16000000-0000-0000-0000-000000000002';
  v_splits jsonb := '[{"user_id":"16000000-0000-0000-0000-000000000001","share_percent":100}]';
begin
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  select id into v_category from public.categories where household_id = v_household and not archived limit 1;

  for v_case in
    select * from (values
      ('A: day 6 to 5', date '2026-09-06', date '2026-09-06', date '2026-09-05', 1, 'confirmed', date '2026-10-05'),
      ('B: day 6 to 10', date '2026-09-06', date '2026-09-06', date '2026-09-10', 1, 'confirmed', date '2026-10-10'),
      ('backward 20 to 5', date '2026-09-21', date '2026-09-20', date '2026-09-05', 1, 'confirmed', date '2026-10-05'),
      ('C: unchanged day 31', date '2026-01-31', date '2026-01-31', date '2026-01-31', 1, 'confirmed', date '2026-02-28'),
      ('D: two months', date '2026-09-06', date '2026-09-06', date '2026-09-05', 2, 'confirmed', date '2026-11-05'),
      ('D: two months forward', date '2026-09-06', date '2026-09-06', date '2026-09-10', 2, 'confirmed', date '2026-11-10'),
      ('pending cycle', date '2026-09-06', date '2026-09-06', date '2026-09-05', 1, 'pending', date '2026-10-05'),
      ('skipped cycle', date '2026-09-06', date '2026-09-06', date '2026-09-05', 1, 'skipped', date '2026-10-05'),
      ('empty September', date '2026-09-06', date '2026-09-20', date '2026-09-10', 1, 'none', date '2026-09-10')
    ) as cases(label, today, original_start, new_start, interval_count, occurrence_status, expected)
  loop
    perform set_config('amedias.test_today', v_case.today::text, true);
    v_expense := null;
    v_id := public.create_recurring_expense_v2(
      v_household, v_case.label, 1499, v_category, 'personal', 'member', v_owner, v_splits,
      'monthly', v_case.interval_count, v_case.original_start, null, 'snapshot', true
    );
    select id into v_occ from public.recurring_expense_occurrences where recurring_expense_id = v_id order by due_date limit 1;
    if v_case.occurrence_status = 'confirmed' then
      v_expense := public.confirm_recurring_expense_occurrence(
        v_occ, v_case.label, 1499, v_category, v_case.original_start, 'historical', 'member', v_owner,
        '[{"user_id":"16000000-0000-0000-0000-000000000001","share_percent":100,"share_amount":14.99}]'
      );
    elsif v_case.occurrence_status = 'skipped' then
      perform public.skip_recurring_expense_occurrence(v_occ);
    end if;
    select jsonb_agg(to_jsonb(o) order by o.id) into v_before
      from public.recurring_expense_occurrences o where recurring_expense_id = v_id;
    select to_jsonb(e) into v_expense_before from public.expenses e where id = v_expense;

    perform public.update_recurring_expense_v2(
      v_id, v_case.label || ' edited', 1999, v_category, 'member', v_owner, v_splits,
      'monthly', v_case.interval_count, v_case.new_start, null, 'new suggestion'
    );
    assert (select next_due_date from public.recurring_expenses where id = v_id) = v_case.expected,
      v_case.label || ': incorrect cursor';
    -- E/F: RPC + repeated frontend refresh cannot advance future cursors,
    -- alter pending/confirmed/skipped snapshots, or change an existing expense.
    perform public.ensure_recurring_occurrences(v_household);
    perform public.ensure_recurring_occurrences(v_household);
    assert (select next_due_date from public.recurring_expenses where id = v_id) = v_case.expected,
      v_case.label || ': refresh advanced cursor';
    assert (select jsonb_agg(to_jsonb(o) order by o.id) from public.recurring_expense_occurrences o
      where recurring_expense_id = v_id) is not distinct from v_before,
      v_case.label || ': occurrence changed/duplicated';
    assert (select to_jsonb(e) from public.expenses e where id = v_expense) is not distinct from v_expense_before,
      v_case.label || ': expense changed';

    -- Re-saving the same rule must not recalculate the cursor.
    perform public.update_recurring_expense_v2(
      v_id, v_case.label || ' edited', 1999, v_category, 'member', v_owner, v_splits,
      'monthly', v_case.interval_count, v_case.new_start, null, 'new suggestion'
    );
    assert (select next_due_date from public.recurring_expenses where id = v_id) = v_case.expected;
    perform public.set_recurring_expense_active_v2(v_id, false);
    perform public.ensure_recurring_occurrences(v_household);
    perform public.set_recurring_expense_active_v2(v_id, true);
    assert (select next_due_date from public.recurring_expenses where id = v_id) = v_case.expected;
    perform public.delete_recurring_expense(v_id);
    perform public.ensure_recurring_occurrences(v_household);
    assert not exists (select 1 from public.recurring_expense_occurrences where recurring_expense_id = v_id and status = 'pending');
    assert (select to_jsonb(e) from public.expenses e where id = v_expense) is not distinct from v_expense_before;
    raise notice 'PASS %', v_case.label;
  end loop;

  -- October can legitimately consume the next monthly cycle in ANY state.
  for v_case in select unnest(array['pending','skipped','confirmed']) as status loop
    perform set_config('amedias.test_today', '2026-09-06', true);
    v_id := public.create_recurring_expense_v2(
      v_household, 'October ' || v_case.status, 1499, v_category, 'personal', 'member', v_owner, v_splits,
      'monthly', 1, '2026-09-06', null, null, true
    );
    perform set_config('amedias.test_today', '2026-10-06', true);
    perform public.ensure_recurring_occurrences(v_household);
    select id into v_occ from public.recurring_expense_occurrences where recurring_expense_id = v_id and due_date = date '2026-10-06';
    if v_case.status = 'skipped' then
      perform public.skip_recurring_expense_occurrence(v_occ);
    elsif v_case.status = 'confirmed' then
      perform public.confirm_recurring_expense_occurrence(
        v_occ, 'October confirmed', 1499, v_category, '2026-10-06', null, 'member', v_owner,
        '[{"user_id":"16000000-0000-0000-0000-000000000001","share_percent":100,"share_amount":14.99}]'
      );
    end if;
    -- Simulate the reported September inspection with October already present.
    perform set_config('amedias.test_today', '2026-09-06', true);
    select jsonb_agg(to_jsonb(o) order by o.id) into v_before from public.recurring_expense_occurrences o where recurring_expense_id = v_id;
    perform public.update_recurring_expense_v2(
      v_id, 'October ' || v_case.status, 1499, v_category, 'member', v_owner, v_splits,
      'monthly', 1, '2026-09-05', null, null
    );
    assert (select next_due_date from public.recurring_expenses where id = v_id) = date '2026-11-05';
    assert (select jsonb_agg(to_jsonb(o) order by o.id) from public.recurring_expense_occurrences o
      where recurring_expense_id = v_id) = v_before;
    perform public.delete_recurring_expense(v_id);
    raise notice 'PASS October % preserved; November justified', v_case.status;
  end loop;

  assert private.next_recurring_due_date('2026-01-31', 'monthly', 1, 31, 1) = date '2026-02-28';
  assert private.next_recurring_due_date('2026-02-28', 'monthly', 1, 31, 1) = date '2026-03-31';
  assert private.next_recurring_due_date('2028-01-31', 'monthly', 1, 31, 1) = date '2028-02-29';

  -- Permissions / search path are retained on the replaced public RPC.
  assert has_function_privilege('authenticated',
    'public.update_recurring_expense_v2(uuid,text,bigint,uuid,text,uuid,jsonb,text,integer,date,date,text)', 'execute');
  assert not has_function_privilege('anon',
    'public.update_recurring_expense_v2(uuid,text,bigint,uuid,text,uuid,jsonb,text,integer,date,date,text)', 'execute');
  assert not has_function_privilege('authenticated',
    'private.next_monthly_due_after_edit(uuid,date,integer,date)', 'execute');
end;
$$;

rollback;
select 'ALL_016_REGRESSIONS_PASSED' as result;
