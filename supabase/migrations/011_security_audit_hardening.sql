begin;

-- Household creation remains a direct authenticated insert because onboarding
-- depends on it. Existing household mutation is not exposed by the frontend and
-- must not be available as an alternate Data API administration surface.
revoke update (name, currency) on table public.households from authenticated;
revoke delete on table public.households from authenticated;

drop policy if exists "households_update_owner" on public.households;
drop policy if exists "households_delete_owner" on public.households;

-- Membership changes are exclusively owned by trusted triggers and invitation
-- RPCs. This prevents invite bypass, direct role promotion and removal of the
-- final owner through the Data API.
revoke insert (household_id, user_id, role, default_share)
  on table public.household_members from authenticated;
revoke update (role, default_share)
  on table public.household_members from authenticated;
revoke delete on table public.household_members from authenticated;

drop policy if exists "household_members_insert_owner" on public.household_members;
drop policy if exists "household_members_update_owner" on public.household_members;
drop policy if exists "household_members_delete_owner" on public.household_members;

-- Categories are currently seeded by the household trigger and have no mutation
-- UI. Remove unused direct writes so a console caller cannot create or alter them.
revoke insert (household_id, name, icon, archived, created_by)
  on table public.categories from authenticated;
revoke update (name, icon, archived)
  on table public.categories from authenticated;

drop policy if exists "categories_insert_member" on public.categories;
drop policy if exists "categories_update_member" on public.categories;

-- Invitations and settlements already have no direct DML grants. Remove their
-- legacy write policies too, so RPC-only mutation remains fail-closed even if a
-- broad table grant is introduced accidentally in the future.
drop policy if exists "household_invites_insert_owner" on public.household_invites;
drop policy if exists "household_invites_update_owner" on public.household_invites;
drop policy if exists "settlements_insert_member" on public.settlements;
drop policy if exists "settlements_update_member" on public.settlements;

-- The current common-fund model is exclusively manual. Keep this historical
-- function for database compatibility, but remove it from the browser API so a
-- member cannot create a monthly contribution from DevTools.
revoke all privileges on function public.ensure_monthly_common_fund(uuid, date)
  from public, anon, authenticated;

-- There is no trash, restore or deleted-record history in the client. Match the
-- Data API boundary to that product model: soft-deleted expenses, settlements
-- and their payment/split children are not readable by authenticated clients.
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
        and expense.deleted_at is null
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

drop policy if exists "expenses_select_visible" on public.expenses;
drop policy if exists "expenses_select_active_visible" on public.expenses;

create policy "expenses_select_active_visible"
on public.expenses
for select
to authenticated
using (
  deleted_at is null
  and (
    (
      expense_type = 'common'
      and (select public.is_household_member(household_id))
    )
    or (
      expense_type = 'personal'
      and personal_owner_id = (select auth.uid())
    )
  )
);

drop policy if exists "settlements_select_member" on public.settlements;
drop policy if exists "settlements_select_active_member" on public.settlements;

create policy "settlements_select_active_member"
on public.settlements
for select
to authenticated
using (
  deleted_at is null
  and (select public.is_household_member(household_id))
);

-- A fund-backed expense may later return to private personal visibility. Its
-- movement is soft-deleted atomically; excluding deleted movements at the RLS
-- boundary prevents the other member from inferring the restored private expense.
drop policy if exists "common_fund_movements_select_member"
  on public.common_fund_movements;
drop policy if exists "common_fund_movements_select_active_member"
  on public.common_fund_movements;

create policy "common_fund_movements_select_active_member"
on public.common_fund_movements
for select
to authenticated
using (
  deleted_at is null
  and (select public.is_household_member(household_id))
);

