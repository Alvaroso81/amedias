begin;

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
security invoker
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_household_id uuid;
  v_payment jsonb;
  v_payment_user_id uuid;
  v_payment_amount numeric;
  v_payment_count integer := 0;
  v_payment_total numeric := 0;
  v_payment_user_ids uuid[] := array[]::uuid[];
  v_split jsonb;
  v_split_user_id uuid;
  v_share_percent numeric;
  v_share_amount numeric;
  v_split_count integer := 0;
  v_split_percent_total numeric := 0;
  v_split_amount_total numeric := 0;
  v_split_user_ids uuid[] := array[]::uuid[];
  v_personal_payer_id uuid;
  v_personal_split_user_id uuid;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para actualizar un gasto';
  end if;

  select e.household_id
  into v_household_id
  from public.expenses as e
  where e.id = p_expense_id
    and e.deleted_at is null
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'El gasto no existe o ya está eliminado';
  end if;

  if not public.is_household_member(v_household_id) then
    raise exception using errcode = '42501', message = 'No perteneces al hogar de este gasto';
  end if;

  if p_description is null or pg_catalog.btrim(p_description) = '' then
    raise exception using errcode = '22023', message = 'El concepto es obligatorio';
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

  if p_expense_date is null then
    raise exception using errcode = '22023', message = 'La fecha es obligatoria';
  end if;

  if p_expense_type is null or p_expense_type not in ('common', 'personal') then
    raise exception using errcode = '22023', message = 'El tipo de gasto no es válido';
  end if;

  if p_category_id is null or not exists (
    select 1
    from public.categories as c
    where c.id = p_category_id
      and c.household_id = v_household_id
      and c.archived = false
  ) then
    raise exception using errcode = '22023', message = 'La categoría no pertenece al hogar o no está activa';
  end if;

  if p_payments is null or pg_catalog.jsonb_typeof(p_payments) <> 'array' then
    raise exception using errcode = '22023', message = 'Los pagos deben enviarse como una lista';
  end if;

  for v_payment in
    select value
    from pg_catalog.jsonb_array_elements(p_payments)
  loop
    if pg_catalog.jsonb_typeof(v_payment) <> 'object' then
      raise exception using errcode = '22023', message = 'Cada pago debe ser un objeto JSON';
    end if;

    begin
      v_payment_user_id := nullif(v_payment ->> 'user_id', '')::uuid;
      v_payment_amount := nullif(v_payment ->> 'amount', '')::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = '22023', message = 'Los datos de un pago no son válidos';
    end;

    if v_payment_user_id is null or v_payment_amount is null then
      raise exception using errcode = '22023', message = 'Cada pago necesita usuario e importe';
    end if;

    if v_payment_user_id = any(v_payment_user_ids) then
      raise exception using errcode = '22023', message = 'No puede repetirse un usuario en los pagos';
    end if;

    if not exists (
      select 1
      from public.household_members as hm
      where hm.household_id = v_household_id
        and hm.user_id = v_payment_user_id
    ) then
      raise exception using errcode = '22023', message = 'Todos los pagadores deben pertenecer al hogar';
    end if;

    if v_payment_amount < 0 then
      raise exception using errcode = '22023', message = 'Los importes pagados no pueden ser negativos';
    end if;

    if v_payment_amount > 9999999999.99 then
      raise exception using errcode = '22003', message = 'Un pago supera el máximo permitido';
    end if;

    if v_payment_amount <> pg_catalog.round(v_payment_amount, 2) then
      raise exception using errcode = '22023', message = 'Los pagos no pueden tener más de dos decimales';
    end if;

    v_payment_count := v_payment_count + 1;
    v_payment_total := v_payment_total + v_payment_amount;
    v_payment_user_ids := pg_catalog.array_append(v_payment_user_ids, v_payment_user_id);
    v_personal_payer_id := v_payment_user_id;
  end loop;

  if v_payment_count = 0 then
    raise exception using errcode = '22023', message = 'El gasto debe tener al menos un pago';
  end if;

  if v_payment_total <> p_amount then
    raise exception using errcode = '22023', message = 'Los pagos deben sumar exactamente el importe del gasto';
  end if;

  if p_splits is null or pg_catalog.jsonb_typeof(p_splits) <> 'array' then
    raise exception using errcode = '22023', message = 'El reparto debe enviarse como una lista';
  end if;

  for v_split in
    select value
    from pg_catalog.jsonb_array_elements(p_splits)
  loop
    if pg_catalog.jsonb_typeof(v_split) <> 'object' then
      raise exception using errcode = '22023', message = 'Cada reparto debe ser un objeto JSON';
    end if;

    begin
      v_split_user_id := nullif(v_split ->> 'user_id', '')::uuid;
      v_share_percent := nullif(v_split ->> 'share_percent', '')::numeric;
      v_share_amount := nullif(v_split ->> 'share_amount', '')::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = '22023', message = 'Los datos de un reparto no son válidos';
    end;

    if v_split_user_id is null or v_share_percent is null or v_share_amount is null then
      raise exception using errcode = '22023', message = 'Cada reparto necesita usuario, porcentaje e importe';
    end if;

    if v_split_user_id = any(v_split_user_ids) then
      raise exception using errcode = '22023', message = 'No puede repetirse un usuario en el reparto';
    end if;

    if not exists (
      select 1
      from public.household_members as hm
      where hm.household_id = v_household_id
        and hm.user_id = v_split_user_id
    ) then
      raise exception using errcode = '22023', message = 'Todas las personas del reparto deben pertenecer al hogar';
    end if;

    if v_share_percent < 0 or v_share_percent > 100 then
      raise exception using errcode = '22023', message = 'Los porcentajes deben estar entre 0 y 100';
    end if;

    if v_share_percent <> pg_catalog.round(v_share_percent, 2) then
      raise exception using errcode = '22023', message = 'Los porcentajes no pueden tener más de dos decimales';
    end if;

    if v_share_amount < 0 then
      raise exception using errcode = '22023', message = 'Los importes del reparto no pueden ser negativos';
    end if;

    if v_share_amount > 9999999999.99 then
      raise exception using errcode = '22003', message = 'Un importe del reparto supera el máximo permitido';
    end if;

    if v_share_amount <> pg_catalog.round(v_share_amount, 2) then
      raise exception using errcode = '22023', message = 'Los importes del reparto no pueden tener más de dos decimales';
    end if;

    v_split_count := v_split_count + 1;
    v_split_percent_total := v_split_percent_total + v_share_percent;
    v_split_amount_total := v_split_amount_total + v_share_amount;
    v_split_user_ids := pg_catalog.array_append(v_split_user_ids, v_split_user_id);
    v_personal_split_user_id := v_split_user_id;
  end loop;

  if v_split_count = 0 then
    raise exception using errcode = '22023', message = 'El gasto debe tener al menos un reparto';
  end if;

  if v_split_amount_total <> p_amount then
    raise exception using errcode = '22023', message = 'Los importes del reparto deben sumar exactamente el importe del gasto';
  end if;

  if p_expense_type = 'common' and v_split_percent_total <> 100 then
    raise exception using errcode = '22023', message = 'El reparto debe sumar exactamente 100 %';
  end if;

  if p_expense_type = 'personal' and (
    v_payment_count <> 1
    or v_split_count <> 1
    or v_personal_payer_id <> v_personal_split_user_id
    or v_payment_total <> p_amount
    or v_split_amount_total <> p_amount
    or v_split_percent_total <> 100
  ) then
    raise exception using errcode = '22023', message = 'Un gasto personal debe corresponder íntegramente a una sola persona';
  end if;

  update public.expenses
  set description = pg_catalog.btrim(p_description),
      amount = p_amount,
      category_id = p_category_id,
      expense_date = p_expense_date,
      expense_type = p_expense_type,
      note = nullif(pg_catalog.btrim(p_note), '')
  where id = p_expense_id;

  -- Los triggers existentes actualizan updated_at y updated_by con auth.uid().
  delete from public.expense_payments
  where expense_id = p_expense_id;

  for v_payment in
    select value
    from pg_catalog.jsonb_array_elements(p_payments)
  loop
    insert into public.expense_payments (expense_id, user_id, amount)
    values (
      p_expense_id,
      (v_payment ->> 'user_id')::uuid,
      (v_payment ->> 'amount')::numeric
    );
  end loop;

  delete from public.expense_splits
  where expense_id = p_expense_id;

  for v_split in
    select value
    from pg_catalog.jsonb_array_elements(p_splits)
  loop
    insert into public.expense_splits (expense_id, user_id, share_percent, share_amount)
    values (
      p_expense_id,
      (v_split ->> 'user_id')::uuid,
      (v_split ->> 'share_percent')::numeric,
      (v_split ->> 'share_amount')::numeric
    );
  end loop;

  return p_expense_id;
