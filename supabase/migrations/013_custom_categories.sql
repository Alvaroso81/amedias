begin;

alter table public.categories
  add column sort_order integer;

with ordered_categories as (
  select
    category.id,
    pg_catalog.row_number() over (
      partition by category.household_id
      order by category.created_at, category.id, category.name
    ) - 1 as sort_order
  from public.categories as category
)
update public.categories as category
set sort_order = ordered.sort_order
from ordered_categories as ordered
where ordered.id = category.id;

alter table public.categories
  alter column sort_order set default 0,
  alter column sort_order set not null,
  add constraint categories_sort_order_nonnegative check (sort_order >= 0);

create index categories_household_active_order_idx
  on public.categories (household_id, archived, sort_order, name);

comment on column public.categories.sort_order is
  'Zero-based display order within the household; active categories are reordered as a complete list.';

-- Preserve the complete bootstrap added by migration 007 and assign a stable,
-- intentional order to every default category in newly-created households.
create or replace function public.handle_new_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.household_members (
    household_id,
    user_id,
    role,
    default_share
  )
  values (new.id, new.created_by, 'owner', 50);

  insert into public.categories (
    household_id,
    name,
    icon,
    sort_order,
    created_by
  )
  values
    (new.id, 'Supermercado', '🛒', 0, new.created_by),
    (new.id, 'Comer fuera', '🍽️', 1, new.created_by),
    (new.id, 'Casa', '🏠', 2, new.created_by),
    (new.id, 'Ropa', '👕', 3, new.created_by),
    (new.id, 'Niños', '👦', 4, new.created_by),
    (new.id, 'Ocio', '🎬', 5, new.created_by),
    (new.id, 'Transporte', '🚗', 6, new.created_by),
    (new.id, 'Viajes', '✈️', 7, new.created_by),
    (new.id, 'Recibos', '💡', 8, new.created_by),
    (new.id, 'Otros', '📦', 9, new.created_by);

  insert into public.common_fund_settings (household_id, created_by)
  values (new.id, new.created_by);

  return new;
end;
$$;

