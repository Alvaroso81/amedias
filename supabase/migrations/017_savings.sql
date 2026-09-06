begin;

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  type text not null check (type in ('personal', 'shared')),
  owner_user_id uuid references auth.users(id) on delete restrict,
  target_amount_cents bigint check (target_amount_cents between 1 and 999999999999),
  target_date date,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((type = 'personal' and owner_user_id = created_by and owner_user_id is not null)
    or (type = 'shared' and owner_user_id is null))
);

create table public.savings_goal_participants (
  goal_id uuid not null references public.savings_goals(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  percentage integer not null check (percentage between 0 and 100),
  primary key (goal_id, user_id)
);

create table public.savings_movements (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.savings_goals(id) on delete restrict,
  movement_type text not null check (movement_type in ('contribution', 'withdrawal')),
  amount_cents bigint not null check (amount_cents between 1 and 999999999999),
  contributor_user_id uuid references auth.users(id) on delete restrict,
  movement_date date not null,
  note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((movement_type = 'contribution' and contributor_user_id is not null)
    or (movement_type = 'withdrawal' and contributor_user_id is null))
);

create index savings_goals_household_idx on public.savings_goals(household_id);
create index savings_participants_user_idx on public.savings_goal_participants(user_id, goal_id);
create index savings_movements_goal_date_idx on public.savings_movements(goal_id, movement_date desc, created_at desc);
create trigger savings_goals_updated_at before update on public.savings_goals
  for each row execute function public.set_updated_at();

-- SECURITY DEFINER avoids recursive RLS through the participant relation.
-- Membership AND ownership/participation are required, including for archived data.
create function private.can_access_savings_goal(p_goal_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.savings_goals g
    where g.id = p_goal_id
      and exists (select 1 from public.household_members m
        where m.household_id = g.household_id and m.user_id = (select auth.uid()))
      and ((g.type = 'personal' and g.owner_user_id = (select auth.uid()))
        or (g.type = 'shared' and exists (
          select 1 from public.savings_goal_participants p
          where p.goal_id = g.id and p.user_id = (select auth.uid())
        )))
  );
$$;
revoke all on function private.can_access_savings_goal(uuid) from public, anon, authenticated;
grant execute on function private.can_access_savings_goal(uuid) to authenticated;

alter table public.savings_goals enable row level security;
alter table public.savings_goal_participants enable row level security;
alter table public.savings_movements enable row level security;
revoke all on public.savings_goals, public.savings_goal_participants, public.savings_movements from public, anon, authenticated;
grant select on public.savings_goals, public.savings_goal_participants, public.savings_movements to authenticated;

create policy savings_goals_visible on public.savings_goals for select to authenticated
  using (private.can_access_savings_goal(id));
create policy savings_participants_visible on public.savings_goal_participants for select to authenticated
  using (private.can_access_savings_goal(goal_id));
create policy savings_movements_visible on public.savings_movements for select to authenticated
  using (private.can_access_savings_goal(goal_id));

-- Canonical JSON makes participant order irrelevant when comparing edits.
create function private.validate_savings_participants(p_household_id uuid, p_participants jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_entry jsonb;
  v_user uuid;
  v_percentage numeric;
  v_seen uuid[] := '{}';
  v_total integer := 0;
  v_result jsonb := '[]';
begin
  if p_participants is null or jsonb_typeof(p_participants) <> 'array'
    or jsonb_array_length(p_participants) < 1 then
    raise exception using errcode = '22023', message = 'SAVINGS_PARTICIPANTS_INVALID';
  end if;
  for v_entry in select value from jsonb_array_elements(p_participants) loop
    if jsonb_typeof(v_entry) <> 'object' or jsonb_typeof(v_entry->'percentage') is distinct from 'number' then
      raise exception using errcode = '22023', message = 'SAVINGS_PARTICIPANTS_INVALID';
    end if;
    begin
      v_user := (v_entry->>'user_id')::uuid;
      v_percentage := (v_entry->>'percentage')::numeric;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'SAVINGS_PARTICIPANTS_INVALID';
    end;
    if v_user is null or v_user = any(v_seen) or v_percentage is null
      or v_percentage < 0 or v_percentage > 100 or trunc(v_percentage) <> v_percentage
      or not exists (select 1 from public.household_members m where m.household_id = p_household_id and m.user_id = v_user) then
      raise exception using errcode = '22023', message = 'SAVINGS_PARTICIPANTS_INVALID';
    end if;
    v_seen := array_append(v_seen, v_user);
    v_total := v_total + v_percentage::integer;
    v_result := v_result || jsonb_build_array(jsonb_build_object('user_id', v_user, 'percentage', v_percentage::integer));
  end loop;
  -- The creating/editing participant must retain access.
  if v_total <> 100 or not ((select auth.uid()) = any(v_seen)) then
    raise exception using errcode = '22023', message = 'SAVINGS_PERCENTAGES_INVALID';
  end if;
  return (select jsonb_agg(value order by value->>'user_id') from jsonb_array_elements(v_result));
end;
$$;

-- All goal mutations acquire the same lock BEFORE reading movements or replacing
-- participants. READ COMMITTED's next statement sees the preceding writer's commit.
create function private.lock_savings_goal(p_goal_id uuid)
returns public.savings_goals language plpgsql security invoker set search_path = ''
as $$
declare v_goal public.savings_goals%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'SAVINGS_ACCESS_DENIED';
  end if;
  select * into v_goal from public.savings_goals where id = p_goal_id for update;
  if not found or not private.can_access_savings_goal(p_goal_id) then
    raise exception using errcode = '42501', message = 'SAVINGS_ACCESS_DENIED';
  end if;
  return v_goal;
end;
$$;
revoke all on function private.validate_savings_participants(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.lock_savings_goal(uuid) from public, anon, authenticated;

create function public.create_savings_goal(
  p_household_id uuid, p_name text, p_type text,
  p_target_amount_cents bigint, p_target_date date, p_participants jsonb
)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_id uuid;
  v_participants jsonb;
begin
  if v_caller is null or not exists (select 1 from public.household_members m where m.household_id = p_household_id and m.user_id = v_caller) then
    raise exception using errcode = '42501', message = 'SAVINGS_ACCESS_DENIED';
  end if;
  if p_name is null or btrim(p_name) = '' or p_type is null or p_type not in ('personal','shared')
    or (p_target_amount_cents is not null and (p_target_amount_cents < 1 or p_target_amount_cents > 999999999999)) then
    raise exception using errcode = '22023', message = 'SAVINGS_GOAL_INVALID';
  end if;
  if p_type = 'shared' then
    v_participants := private.validate_savings_participants(p_household_id, p_participants);
  else
    -- Ignore caller-supplied ownership/participants; owner always comes from auth.
    v_participants := jsonb_build_array(jsonb_build_object('user_id', v_caller, 'percentage', 100));
  end if;
  insert into public.savings_goals(household_id, name, type, owner_user_id, target_amount_cents, target_date, created_by)
  values (p_household_id, btrim(p_name), p_type, case when p_type = 'personal' then v_caller end, p_target_amount_cents, p_target_date, v_caller)
  returning id into v_id;
  insert into public.savings_goal_participants(goal_id, user_id, percentage)
    select v_id, (value->>'user_id')::uuid, (value->>'percentage')::integer from jsonb_array_elements(v_participants);
  return v_id;
end;
$$;

create function public.update_savings_goal(
  p_goal_id uuid, p_name text, p_target_amount_cents bigint,
  p_target_date date, p_participants jsonb
)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_goal public.savings_goals%rowtype;
  v_participants jsonb;
  v_current jsonb;
begin
  v_goal := private.lock_savings_goal(p_goal_id);
  if v_goal.archived_at is not null then
    raise exception using errcode = '55000', message = 'SAVINGS_ARCHIVED';
  end if;
  if p_name is null or btrim(p_name) = ''
    or (p_target_amount_cents is not null and (p_target_amount_cents < 1 or p_target_amount_cents > 999999999999)) then
    raise exception using errcode = '22023', message = 'SAVINGS_GOAL_INVALID';
  end if;
  -- Null means leave participants alone (also permits editing after a member leaves).
  if v_goal.type = 'shared' and p_participants is not null then
    v_participants := private.validate_savings_participants(v_goal.household_id, p_participants);
    select jsonb_agg(jsonb_build_object('user_id', user_id, 'percentage', percentage) order by user_id)
      into v_current from public.savings_goal_participants where goal_id = p_goal_id;
    if v_participants is distinct from v_current then
      if exists (select 1 from public.savings_movements where goal_id = p_goal_id) then
        raise exception using errcode = '55000', message = 'SAVINGS_PARTICIPANTS_LOCKED';
      end if;
      delete from public.savings_goal_participants where goal_id = p_goal_id;
      insert into public.savings_goal_participants(goal_id, user_id, percentage)
        select p_goal_id, (value->>'user_id')::uuid, (value->>'percentage')::integer from jsonb_array_elements(v_participants);
    end if;
  end if;
  update public.savings_goals set name = btrim(p_name), target_amount_cents = p_target_amount_cents, target_date = p_target_date where id = p_goal_id;
  return p_goal_id;
end;
$$;

create function public.set_savings_goal_archived(p_goal_id uuid, p_archived boolean)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform private.lock_savings_goal(p_goal_id);
  if p_archived is null then raise exception using errcode = '22023', message = 'SAVINGS_GOAL_INVALID'; end if;
  update public.savings_goals set archived_at = case when p_archived then coalesce(archived_at, now()) end where id = p_goal_id;
  return p_goal_id;
end;
$$;

create function public.add_savings_contribution(
  p_goal_id uuid, p_amount_cents bigint, p_contributor_user_id uuid, p_movement_date date, p_note text
)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare v_goal public.savings_goals%rowtype; v_id uuid; v_contributor uuid;
begin
  v_goal := private.lock_savings_goal(p_goal_id);
  if v_goal.archived_at is not null then raise exception using errcode = '55000', message = 'SAVINGS_ARCHIVED'; end if;
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 999999999999 or p_movement_date is null then
    raise exception using errcode = '22023', message = 'SAVINGS_MOVEMENT_INVALID';
  end if;
  v_contributor := case when v_goal.type = 'personal' then v_goal.owner_user_id else p_contributor_user_id end;
  if v_contributor is null or not exists (
    select 1 from public.savings_goal_participants p join public.household_members m
      on m.user_id = p.user_id and m.household_id = v_goal.household_id
    where p.goal_id = p_goal_id and p.user_id = v_contributor
  ) then raise exception using errcode = '22023', message = 'SAVINGS_PARTICIPANTS_INVALID'; end if;
  insert into public.savings_movements(goal_id, movement_type, amount_cents, contributor_user_id, movement_date, note, created_by)
  values (p_goal_id, 'contribution', p_amount_cents, v_contributor, p_movement_date, nullif(btrim(p_note), ''), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.withdraw_from_savings_goal(
  p_goal_id uuid, p_amount_cents bigint, p_movement_date date, p_note text
)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare v_goal public.savings_goals%rowtype; v_balance numeric; v_id uuid;
begin
  v_goal := private.lock_savings_goal(p_goal_id);
  if v_goal.archived_at is not null then raise exception using errcode = '55000', message = 'SAVINGS_ARCHIVED'; end if;
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 999999999999 or p_movement_date is null then
    raise exception using errcode = '22023', message = 'SAVINGS_MOVEMENT_INVALID';
  end if;
  select coalesce(sum(case when movement_type = 'contribution' then amount_cents else -amount_cents end), 0)
    into v_balance from public.savings_movements where goal_id = p_goal_id;
  if p_amount_cents > v_balance then raise exception using errcode = '22023', message = 'SAVINGS_INSUFFICIENT_BALANCE'; end if;
  insert into public.savings_movements(goal_id, movement_type, amount_cents, movement_date, note, created_by)
  values (p_goal_id, 'withdrawal', p_amount_cents, p_movement_date, nullif(btrim(p_note), ''), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_savings_goal(uuid,text,text,bigint,date,jsonb) from public, anon, authenticated;
revoke all on function public.update_savings_goal(uuid,text,bigint,date,jsonb) from public, anon, authenticated;
revoke all on function public.set_savings_goal_archived(uuid,boolean) from public, anon, authenticated;
revoke all on function public.add_savings_contribution(uuid,bigint,uuid,date,text) from public, anon, authenticated;
revoke all on function public.withdraw_from_savings_goal(uuid,bigint,date,text) from public, anon, authenticated;
grant execute on function public.create_savings_goal(uuid,text,text,bigint,date,jsonb) to authenticated;
grant execute on function public.update_savings_goal(uuid,text,bigint,date,jsonb) to authenticated;
grant execute on function public.set_savings_goal_archived(uuid,boolean) to authenticated;
grant execute on function public.add_savings_contribution(uuid,bigint,uuid,date,text) to authenticated;
grant execute on function public.withdraw_from_savings_goal(uuid,bigint,date,text) to authenticated;

comment on table public.savings_movements is
  'Independent savings ledger: withdrawals reduce balance but never historical contributions or expense balances.';
comment on table public.savings_goal_participants is
  'Integer target percentages. RPCs require exactly 100 and freeze allocation once any movement exists.';
commit;
