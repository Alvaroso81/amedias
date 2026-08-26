begin;

-- Internal helpers used by RLS live outside the exposed public schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_blank check (btrim(display_name) <> '')
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'EUR',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint households_name_not_blank check (btrim(name) <> ''),
  constraint households_currency_iso_code check (currency ~ '^[A-Z]{3}$')
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  default_share numeric(5, 2) not null default 50,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  constraint household_members_role_valid check (role in ('owner', 'member')),
  constraint household_members_default_share_valid check (
    default_share >= 0 and default_share <= 100
  )
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  icon text,
  archived boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (btrim(name) <> ''),
  constraint categories_id_household_unique unique (id, household_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null,
  category_id uuid,
  expense_date date not null,
  expense_type text not null,
  note text,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint expenses_description_not_blank check (btrim(description) <> ''),
  constraint expenses_amount_positive check (amount > 0),
  constraint expenses_type_valid check (expense_type in ('common', 'personal')),
  constraint expenses_category_household_fkey
    foreign key (category_id, household_id)
    references public.categories (id, household_id)
    on delete no action
);

create table public.expense_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete restrict,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  constraint expense_payments_amount_nonnegative check (amount >= 0)
);

comment on table public.expense_payments is
  'Tracks who advanced money for an expense; one expense may have multiple payers.';

create table public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete restrict,
  share_percent numeric(5, 2),
  share_amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  constraint expense_splits_percent_valid check (
    share_percent is null or (share_percent >= 0 and share_percent <= 100)
  ),
  constraint expense_splits_amount_nonnegative check (share_amount >= 0),
  constraint expense_splits_expense_user_unique unique (expense_id, user_id)
);

comment on table public.expense_splits is
  'Stores each participant actual responsibility, allowing cent-level rounding.';

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_user_id uuid not null references auth.users (id) on delete restrict,
  to_user_id uuid not null references auth.users (id) on delete restrict,
  amount numeric(12, 2) not null,
  settlement_date date not null,
  note text,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint settlements_amount_positive check (amount > 0),
  constraint settlements_distinct_users check (from_user_id <> to_user_id)
);

comment on table public.settlements is
  'Transfers between household members that settle balances; they are not expenses.';

-- Case-insensitive category names remain unique even after archiving.
create unique index categories_household_name_unique
  on public.categories (household_id, lower(btrim(name)));

create index household_members_user_id_idx
  on public.household_members (user_id);

create index expenses_household_id_idx
  on public.expenses (household_id);
create index expenses_expense_date_idx
  on public.expenses (expense_date);
create index expenses_category_id_idx
  on public.expenses (category_id);
create index expenses_deleted_at_idx
  on public.expenses (deleted_at);

create index expense_payments_expense_id_idx
  on public.expense_payments (expense_id);
create index expense_payments_user_id_idx
  on public.expense_payments (user_id);

-- The unique (expense_id, user_id) constraint also indexes expense_id.
create index expense_splits_user_id_idx
  on public.expense_splits (user_id);

create index settlements_household_id_idx
  on public.settlements (household_id);
create index settlements_settlement_date_idx
  on public.settlements (settlement_date);
create index settlements_deleted_at_idx
  on public.settlements (deleted_at);

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function public.set_updated_by_from_auth()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.updated_by = (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger households_set_updated_at
before update on public.households
for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

create trigger expenses_set_updated_by
before update on public.expenses
for each row execute function public.set_updated_by_from_auth();

create trigger settlements_set_updated_at
before update on public.settlements
for each row execute function public.set_updated_at();

create trigger settlements_set_updated_by
before update on public.settlements
for each row execute function public.set_updated_by_from_auth();

-- Auth trigger failures are logged without unnecessarily blocking registration.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Usuario'
    )
  )
  on conflict (id) do nothing;

  return new;
exception
  when others then
    raise warning 'Could not create a profile for auth user %', new.id;
    return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Every household starts with its creator as owner and the default categories.
create function public.handle_new_household()
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

  insert into public.categories (household_id, name, icon, created_by)
  values
    (new.id, 'Supermercado', '🛒', new.created_by),
    (new.id, 'Comer fuera', '🍽️', new.created_by),
    (new.id, 'Casa', '🏠', new.created_by),
    (new.id, 'Ropa', '👕', new.created_by),
    (new.id, 'Niños', '👦', new.created_by),
    (new.id, 'Ocio', '🎬', new.created_by),
    (new.id, 'Transporte', '🚗', new.created_by),
    (new.id, 'Viajes', '✈️', new.created_by),
    (new.id, 'Recibos', '💡', new.created_by),
    (new.id, 'Otros', '📦', new.created_by);

  return new;
