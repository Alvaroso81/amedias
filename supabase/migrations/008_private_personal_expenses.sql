begin;

-- Personal expenses have an explicit owner. The owner is derived by trusted
-- database code and is never accepted as frontend input.
alter table public.expenses
  add column personal_owner_id uuid null
  references auth.users (id) on delete restrict;

comment on column public.expenses.personal_owner_id is
  'Authenticated owner of a private personal expense; NULL for common expenses.';

-- Prefer an unambiguous full payer, then an unambiguous 100 % split, and use
-- created_by only when it still identifies a member of the same household.
with owner_candidates as (
  select
    expense.id,
    coalesce(
      (
        select payment.user_id
        from public.expense_payments as payment
        join public.household_members as member
          on member.household_id = expense.household_id
         and member.user_id = payment.user_id
        where payment.expense_id = expense.id
          and payment.amount = expense.amount
          and (select pg_catalog.count(*) from public.expense_payments as all_payment
               where all_payment.expense_id = expense.id) = 1
        limit 1
      ),
      (
        select split.user_id
        from public.expense_splits as split
        join public.household_members as member
          on member.household_id = expense.household_id
         and member.user_id = split.user_id
        where split.expense_id = expense.id
          and split.share_percent = 100
          and split.share_amount = expense.amount
          and (select pg_catalog.count(*) from public.expense_splits as all_split
               where all_split.expense_id = expense.id) = 1
        limit 1
      ),
      (
        select member.user_id
        from public.household_members as member
        where member.household_id = expense.household_id
          and member.user_id = expense.created_by
        limit 1
      )
    ) as owner_id
  from public.expenses as expense
  where expense.expense_type = 'personal'
)
update public.expenses as expense
set personal_owner_id = candidate.owner_id
from owner_candidates as candidate
where expense.id = candidate.id;

