begin;

-- The common fund is a household-owned ledger. Its balance is always derived from
-- active movements; no cached balance can drift away from the source of truth.
create table public.common_fund_settings (
  household_id uuid primary key references public.households (id) on delete cascade,
  enabled boolean not null default true,
  monthly_amount numeric(12, 2) not null default 600,
  carry_over boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint common_fund_settings_monthly_amount_valid check (monthly_amount >= 0)
);

create table public.common_fund_movements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  movement_type text not null,
  amount_delta numeric(12, 2) not null,
  expense_id uuid references public.expenses (id) on delete restrict,
  period_month date,
  note text,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint common_fund_movements_type_valid check (
    movement_type in ('monthly_contribution', 'top_up', 'expense', 'adjustment')
  ),
  constraint common_fund_movements_amount_nonzero check (amount_delta <> 0),
  constraint common_fund_movements_period_is_month_start check (
    period_month is null
    or period_month = pg_catalog.date_trunc('month', period_month)::date
  ),
  constraint common_fund_movements_shape_valid check (
    (movement_type = 'monthly_contribution' and amount_delta > 0 and period_month is not null and expense_id is null)
    or (movement_type = 'top_up' and amount_delta > 0 and period_month is null and expense_id is null)
    or (movement_type = 'expense' and amount_delta < 0 and period_month is null and expense_id is not null)
    or (movement_type = 'adjustment' and period_month is null and expense_id is null)
  )
);

alter table public.expenses
  add column payment_source text not null default 'member';

alter table public.expenses
  add constraint expenses_payment_source_valid
  check (payment_source in ('member', 'common_fund'));

comment on column public.expenses.payment_source is
  'Origin of the money: a household member or the household common fund.';

comment on table public.common_fund_movements is
  'Append-style ledger whose active rows are summed to obtain the common-fund balance.';

create index common_fund_movements_household_id_idx
  on public.common_fund_movements (household_id);
create index common_fund_movements_created_at_idx
  on public.common_fund_movements (created_at desc);
create index common_fund_movements_period_month_idx
  on public.common_fund_movements (period_month);
create index common_fund_movements_expense_id_idx
  on public.common_fund_movements (expense_id);
create index common_fund_movements_deleted_at_idx
  on public.common_fund_movements (deleted_at);

create unique index common_fund_active_expense_movement_unique
  on public.common_fund_movements (expense_id)
  where movement_type = 'expense' and deleted_at is null;

create unique index common_fund_active_monthly_contribution_unique
  on public.common_fund_movements (household_id, period_month)
  where movement_type = 'monthly_contribution' and deleted_at is null;

create trigger common_fund_settings_set_updated_at
before update on public.common_fund_settings
for each row execute function public.set_updated_at();

create trigger common_fund_movements_set_updated_at
before update on public.common_fund_movements
for each row execute function public.set_updated_at();

create trigger common_fund_movements_set_updated_by
before update on public.common_fund_movements
for each row execute function public.set_updated_by_from_auth();

-- Existing households receive settings without creating any retroactive money.
insert into public.common_fund_settings (household_id, created_by)
select household.id, household.created_by
from public.households as household
on conflict (household_id) do nothing;

-- Preserve all previous household bootstrap behaviour and add common-fund settings.
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

  insert into public.common_fund_settings (household_id, created_by)
  values (new.id, new.created_by);

  return new;
end;
$$;

alter table public.common_fund_settings enable row level security;
alter table public.common_fund_movements enable row level security;

revoke all privileges on table public.common_fund_settings
  from public, anon, authenticated;
revoke all privileges on table public.common_fund_movements
  from public, anon, authenticated;

grant select on table public.common_fund_settings to authenticated;
grant select on table public.common_fund_movements to authenticated;

create policy "common_fund_settings_select_member"
on public.common_fund_settings
for select
to authenticated
using ((select public.is_household_member(household_id)));

create policy "common_fund_movements_select_member"
on public.common_fund_movements
for select
to authenticated
using ((select public.is_household_member(household_id)));