-- Avoid existence oracles for arbitrary settlement UUIDs/household UUIDs. A
-- missing, deleted or foreign record follows the same access-denied path.
create or replace function public.create_settlement(
  p_household_id uuid,
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_amount numeric,
  p_settlement_date date,
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
  v_settlement_id uuid;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para registrar una liquidación';
  end if;

  if p_household_id is null
    or not (select public.is_household_member(p_household_id)) then
    raise exception using errcode = '42501', message = 'No tienes acceso al hogar indicado';
  end if;

  if p_from_user_id is null or not exists (
    select 1
    from public.household_members as member
    where member.household_id = p_household_id
      and member.user_id = p_from_user_id
  ) then
    raise exception using errcode = '22023', message = 'La persona que entrega el dinero no pertenece al hogar';
  end if;

  if p_to_user_id is null or not exists (
    select 1
    from public.household_members as member
    where member.household_id = p_household_id
      and member.user_id = p_to_user_id
  ) then
    raise exception using errcode = '22023', message = 'La persona que recibe el dinero no pertenece al hogar';
  end if;

  if p_from_user_id = p_to_user_id then
    raise exception using errcode = '22023', message = 'Las personas de origen y destino deben ser diferentes';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'El importe debe ser mayor que 0';
  end if;

  if p_amount > 9999999999.99 then
    raise exception using errcode = '22003', message = 'El importe supera el máximo permitido';
  end if;

  if p_amount <> pg_catalog.round(p_amount, 2) then
    raise exception using errcode = '22023', message = 'El importe no puede tener más de dos decimales';
  end if;

  if p_settlement_date is null then
    raise exception using errcode = '22023', message = 'La fecha es obligatoria';
  end if;

  insert into public.settlements (
    household_id,
    from_user_id,
    to_user_id,
    amount,
    settlement_date,
    note,
    created_by
  )
  values (
    p_household_id,
    p_from_user_id,
    p_to_user_id,
    p_amount,
    p_settlement_date,
    nullif(pg_catalog.btrim(p_note), ''),
    v_caller_id
  )
  returning id into v_settlement_id;

  return v_settlement_id;
end;
$$;

create or replace function public.update_settlement(
  p_settlement_id uuid,
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_amount numeric,
  p_settlement_date date,
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
  v_household_id uuid;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para actualizar una liquidación';
  end if;

  select settlement.household_id
  into v_household_id
  from public.settlements as settlement
  where settlement.id = p_settlement_id
    and settlement.deleted_at is null
    and exists (
      select 1
      from public.household_members as member
      where member.household_id = settlement.household_id
        and member.user_id = v_caller_id
    )
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'No tienes acceso a esta liquidación';
  end if;

  if p_from_user_id is null or not exists (
    select 1
    from public.household_members as member
    where member.household_id = v_household_id
      and member.user_id = p_from_user_id
  ) then
    raise exception using errcode = '22023', message = 'La persona que entrega el dinero no pertenece al hogar';
  end if;

  if p_to_user_id is null or not exists (
    select 1
    from public.household_members as member
    where member.household_id = v_household_id
      and member.user_id = p_to_user_id
  ) then
    raise exception using errcode = '22023', message = 'La persona que recibe el dinero no pertenece al hogar';
  end if;

  if p_from_user_id = p_to_user_id then
    raise exception using errcode = '22023', message = 'Las personas de origen y destino deben ser diferentes';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'El importe debe ser mayor que 0';
  end if;

  if p_amount > 9999999999.99 then
    raise exception using errcode = '22003', message = 'El importe supera el máximo permitido';
  end if;

  if p_amount <> pg_catalog.round(p_amount, 2) then
    raise exception using errcode = '22023', message = 'El importe no puede tener más de dos decimales';
  end if;

  if p_settlement_date is null then
    raise exception using errcode = '22023', message = 'La fecha es obligatoria';
  end if;

  update public.settlements
  set from_user_id = p_from_user_id,
      to_user_id = p_to_user_id,
      amount = p_amount,
      settlement_date = p_settlement_date,
      note = nullif(pg_catalog.btrim(p_note), '')
  where id = p_settlement_id;

  return p_settlement_id;
end;
$$;

create or replace function public.delete_settlement(p_settlement_id uuid)
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
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para eliminar una liquidación';
  end if;

  update public.settlements as settlement
  set deleted_at = pg_catalog.now()
  where settlement.id = p_settlement_id
    and settlement.deleted_at is null
    and exists (
      select 1
      from public.household_members as member
      where member.household_id = settlement.household_id
        and member.user_id = v_caller_id
    );

  if not found then
    raise exception using errcode = '42501', message = 'No tienes acceso a esta liquidación';
  end if;

  return p_settlement_id;
end;
$$;

-- Invite management likewise returns the same unavailable result for missing,
-- foreign and non-owner UUIDs.
create or replace function public.revoke_household_invite(p_invite_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_invitation public.household_invites%rowtype;
begin
  if v_caller_id is null then
    raise exception 'INVITE_AUTH_REQUIRED' using errcode = '28000';
  end if;

  select invitation.*
  into v_invitation
  from public.household_invites as invitation
  where invitation.id = p_invite_id
    and exists (
      select 1
      from public.household_members as member
      where member.household_id = invitation.household_id
        and member.user_id = v_caller_id
        and member.role = 'owner'
    )
  for update;

  if not found or v_invitation.status <> 'pending' then
    raise exception 'INVITE_UNAVAILABLE' using errcode = '42501';
  end if;

  update public.household_invites
  set status = case
    when expires_at <= pg_catalog.now() then 'expired'
    else 'revoked'
  end
  where id = v_invitation.id;
end;
$$;

revoke all privileges on function public.create_settlement(uuid, uuid, uuid, numeric, date, text)
  from public, anon, authenticated;
revoke all privileges on function public.update_settlement(uuid, uuid, uuid, numeric, date, text)
  from public, anon, authenticated;
revoke all privileges on function public.delete_settlement(uuid)
  from public, anon, authenticated;
revoke all privileges on function public.revoke_household_invite(uuid)
  from public, anon, authenticated;

grant execute on function public.create_settlement(uuid, uuid, uuid, numeric, date, text)
  to authenticated;
grant execute on function public.update_settlement(uuid, uuid, uuid, numeric, date, text)
  to authenticated;
grant execute on function public.delete_settlement(uuid)
  to authenticated;
grant execute on function public.revoke_household_invite(uuid)
  to authenticated;

commit;