end;
$$;

create trigger on_household_created
after insert on public.households
for each row execute function public.handle_new_household();

-- Public helper required by RLS; it only evaluates membership for auth.uid().
create function public.is_household_member(household_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.household_members as member
      where member.household_id = household_uuid
        and member.user_id = (select auth.uid())
    );
$$;

create function private.is_household_owner(household_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.household_members as member
      where member.household_id = household_uuid
        and member.user_id = (select auth.uid())
        and member.role = 'owner'
    );
$$;

create function private.shares_household(target_user_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.household_members as current_member
      join public.household_members as target_member
        on target_member.household_id = current_member.household_id
      where current_member.user_id = (select auth.uid())
        and target_member.user_id = target_user_uuid
    );
$$;

create function private.can_access_expense(expense_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.expenses as expense
      join public.household_members as member
        on member.household_id = expense.household_id
      where expense.id = expense_uuid
        and member.user_id = (select auth.uid())
    );
$$;

create function private.is_expense_household_member(
  expense_uuid uuid,
  target_user_uuid uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.expenses as expense
      join public.household_members as current_member
        on current_member.household_id = expense.household_id
      join public.household_members as target_member
        on target_member.household_id = expense.household_id
      where expense.id = expense_uuid
        and current_member.user_id = (select auth.uid())
        and target_member.user_id = target_user_uuid
    );
$$;

create function private.is_household_participant(
  household_uuid uuid,
  target_user_uuid uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.household_members as current_member
      join public.household_members as target_member
        on target_member.household_id = current_member.household_id
      where current_member.household_id = household_uuid
        and current_member.user_id = (select auth.uid())
        and target_member.user_id = target_user_uuid
    );
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.set_updated_by_from_auth() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_household() from public, anon, authenticated;
revoke execute on function public.is_household_member(uuid) from public, anon, authenticated;
revoke execute on function private.is_household_owner(uuid) from public, anon, authenticated;
revoke execute on function private.shares_household(uuid) from public, anon, authenticated;
revoke execute on function private.can_access_expense(uuid) from public, anon, authenticated;
revoke execute on function private.is_expense_household_member(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.is_household_participant(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function private.is_household_owner(uuid) to authenticated;
grant execute on function private.shares_household(uuid) to authenticated;
grant execute on function private.can_access_expense(uuid) to authenticated;
grant execute on function private.is_expense_household_member(uuid, uuid) to authenticated;
grant execute on function private.is_household_participant(uuid, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payments enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements enable row level security;

revoke all privileges on table public.profiles from public, anon, authenticated;
revoke all privileges on table public.households from public, anon, authenticated;
revoke all privileges on table public.household_members from public, anon, authenticated;
revoke all privileges on table public.categories from public, anon, authenticated;
revoke all privileges on table public.expenses from public, anon, authenticated;
revoke all privileges on table public.expense_payments from public, anon, authenticated;
revoke all privileges on table public.expense_splits from public, anon, authenticated;
revoke all privileges on table public.settlements from public, anon, authenticated;

grant usage on schema public to authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

grant select, delete on table public.households to authenticated;
grant insert (name, currency, created_by) on table public.households to authenticated;
grant update (name, currency) on table public.households to authenticated;

grant select, delete on table public.household_members to authenticated;
grant insert (household_id, user_id, role, default_share)
  on table public.household_members to authenticated;
grant update (role, default_share)
  on table public.household_members to authenticated;

grant select on table public.categories to authenticated;
grant insert (household_id, name, icon, archived, created_by)
  on table public.categories to authenticated;
grant update (name, icon, archived)
  on table public.categories to authenticated;

grant select on table public.expenses to authenticated;
grant insert (
  household_id,
  description,
  amount,
  category_id,
  expense_date,
  expense_type,
  note,
  created_by
) on table public.expenses to authenticated;
grant update (
  description,
  amount,
  category_id,
  expense_date,
  expense_type,
  note,
  deleted_at
) on table public.expenses to authenticated;

grant select, delete on table public.expense_payments to authenticated;
grant insert (expense_id, user_id, amount)
  on table public.expense_payments to authenticated;
grant update (amount) on table public.expense_payments to authenticated;

grant select, delete on table public.expense_splits to authenticated;
grant insert (expense_id, user_id, share_percent, share_amount)
  on table public.expense_splits to authenticated;
grant update (share_percent, share_amount)
  on table public.expense_splits to authenticated;

grant select on table public.settlements to authenticated;
grant insert (
  household_id,
  from_user_id,
  to_user_id,
  amount,
  settlement_date,
  note,
  created_by
) on table public.settlements to authenticated;
grant update (
  from_user_id,
  to_user_id,
  amount,
  settlement_date,
  note,
  deleted_at
) on table public.settlements to authenticated;

-- Profiles are private except to the user and members of a shared household.
create policy "profiles_select_shared_household"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.shares_household(id))
);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "households_select_member_or_creator"
on public.households
for select
to authenticated
using (
  created_by = (select auth.uid())
  or (select public.is_household_member(id))
);

create policy "households_insert_own"
on public.households
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and created_by = (select auth.uid())
);

