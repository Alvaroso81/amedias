begin;

-- Expense and settlement writes are only exposed through the validated RPCs below.
-- Revoke both table-level DML and the column-level grants created in 001.
revoke insert, update, delete
  on table public.expenses,
    public.expense_payments,
    public.expense_splits,
    public.settlements
  from public, anon, authenticated;

revoke insert (
  household_id,
  description,
  amount,
  category_id,
  expense_date,
  expense_type,
  note,
  created_by
) on table public.expenses from authenticated;

revoke update (
  description,
  amount,
  category_id,
  expense_date,
  expense_type,
  note,
  deleted_at
) on table public.expenses from authenticated;

revoke insert (expense_id, user_id, amount)
  on table public.expense_payments from authenticated;
revoke update (amount)
  on table public.expense_payments from authenticated;

revoke insert (expense_id, user_id, share_percent, share_amount)
  on table public.expense_splits from authenticated;
revoke update (share_percent, share_amount)
  on table public.expense_splits from authenticated;

revoke insert (
  household_id,
  from_user_id,
  to_user_id,
  amount,
  settlement_date,
  note,
  created_by
) on table public.settlements from authenticated;

revoke update (
  from_user_id,
  to_user_id,
  amount,
  settlement_date,
  note,
  deleted_at
) on table public.settlements from authenticated;

-- Preserve RLS-protected reads for signed-in users and keep family data away from anon.
grant select
  on table public.expenses,
    public.expense_payments,
    public.expense_splits,
    public.settlements
  to authenticated;

revoke select
  on table public.expenses,
    public.expense_payments,
    public.expense_splits,
    public.settlements
  from public, anon;

-- These functions already validate auth.uid(), household membership, active records,
-- categories, participants, amounts and splits internally. SECURITY DEFINER lets only
-- their trusted, validated bodies perform writes after direct DML has been revoked.
alter function public.create_expense(
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
) security definer;
alter function public.create_expense(
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
) set search_path = '';

alter function public.update_expense(
  uuid,
  text,
  numeric,
  uuid,
  date,
  text,
  text,
  jsonb,
  jsonb
) security definer;
alter function public.update_expense(
  uuid,
  text,
  numeric,
  uuid,
  date,
  text,
  text,
  jsonb,
  jsonb
) set search_path = '';

alter function public.delete_expense(uuid) security definer;
alter function public.delete_expense(uuid) set search_path = '';

alter function public.create_settlement(
  uuid,
  uuid,
  uuid,
  numeric,
  date,
  text
) security definer;
alter function public.create_settlement(
  uuid,
  uuid,
  uuid,
  numeric,
  date,
  text
) set search_path = '';

alter function public.update_settlement(
  uuid,
  uuid,
  uuid,
  numeric,
  date,
  text
) security definer;
alter function public.update_settlement(
  uuid,
  uuid,
  uuid,
  numeric,
  date,
  text
) set search_path = '';

alter function public.delete_settlement(uuid) security definer;
alter function public.delete_settlement(uuid) set search_path = '';

-- Function execution is deliberately narrower than table read access.
revoke all privileges on function public.create_expense(
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

revoke all privileges on function public.update_expense(
  uuid,
  text,
  numeric,
  uuid,
  date,
  text,
  text,
  jsonb,
  jsonb
) from public, anon, authenticated;
grant execute on function public.update_expense(
  uuid,
  text,
  numeric,
  uuid,
  date,
  text,
  text,
  jsonb,
  jsonb
) to authenticated;

revoke all privileges on function public.delete_expense(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_expense(uuid) to authenticated;

revoke all privileges on function public.create_settlement(
  uuid,
  uuid,
  uuid,
  numeric,
  date,
  text
) from public, anon, authenticated;
grant execute on function public.create_settlement(
  uuid,
  uuid,
  uuid,
  numeric,
  date,
  text
) to authenticated;

revoke all privileges on function public.update_settlement(
  uuid,
  uuid,
  uuid,
  numeric,
  date,
  text
) from public, anon, authenticated;
grant execute on function public.update_settlement(
  uuid,
  uuid,
  uuid,
  numeric,
  date,
  text
) to authenticated;

revoke all privileges on function public.delete_settlement(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_settlement(uuid) to authenticated;

commit;
