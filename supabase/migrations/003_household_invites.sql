begin;

create extension if not exists pgcrypto with schema extensions;

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email text not null,
  token_hash text not null,
  invited_by uuid not null references auth.users (id) on delete restrict,
  status text not null default 'pending',
  expires_at timestamptz not null,
  accepted_by uuid references auth.users (id) on delete restrict,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint household_invites_email_not_blank check (pg_catalog.btrim(email) <> ''),
  constraint household_invites_email_normalized check (email = pg_catalog.lower(pg_catalog.btrim(email))),
  constraint household_invites_token_hash_valid check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint household_invites_status_valid check (
    status in ('pending', 'accepted', 'revoked', 'expired')
  ),
  constraint household_invites_expiry_valid check (expires_at > created_at),
  constraint household_invites_acceptance_valid check (
    (
      status = 'accepted'
      and accepted_by is not null
      and accepted_at is not null
    )
    or (
      status <> 'accepted'
      and accepted_by is null
      and accepted_at is null
    )
  )
);

comment on table public.household_invites is
  'Single-use household invitations. Only a SHA-256 token hash is persisted.';

create index household_invites_household_id_idx
  on public.household_invites (household_id);
create index household_invites_email_idx
  on public.household_invites (email);
create unique index household_invites_token_hash_unique
  on public.household_invites (token_hash);
create index household_invites_status_idx
  on public.household_invites (status);
create index household_invites_expires_at_idx
  on public.household_invites (expires_at);
create unique index household_invites_pending_household_email_unique
  on public.household_invites (household_id, email)
  where status = 'pending';

alter table public.household_invites enable row level security;

revoke all privileges on table public.household_invites from public, anon, authenticated;

-- Owners can list invitation metadata, but token_hash is never selectable through the API.
grant select (
  id,
  household_id,
  email,
  invited_by,
  status,
  expires_at,
  accepted_by,
  accepted_at,
  created_at
) on table public.household_invites to authenticated;

create policy "household_invites_select_owner"
on public.household_invites
for select
to authenticated
using ((select private.is_household_owner(household_id)));

-- These policies document the row boundary even though writes are exposed only through RPCs.
create policy "household_invites_insert_owner"
on public.household_invites
for insert
to authenticated
with check (
  invited_by = (select auth.uid())
  and (select private.is_household_owner(household_id))
);

create policy "household_invites_update_owner"
on public.household_invites
for update
to authenticated
using ((select private.is_household_owner(household_id)))
with check ((select private.is_household_owner(household_id)));

create function public.create_household_invite(
  p_household_id uuid,
  p_email text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_caller_email text;
  v_normalized_email text;
  v_token text;
  v_token_hash text;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null then
    raise exception 'INVITE_AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_household_id is null or not exists (
    select 1
    from public.household_members as member
    where member.household_id = p_household_id
      and member.user_id = v_caller_id
      and member.role = 'owner'
  ) then
    raise exception 'INVITE_OWNER_REQUIRED' using errcode = '42501';
  end if;

  v_normalized_email := pg_catalog.lower(pg_catalog.btrim(p_email));

  if v_normalized_email is null
    or v_normalized_email = ''
    or pg_catalog.length(v_normalized_email) > 254
    or v_normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVITE_EMAIL_INVALID' using errcode = '22023';
  end if;

  select pg_catalog.lower(pg_catalog.btrim(auth_user.email))
  into v_caller_email
  from auth.users as auth_user
  where auth_user.id = v_caller_id;

  if v_caller_email is null then
    raise exception 'INVITE_CALLER_EMAIL_MISSING' using errcode = '22023';
  end if;

  if v_normalized_email = v_caller_email then
    raise exception 'INVITE_SELF_NOT_ALLOWED' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.household_members as member
    join auth.users as auth_user on auth_user.id = member.user_id
    where member.household_id = p_household_id
      and pg_catalog.lower(pg_catalog.btrim(auth_user.email)) = v_normalized_email
  ) then
    raise exception 'INVITE_ALREADY_MEMBER' using errcode = '22023';
  end if;

  -- Prevent two concurrent requests from leaving duplicate pending invitations.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_household_id::text || ':' || v_normalized_email,
      0
    )
  );

  update public.household_invites as invitation
  set status = 'expired'
  where invitation.household_id = p_household_id
    and invitation.status = 'pending'
    and invitation.expires_at <= pg_catalog.now();

  update public.household_invites as invitation
  set status = 'revoked'
  where invitation.household_id = p_household_id
    and invitation.email = v_normalized_email
    and invitation.status = 'pending';

  v_token := pg_catalog.translate(
    pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'),
    '+/=',
    '-_'
  );
  v_token_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.household_invites (
    household_id,
    email,
    token_hash,
    invited_by,
    status,
    expires_at
  )
  values (
    p_household_id,
    v_normalized_email,
    v_token_hash,
    v_caller_id,
    'pending',
    pg_catalog.now() + interval '7 days'
  );

  return v_token;