do $$
begin
  if exists (
    select 1
    from public.expenses as expense
    where expense.expense_type = 'personal'
      and (
        expense.personal_owner_id is null
        or not exists (
          select 1
          from public.household_members as member
          where member.household_id = expense.household_id
            and member.user_id = expense.personal_owner_id
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'No se ha podido determinar un propietario válido para todos los gastos personales';
  end if;
end;
$$;

alter table public.expenses
  add constraint expenses_personal_owner_valid check (
    (
      expense_type = 'common'
      and personal_owner_id is null
    )
    or (
      expense_type = 'personal'
      and personal_owner_id is not null
      and payment_source = 'member'
    )
  );

create index expenses_personal_owner_id_idx
  on public.expenses (personal_owner_id)
  where expense_type = 'personal';

create function private.set_expense_personal_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
begin
  if new.expense_type = 'common' then
    new.personal_owner_id := null;
    return new;
  end if;

  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para guardar un gasto personal';
  end if;

  if new.payment_source <> 'member' then
    raise exception using errcode = '22023', message = 'Un gasto personal no puede pagarse con el fondo común';
  end if;

  if tg_op = 'UPDATE' and old.expense_type = 'personal' then
    new.personal_owner_id := old.personal_owner_id;
  else
    new.personal_owner_id := v_caller_id;
  end if;

  return new;
end;
$$;

revoke all privileges on function private.set_expense_personal_owner()
  from public, anon, authenticated;

create trigger set_expense_personal_owner
before insert or update of expense_type, personal_owner_id, payment_source
on public.expenses
for each row execute function private.set_expense_personal_owner();

-- The helper is used by child-table RLS and deliberately applies the exact same
-- visibility rule as the parent expense.
create or replace function private.can_access_expense(expense_uuid uuid)
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
      where expense.id = expense_uuid
        and (
          (
            expense.expense_type = 'common'
            and exists (
              select 1
              from public.household_members as member
              where member.household_id = expense.household_id
                and member.user_id = (select auth.uid())
            )
          )
          or (
            expense.expense_type = 'personal'
            and expense.personal_owner_id = (select auth.uid())
          )
        )
    );
$$;

-- This older helper exposed whether an arbitrary expense belonged to a household.
-- Direct DML no longer uses it, so authenticated callers must not execute it.
revoke execute on function private.is_expense_household_member(uuid, uuid)
  from authenticated;

drop policy if exists "expenses_select_member" on public.expenses;
drop policy if exists "expenses_insert_member" on public.expenses;
drop policy if exists "expenses_update_member" on public.expenses;

create policy "expenses_select_visible"
on public.expenses
for select
to authenticated
using (
  (
    expense_type = 'common'
    and (select public.is_household_member(household_id))
  )
  or (
    expense_type = 'personal'
    and personal_owner_id = (select auth.uid())
  )
);

drop policy if exists "expense_payments_select_expense_member" on public.expense_payments;
drop policy if exists "expense_payments_insert_expense_member" on public.expense_payments;
drop policy if exists "expense_payments_update_expense_member" on public.expense_payments;
drop policy if exists "expense_payments_delete_expense_member" on public.expense_payments;

create policy "expense_payments_select_visible_expense"
on public.expense_payments
for select
to authenticated
using ((select private.can_access_expense(expense_id)));

drop policy if exists "expense_splits_select_expense_member" on public.expense_splits;
drop policy if exists "expense_splits_insert_expense_member" on public.expense_splits;
drop policy if exists "expense_splits_update_expense_member" on public.expense_splits;
drop policy if exists "expense_splits_delete_expense_member" on public.expense_splits;

create policy "expense_splits_select_visible_expense"
on public.expense_splits
for select
to authenticated
using ((select private.can_access_expense(expense_id)));

-- Preserve the hardening from 006: reads are RLS-protected and every mutation
-- remains available exclusively through authenticated RPCs.
revoke insert, update, delete
  on table public.expenses, public.expense_payments, public.expense_splits
  from public, anon, authenticated;
revoke select
  on table public.expenses, public.expense_payments, public.expense_splits
  from public, anon;
grant select
  on table public.expenses, public.expense_payments, public.expense_splits
  to authenticated;

-- Keep the complete validated V1 implementation private. The public signature
-- below normalizes personal expenses to the authenticated user before calling it.
alter function public.create_expense(uuid, text, numeric, uuid, date, text, text, uuid, numeric, jsonb)
  set schema private;
alter function private.create_expense(uuid, text, numeric, uuid, date, text, text, uuid, numeric, jsonb)
  rename to create_expense_legacy;

revoke all privileges on function private.create_expense_legacy(uuid, text, numeric, uuid, date, text, text, uuid, numeric, jsonb)
  from public, anon, authenticated;

create function public.create_expense(
  p_household_id uuid,
  p_description text,
  p_amount numeric,
  p_category_id uuid,
  p_expense_date date,
  p_expense_type text,
  p_note text,
  p_paid_by_user_id uuid,
  p_payer_amount numeric,
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
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para crear un gasto';
  end if;

  if p_expense_type = 'personal' then
    return private.create_expense_legacy(
      p_household_id,
      p_description,
      p_amount,
      p_category_id,
      p_expense_date,
      'personal',
      p_note,
      v_caller_id,
      p_amount,
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'user_id', v_caller_id,
          'share_percent', 100,
          'share_amount', p_amount
        )
      )
    );
  end if;

  return private.create_expense_legacy(
    p_household_id,
    p_description,
    p_amount,
    p_category_id,
    p_expense_date,
    p_expense_type,
    p_note,
    p_paid_by_user_id,
    p_payer_amount,
    p_splits
  );
end;
$$;

-- Wrap the V2 updater so SECURITY DEFINER can never bypass personal ownership.
alter function public.update_expense_v2(uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb)
  set schema private;
alter function private.update_expense_v2(uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb)
  rename to update_expense_v2_legacy;

revoke all privileges on function private.update_expense_v2_legacy(uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;

create function public.update_expense_v2(
  p_expense_id uuid,
  p_description text,
  p_amount numeric,
  p_category_id uuid,
  p_expense_date date,
  p_expense_type text,
  p_note text,
  p_payment_source text,
  p_payments jsonb,
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
  v_household_id uuid;
  v_current_type text;
  v_personal_owner_id uuid;
  v_normalized_payments jsonb;
  v_normalized_splits jsonb;
  v_total_weight numeric;
  v_remaining_percent numeric := 100;
  v_remaining_amount numeric := p_amount;
  v_member_count integer;
  v_member_index integer := 0;
  v_percentage numeric;
  v_share_amount numeric;
  v_member record;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para actualizar un gasto';
  end if;

  select expense.household_id, expense.expense_type, expense.personal_owner_id
  into v_household_id, v_current_type, v_personal_owner_id
  from public.expenses as expense
  where expense.id = p_expense_id
    and expense.deleted_at is null
  for update;

  if not found
    or (v_current_type = 'personal' and v_personal_owner_id <> v_caller_id)
    or (v_current_type = 'common' and not (select public.is_household_member(v_household_id))) then
    raise exception using errcode = '42501', message = 'No tienes acceso a este gasto';
  end if;

  if v_current_type = 'common' and p_expense_type = 'personal' then
    raise exception using errcode = '22023', message = 'Un gasto común no puede convertirse en personal';
  end if;

  if v_current_type = 'personal' and p_expense_type = 'personal' then
    return private.update_expense_v2_legacy(
      p_expense_id,
      p_description,
      p_amount,
      p_category_id,
      p_expense_date,
      'personal',
      p_note,
      'member',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('user_id', v_caller_id, 'amount', p_amount)
      ),
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'user_id', v_caller_id,
          'share_percent', 100,
          'share_amount', p_amount
        )
      )
    );
  end if;

  if v_current_type = 'personal' and p_expense_type = 'common' then
    select pg_catalog.count(*), pg_catalog.sum(greatest(member.default_share, 0))
    into v_member_count, v_total_weight
    from public.household_members as member
    where member.household_id = v_household_id;

    if v_member_count = 0 then
      raise exception using errcode = '22023', message = 'El hogar no tiene miembros disponibles';
    end if;

    v_normalized_payments := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('user_id', v_caller_id, 'amount', p_amount)
    );
    v_normalized_splits := '[]'::jsonb;

    for v_member in
      select member.user_id, member.default_share
      from public.household_members as member
      where member.household_id = v_household_id
      order by member.joined_at, member.user_id
    loop
      v_member_index := v_member_index + 1;

      if v_member_index = v_member_count then
        v_percentage := v_remaining_percent;
        v_share_amount := v_remaining_amount;
      else
        v_percentage := greatest(
          0,
          least(
            v_remaining_percent,
            pg_catalog.round(
              case
                when coalesce(v_total_weight, 0) > 0
                  then greatest(v_member.default_share, 0) / v_total_weight * 100
                else 100::numeric / v_member_count
              end,
              2
            )
          )
        );
        v_share_amount := pg_catalog.round(p_amount * v_percentage / 100, 2);
        v_remaining_percent := v_remaining_percent - v_percentage;
        v_remaining_amount := v_remaining_amount - v_share_amount;
      end if;

      v_normalized_splits := v_normalized_splits || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'user_id', v_member.user_id,
          'share_percent', v_percentage,
          'share_amount', v_share_amount
        )
      );
    end loop;

    return private.update_expense_v2_legacy(
      p_expense_id,
      p_description,
      p_amount,
      p_category_id,
      p_expense_date,
      'common',
      p_note,
      'member',
      v_normalized_payments,
      v_normalized_splits
    );
  end if;

  return private.update_expense_v2_legacy(
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
end;
$$;

-- Deletion has the same ownership boundary and delegates the atomic fund cleanup
-- to the already-tested V2 implementation.
alter function public.delete_expense_v2(uuid) set schema private;
alter function private.delete_expense_v2(uuid) rename to delete_expense_v2_legacy;

revoke all privileges on function private.delete_expense_v2_legacy(uuid)
  from public, anon, authenticated;

create function public.delete_expense_v2(p_expense_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_household_id uuid;
  v_expense_type text;
  v_personal_owner_id uuid;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para eliminar un gasto';
  end if;

  select expense.household_id, expense.expense_type, expense.personal_owner_id
  into v_household_id, v_expense_type, v_personal_owner_id
  from public.expenses as expense
  where expense.id = p_expense_id
    and expense.deleted_at is null;

  if not found
    or (v_expense_type = 'personal' and v_personal_owner_id <> v_caller_id)
    or (v_expense_type = 'common' and not (select public.is_household_member(v_household_id))) then
    raise exception using errcode = '42501', message = 'No tienes acceso a este gasto';
  end if;

  return private.delete_expense_v2_legacy(p_expense_id);
end;
$$;

-- Legacy update/delete wrappers already delegate to the public V2 signatures and
-- therefore inherit the same privacy checks. Lock down all public entry points.
create or replace function public.update_expense(
  p_expense_id uuid,
  p_description text,
  p_amount numeric,
  p_category_id uuid,
  p_expense_date date,
  p_expense_type text,
  p_note text,
  p_payments jsonb,
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
  v_payment_source text;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para actualizar un gasto';
  end if;

  select expense.payment_source
  into v_payment_source
  from public.expenses as expense
  where expense.id = p_expense_id
    and expense.deleted_at is null
    and (
      (
        expense.expense_type = 'common'
        and (select public.is_household_member(expense.household_id))
      )
      or (
        expense.expense_type = 'personal'
        and expense.personal_owner_id = v_caller_id
      )
    );

  if not found then
    raise exception using errcode = '42501', message = 'No tienes acceso a este gasto';
  end if;

  return public.update_expense_v2(
    p_expense_id,
    p_description,
    p_amount,
    p_category_id,
    p_expense_date,
    p_expense_type,
    p_note,
    v_payment_source,
    p_payments,
    p_splits
  );
end;
$$;

revoke all privileges on function public.create_expense(uuid, text, numeric, uuid, date, text, text, uuid, numeric, jsonb)
  from public, anon, authenticated;
revoke all privileges on function public.update_expense_v2(uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all privileges on function public.delete_expense_v2(uuid)
  from public, anon, authenticated;
revoke all privileges on function public.update_expense(uuid, text, numeric, uuid, date, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all privileges on function public.delete_expense(uuid)
  from public, anon, authenticated;

grant execute on function public.create_expense(uuid, text, numeric, uuid, date, text, text, uuid, numeric, jsonb)
  to authenticated;
grant execute on function public.update_expense_v2(uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb)
  to authenticated;
grant execute on function public.delete_expense_v2(uuid)
  to authenticated;
grant execute on function public.update_expense(uuid, text, numeric, uuid, date, text, text, jsonb, jsonb)
  to authenticated;
grant execute on function public.delete_expense(uuid)
  to authenticated;

comment on function public.create_expense(uuid, text, numeric, uuid, date, text, text, uuid, numeric, jsonb) is
  'Creates common expenses normally and derives every personal owner, payment and 100 % split from auth.uid().';
comment on function public.update_expense_v2(uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb) is
  'Protects personal ownership, forbids common-to-personal, and rebuilds household defaults for personal-to-common.';
comment on function public.delete_expense_v2(uuid) is
  'Soft-deletes common expenses for household members and personal expenses only for their owner.';

commit;
