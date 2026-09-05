begin;

-- Recurring expenses are templates only. Financial rows are created exclusively
-- when a pending occurrence is confirmed through create_expense_v3.
create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  description text not null,
  amount_cents bigint not null,
  category_id uuid not null,
  expense_type text not null,
  payment_source text not null,
  payer_user_id uuid references auth.users (id) on delete restrict,
  split_config jsonb not null,
  frequency text not null,
  interval_count integer not null default 1,
  start_date date not null,
  anchor_day integer not null,
  anchor_month integer not null,
  next_due_date date not null,
  end_date date,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_expenses_description_not_blank
    check (pg_catalog.btrim(description) <> ''),
  constraint recurring_expenses_amount_cents_valid
    check (amount_cents between 1 and 999999999999),
  constraint recurring_expenses_type_valid
    check (expense_type in ('common', 'personal')),
  constraint recurring_expenses_payment_source_valid
    check (payment_source in ('member', 'common_fund')),
  constraint recurring_expenses_frequency_valid
    check (frequency in ('weekly', 'monthly', 'yearly')),
  constraint recurring_expenses_interval_count_valid
    check (interval_count between 1 and 120),
  constraint recurring_expenses_anchor_day_valid
    check (anchor_day between 1 and 31),
  constraint recurring_expenses_anchor_month_valid
    check (anchor_month between 1 and 12),
  constraint recurring_expenses_dates_valid
    check (end_date is null or end_date >= start_date),
  constraint recurring_expenses_personal_shape_valid check (
    (expense_type = 'common')
    or (
      expense_type = 'personal'
      and payment_source = 'member'
      and payer_user_id = created_by
    )
  ),
  constraint recurring_expenses_category_household_fkey
    foreign key (category_id, household_id)
    references public.categories (id, household_id)
    on delete no action
);

comment on table public.recurring_expenses is
  'Non-financial templates used to propose expenses for manual review and confirmation.';
comment on column public.recurring_expenses.amount_cents is
  'Suggested amount in integer cents; it may be changed for an individual occurrence.';
comment on column public.recurring_expenses.split_config is
  'Validated JSON array of household member user_id and share_percent values.';
comment on column public.recurring_expenses.anchor_day is
  'Original civil day used to recover day 29/30/31 after a shorter month.';
comment on column public.recurring_expenses.anchor_month is
  'Original civil month used by yearly schedules, including leap-day schedules.';
comment on column public.recurring_expenses.next_due_date is
  'Next unmaterialized scheduled civil date. Pending dates live in recurring_expense_occurrences.';

create table public.recurring_expense_occurrences (
  id uuid primary key default gen_random_uuid(),
  recurring_expense_id uuid not null
    references public.recurring_expenses (id) on delete cascade,
  due_date date not null,
  expense_id uuid references public.expenses (id) on delete restrict,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete restrict,
  constraint recurring_expense_occurrences_status_valid
    check (status in ('pending', 'confirmed', 'skipped')),
  constraint recurring_expense_occurrences_resolution_valid check (
    (status = 'pending' and expense_id is null and resolved_at is null and resolved_by is null)
    or (status = 'confirmed' and expense_id is not null and resolved_at is not null and resolved_by is not null)
    or (status = 'skipped' and expense_id is null and resolved_at is not null and resolved_by is not null)
  ),
  constraint recurring_expense_occurrences_template_date_unique
    unique (recurring_expense_id, due_date)
);

comment on table public.recurring_expense_occurrences is
  'Idempotent scheduled dates. Pending and skipped rows have no financial effect.';

create index recurring_expenses_household_active_due_idx
  on public.recurring_expenses (household_id, is_active, next_due_date);
create index recurring_expenses_created_by_idx
  on public.recurring_expenses (created_by);
create index recurring_expense_occurrences_pending_due_idx
  on public.recurring_expense_occurrences (due_date, recurring_expense_id)
  where status = 'pending';
create index recurring_expense_occurrences_expense_id_idx
  on public.recurring_expense_occurrences (expense_id)
  where expense_id is not null;