end;
$$;

comment on function public.create_household_invite(uuid, text) is
  'Creates a seven-day, single-use household invitation and returns its raw token once.';

create function public.accept_household_invite(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_caller_email text;
  v_token_hash text;
  v_invitation public.household_invites%rowtype;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null then
    raise exception 'INVITE_AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_token is null
    or pg_catalog.btrim(p_token) = ''
    or pg_catalog.length(pg_catalog.btrim(p_token)) > 512 then
    raise exception 'INVITE_INVALID' using errcode = '22023';
  end if;

  select pg_catalog.lower(pg_catalog.btrim(auth_user.email))
  into v_caller_email
  from auth.users as auth_user
  where auth_user.id = v_caller_id
    and auth_user.email_confirmed_at is not null;

  if v_caller_email is null then
    raise exception 'INVITE_CONFIRMED_EMAIL_REQUIRED' using errcode = '28000';
  end if;

  v_token_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.btrim(p_token), 'sha256'),
    'hex'
  );

  select invitation.*
  into v_invitation
  from public.household_invites as invitation
  where invitation.token_hash = v_token_hash
  for update;

  if not found then
    raise exception 'INVITE_INVALID' using errcode = '22023';
  end if;

  if v_invitation.status = 'expired'
    or (
      v_invitation.status = 'pending'
      and v_invitation.expires_at <= pg_catalog.now()
    ) then
    raise exception 'INVITE_EXPIRED' using errcode = '22023';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'INVITE_UNAVAILABLE' using errcode = '22023';
  end if;

  if v_invitation.email <> v_caller_email then
    raise exception 'INVITE_EMAIL_MISMATCH' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.household_members as member
    where member.household_id = v_invitation.household_id
      and member.user_id = v_caller_id
  ) then
    raise exception 'INVITE_ALREADY_MEMBER' using errcode = '22023';
  end if;

  insert into public.household_members (
    household_id,
    user_id,
    role,
    default_share
  )
  values (
    v_invitation.household_id,
    v_caller_id,
    'member',
    50
  );

  update public.household_invites
  set
    status = 'accepted',
    accepted_by = v_caller_id,
    accepted_at = pg_catalog.now()
  where id = v_invitation.id;

  return v_invitation.household_id;
end;
$$;

comment on function public.accept_household_invite(text) is
  'Atomically accepts a valid invitation when its normalized email matches the confirmed user email.';

create function public.revoke_household_invite(p_invite_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_invitation public.household_invites%rowtype;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null then
    raise exception 'INVITE_AUTH_REQUIRED' using errcode = '28000';
  end if;

  select invitation.*
  into v_invitation
  from public.household_invites as invitation
  where invitation.id = p_invite_id
  for update;

  if not found then
    raise exception 'INVITE_UNAVAILABLE' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.household_members as member
    where member.household_id = v_invitation.household_id
      and member.user_id = v_caller_id
      and member.role = 'owner'
  ) then
    raise exception 'INVITE_OWNER_REQUIRED' using errcode = '42501';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'INVITE_UNAVAILABLE' using errcode = '22023';
  end if;

  update public.household_invites
  set status = case
    when expires_at <= pg_catalog.now() then 'expired'
    else 'revoked'
  end
  where id = v_invitation.id;
end;
$$;

comment on function public.revoke_household_invite(uuid) is
  'Soft-revokes a pending invitation when called by an owner of its household.';

revoke execute on function public.create_household_invite(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.accept_household_invite(text)
  from public, anon, authenticated;
revoke execute on function public.revoke_household_invite(uuid)
  from public, anon, authenticated;

grant execute on function public.create_household_invite(uuid, text) to authenticated;
grant execute on function public.accept_household_invite(text) to authenticated;
grant execute on function public.revoke_household_invite(uuid) to authenticated;

commit;
