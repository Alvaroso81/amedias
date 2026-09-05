begin;

alter table public.recurring_expenses
  add column deleted_at timestamptz;

comment on column public.recurring_expenses.deleted_at is
  'Soft-deletion timestamp. Historical confirmed expenses retain their occurrence link.';

create index recurring_expenses_deleted_at_idx
  on public.recurring_expenses (deleted_at);

-- An occurrence is a proposal snapshot. Later template edits must not silently
-- change a date that the user has already been asked to review.
alter table public.recurring_expense_occurrences
  add column proposed_description text,
  add column proposed_amount_cents bigint,
  add column proposed_category_id uuid references public.categories (id) on delete no action,
  add column proposed_expense_type text,
  add column proposed_payment_source text,
  add column proposed_payer_user_id uuid references auth.users (id) on delete restrict,
  add column proposed_split_config jsonb,
  add column proposed_note text;

update public.recurring_expense_occurrences as occurrence
set proposed_description = template.description,
    proposed_amount_cents = template.amount_cents,
    proposed_category_id = template.category_id,
    proposed_expense_type = template.expense_type,
    proposed_payment_source = template.payment_source,
    proposed_payer_user_id = template.payer_user_id,
    proposed_split_config = template.split_config,
    proposed_note = template.note
from public.recurring_expenses as template
where template.id = occurrence.recurring_expense_id;

alter table public.recurring_expense_occurrences
  alter column proposed_description set not null,
  alter column proposed_amount_cents set not null,
  alter column proposed_category_id set not null,
  alter column proposed_expense_type set not null,
  alter column proposed_payment_source set not null,
  alter column proposed_split_config set not null,
  add constraint recurring_occurrences_proposed_description_not_blank
    check (pg_catalog.btrim(proposed_description) <> ''),
  add constraint recurring_occurrences_proposed_amount_valid
    check (proposed_amount_cents between 1 and 999999999999),
  add constraint recurring_occurrences_proposed_type_valid
    check (proposed_expense_type in ('common', 'personal')),
  add constraint recurring_occurrences_proposed_payment_source_valid
    check (proposed_payment_source in ('member', 'common_fund'));

comment on column public.recurring_expense_occurrences.proposed_description is
  'Description snapshot captured when this occurrence is materialized.';
comment on column public.recurring_expense_occurrences.proposed_amount_cents is
  'Suggested amount snapshot; review may still override it for the real expense.';
comment on column public.recurring_expense_occurrences.proposed_split_config is
  'Split-percentage snapshot, independent from later template edits.';

-- Supabase database sessions normally use UTC. The product works with Spanish
-- civil dates, so current_date can lag the app by one day after local midnight.
create function private.current_recurring_civil_date()
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.timezone('Europe/Madrid', pg_catalog.statement_timestamp())::date;
$$;

revoke all privileges on function private.current_recurring_civil_date()
  from public, anon, authenticated;

create function private.first_recurring_due_on_or_after(
  p_start_date date,
  p_boundary date,
  p_frequency text,
  p_interval_count integer,
  p_anchor_day integer,
  p_anchor_month integer
)
returns date
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_due date := p_start_date;
  v_steps integer := 0;
begin
  while v_due < p_boundary loop
    v_due := private.next_recurring_due_date(
      v_due,
      p_frequency,
      p_interval_count,
      p_anchor_day,
      p_anchor_month
    );
    v_steps := v_steps + 1;

    if v_steps > 20000 then
      raise exception using errcode = '22023', message = 'RECURRING_SCHEDULE_RANGE_INVALID';
    end if;
  end loop;

  return v_due;
end;
$$;

revoke all privileges on function private.first_recurring_due_on_or_after(date, date, text, integer, integer, integer)
  from public, anon, authenticated;

-- Keep the 014 RPCs compatible for clients with a cached older bundle. The
-- table-level guard gives those entry points the same deletion and conservative
-- cursor semantics as the V2 wrappers introduced below.
create function private.protect_recurring_expense_lifecycle()
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
    new.next_due_date := private.first_recurring_due_on_or_after(
      new.start_date,
      old.next_due_date,
      new.frequency,
      new.interval_count,
      extract(day from new.start_date)::integer,
      extract(month from new.start_date)::integer
    );
  end if;

  return new;
end;
$$;

revoke all privileges on function private.protect_recurring_expense_lifecycle()
  from public, anon, authenticated;

create trigger recurring_expenses_protect_lifecycle
before update on public.recurring_expenses
for each row execute function private.protect_recurring_expense_lifecycle();