create trigger recurring_expenses_set_updated_at
before update on public.recurring_expenses
for each row execute function public.set_updated_at();

-- Monthly and yearly schedules always use their original anchors. Thus
-- 31 January -> last day of February -> 31 March, and 29 February yearly uses
-- 28 February in non-leap years before returning to 29 February in leap years.
create function private.next_recurring_due_date(
  p_due_date date,
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
  v_target_month date;
  v_last_day integer;
  v_target_year integer;
begin
  if p_frequency = 'weekly' then
    return p_due_date + (p_interval_count * 7);
  end if;

  if p_frequency = 'monthly' then
    v_target_month := (
      pg_catalog.date_trunc('month', p_due_date)::date
      + pg_catalog.make_interval(months => p_interval_count)
    )::date;
    v_last_day := extract(day from (
      v_target_month + interval '1 month - 1 day'
    ))::integer;
    return pg_catalog.make_date(
      extract(year from v_target_month)::integer,
      extract(month from v_target_month)::integer,
      least(p_anchor_day, v_last_day)
    );
  end if;

  if p_frequency = 'yearly' then
    v_target_year := extract(year from p_due_date)::integer + p_interval_count;
    v_target_month := pg_catalog.make_date(v_target_year, p_anchor_month, 1);
    v_last_day := extract(day from (
      v_target_month + interval '1 month - 1 day'
    ))::integer;
    return pg_catalog.make_date(
      v_target_year,
      p_anchor_month,
      least(p_anchor_day, v_last_day)
    );
  end if;

  raise exception using errcode = '22023', message = 'RECURRING_FREQUENCY_INVALID';
end;
$$;

revoke all privileges on function private.next_recurring_due_date(date, text, integer, integer, integer)
  from public, anon, authenticated;

create function private.validate_recurring_split_config(
  p_household_id uuid,
  p_expense_type text,
  p_payment_source text,
  p_payer_user_id uuid,
  p_split_config jsonb,
  p_caller_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_user_id uuid;
  v_share_percent numeric;
  v_seen_user_ids uuid[] := '{}'::uuid[];
  v_count integer := 0;
  v_total numeric := 0;
  v_normalized jsonb := '[]'::jsonb;
begin
  if p_expense_type not in ('common', 'personal') then
    raise exception using errcode = '22023', message = 'RECURRING_EXPENSE_TYPE_INVALID';
  end if;

  if p_payment_source not in ('member', 'common_fund') then
    raise exception using errcode = '22023', message = 'RECURRING_PAYMENT_SOURCE_INVALID';
  end if;

  if p_payment_source = 'member' then
    if p_payer_user_id is null or not exists (
      select 1
      from public.household_members as member
      where member.household_id = p_household_id
        and member.user_id = p_payer_user_id
    ) then
      raise exception using errcode = '22023', message = 'RECURRING_PAYER_INVALID';
    end if;
  elsif p_payer_user_id is not null then
    raise exception using errcode = '22023', message = 'RECURRING_FUND_PAYER_MUST_BE_EMPTY';
  end if;

  if p_expense_type = 'personal' and (
    p_payment_source <> 'member' or p_payer_user_id <> p_caller_id
  ) then
    raise exception using errcode = '42501', message = 'RECURRING_PERSONAL_OWNER_REQUIRED';
  end if;

  if p_payment_source = 'common_fund' and p_expense_type <> 'common' then
    raise exception using errcode = '22023', message = 'RECURRING_FUND_COMMON_ONLY';
  end if;

  if p_split_config is null or pg_catalog.jsonb_typeof(p_split_config) <> 'array' then
    raise exception using errcode = '22023', message = 'RECURRING_SPLITS_INVALID';
  end if;

  for v_item in
    select split_item.value
    from pg_catalog.jsonb_array_elements(p_split_config) as split_item(value)
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'RECURRING_SPLITS_INVALID';
    end if;

    begin
      v_user_id := nullif(v_item ->> 'user_id', '')::uuid;
      v_share_percent := nullif(v_item ->> 'share_percent', '')::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = '22023', message = 'RECURRING_SPLITS_INVALID';
    end;

    if v_user_id is null or v_share_percent is null
      or v_share_percent < 0 or v_share_percent > 100
      or v_share_percent <> pg_catalog.round(v_share_percent, 2)
      or v_user_id = any (v_seen_user_ids)
      or not exists (
        select 1
        from public.household_members as member
        where member.household_id = p_household_id
          and member.user_id = v_user_id
      ) then
      raise exception using errcode = '22023', message = 'RECURRING_SPLITS_INVALID';
    end if;

    v_seen_user_ids := pg_catalog.array_append(v_seen_user_ids, v_user_id);
    v_count := v_count + 1;
    v_total := v_total + v_share_percent;
    v_normalized := v_normalized || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'user_id', v_user_id,
        'share_percent', v_share_percent
      )
    );
  end loop;

  if v_count = 0 or v_total <> 100 then
    raise exception using errcode = '22023', message = 'RECURRING_SPLITS_INVALID';
  end if;

  if p_expense_type = 'personal' and (
    v_count <> 1
    or v_seen_user_ids[1] <> p_caller_id
    or v_total <> 100
  ) then
    raise exception using errcode = '42501', message = 'RECURRING_PERSONAL_OWNER_REQUIRED';
  end if;

  if p_payment_source = 'common_fund' and (
    v_count <> 2
    or (select count(*) from public.household_members as member where member.household_id = p_household_id) <> 2
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_normalized) as split_item(value)
      where (split_item.value ->> 'share_percent')::numeric <> 50
    )
  ) then
    raise exception using errcode = '22023', message = 'RECURRING_FUND_SPLIT_INVALID';
  end if;

  return v_normalized;
