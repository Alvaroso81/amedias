begin;

alter table public.households
  add column accounting_month_start_day integer not null default 1,
  add constraint households_accounting_month_start_day_valid check (
    accounting_month_start_day between 1 and 28
  );

comment on column public.households.accounting_month_start_day is
  'First real calendar day assigned by default to the following accounting month; 1 keeps natural calendar months.';

-- Existing households start at day 1, so the backfill preserves every historical
-- calendar month exactly as it was before this migration.
alter table public.expenses
  add column accounting_month date;

update public.expenses
set accounting_month = pg_catalog.date_trunc('month', expense_date)::date;

alter table public.expenses
  alter column accounting_month set not null,
  add constraint expenses_accounting_month_first_day check (
    extract(day from accounting_month) = 1
  ),
  add constraint expenses_accounting_month_reasonable_range check (
    accounting_month between date '1900-01-01' and date '2200-12-01'
  );

comment on column public.expenses.accounting_month is
  'First day of the accounting month used for period totals and statistics; independent from expense_date.';

create index expenses_household_accounting_month_idx
  on public.expenses (household_id, accounting_month);

create function private.calculate_accounting_month(
  p_expense_date date,
  p_start_day integer
)
returns date
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_natural_month date;
begin
  if p_start_day < 1 or p_start_day > 28 then
    raise exception using
      errcode = '22023',
      message = 'El día de inicio del mes contable debe estar entre 1 y 28';
  end if;

  v_natural_month := pg_catalog.date_trunc('month', p_expense_date)::date;

  if p_start_day > 1
    and extract(day from p_expense_date) >= p_start_day then
    return (v_natural_month + interval '1 month')::date;
  end if;

  return v_natural_month;
end;
$$;

create function private.accounting_month_is_valid(p_accounting_month date)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select
    extract(day from p_accounting_month) = 1
    and p_accounting_month between date '1900-01-01' and date '2200-12-01';
$$;

revoke all privileges on function private.calculate_accounting_month(date, integer)
  from public, anon, authenticated;
revoke all privileges on function private.accounting_month_is_valid(date)
  from public, anon, authenticated;

-- The trigger keeps legacy clients safe. New inserts derive the month when it is
-- omitted. Legacy updates recalculate only when expense_date changes; changing
-- the household cutoff alone never rewrites existing expenses.
create function private.set_expense_accounting_month()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start_day integer;
begin
  select household.accounting_month_start_day
  into v_start_day
  from public.households as household
  where household.id = new.household_id;

  if not found then
    raise exception using errcode = '22023', message = 'El hogar del gasto no existe';
  end if;

  if tg_op = 'INSERT' and new.accounting_month is null then
    new.accounting_month := private.calculate_accounting_month(
      new.expense_date,
      v_start_day
    );
  elsif tg_op = 'UPDATE'
    and new.accounting_month is not distinct from old.accounting_month
    and (
      new.expense_date is distinct from old.expense_date
      or new.household_id is distinct from old.household_id
    ) then
    new.accounting_month := private.calculate_accounting_month(
      new.expense_date,
      v_start_day
    );
  end if;

  if new.accounting_month is null
    or not private.accounting_month_is_valid(new.accounting_month) then
    raise exception using
      errcode = '22023',
      message = 'El mes contable debe ser el primer día de un mes entre 1900 y 2200';
  end if;

  return new;
end;
$$;

revoke all privileges on function private.set_expense_accounting_month()
  from public, anon, authenticated;

create trigger set_expense_accounting_month
before insert or update of household_id, expense_date, accounting_month
on public.expenses
for each row execute function private.set_expense_accounting_month();

-- V3 delegates every financial/privacy validation to the current hardened V2
-- implementation and only adds the accounting-month input in the same transaction.
create function public.create_expense_v3(
  p_household_id uuid,
  p_description text,
  p_amount numeric,
  p_category_id uuid,
  p_expense_date date,
  p_expense_type text,
  p_note text,
  p_payment_source text,
  p_paid_by_user_id uuid,
  p_payer_amount numeric,
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
begin
  if p_accounting_month is not null
    and not private.accounting_month_is_valid(p_accounting_month) then
    raise exception using
      errcode = '22023',
      message = 'El mes contable debe ser el primer día de un mes entre 1900 y 2200';
  end if;

  v_expense_id := public.create_expense_v2(
    p_household_id,
    p_description,
    p_amount,
    p_category_id,
    p_expense_date,
    p_expense_type,
    p_note,
    p_payment_source,
    p_paid_by_user_id,
    p_payer_amount,
    p_splits
  );

  if p_accounting_month is not null then
    update public.expenses
    set accounting_month = p_accounting_month
    where id = v_expense_id;
  end if;

  return v_expense_id;
end;
$$;

create function public.update_expense_v3(
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
begin
  if p_accounting_month is not null
    and not private.accounting_month_is_valid(p_accounting_month) then
    raise exception using
      errcode = '22023',
      message = 'El mes contable debe ser el primer día de un mes entre 1900 y 2200';
  end if;

  v_expense_id := public.update_expense_v2(
    p_expense_id,
    p_description,
    p_amount,
    p_category_id,
    p_expense_date,
    p_expense_type,
    p_note,
    p_payment_source,
    p_payments,
    p_splits
  );

  if p_accounting_month is not null then
    update public.expenses
    set accounting_month = p_accounting_month
    where id = v_expense_id;
  end if;

  return v_expense_id;
end;
$$;

-- This shared setting changes defaults only. It intentionally performs no update
-- against expenses, so historical accounting months remain frozen.
create function public.update_accounting_month_start_day(
  p_household_id uuid,
  p_start_day integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
begin
  if v_caller_id is null then
    raise exception using
      errcode = '42501',
      message = 'Debes iniciar sesión para cambiar el mes contable';
  end if;

  if p_start_day is null or p_start_day < 1 or p_start_day > 28 then
    raise exception using
      errcode = '22023',
      message = 'El día de inicio del mes contable debe estar entre 1 y 28';
  end if;

  update public.households as household
  set accounting_month_start_day = p_start_day
  where household.id = p_household_id
    and exists (
      select 1
      from public.household_members as member
      where member.household_id = household.id
        and member.user_id = v_caller_id
        and member.role = 'owner'
    );

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Solo la persona propietaria puede cambiar el mes contable';
  end if;

  return p_start_day;
end;
$$;

revoke update (accounting_month_start_day)
  on table public.households from public, anon, authenticated;

revoke all privileges on function public.create_expense_v3(
  uuid, text, numeric, uuid, date, text, text, text, uuid, numeric, jsonb, date
) from public, anon, authenticated;
revoke all privileges on function public.update_expense_v3(
  uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb, date
) from public, anon, authenticated;
revoke all privileges on function public.update_accounting_month_start_day(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.create_expense_v3(
  uuid, text, numeric, uuid, date, text, text, text, uuid, numeric, jsonb, date
) to authenticated;
grant execute on function public.update_expense_v3(
  uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb, date
) to authenticated;
grant execute on function public.update_accounting_month_start_day(uuid, integer)
  to authenticated;

comment on function public.create_expense_v3(
  uuid, text, numeric, uuid, date, text, text, text, uuid, numeric, jsonb, date
) is
  'Creates an expense through the hardened V2 logic and applies an optional validated accounting-month override.';
comment on function public.update_expense_v3(
  uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb, date
) is
  'Updates an expense through the hardened V2 logic and preserves or explicitly updates its accounting month.';
comment on function public.update_accounting_month_start_day(uuid, integer) is
  'Allows only the household owner to change the default accounting-month cutoff without rewriting history.';

commit;