end;
$$;

create or replace function public.delete_expense(p_expense_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_household_id uuid;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión para eliminar un gasto';
  end if;

  select e.household_id
  into v_household_id
  from public.expenses as e
  where e.id = p_expense_id
    and e.deleted_at is null
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'El gasto no existe o ya está eliminado';
  end if;

  if not public.is_household_member(v_household_id) then
    raise exception using errcode = '42501', message = 'No perteneces al hogar de este gasto';
  end if;

  update public.expenses
  set deleted_at = pg_catalog.now()
  where id = p_expense_id;

  -- Los triggers existentes actualizan updated_at y updated_by con auth.uid().
  return p_expense_id;
end;
$$;

revoke all on function public.update_expense(uuid, text, numeric, uuid, date, text, text, jsonb, jsonb) from public;
revoke all on function public.update_expense(uuid, text, numeric, uuid, date, text, text, jsonb, jsonb) from anon;
revoke all on function public.update_expense(uuid, text, numeric, uuid, date, text, text, jsonb, jsonb) from authenticated;
grant execute on function public.update_expense(uuid, text, numeric, uuid, date, text, text, jsonb, jsonb) to authenticated;

revoke all on function public.delete_expense(uuid) from public;
revoke all on function public.delete_expense(uuid) from anon;
revoke all on function public.delete_expense(uuid) from authenticated;
grant execute on function public.delete_expense(uuid) to authenticated;

commit;
