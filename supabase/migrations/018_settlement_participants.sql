-- Both the payer and recipient may record the same payment.
-- Existing and replacement participants must authorize edits; household membership alone is insufficient.
begin;

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

  if v_caller_id not in (p_from_user_id, p_to_user_id) then
    raise exception using errcode = '42501', message = 'Solo quien paga o recibe puede registrar esta liquidación';
  end if;

  if p_amount is null or p_amount in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) or p_amount <= 0 then
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
    and v_caller_id in (settlement.from_user_id, settlement.to_user_id)
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

  if v_caller_id not in (p_from_user_id, p_to_user_id) then
    raise exception using errcode = '42501', message = 'Solo quien paga o recibe puede registrar esta liquidación';
  end if;

  if p_amount is null or p_amount in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) or p_amount <= 0 then
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
    and v_caller_id in (settlement.from_user_id, settlement.to_user_id)
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

revoke all privileges on function public.create_settlement(uuid, uuid, uuid, numeric, date, text)
  from public, anon, authenticated;
revoke all privileges on function public.update_settlement(uuid, uuid, uuid, numeric, date, text)
  from public, anon, authenticated;
revoke all privileges on function public.delete_settlement(uuid)
  from public, anon, authenticated;
grant execute on function public.create_settlement(uuid, uuid, uuid, numeric, date, text) to authenticated;
grant execute on function public.update_settlement(uuid, uuid, uuid, numeric, date, text) to authenticated;
grant execute on function public.delete_settlement(uuid) to authenticated;

-- Mutation remains RPC-only. SELECT privileges and existing RLS are unchanged.
revoke insert, update, delete on public.settlements from public, anon, authenticated;
revoke insert (household_id, from_user_id, to_user_id, amount, settlement_date, note, created_by),
  update (from_user_id, to_user_id, amount, settlement_date, note, deleted_at, updated_by)
  on public.settlements from public, anon, authenticated;

commit;