-- Only trusted RPCs may mutate the ledger/settings. This helper is intentionally
-- private and returns the live active balance while its caller owns the lock.
create function private.get_common_fund_balance(p_household_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.sum(movement.amount_delta), 0)::numeric
  from public.common_fund_movements as movement
  where movement.household_id = p_household_id
    and movement.deleted_at is null;
$$;

revoke all on function private.get_common_fund_balance(uuid)
  from public, anon, authenticated;

create function public.ensure_monthly_common_fund(
  p_household_id uuid,
  p_month date
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_period_month date;
  v_monthly_amount numeric;
  v_movement_id uuid;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para usar el fondo común';
  end if;

  if p_household_id is null or not (select public.is_household_member(p_household_id)) then
    raise exception using errcode = '42501', message = 'No perteneces al hogar indicado';
  end if;

  if p_month is null then
    raise exception using errcode = '22023', message = 'El mes del fondo común es obligatorio';
  end if;

  if (select pg_catalog.count(*) from public.household_members as member where member.household_id = p_household_id) <> 2 then
    raise exception using errcode = '22023', message = 'El fondo común requiere exactamente dos miembros';
  end if;

  -- One transaction per household serializes ensure, adjustments and expenses.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('common_fund:' || p_household_id::text, 0)
  );

  select settings.monthly_amount
  into v_monthly_amount
  from public.common_fund_settings as settings
  where settings.household_id = p_household_id
    and settings.enabled = true;

  if not found then
    raise exception using errcode = '22023', message = 'El fondo común está desactivado';
  end if;

  v_period_month := pg_catalog.date_trunc('month', p_month)::date;

  select movement.id
  into v_movement_id
  from public.common_fund_movements as movement
  where movement.household_id = p_household_id
    and movement.movement_type = 'monthly_contribution'
    and movement.period_month = v_period_month
    and movement.deleted_at is null;

  if found then
    return v_movement_id;
  end if;

  -- A configured contribution of zero is a deliberate no-op.
  if v_monthly_amount = 0 then
    return null;
  end if;

  insert into public.common_fund_movements (
    household_id,
    movement_type,
    amount_delta,
    period_month,
    note,
    created_by
  )
  values (
    p_household_id,
    'monthly_contribution',
    v_monthly_amount,
    v_period_month,
    'Aportación mensual',
    v_caller_id
  )
  on conflict (household_id, period_month)
    where movement_type = 'monthly_contribution' and deleted_at is null
  do nothing
  returning id into v_movement_id;

  if v_movement_id is null then
    select movement.id
    into v_movement_id
    from public.common_fund_movements as movement
    where movement.household_id = p_household_id
      and movement.movement_type = 'monthly_contribution'
      and movement.period_month = v_period_month
      and movement.deleted_at is null;
  end if;

  return v_movement_id;
end;
$$;