create or replace function public.ensure_recurring_occurrences(p_household_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_template public.recurring_expenses%rowtype;
  v_today date := private.current_recurring_civil_date();
  v_due date;
  v_created integer := 0;
  v_per_template integer;
  v_was_inserted integer;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'RECURRING_AUTH_REQUIRED';
  end if;

  if p_household_id is null or not exists (
    select 1 from public.household_members as member
    where member.household_id = p_household_id and member.user_id = v_caller_id
  ) then
    raise exception using errcode = '42501', message = 'RECURRING_ACCESS_DENIED';
  end if;

  for v_template in
    select template.*
    from public.recurring_expenses as template
    where template.household_id = p_household_id
      and template.is_active = true
      and template.deleted_at is null
      and (template.expense_type = 'common' or template.created_by = v_caller_id)
    order by template.next_due_date, template.id
    for update
  loop
    v_due := v_template.next_due_date;
    v_per_template := 0;

    while v_due <= v_today
      and v_per_template < 100
      and (v_template.end_date is null or v_due <= v_template.end_date)
    loop
      insert into public.recurring_expense_occurrences (
        recurring_expense_id,
        due_date,
        proposed_description,
        proposed_amount_cents,
        proposed_category_id,
        proposed_expense_type,
        proposed_payment_source,
        proposed_payer_user_id,
        proposed_split_config,
        proposed_note
      ) values (
        v_template.id,
        v_due,
        v_template.description,
        v_template.amount_cents,
        v_template.category_id,
        v_template.expense_type,
        v_template.payment_source,
        v_template.payer_user_id,
        v_template.split_config,
        v_template.note
      ) on conflict (recurring_expense_id, due_date) do nothing;

      get diagnostics v_was_inserted = row_count;
      v_created := v_created + v_was_inserted;
      v_per_template := v_per_template + 1;
      v_due := private.next_recurring_due_date(
        v_due,
        v_template.frequency,
        v_template.interval_count,
        v_template.anchor_day,
        v_template.anchor_month
      );
    end loop;

    update public.recurring_expenses
    set next_due_date = v_due,
        is_active = case
          when v_template.end_date is not null and v_due > v_template.end_date then false
          else is_active
        end
    where id = v_template.id;
  end loop;

  return v_created;
end;
$$;

-- V2 makes creation and initial materialization a single transaction. It also
-- protects older UI flows from needing a reload after creating a due template.
create function public.create_recurring_expense_v2(
  p_household_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_category_id uuid,
  p_expense_type text,
  p_payment_source text,
  p_payer_user_id uuid,
  p_split_config jsonb,
  p_frequency text,
  p_interval_count integer,
  p_start_date date,
  p_end_date date,
  p_note text,
  p_is_active boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.create_recurring_expense(
    p_household_id,
    p_description,
    p_amount_cents,
    p_category_id,
    p_expense_type,
    p_payment_source,
    p_payer_user_id,
    p_split_config,
    p_frequency,
    p_interval_count,
    p_start_date,
    p_end_date,
    p_note,
    p_is_active
  );

  perform public.ensure_recurring_occurrences(p_household_id);
  return v_id;
end;
$$;

-- Existing pending rows keep their proposal snapshot. Schedule edits only move
-- the next unmaterialized cursor, never backwards over an already proposed date.
create function public.update_recurring_expense_v2(
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
  v_schedule_changed boolean;
  v_next_due date;
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

  v_schedule_changed :=
    v_template.frequency <> p_frequency
    or v_template.interval_count <> p_interval_count
    or v_template.start_date <> p_start_date;

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

  if v_schedule_changed then
    v_next_due := private.first_recurring_due_on_or_after(
      p_start_date,
      v_template.next_due_date,
      p_frequency,
      p_interval_count,
      extract(day from p_start_date)::integer,
      extract(month from p_start_date)::integer
    );

    update public.recurring_expenses
    set next_due_date = v_next_due
    where id = p_recurring_expense_id;
  end if;

  perform public.ensure_recurring_occurrences(v_template.household_id);
  return p_recurring_expense_id;
end;
$$;

create function public.set_recurring_expense_active_v2(
  p_recurring_expense_id uuid,
  p_is_active boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_household_id uuid;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'RECURRING_AUTH_REQUIRED';
  end if;

  select template.household_id into v_household_id
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

  perform public.set_recurring_expense_active(p_recurring_expense_id, p_is_active);
  if p_is_active then
    perform public.ensure_recurring_occurrences(v_household_id);
  end if;

  return p_recurring_expense_id;
end;
$$;

create or replace function public.confirm_recurring_expense_occurrence(
  p_occurrence_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_category_id uuid,
  p_expense_date date,
  p_note text,
  p_payment_source text,
  p_paid_by_user_id uuid,
  p_splits jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_occurrence public.recurring_expense_occurrences%rowtype;
  v_template public.recurring_expenses%rowtype;
  v_expense_id uuid;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'RECURRING_AUTH_REQUIRED';
  end if;

  select occurrence.* into v_occurrence
  from public.recurring_expense_occurrences as occurrence
  where occurrence.id = p_occurrence_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'RECURRING_ACCESS_DENIED';
  end if;

  select template.* into v_template
  from public.recurring_expenses as template
  where template.id = v_occurrence.recurring_expense_id
    and template.deleted_at is null
    and (
      (template.expense_type = 'common' and exists (
        select 1 from public.household_members as member
        where member.household_id = template.household_id and member.user_id = v_caller_id
      ))
      or (template.expense_type = 'personal' and template.created_by = v_caller_id)
    );

  if not found then
    raise exception using errcode = '42501', message = 'RECURRING_ACCESS_DENIED';
  end if;

  if v_occurrence.status <> 'pending' then
    raise exception using errcode = '55000', message = 'RECURRING_OCCURRENCE_ALREADY_RESOLVED';
  end if;

  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 999999999999 then
    raise exception using errcode = '22023', message = 'RECURRING_AMOUNT_INVALID';
  end if;

  if v_occurrence.proposed_expense_type = 'personal' and (
    p_payment_source <> 'member' or p_paid_by_user_id <> v_caller_id
  ) then
    raise exception using errcode = '42501', message = 'RECURRING_PERSONAL_OWNER_REQUIRED';
  end if;

  v_expense_id := public.create_expense_v3(
    v_template.household_id,
    p_description,
    p_amount_cents::numeric / 100,
    p_category_id,
    p_expense_date,
    v_occurrence.proposed_expense_type,
    p_note,
    p_payment_source,
    p_paid_by_user_id,
    case when p_payment_source = 'member' then p_amount_cents::numeric / 100 else null end,
    p_splits,
    null
  );

  update public.recurring_expense_occurrences
  set status = 'confirmed',
      expense_id = v_expense_id,
      resolved_at = now(),
      resolved_by = v_caller_id
  where id = p_occurrence_id;

  return v_expense_id;
end;
$$;

create or replace function public.skip_recurring_expense_occurrence(p_occurrence_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_occurrence public.recurring_expense_occurrences%rowtype;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'RECURRING_AUTH_REQUIRED';
  end if;

  select occurrence.* into v_occurrence
  from public.recurring_expense_occurrences as occurrence
  join public.recurring_expenses as template
    on template.id = occurrence.recurring_expense_id
  where occurrence.id = p_occurrence_id
    and template.deleted_at is null
    and (
      (template.expense_type = 'common' and exists (
        select 1 from public.household_members as member
        where member.household_id = template.household_id and member.user_id = v_caller_id
      ))
      or (template.expense_type = 'personal' and template.created_by = v_caller_id)
    )
  for update of occurrence;

  if not found then
    raise exception using errcode = '42501', message = 'RECURRING_ACCESS_DENIED';
  end if;

  if v_occurrence.status <> 'pending' then
    raise exception using errcode = '55000', message = 'RECURRING_OCCURRENCE_ALREADY_RESOLVED';
  end if;

  update public.recurring_expense_occurrences
  set status = 'skipped',
      resolved_at = now(),
      resolved_by = v_caller_id
  where id = p_occurrence_id;

  return p_occurrence_id;
end;
$$;

create function public.delete_recurring_expense(p_recurring_expense_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'RECURRING_AUTH_REQUIRED';
  end if;

  update public.recurring_expenses as template
  set deleted_at = now(),
      is_active = false
  where template.id = p_recurring_expense_id
    and template.deleted_at is null
    and (
      (template.expense_type = 'common' and exists (
        select 1 from public.household_members as member
        where member.household_id = template.household_id and member.user_id = v_caller_id
      ))
      or (template.expense_type = 'personal' and template.created_by = v_caller_id)
    );

  if not found then
    raise exception using errcode = '42501', message = 'RECURRING_ACCESS_DENIED';
  end if;

  update public.recurring_expense_occurrences
  set status = 'skipped',
      resolved_at = now(),
      resolved_by = v_caller_id
  where recurring_expense_id = p_recurring_expense_id
    and status = 'pending';

  return p_recurring_expense_id;
end;
$$;

create function public.get_recurring_expense_links(p_household_id uuid)
returns table (
  expense_id uuid,
  recurring_expense_id uuid,
  due_date date,
  frequency text,
  interval_count integer,
  anchor_day integer,
  anchor_month integer,
  next_due_date date,
  is_active boolean,
  deleted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'RECURRING_AUTH_REQUIRED';
  end if;

  if p_household_id is null or not exists (
    select 1 from public.household_members as member
    where member.household_id = p_household_id and member.user_id = v_caller_id
  ) then
    raise exception using errcode = '42501', message = 'RECURRING_ACCESS_DENIED';
  end if;

  return query
  select
    expense.id,
    template.id,
    occurrence.due_date,
    template.frequency,
    template.interval_count,
    template.anchor_day,
    template.anchor_month,
    template.next_due_date,
    template.is_active,
    template.deleted_at
  from public.recurring_expense_occurrences as occurrence
  join public.recurring_expenses as template
    on template.id = occurrence.recurring_expense_id
  join public.expenses as expense
    on expense.id = occurrence.expense_id
  where template.household_id = p_household_id
    and occurrence.status = 'confirmed'
    and expense.deleted_at is null
    and (
      template.expense_type = 'common'
      or template.created_by = v_caller_id
    )
    and (
      (expense.expense_type = 'common' and exists (
        select 1 from public.household_members as member
        where member.household_id = expense.household_id and member.user_id = v_caller_id
      ))
      or (expense.expense_type = 'personal' and expense.personal_owner_id = v_caller_id)
    );
end;
$$;

drop policy if exists "recurring_expenses_select_visible"
  on public.recurring_expenses;
create policy "recurring_expenses_select_visible"
on public.recurring_expenses
for select
to authenticated
using (
  deleted_at is null
  and (
    (expense_type = 'common' and (select public.is_household_member(household_id)))
    or (expense_type = 'personal' and created_by = (select auth.uid()))
  )
);

drop policy if exists "recurring_occurrences_select_visible"
  on public.recurring_expense_occurrences;
create policy "recurring_occurrences_select_visible"
on public.recurring_expense_occurrences
for select
to authenticated
using (
  exists (
    select 1
    from public.recurring_expenses as template
    where template.id = recurring_expense_id
      and template.deleted_at is null
      and (
        (template.expense_type = 'common' and (select public.is_household_member(template.household_id)))
        or (template.expense_type = 'personal' and template.created_by = (select auth.uid()))
      )
  )
);

-- The frontend uses the atomic V2 wrappers. The 014 update/active RPC grants
-- remain available to cached clients and are protected by the lifecycle trigger.

revoke all privileges on function public.create_recurring_expense_v2(uuid, text, bigint, uuid, text, text, uuid, jsonb, text, integer, date, date, text, boolean)
  from public, anon, authenticated;
revoke all privileges on function public.update_recurring_expense_v2(uuid, text, bigint, uuid, text, uuid, jsonb, text, integer, date, date, text)
  from public, anon, authenticated;
revoke all privileges on function public.set_recurring_expense_active_v2(uuid, boolean)
  from public, anon, authenticated;
revoke all privileges on function public.delete_recurring_expense(uuid)
  from public, anon, authenticated;
revoke all privileges on function public.get_recurring_expense_links(uuid)
  from public, anon, authenticated;

grant execute on function public.create_recurring_expense_v2(uuid, text, bigint, uuid, text, text, uuid, jsonb, text, integer, date, date, text, boolean)
  to authenticated;
grant execute on function public.update_recurring_expense_v2(uuid, text, bigint, uuid, text, uuid, jsonb, text, integer, date, date, text)
  to authenticated;
grant execute on function public.set_recurring_expense_active_v2(uuid, boolean)
  to authenticated;
grant execute on function public.delete_recurring_expense(uuid)
  to authenticated;
grant execute on function public.get_recurring_expense_links(uuid)
  to authenticated;

comment on function public.create_recurring_expense_v2(uuid, text, bigint, uuid, text, text, uuid, jsonb, text, integer, date, date, text, boolean) is
  'Creates a recurring template and materializes every visible due proposal through the current Spanish civil date in one transaction.';
comment on function public.delete_recurring_expense(uuid) is
  'Soft-deletes an accessible template and atomically skips all of its pending occurrences.';
comment on function public.get_recurring_expense_links(uuid) is
  'Returns recurrence metadata only for expenses visible to the caller, including links to soft-deleted templates.';

commit;
