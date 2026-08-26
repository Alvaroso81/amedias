begin;

-- Creates an expense and its payment/splits atomically under the caller's RLS context.
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
security invoker
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_expense_id uuid;
  v_split jsonb;
  v_split_user_id uuid;
  v_share_percent numeric;
  v_share_amount numeric;
  v_split_count integer := 0;
  v_total_percent numeric := 0;
  v_total_amount numeric := 0;
  v_seen_user_ids uuid[] := '{}'::uuid[];
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null then
    raise exception 'Debes iniciar sesión para crear un gasto' using errcode = '28000';
  end if;

  if p_household_id is null
    or not (select public.is_household_member(p_household_id)) then
    raise exception 'No perteneces al hogar indicado' using errcode = '42501';
  end if;

  if p_description is null or pg_catalog.btrim(p_description) = '' then
    raise exception 'El concepto del gasto es obligatorio' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe debe ser mayor que 0' using errcode = '22023';
  end if;

  if p_amount <> pg_catalog.round(p_amount, 2) then
    raise exception 'El importe no puede tener más de dos decimales' using errcode = '22023';
  end if;

  if p_amount > 9999999999.99 then
    raise exception 'El importe supera el máximo permitido' using errcode = '22023';
  end if;

  if p_expense_type is null or p_expense_type not in ('common', 'personal') then
    raise exception 'El tipo de gasto debe ser common o personal' using errcode = '22023';
  end if;

  if p_expense_date is null then
    raise exception 'La fecha del gasto es obligatoria' using errcode = '22023';
  end if;

  if p_category_id is null or not exists (
    select 1
    from public.categories as category
    where category.id = p_category_id
      and category.household_id = p_household_id
      and category.archived = false
  ) then
    raise exception 'La categoría no pertenece al hogar o está archivada'
      using errcode = '22023';
  end if;

  if p_paid_by_user_id is null or not exists (
    select 1
    from public.household_members as member
    where member.household_id = p_household_id
      and member.user_id = p_paid_by_user_id
  ) then
    raise exception 'El pagador no pertenece al hogar' using errcode = '22023';
  end if;

  if p_payer_amount is null or p_payer_amount <= 0 then
    raise exception 'El importe pagado debe ser mayor que 0' using errcode = '22023';
  end if;

  if p_payer_amount <> pg_catalog.round(p_payer_amount, 2) then
    raise exception 'El importe pagado no puede tener más de dos decimales'
      using errcode = '22023';
  end if;

  if p_payer_amount <> p_amount then
    raise exception 'En esta versión el pagador debe abonar el importe completo'
      using errcode = '22023';
  end if;

  if p_splits is null or pg_catalog.jsonb_typeof(p_splits) <> 'array' then
    raise exception 'El reparto debe ser un array JSON' using errcode = '22023';
  end if;

  for v_split in
    select split_item.value
    from pg_catalog.jsonb_array_elements(p_splits) as split_item(value)
  loop
    if pg_catalog.jsonb_typeof(v_split) <> 'object' then
      raise exception 'Cada elemento del reparto debe ser un objeto JSON'
        using errcode = '22023';
    end if;

    begin
      v_split_user_id := nullif(v_split ->> 'user_id', '')::uuid;
      v_share_percent := nullif(v_split ->> 'share_percent', '')::numeric;
      v_share_amount := nullif(v_split ->> 'share_amount', '')::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'El reparto contiene valores con formato inválido'
          using errcode = '22023';
    end;

    if v_split_user_id is null
      or v_share_percent is null
      or v_share_amount is null then
      raise exception 'Cada reparto debe incluir user_id, share_percent y share_amount'
        using errcode = '22023';
    end if;

    if v_split_user_id = any (v_seen_user_ids) then
      raise exception 'No puede repetirse un usuario en el reparto' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.household_members as member
      where member.household_id = p_household_id
        and member.user_id = v_split_user_id
    ) then
      raise exception 'Todos los participantes del reparto deben pertenecer al hogar'
        using errcode = '22023';
    end if;

    if v_share_percent < 0 or v_share_percent > 100 then
      raise exception 'Cada porcentaje debe estar entre 0 y 100'
        using errcode = '22023';
    end if;

    if v_share_percent <> pg_catalog.round(v_share_percent, 2) then
      raise exception 'Los porcentajes no pueden tener más de dos decimales'
        using errcode = '22023';
    end if;

    if v_share_amount < 0 then
      raise exception 'Los importes del reparto no pueden ser negativos'
        using errcode = '22023';
    end if;

    if v_share_amount <> pg_catalog.round(v_share_amount, 2) then
      raise exception 'Los importes del reparto no pueden tener más de dos decimales'
        using errcode = '22023';
    end if;

    v_seen_user_ids := pg_catalog.array_append(v_seen_user_ids, v_split_user_id);
    v_split_count := v_split_count + 1;
    v_total_percent := v_total_percent + v_share_percent;
    v_total_amount := v_total_amount + v_share_amount;
  end loop;

  if v_split_count = 0 then
    raise exception 'El gasto debe tener al menos un reparto' using errcode = '22023';
  end if;

  if v_total_amount <> p_amount then
    raise exception 'La suma de los importes del reparto debe coincidir con el gasto'
      using errcode = '22023';
  end if;

  -- NUMERIC is exact, so no floating-point tolerance is required here.
  if v_total_percent <> 100 then
    raise exception 'La suma de los porcentajes del reparto debe ser 100'
      using errcode = '22023';
  end if;

  if p_expense_type = 'personal' and (
    v_split_count <> 1
    or v_split_user_id <> p_paid_by_user_id
    or v_share_percent <> 100
    or v_share_amount <> p_amount
  ) then
    raise exception 'Un gasto personal debe asignarse íntegramente al pagador'
      using errcode = '22023';
  end if;

  insert into public.expenses (
    household_id,
    description,
    amount,
    category_id,
    expense_date,
    expense_type,
    note,
    created_by
  )
  values (
    p_household_id,
    pg_catalog.btrim(p_description),
    p_amount,
    p_category_id,
    p_expense_date,
    p_expense_type,
    nullif(pg_catalog.btrim(p_note), ''),
    v_caller_id
  )
  returning id into v_expense_id;

  insert into public.expense_payments (expense_id, user_id, amount)
  values (v_expense_id, p_paid_by_user_id, p_payer_amount);

  for v_split in
    select split_item.value
    from pg_catalog.jsonb_array_elements(p_splits) as split_item(value)
  loop
    insert into public.expense_splits (
      expense_id,
      user_id,
      share_percent,
      share_amount
    )
    values (
      v_expense_id,
      (v_split ->> 'user_id')::uuid,
      (v_split ->> 'share_percent')::numeric,
      (v_split ->> 'share_amount')::numeric
    );
  end loop;

  return v_expense_id;
end;
$$;

comment on function public.create_expense(
  uuid,
  text,
  numeric,
  uuid,
  date,
  text,
  text,
  uuid,
  numeric,
  jsonb
) is 'Atomically creates an expense, its single V1 payment, and validated splits.';

revoke execute on function public.create_expense(
  uuid,
  text,
  numeric,
  uuid,
  date,
  text,
  text,
  uuid,
  numeric,
  jsonb
) from public, anon, authenticated;

grant execute on function public.create_expense(
  uuid,
  text,
  numeric,
  uuid,
  date,
  text,
  text,
  uuid,
  numeric,
  jsonb
) to authenticated;

commit;