create function public.top_up_common_fund(
  p_household_id uuid,
  p_amount numeric,
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
  v_movement_id uuid;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para recargar el fondo común';
  end if;

  if p_household_id is null or not (select public.is_household_member(p_household_id)) then
    raise exception using errcode = '42501', message = 'No perteneces al hogar indicado';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 9999999999.99
    or p_amount <> pg_catalog.round(p_amount, 2) then
    raise exception using errcode = '22023', message = 'La recarga debe ser mayor que 0 y tener como máximo dos decimales';
  end if;

  if (select pg_catalog.count(*) from public.household_members as member where member.household_id = p_household_id) <> 2 then
    raise exception using errcode = '22023', message = 'El fondo común requiere exactamente dos miembros';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('common_fund:' || p_household_id::text, 0)
  );

  if not exists (
    select 1 from public.common_fund_settings as settings
    where settings.household_id = p_household_id and settings.enabled = true
  ) then
    raise exception using errcode = '22023', message = 'El fondo común está desactivado';
  end if;

  insert into public.common_fund_movements (
    household_id,
    movement_type,
    amount_delta,
    note,
    created_by
  )
  values (
    p_household_id,
    'top_up',
    p_amount,
    nullif(pg_catalog.btrim(p_note), ''),
    v_caller_id
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

create function public.set_common_fund_balance(
  p_household_id uuid,
  p_target_balance numeric,
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
  v_current_balance numeric;
  v_delta numeric;
  v_movement_id uuid;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para ajustar el fondo común';
  end if;

  if p_household_id is null or not (select public.is_household_member(p_household_id)) then
    raise exception using errcode = '42501', message = 'No perteneces al hogar indicado';
  end if;

  if p_target_balance is null or p_target_balance < 0 or p_target_balance > 9999999999.99
    or p_target_balance <> pg_catalog.round(p_target_balance, 2) then
    raise exception using errcode = '22023', message = 'El saldo objetivo debe ser 0 o mayor y tener como máximo dos decimales';
  end if;

  if (select pg_catalog.count(*) from public.household_members as member where member.household_id = p_household_id) <> 2 then
    raise exception using errcode = '22023', message = 'El fondo común requiere exactamente dos miembros';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('common_fund:' || p_household_id::text, 0)
  );

  if not exists (
    select 1 from public.common_fund_settings as settings
    where settings.household_id = p_household_id and settings.enabled = true
  ) then
    raise exception using errcode = '22023', message = 'El fondo común está desactivado';
  end if;

  v_current_balance := private.get_common_fund_balance(p_household_id);
  v_delta := p_target_balance - v_current_balance;

  -- Returning NULL documents a successful no-op without inventing a movement.
  if v_delta = 0 then
    return null;
  end if;

  insert into public.common_fund_movements (
    household_id,
    movement_type,
    amount_delta,
    note,
    created_by
  )
  values (
    p_household_id,
    'adjustment',
    v_delta,
    nullif(pg_catalog.btrim(p_note), ''),
    v_caller_id
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

create function public.update_common_fund_settings(
  p_household_id uuid,
  p_monthly_amount numeric,
  p_enabled boolean
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
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para configurar el fondo común';
  end if;

  if p_household_id is null or not (select public.is_household_member(p_household_id)) then
    raise exception using errcode = '42501', message = 'No perteneces al hogar indicado';
  end if;

  if p_monthly_amount is null or p_monthly_amount < 0 or p_monthly_amount > 9999999999.99
    or p_monthly_amount <> pg_catalog.round(p_monthly_amount, 2) then
    raise exception using errcode = '22023', message = 'La aportación mensual debe ser 0 o mayor y tener como máximo dos decimales';
  end if;

  if p_enabled is null then
    raise exception using errcode = '22023', message = 'Indica si el fondo común está activo';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('common_fund:' || p_household_id::text, 0)
  );

  update public.common_fund_settings
  set monthly_amount = p_monthly_amount,
      enabled = p_enabled
  where household_id = p_household_id;

  if not found then
    raise exception using errcode = '22023', message = 'No existe configuración para este hogar';
  end if;

  return p_household_id;
end;
$$;

-- V2 keeps member payments compatible and adds atomic common-fund expenses.
create function public.create_expense_v2(
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
  v_expense_id uuid;
  v_member_ids uuid[];
  v_amount_cents bigint;
  v_first_share numeric;
  v_second_share numeric;
  v_balance numeric;
begin
  if p_payment_source is null or p_payment_source not in ('member', 'common_fund') then
    raise exception using errcode = '22023', message = 'El origen del pago no es válido';
  end if;

  if p_payment_source = 'member' then
    return public.create_expense(
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
  end if;

  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para crear un gasto';
  end if;

  if p_household_id is null or not (select public.is_household_member(p_household_id)) then
    raise exception using errcode = '42501', message = 'No perteneces al hogar indicado';
  end if;

  if p_description is null or pg_catalog.btrim(p_description) = '' then
    raise exception using errcode = '22023', message = 'El concepto del gasto es obligatorio';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 9999999999.99
    or p_amount <> pg_catalog.round(p_amount, 2) then
    raise exception using errcode = '22023', message = 'El importe debe ser mayor que 0 y tener como máximo dos decimales';
  end if;

  if p_expense_date is null then
    raise exception using errcode = '22023', message = 'La fecha del gasto es obligatoria';
  end if;

  if p_expense_type <> 'common' then
    raise exception using errcode = '22023', message = 'Un gasto del fondo común debe ser de tipo common';
  end if;

  if p_category_id is null or not exists (
    select 1 from public.categories as category
    where category.id = p_category_id
      and category.household_id = p_household_id
      and category.archived = false
  ) then
    raise exception using errcode = '22023', message = 'La categoría no pertenece al hogar o está archivada';
  end if;

  select pg_catalog.array_agg(member.user_id order by member.joined_at, member.user_id)
  into v_member_ids
  from public.household_members as member
  where member.household_id = p_household_id;

  if coalesce(pg_catalog.array_length(v_member_ids, 1), 0) <> 2 then
    raise exception using errcode = '22023', message = 'El fondo común requiere exactamente dos miembros';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('common_fund:' || p_household_id::text, 0)
  );

  if not exists (
    select 1 from public.common_fund_settings as settings
    where settings.household_id = p_household_id and settings.enabled = true
  ) then
    raise exception using errcode = '22023', message = 'El fondo común está desactivado';
  end if;

  v_balance := private.get_common_fund_balance(p_household_id);
  if v_balance < p_amount then
    raise exception using errcode = '22023', message = 'No hay suficiente dinero en el fondo común.';
  end if;

  insert into public.expenses (
    household_id,
    description,
    amount,
    category_id,
    expense_date,
    expense_type,
    note,
    payment_source,
    created_by
  )
  values (
    p_household_id,
    pg_catalog.btrim(p_description),
    p_amount,
    p_category_id,
    p_expense_date,
    'common',
    nullif(pg_catalog.btrim(p_note), ''),
    'common_fund',
    v_caller_id
  )
  returning id into v_expense_id;

  v_amount_cents := pg_catalog.round(p_amount * 100)::bigint;
  v_first_share := (v_amount_cents / 2)::numeric / 100;
  v_second_share := p_amount - v_first_share;

  insert into public.expense_splits (expense_id, user_id, share_percent, share_amount)
  values
    (v_expense_id, v_member_ids[1], 50, v_first_share),
    (v_expense_id, v_member_ids[2], 50, v_second_share);

  insert into public.common_fund_movements (
    household_id,
    movement_type,
    amount_delta,
    expense_id,
    note,
    created_by
  )
  values (
    p_household_id,
    'expense',
    -p_amount,
    v_expense_id,
    pg_catalog.btrim(p_description),
    v_caller_id
  );

  return v_expense_id;
end;
$$;

-- Keep the complete V1 validation logic as a private implementation for member payments.
alter function public.update_expense(uuid, text, numeric, uuid, date, text, text, jsonb, jsonb)
  set schema private;
alter function public.delete_expense(uuid)
  set schema private;

revoke all on function private.update_expense(uuid, text, numeric, uuid, date, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.delete_expense(uuid)
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
  v_current_source text;
  v_member_ids uuid[];
  v_amount_cents bigint;
  v_first_share numeric;
  v_second_share numeric;
  v_balance numeric;
  v_existing_delta numeric;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para actualizar un gasto';
  end if;

  select expense.household_id, expense.payment_source
  into v_household_id, v_current_source
  from public.expenses as expense
  where expense.id = p_expense_id and expense.deleted_at is null
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'El gasto no existe o ya está eliminado';
  end if;

  if not (select public.is_household_member(v_household_id)) then
    raise exception using errcode = '42501', message = 'No perteneces al hogar de este gasto';
  end if;

  if p_payment_source is null or p_payment_source not in ('member', 'common_fund') then
    raise exception using errcode = '22023', message = 'El origen del pago no es válido';
  end if;

  -- Any transition touching the fund shares the same household lock.
  if v_current_source = 'common_fund' or p_payment_source = 'common_fund' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('common_fund:' || v_household_id::text, 0)
    );
  end if;

  if p_payment_source = 'member' then
    perform private.update_expense(
      p_expense_id,
      p_description,
      p_amount,
      p_category_id,
      p_expense_date,
      p_expense_type,
      p_note,
      p_payments,
      p_splits
    );

    if v_current_source = 'common_fund' then
      update public.common_fund_movements
      set deleted_at = pg_catalog.now()
      where expense_id = p_expense_id
        and movement_type = 'expense'
        and deleted_at is null;

      if not found then
        raise exception using errcode = '23514', message = 'El gasto del fondo no tiene un movimiento activo';
      end if;
    end if;

    update public.expenses
    set payment_source = 'member'
    where id = p_expense_id;

    return p_expense_id;
  end if;

  if p_description is null or pg_catalog.btrim(p_description) = '' then
    raise exception using errcode = '22023', message = 'El concepto es obligatorio';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 9999999999.99
    or p_amount <> pg_catalog.round(p_amount, 2) then
    raise exception using errcode = '22023', message = 'El importe debe ser mayor que 0 y tener como máximo dos decimales';
  end if;

  if p_expense_date is null then
    raise exception using errcode = '22023', message = 'La fecha es obligatoria';
  end if;

  if p_expense_type <> 'common' then
    raise exception using errcode = '22023', message = 'Un gasto del fondo común debe ser de tipo common';
  end if;

  if p_category_id is null or not exists (
    select 1 from public.categories as category
    where category.id = p_category_id
      and category.household_id = v_household_id
      and category.archived = false
  ) then
    raise exception using errcode = '22023', message = 'La categoría no pertenece al hogar o no está activa';
  end if;

  select pg_catalog.array_agg(member.user_id order by member.joined_at, member.user_id)
  into v_member_ids
  from public.household_members as member
  where member.household_id = v_household_id;

  if coalesce(pg_catalog.array_length(v_member_ids, 1), 0) <> 2 then
    raise exception using errcode = '22023', message = 'El fondo común requiere exactamente dos miembros';
  end if;

  if not exists (
    select 1 from public.common_fund_settings as settings
    where settings.household_id = v_household_id and settings.enabled = true
  ) then
    raise exception using errcode = '22023', message = 'El fondo común está desactivado';
  end if;

  v_balance := private.get_common_fund_balance(v_household_id);
  v_existing_delta := 0;

  if v_current_source = 'common_fund' then
    select movement.amount_delta
    into v_existing_delta
    from public.common_fund_movements as movement
    where movement.expense_id = p_expense_id
      and movement.movement_type = 'expense'
      and movement.deleted_at is null
    for update;

    if not found then
      raise exception using errcode = '23514', message = 'El gasto del fondo no tiene un movimiento activo';
    end if;
  end if;

  if v_balance - v_existing_delta < p_amount then
    raise exception using errcode = '22023', message = 'No hay suficiente dinero en el fondo común.';
  end if;

  update public.expenses
  set description = pg_catalog.btrim(p_description),
      amount = p_amount,
      category_id = p_category_id,
      expense_date = p_expense_date,
      expense_type = 'common',
      note = nullif(pg_catalog.btrim(p_note), ''),
      payment_source = 'common_fund'
  where id = p_expense_id;

  delete from public.expense_payments where expense_id = p_expense_id;
  delete from public.expense_splits where expense_id = p_expense_id;

  v_amount_cents := pg_catalog.round(p_amount * 100)::bigint;
  v_first_share := (v_amount_cents / 2)::numeric / 100;
  v_second_share := p_amount - v_first_share;

  insert into public.expense_splits (expense_id, user_id, share_percent, share_amount)
  values
    (p_expense_id, v_member_ids[1], 50, v_first_share),
    (p_expense_id, v_member_ids[2], 50, v_second_share);

  if v_current_source = 'common_fund' then
    update public.common_fund_movements
    set amount_delta = -p_amount,
        note = pg_catalog.btrim(p_description)
    where expense_id = p_expense_id
      and movement_type = 'expense'
      and deleted_at is null;
  else
    insert into public.common_fund_movements (
      household_id,
      movement_type,
      amount_delta,
      expense_id,
      note,
      created_by
    )
    values (
      v_household_id,
      'expense',
      -p_amount,
      p_expense_id,
      pg_catalog.btrim(p_description),
      v_caller_id
    );
  end if;

  return p_expense_id;
end;
$$;

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
  v_payment_source text;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para eliminar un gasto';
  end if;

  select expense.household_id, expense.payment_source
  into v_household_id, v_payment_source
  from public.expenses as expense
  where expense.id = p_expense_id and expense.deleted_at is null
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'El gasto no existe o ya está eliminado';
  end if;

  if not (select public.is_household_member(v_household_id)) then
    raise exception using errcode = '42501', message = 'No perteneces al hogar de este gasto';
  end if;

  if v_payment_source = 'common_fund' then
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
  end if;

  update public.expenses
  set deleted_at = pg_catalog.now()
  where id = p_expense_id;

  return p_expense_id;
end;
$$;

-- Legacy RPC signatures remain available and delegate to the safe V2 paths.
create function public.update_expense(
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
  v_payment_source text;
begin
  select expense.payment_source
  into v_payment_source
  from public.expenses as expense
  where expense.id = p_expense_id and expense.deleted_at is null;

  if not found then
    raise exception using errcode = '22023', message = 'El gasto no existe o ya está eliminado';
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

create function public.delete_expense(p_expense_id uuid)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select public.delete_expense_v2(p_expense_id);
$$;

comment on function public.ensure_monthly_common_fund(uuid, date) is
  'Idempotently credits one configured contribution per household/month; household advisory locking plus a partial unique index protects concurrent calls.';
comment on function public.set_common_fund_balance(uuid, numeric, text) is
  'Creates only the delta needed to reach a nonnegative target; returns NULL when already at that target.';
comment on function public.create_expense_v2(uuid, text, numeric, uuid, date, text, text, text, uuid, numeric, jsonb) is
  'Creates member or common-fund expenses atomically; fund expenses always use two 50/50 splits and no member payment.';
comment on function public.update_expense_v2(uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb) is
  'Atomically supports member/member, member/fund, fund/member and fund/fund transitions.';
comment on function public.delete_expense_v2(uuid) is
  'Soft-deletes an expense and, for fund expenses, its linked ledger movement in the same transaction.';

-- No direct mutation is exposed, and function execution is authenticated-only.
revoke all privileges on function public.ensure_monthly_common_fund(uuid, date)
  from public, anon, authenticated;
revoke all privileges on function public.top_up_common_fund(uuid, numeric, text)
  from public, anon, authenticated;
revoke all privileges on function public.set_common_fund_balance(uuid, numeric, text)
  from public, anon, authenticated;
revoke all privileges on function public.update_common_fund_settings(uuid, numeric, boolean)
  from public, anon, authenticated;
revoke all privileges on function public.create_expense_v2(uuid, text, numeric, uuid, date, text, text, text, uuid, numeric, jsonb)
  from public, anon, authenticated;
revoke all privileges on function public.update_expense_v2(uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all privileges on function public.delete_expense_v2(uuid)
  from public, anon, authenticated;
revoke all privileges on function public.update_expense(uuid, text, numeric, uuid, date, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all privileges on function public.delete_expense(uuid)
  from public, anon, authenticated;

grant execute on function public.ensure_monthly_common_fund(uuid, date) to authenticated;
grant execute on function public.top_up_common_fund(uuid, numeric, text) to authenticated;
grant execute on function public.set_common_fund_balance(uuid, numeric, text) to authenticated;
grant execute on function public.update_common_fund_settings(uuid, numeric, boolean) to authenticated;
grant execute on function public.create_expense_v2(uuid, text, numeric, uuid, date, text, text, text, uuid, numeric, jsonb) to authenticated;
grant execute on function public.update_expense_v2(uuid, text, numeric, uuid, date, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.delete_expense_v2(uuid) to authenticated;
grant execute on function public.update_expense(uuid, text, numeric, uuid, date, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.delete_expense(uuid) to authenticated;

-- Explicitly preserve read-only frontend access to the new expense column.
grant select on table public.expenses to authenticated;

commit;