create policy "households_update_owner"
on public.households
for update
to authenticated
using ((select private.is_household_owner(id)))
with check ((select private.is_household_owner(id)));

create policy "households_delete_owner"
on public.households
for delete
to authenticated
using ((select private.is_household_owner(id)));

-- SECURITY DEFINER helpers avoid recursive household_members policy checks.
create policy "household_members_select_household"
on public.household_members
for select
to authenticated
using ((select public.is_household_member(household_id)));

create policy "household_members_insert_owner"
on public.household_members
for insert
to authenticated
with check ((select private.is_household_owner(household_id)));

create policy "household_members_update_owner"
on public.household_members
for update
to authenticated
using ((select private.is_household_owner(household_id)))
with check ((select private.is_household_owner(household_id)));

create policy "household_members_delete_owner"
on public.household_members
for delete
to authenticated
using ((select private.is_household_owner(household_id)));

create policy "categories_select_member"
on public.categories
for select
to authenticated
using ((select public.is_household_member(household_id)));

create policy "categories_insert_member"
on public.categories
for insert
to authenticated
with check (
  (select public.is_household_member(household_id))
  and created_by = (select auth.uid())
);

create policy "categories_update_member"
on public.categories
for update
to authenticated
using ((select public.is_household_member(household_id)))
with check ((select public.is_household_member(household_id)));

create policy "expenses_select_member"
on public.expenses
for select
to authenticated
using ((select public.is_household_member(household_id)));

create policy "expenses_insert_member"
on public.expenses
for insert
to authenticated
with check (
  (select public.is_household_member(household_id))
  and created_by = (select auth.uid())
  and updated_by is null
);

create policy "expenses_update_member"
on public.expenses
for update
to authenticated
using ((select public.is_household_member(household_id)))
with check (
  (select public.is_household_member(household_id))
  and updated_by = (select auth.uid())
);

-- Payment and split access follows the parent expense household.
create policy "expense_payments_select_expense_member"
on public.expense_payments
for select
to authenticated
using ((select private.can_access_expense(expense_id)));

create policy "expense_payments_insert_expense_member"
on public.expense_payments
for insert
to authenticated
with check (
  (select private.can_access_expense(expense_id))
  and (select private.is_expense_household_member(expense_id, user_id))
);

create policy "expense_payments_update_expense_member"
on public.expense_payments
for update
to authenticated
using ((select private.can_access_expense(expense_id)))
with check (
  (select private.can_access_expense(expense_id))
  and (select private.is_expense_household_member(expense_id, user_id))
);

create policy "expense_payments_delete_expense_member"
on public.expense_payments
for delete
to authenticated
using ((select private.can_access_expense(expense_id)));

create policy "expense_splits_select_expense_member"
on public.expense_splits
for select
to authenticated
using ((select private.can_access_expense(expense_id)));

create policy "expense_splits_insert_expense_member"
on public.expense_splits
for insert
to authenticated
with check (
  (select private.can_access_expense(expense_id))
  and (select private.is_expense_household_member(expense_id, user_id))
);

create policy "expense_splits_update_expense_member"
on public.expense_splits
for update
to authenticated
using ((select private.can_access_expense(expense_id)))
with check (
  (select private.can_access_expense(expense_id))
  and (select private.is_expense_household_member(expense_id, user_id))
);

create policy "expense_splits_delete_expense_member"
on public.expense_splits
for delete
to authenticated
using ((select private.can_access_expense(expense_id)));

create policy "settlements_select_member"
on public.settlements
for select
to authenticated
using ((select public.is_household_member(household_id)));

create policy "settlements_insert_member"
on public.settlements
for insert
to authenticated
with check (
  (select public.is_household_member(household_id))
  and created_by = (select auth.uid())
  and updated_by is null
  and (select private.is_household_participant(household_id, from_user_id))
  and (select private.is_household_participant(household_id, to_user_id))
);

create policy "settlements_update_member"
on public.settlements
for update
to authenticated
using ((select public.is_household_member(household_id)))
with check (
  (select public.is_household_member(household_id))
  and updated_by = (select auth.uid())
  and (select private.is_household_participant(household_id, from_user_id))
  and (select private.is_household_participant(household_id, to_user_id))
);

commit;