end;
$$;

revoke all privileges on function private.validate_recurring_split_config(uuid, text, text, uuid, jsonb, uuid)
  from public, anon, authenticated;

create function public.create_recurring_expense(
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
  v_caller_id uuid := (select auth.uid());
  v_id uuid;
  v_split_config jsonb;
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

  if p_description is null or pg_catalog.btrim(p_description) = '' then
    raise exception using errcode = '22023', message = 'RECURRING_DESCRIPTION_REQUIRED';
  end if;

  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 999999999999 then
    raise exception using errcode = '22023', message = 'RECURRING_AMOUNT_INVALID';
  end if;

  if p_category_id is null or not exists (
    select 1 from public.categories as category
    where category.id = p_category_id
      and category.household_id = p_household_id
      and category.archived = false
  ) then
    raise exception using errcode = '22023', message = 'RECURRING_CATEGORY_INVALID';
  end if;

  if p_frequency not in ('weekly', 'monthly', 'yearly')
    or p_interval_count is null or p_interval_count < 1 or p_interval_count > 120 then
    raise exception using errcode = '22023', message = 'RECURRING_SCHEDULE_INVALID';
  end if;

  if p_start_date is null or (p_end_date is not null and p_end_date < p_start_date) then
    raise exception using errcode = '22023', message = 'RECURRING_DATES_INVALID';
  end if;

  if p_is_active is null then
    raise exception using errcode = '22023', message = 'RECURRING_ACTIVE_REQUIRED';
  end if;

  v_split_config := private.validate_recurring_split_config(
    p_household_id,
    p_expense_type,
    p_payment_source,
    p_payer_user_id,
    p_split_config,
    v_caller_id
  );

  insert into public.recurring_expenses (
    household_id, created_by, description, amount_cents, category_id,
    expense_type, payment_source, payer_user_id, split_config,
    frequency, interval_count, start_date, anchor_day, anchor_month,
    next_due_date, end_date, is_active, note
  ) values (
    p_household_id, v_caller_id, pg_catalog.btrim(p_description), p_amount_cents,
    p_category_id, p_expense_type, p_payment_source, p_payer_user_id,
    v_split_config, p_frequency, p_interval_count, p_start_date,
    extract(day from p_start_date)::integer,
    extract(month from p_start_date)::integer,
    p_start_date, p_end_date, p_is_active, nullif(pg_catalog.btrim(p_note), '')
  ) returning id into v_id;

  return v_id;
end;
$$;

create function public.update_recurring_expense(
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
  v_split_config jsonb;
  v_schedule_changed boolean;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'RECURRING_AUTH_REQUIRED';
  end if;

  select template.* into v_template
  from public.recurring_expenses as template
  where template.id = p_recurring_expense_id
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

  if p_description is null or pg_catalog.btrim(p_description) = '' then
    raise exception using errcode = '22023', message = 'RECURRING_DESCRIPTION_REQUIRED';
  end if;

  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 999999999999 then
    raise exception using errcode = '22023', message = 'RECURRING_AMOUNT_INVALID';
  end if;

  if p_category_id is null or not exists (
    select 1 from public.categories as category
    where category.id = p_category_id
      and category.household_id = v_template.household_id
      and category.archived = false
  ) then
    raise exception using errcode = '22023', message = 'RECURRING_CATEGORY_INVALID';
  end if;

  if p_frequency not in ('weekly', 'monthly', 'yearly')
    or p_interval_count is null or p_interval_count < 1 or p_interval_count > 120 then
    raise exception using errcode = '22023', message = 'RECURRING_SCHEDULE_INVALID';
  end if;

  if p_start_date is null or (p_end_date is not null and p_end_date < p_start_date) then
    raise exception using errcode = '22023', message = 'RECURRING_DATES_INVALID';
  end if;

  v_split_config := private.validate_recurring_split_config(
    v_template.household_id,
    v_template.expense_type,
    p_payment_source,
    p_payer_user_id,
    p_split_config,
    v_caller_id
  );

  v_schedule_changed :=
    v_template.frequency <> p_frequency
    or v_template.interval_count <> p_interval_count
    or v_template.start_date <> p_start_date;

  update public.recurring_expenses
  set description = pg_catalog.btrim(p_description),
      amount_cents = p_amount_cents,
      category_id = p_category_id,
      payment_source = p_payment_source,
      payer_user_id = p_payer_user_id,
      split_config = v_split_config,
      frequency = p_frequency,
      interval_count = p_interval_count,
      start_date = p_start_date,
      anchor_day = extract(day from p_start_date)::integer,
      anchor_month = extract(month from p_start_date)::integer,
      next_due_date = case when v_schedule_changed then p_start_date else next_due_date end,
      end_date = p_end_date,
      note = nullif(pg_catalog.btrim(p_note), '')
  where id = p_recurring_expense_id;

  return p_recurring_expense_id;
end;
$$;

create function public.set_recurring_expense_active(
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
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'RECURRING_AUTH_REQUIRED';
  end if;

  if p_is_active is null then
    raise exception using errcode = '22023', message = 'RECURRING_ACTIVE_REQUIRED';
  end if;

  update public.recurring_expenses as template
  set is_active = p_is_active
  where template.id = p_recurring_expense_id
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

  return p_recurring_expense_id;
end;
$$;

-- Materializes at most 100 occurrences per visible active template and call.
-- It never creates an expense or common-fund movement.
create function public.ensure_recurring_occurrences(p_household_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_template public.recurring_expenses%rowtype;
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
      and (
        template.expense_type = 'common'
        or template.created_by = v_caller_id
      )
    order by template.next_due_date, template.id
    for update
  loop
    v_due := v_template.next_due_date;
    v_per_template := 0;

    while v_due <= current_date
      and v_per_template < 100
      and (v_template.end_date is null or v_due <= v_template.end_date)
    loop
      insert into public.recurring_expense_occurrences (
        recurring_expense_id,
        due_date
      ) values (
        v_template.id,
        v_due
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

create function public.confirm_recurring_expense_occurrence(
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

  if v_template.expense_type = 'personal' and (
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
    v_template.expense_type,
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

  -- Normally ensure_recurring_occurrences already advanced this cursor. This
  -- branch keeps direct/manual materialization and future extensions correct.
  if v_template.next_due_date <= v_occurrence.due_date then
    update public.recurring_expenses
    set next_due_date = private.next_recurring_due_date(
      v_occurrence.due_date,
      v_template.frequency,
      v_template.interval_count,
      v_template.anchor_day,
      v_template.anchor_month
    )
    where id = v_template.id;
  end if;

  return v_expense_id;
end;
$$;

create function public.skip_recurring_expense_occurrence(p_occurrence_id uuid)
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

  update public.recurring_expense_occurrences
  set status = 'skipped',
      resolved_at = now(),
      resolved_by = v_caller_id
  where id = p_occurrence_id;

  if v_template.next_due_date <= v_occurrence.due_date then
    update public.recurring_expenses
    set next_due_date = private.next_recurring_due_date(
      v_occurrence.due_date,
      v_template.frequency,
      v_template.interval_count,
      v_template.anchor_day,
      v_template.anchor_month
    )
    where id = v_template.id;
  end if;

  return p_occurrence_id;
end;
$$;

alter table public.recurring_expenses enable row level security;
alter table public.recurring_expense_occurrences enable row level security;

create policy "recurring_expenses_select_visible"
on public.recurring_expenses
for select
to authenticated
using (
  (expense_type = 'common' and (select public.is_household_member(household_id)))
  or (expense_type = 'personal' and created_by = (select auth.uid()))
);

create policy "recurring_occurrences_select_visible"
on public.recurring_expense_occurrences
for select
to authenticated
using (
  exists (
    select 1
    from public.recurring_expenses as template
    where template.id = recurring_expense_id
      and (
        (template.expense_type = 'common' and (select public.is_household_member(template.household_id)))
        or (template.expense_type = 'personal' and template.created_by = (select auth.uid()))
      )
  )
);

revoke all on table public.recurring_expenses, public.recurring_expense_occurrences
  from public, anon, authenticated;
grant select on table public.recurring_expenses, public.recurring_expense_occurrences
  to authenticated;

revoke all privileges on function public.create_recurring_expense(uuid, text, bigint, uuid, text, text, uuid, jsonb, text, integer, date, date, text, boolean)
  from public, anon, authenticated;
revoke all privileges on function public.update_recurring_expense(uuid, text, bigint, uuid, text, uuid, jsonb, text, integer, date, date, text)
  from public, anon, authenticated;
revoke all privileges on function public.set_recurring_expense_active(uuid, boolean)
  from public, anon, authenticated;
revoke all privileges on function public.ensure_recurring_occurrences(uuid)
  from public, anon, authenticated;
revoke all privileges on function public.confirm_recurring_expense_occurrence(uuid, text, bigint, uuid, date, text, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all privileges on function public.skip_recurring_expense_occurrence(uuid)
  from public, anon, authenticated;

grant execute on function public.create_recurring_expense(uuid, text, bigint, uuid, text, text, uuid, jsonb, text, integer, date, date, text, boolean)
  to authenticated;
grant execute on function public.update_recurring_expense(uuid, text, bigint, uuid, text, uuid, jsonb, text, integer, date, date, text)
  to authenticated;
grant execute on function public.set_recurring_expense_active(uuid, boolean)
  to authenticated;
grant execute on function public.ensure_recurring_occurrences(uuid)
  to authenticated;
grant execute on function public.confirm_recurring_expense_occurrence(uuid, text, bigint, uuid, date, text, text, uuid, jsonb)
  to authenticated;
grant execute on function public.skip_recurring_expense_occurrence(uuid)
  to authenticated;

comment on function public.ensure_recurring_occurrences(uuid) is
  'Idempotently materializes due visible occurrences through today, capped at 100 per template per call; creates no financial rows.';
comment on function public.confirm_recurring_expense_occurrence(uuid, text, bigint, uuid, date, text, text, uuid, jsonb) is
  'Atomically locks one pending occurrence, delegates financial creation to create_expense_v3, and links the resulting expense.';
comment on function public.skip_recurring_expense_occurrence(uuid) is
  'Atomically marks one visible pending occurrence skipped without creating financial data.';

commit;