create function private.normalize_category_name(p_name text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_name text := pg_catalog.btrim(p_name);
begin
  if v_name is null or v_name = '' then
    raise exception using errcode = '22023', message = 'CATEGORY_NAME_REQUIRED';
  end if;

  if pg_catalog.length(v_name) > 80 then
    raise exception using errcode = '22023', message = 'CATEGORY_NAME_TOO_LONG';
  end if;

  return v_name;
end;
$$;

create function private.normalize_category_icon(p_icon text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_icon text := nullif(pg_catalog.btrim(p_icon), '');
begin
  if v_icon is not null and pg_catalog.length(v_icon) > 16 then
    raise exception using errcode = '22023', message = 'CATEGORY_ICON_TOO_LONG';
  end if;

  return v_icon;
end;
$$;

revoke all privileges on function private.normalize_category_name(text)
  from public, anon, authenticated;
revoke all privileges on function private.normalize_category_icon(text)
  from public, anon, authenticated;

create function public.create_category(
  p_household_id uuid,
  p_name text,
  p_icon text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_category_id uuid;
  v_name text;
  v_icon text;
  v_sort_order integer;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'CATEGORY_AUTH_REQUIRED';
  end if;

  if p_household_id is null or not exists (
    select 1
    from public.household_members as member
    where member.household_id = p_household_id
      and member.user_id = v_caller_id
  ) then
    raise exception using errcode = '42501', message = 'CATEGORY_ACCESS_DENIED';
  end if;

  v_name := private.normalize_category_name(p_name);
  v_icon := private.normalize_category_icon(p_icon);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('category_order:' || p_household_id::text, 0)
  );

  if exists (
    select 1
    from public.categories as category
    where category.household_id = p_household_id
      and pg_catalog.lower(pg_catalog.btrim(category.name)) = pg_catalog.lower(v_name)
  ) then
    raise exception using errcode = '23505', message = 'CATEGORY_DUPLICATE';
  end if;

  select coalesce(pg_catalog.max(category.sort_order), -1) + 1
  into v_sort_order
  from public.categories as category
  where category.household_id = p_household_id
    and category.archived = false;

  insert into public.categories (
    household_id,
    name,
    icon,
    archived,
    sort_order,
    created_by
  )
  values (
    p_household_id,
    v_name,
    v_icon,
    false,
    v_sort_order,
    v_caller_id
  )
  returning id into v_category_id;

  return v_category_id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'CATEGORY_DUPLICATE';
end;
$$;

create function public.update_category(
  p_category_id uuid,
  p_name text,
  p_icon text default null
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
  v_name text;
  v_icon text;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'CATEGORY_AUTH_REQUIRED';
  end if;

  select category.household_id
  into v_household_id
  from public.categories as category
  where category.id = p_category_id
    and exists (
      select 1
      from public.household_members as member
      where member.household_id = category.household_id
        and member.user_id = v_caller_id
    )
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'CATEGORY_ACCESS_DENIED';
  end if;

  v_name := private.normalize_category_name(p_name);
  v_icon := private.normalize_category_icon(p_icon);

  if exists (
    select 1
    from public.categories as category
    where category.household_id = v_household_id
      and category.id <> p_category_id
      and pg_catalog.lower(pg_catalog.btrim(category.name)) = pg_catalog.lower(v_name)
  ) then
    raise exception using errcode = '23505', message = 'CATEGORY_DUPLICATE';
  end if;

  update public.categories
  set name = v_name,
      icon = v_icon
  where id = p_category_id;

  return p_category_id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'CATEGORY_DUPLICATE';
end;
$$;

create function public.set_category_active(
  p_category_id uuid,
  p_active boolean
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
  v_is_archived boolean;
  v_active_count integer;
  v_sort_order integer;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'CATEGORY_AUTH_REQUIRED';
  end if;

  if p_active is null then
    raise exception using errcode = '22023', message = 'CATEGORY_ACTIVE_REQUIRED';
  end if;

  select category.household_id, category.archived
  into v_household_id, v_is_archived
  from public.categories as category
  where category.id = p_category_id
    and exists (
      select 1
      from public.household_members as member
      where member.household_id = category.household_id
        and member.user_id = v_caller_id
    );

  if not found then
    raise exception using errcode = '42501', message = 'CATEGORY_ACCESS_DENIED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('category_order:' || v_household_id::text, 0)
  );

  select category.archived
  into v_is_archived
  from public.categories as category
  where category.id = p_category_id
  for update;

  if p_active and v_is_archived then
    select coalesce(pg_catalog.max(category.sort_order), -1) + 1
    into v_sort_order
    from public.categories as category
    where category.household_id = v_household_id
      and category.archived = false;

    update public.categories
    set archived = false,
        sort_order = v_sort_order
    where id = p_category_id;
  elsif not p_active and not v_is_archived then
    select pg_catalog.count(*)
    into v_active_count
    from public.categories as category
    where category.household_id = v_household_id
      and category.archived = false;

    if v_active_count <= 1 then
      raise exception using errcode = '22023', message = 'CATEGORY_LAST_ACTIVE';
    end if;

    update public.categories
    set archived = true
    where id = p_category_id;
  end if;

  return p_category_id;
end;
$$;

create function public.reorder_categories(
  p_household_id uuid,
  p_category_ids uuid[]
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_active_count integer;
  v_input_count integer;
  v_distinct_count integer;
  v_updated_count integer;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'CATEGORY_AUTH_REQUIRED';
  end if;

  if p_household_id is null or not exists (
    select 1
    from public.household_members as member
    where member.household_id = p_household_id
      and member.user_id = v_caller_id
  ) then
    raise exception using errcode = '42501', message = 'CATEGORY_ACCESS_DENIED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('category_order:' || p_household_id::text, 0)
  );

  select pg_catalog.count(*)
  into v_active_count
  from public.categories as category
  where category.household_id = p_household_id
    and category.archived = false;

  select pg_catalog.count(*), pg_catalog.count(distinct requested.category_id)
  into v_input_count, v_distinct_count
  from pg_catalog.unnest(p_category_ids) as requested(category_id);

  if p_category_ids is null
    or v_input_count <> v_active_count
    or v_distinct_count <> v_input_count
    or exists (
      select 1
      from pg_catalog.unnest(p_category_ids) as requested(category_id)
      left join public.categories as category
        on category.id = requested.category_id
        and category.household_id = p_household_id
        and category.archived = false
      where category.id is null
    ) then
    raise exception using errcode = '22023', message = 'CATEGORY_REORDER_INVALID';
  end if;

  with ordered_categories as (
    select
      requested.category_id,
      (requested.ordinality - 1)::integer as sort_order
    from pg_catalog.unnest(p_category_ids) with ordinality
      as requested(category_id, ordinality)
  )
  update public.categories as category
  set sort_order = ordered.sort_order
  from ordered_categories as ordered
  where category.id = ordered.category_id
    and category.household_id = p_household_id
    and category.archived = false;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

-- V4 delegates the complete hardened V3 update. When an existing expense keeps
-- its now-inactive category, V3 validates the update with an active category in
-- the same household and this wrapper restores the original category atomically.
-- No intermediate state is visible outside the transaction.
create function public.update_expense_v4(
  p_expense_id uuid,
  p_description text,
  p_amount numeric,
  p_category_id uuid,
  p_expense_date date,
  p_expense_type text,
  p_note text,
  p_payment_source text,
  p_payments jsonb,
  p_splits jsonb,
  p_accounting_month date default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_expense_id uuid;
  v_household_id uuid;
  v_current_category_id uuid;
  v_validation_category_id uuid;
begin
  select expense.household_id, expense.category_id
  into v_household_id, v_current_category_id
  from public.expenses as expense
  where expense.id = p_expense_id
    and expense.deleted_at is null;

  if found
    and p_category_id = v_current_category_id
    and exists (
      select 1
      from public.categories as category
      where category.id = v_current_category_id
        and category.household_id = v_household_id
        and category.archived = true
    ) then
    select category.id
    into v_validation_category_id
    from public.categories as category
    where category.household_id = v_household_id
      and category.archived = false
    order by category.sort_order, category.name, category.id
    limit 1;
  end if;

  v_expense_id := public.update_expense_v3(
    p_expense_id,
    p_description,
    p_amount,
    coalesce(v_validation_category_id, p_category_id),
    p_expense_date,
    p_expense_type,
    p_note,
    p_payment_source,
    p_payments,
    p_splits,
    p_accounting_month
  );

  if v_validation_category_id is not null then
    update public.expenses
    set category_id = v_current_category_id
    where id = v_expense_id;
  end if;

  return v_expense_id;
end;
$$;

-- Keep category mutation RPC-only. SELECT continues through the existing
-- household-membership RLS policy from migration 001.
revoke insert, update, delete on table public.categories
  from public, anon, authenticated;

revoke all privileges on function public.create_category(uuid, text, text)
  from public, anon, authenticated;
revoke all privileges on function public.update_category(uuid, text, text)
  from public, anon, authenticated;
revoke all privileges on function public.set_category_active(uuid, boolean)
  from public, anon, authenticated;
revoke all privileges on function public.reorder_categories(uuid, uuid[])
  from public, anon, authenticated;
revoke all privileges on function public.update_expense_v4(
  uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb, date
) from public, anon, authenticated;

grant execute on function public.create_category(uuid, text, text)
  to authenticated;
grant execute on function public.update_category(uuid, text, text)
  to authenticated;
grant execute on function public.set_category_active(uuid, boolean)
  to authenticated;
grant execute on function public.reorder_categories(uuid, uuid[])
  to authenticated;
grant execute on function public.update_expense_v4(
  uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb, date
) to authenticated;

comment on function public.create_category(uuid, text, text) is
  'Creates an active household category at the end of the shared order.';
comment on function public.update_category(uuid, text, text) is
  'Allows any household member to rename a category or change its emoji.';
comment on function public.set_category_active(uuid, boolean) is
  'Allows any household member to deactivate or reactivate a category without deleting history.';
comment on function public.reorder_categories(uuid, uuid[]) is
  'Reorders the complete active category list after validating household ownership of every identifier.';
comment on function public.update_expense_v4(
  uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb, date
) is
  'Updates through hardened V3 while allowing an unchanged inactive historical category to remain attached.';

commit;
