begin;

alter table public.households
  add column common_expenses_start_date date;

comment on column public.households.common_expenses_start_date is
  'Inclusive start date for the common-expense total shown on the household home page.';

-- Freeze the previous monthly period for existing households when this migration is applied.
update public.households
set common_expenses_start_date = pg_catalog.date_trunc(
  'month',
  pg_catalog.now() at time zone 'Europe/Madrid'
)::date;

alter table public.households
  alter column common_expenses_start_date
    set default (
      pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'Europe/Madrid')::date
    ),
  alter column common_expenses_start_date set not null;

-- Both household members share this setting, so either member may update it through
-- this validated function. Direct updates to the new column are not granted.
create function public.update_common_expenses_start_date(
  p_household_id uuid,
  p_start_date date
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para cambiar la fecha';
  end if;

  if p_household_id is null
    or not (select public.is_household_member(p_household_id)) then
    raise exception 'No perteneces al hogar indicado';
  end if;

  if p_start_date is null then
    raise exception 'La fecha de inicio es obligatoria';
  end if;

  if p_start_date > (pg_catalog.now() at time zone 'Europe/Madrid')::date then
    raise exception 'La fecha de inicio no puede ser futura';
  end if;

  update public.households
  set common_expenses_start_date = p_start_date
  where id = p_household_id;

  return p_start_date;
end;
$$;

comment on function public.update_common_expenses_start_date(uuid, date) is
  'Updates the shared common-expense summary start date for a household member.';

revoke all privileges on function public.update_common_expenses_start_date(uuid, date)
  from public, anon, authenticated;
grant execute on function public.update_common_expenses_start_date(uuid, date)
  to authenticated;

commit;
