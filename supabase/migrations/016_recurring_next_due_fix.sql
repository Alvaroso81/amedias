begin;

-- The 015 edit compared the new schedule to the old NEXT DATE (Oct 6).
-- Oct 5 was therefore discarded even though October had not been materialized.
-- For monthly edits, use the consumed calendar cycle, not that old day.
create function private.next_monthly_due_after_edit(
  p_recurring_expense_id uuid,
  p_start_date date,
  p_interval_count integer,
  p_today date
)
returns date
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_last_materialized date;
  v_boundary date := p_today + 1;
begin
  -- Every materialized state consumes its cycle: pending, confirmed and skipped.
  -- Do not rewrite snapshots, reopen skipped rows, or duplicate a consumed month.
  select max(occurrence.due_date) into v_last_materialized
  from public.recurring_expense_occurrences as occurrence
  where occurrence.recurring_expense_id = p_recurring_expense_id;

  if v_last_materialized is not null then
    v_boundary := greatest(
      v_boundary,
      (pg_catalog.date_trunc('month', v_last_materialized)::date
        + pg_catalog.make_interval(months => p_interval_count))::date
    );
  end if;

  -- start_date preserves the new rule's phase for intervals greater than one.
  -- The existing date helper preserves day 31 across short months.
  return private.first_recurring_due_on_or_after(
    p_start_date, v_boundary, 'monthly', p_interval_count,
    extract(day from p_start_date)::integer,
    extract(month from p_start_date)::integer
  );
end;
$$;

revoke all privileges on function private.next_monthly_due_after_edit(uuid, date, integer, date)
  from public, anon, authenticated;

create or replace function private.protect_recurring_expense_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception using errcode = '55000', message = 'RECURRING_EXPENSE_DELETED';
  end if;

  if old.frequency <> new.frequency
    or old.interval_count <> new.interval_count
    or old.start_date <> new.start_date then
    if new.frequency = 'monthly' then
      new.next_due_date := private.next_monthly_due_after_edit(
        old.id, new.start_date, new.interval_count,
        private.current_recurring_civil_date()
      );
    else
      -- Weekly/yearly editing keeps the existing 015 behavior.
      new.next_due_date := private.first_recurring_due_on_or_after(
        new.start_date, old.next_due_date, new.frequency, new.interval_count,
        extract(day from new.start_date)::integer,
        extract(month from new.start_date)::integer
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.update_recurring_expense_v2(
  p_recurring_expense_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_category_id uuid,
  p_payment_source text,
  p_payer_user_id uuid,
  p_split_config jsonb,
  p_frequency text,
  p_interval_count integer,
  p_start_date date,
  p_end_date date,
  p_note text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_template public.recurring_expenses%rowtype;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'RECURRING_AUTH_REQUIRED';
  end if;

  select template.* into v_template
  from public.recurring_expenses as template
  where template.id = p_recurring_expense_id
    and template.deleted_at is null
    and (
      (template.expense_type = 'common' and exists (
        select 1 from public.household_members as member
        where member.household_id = template.household_id and member.user_id = v_caller_id
      ))
      or (template.expense_type = 'personal' and template.created_by = v_caller_id)
    )
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'RECURRING_ACCESS_DENIED';
  end if;

  perform public.update_recurring_expense(
    p_recurring_expense_id,
    p_description,
    p_amount_cents,
    p_category_id,
    p_payment_source,
    p_payer_user_id,
    p_split_config,
    p_frequency,
    p_interval_count,
    p_start_date,
    p_end_date,
    p_note
  );

  -- The lifecycle trigger is the sole schedule-cursor writer on edits.
  perform public.ensure_recurring_occurrences(v_template.household_id);
  return p_recurring_expense_id;
end;
$$;

-- Repair future monthly cursors already displaced by 015, based on actual
-- materialized cycles. Never consume an occurrence or move a due/overdue cursor.
-- October pending/skipped/confirmed keeps November (monthly interval 1).
-- Deleted templates, schedules without history, and activity flags are untouched.
do $$
declare
  v_template public.recurring_expenses%rowtype;
  v_candidate date;
  v_today date := private.current_recurring_civil_date();
begin
  for v_template in
    select template.*
    from public.recurring_expenses as template
    where template.deleted_at is null
      and template.frequency = 'monthly'
      and template.next_due_date > v_today
      and exists (
        select 1 from public.recurring_expense_occurrences as occurrence
        where occurrence.recurring_expense_id = template.id
      )
    order by template.id
    for update
  loop
    v_candidate := private.next_monthly_due_after_edit(
      v_template.id, v_template.start_date, v_template.interval_count, v_today
    );
    if v_candidate < v_template.next_due_date then
      update public.recurring_expenses
      set next_due_date = v_candidate
      where id = v_template.id;
    end if;
  end loop;
end;
$$;

comment on function private.next_monthly_due_after_edit(uuid, date, integer, date) is
  'First future date on the new monthly rule after all materialized cycles; every occurrence status consumes its month and interval.';

commit;
