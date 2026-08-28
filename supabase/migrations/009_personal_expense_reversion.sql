begin;

-- Keep the original private owner even while an expense is temporarily common.
-- Existing common rows remain NULL: migration 008 did not retain enough evidence
-- to distinguish native common expenses from earlier personal-to-common conversions.
alter table public.expenses
  add column personal_origin_owner_id uuid null
  references auth.users (id) on delete restrict;

comment on column public.expenses.personal_origin_owner_id is
  'Immutable original owner of an expense created as personal; NULL means no recoverable personal origin.';

update public.expenses
set personal_origin_owner_id = personal_owner_id
where expense_type = 'personal';

alter table public.expenses
  drop constraint expenses_personal_owner_valid;

alter table public.expenses
  add constraint expenses_personal_owner_valid check (
    (
      expense_type = 'common'
      and personal_owner_id is null
    )
    or (
      expense_type = 'personal'
      and personal_owner_id is not null
      and personal_origin_owner_id is not null
      and personal_owner_id = personal_origin_owner_id
      and payment_source = 'member'
    )
  );

create index expenses_personal_origin_owner_id_idx
  on public.expenses (personal_origin_owner_id)
  where personal_origin_owner_id is not null;

-- The historical owner is derived once from auth.uid() and then immutable.
-- On common-to-personal, only that same authenticated owner may restore privacy.
create or replace function private.set_expense_personal_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.expense_type = 'common' then
      new.personal_owner_id := null;
      new.personal_origin_owner_id := null;
      return new;
    end if;

    if v_caller_id is null then
      raise exception using errcode = '42501', message = 'Debes iniciar sesión para guardar un gasto personal';
    end if;

    if new.payment_source <> 'member' then
      raise exception using errcode = '22023', message = 'Un gasto personal no puede pagarse con el fondo común';
    end if;

    new.personal_owner_id := v_caller_id;
    new.personal_origin_owner_id := v_caller_id;
    return new;
  end if;

  -- Never accept a replacement historical owner from any caller or trusted RPC.
  new.personal_origin_owner_id := old.personal_origin_owner_id;

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

  if old.expense_type = 'personal' then
    new.personal_owner_id := old.personal_owner_id;
    return new;
  end if;

  if old.personal_origin_owner_id is null
    or old.personal_origin_owner_id <> v_caller_id then
    raise exception using
      errcode = '42501',
      message = 'No tienes permiso para convertir este gasto en personal';
  end if;

  new.personal_owner_id := old.personal_origin_owner_id;
  return new;
end;
$$;

revoke all privileges on function private.set_expense_personal_owner()
  from public, anon, authenticated;

drop trigger set_expense_personal_owner on public.expenses;

create trigger set_expense_personal_owner
before insert or update of
  expense_type,
  personal_owner_id,
  personal_origin_owner_id,
  payment_source
on public.expenses
for each row execute function private.set_expense_personal_owner();

-- Preserve the complete migration-008 wrapper for every transition except the
-- newly authorized common-to-personal restoration.
alter function public.update_expense_v2(uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb)
  set schema private;
alter function private.update_expense_v2(uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb)
  rename to update_expense_v2_private_origin_legacy;

revoke all privileges on function private.update_expense_v2_private_origin_legacy(
  uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb
) from public, anon, authenticated;

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
  v_current_source text;
  v_personal_owner_id uuid;
  v_personal_origin_owner_id uuid;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para actualizar un gasto';
  end if;

  select
    expense.household_id,
    expense.expense_type,
    expense.payment_source,
    expense.personal_owner_id,
    expense.personal_origin_owner_id
  into
    v_household_id,
    v_current_type,
    v_current_source,
    v_personal_owner_id,
    v_personal_origin_owner_id
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
    if v_personal_origin_owner_id is null
      or v_personal_origin_owner_id <> v_caller_id then
      raise exception using
        errcode = '42501',
        message = 'No tienes permiso para convertir este gasto en personal';
    end if;

    -- A fund-backed expense must release its active movement before becoming
    -- personal. All statements share this transaction, so any later validation
    -- failure restores both the movement and the previous expense state.
    if v_current_source = 'common_fund' then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('common_fund:' || v_household_id::text, 0)
      );

      update public.common_fund_movements
      set deleted_at = pg_catalog.now()
      where expense_id = p_expense_id
        and movement_type = 'expense'
        and deleted_at is null;

      if not found then
        raise exception using errcode = '23514', message = 'El gasto del fondo no tiene un movimiento activo';
      end if;

      update public.expenses
      set payment_source = 'member'
      where id = p_expense_id;
    end if;

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
        pg_catalog.jsonb_build_object(
          'user_id', v_personal_origin_owner_id,
          'amount', p_amount
        )
      ),
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'user_id', v_personal_origin_owner_id,
          'share_percent', 100,
          'share_amount', p_amount
        )
      )
    );
  end if;

  return private.update_expense_v2_private_origin_legacy(
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

revoke all privileges on function public.update_expense_v2(
  uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.update_expense_v2(
  uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb
) to authenticated;

comment on function public.update_expense_v2(
  uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb
) is
  'Restores a common expense to personal only for its immutable original owner and atomically releases any common-fund movement.';

commit;
