-- ALLEY Cloud permanent promo code migration.
-- Run this SQL in Supabase SQL Editor. The code itself is kept in the Edge Function secret.
-- Each authenticated Supabase user can redeem once. The same code remains valid for future users.

create table if not exists public.alley_promo_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  all_features boolean not null default true,
  prime_access boolean not null default true,
  admin_access boolean not null default false,
  granted_at timestamptz not null default now(),
  promo_redemption_number bigint
);

alter table public.alley_promo_access
  add column if not exists all_features boolean not null default true,
  add column if not exists prime_access boolean not null default true,
  add column if not exists admin_access boolean not null default false,
  add column if not exists granted_at timestamptz not null default now(),
  add column if not exists promo_redemption_number bigint;

create sequence if not exists public.alley_promo_redemption_seq;

create table if not exists public.alley_promo_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0
);

create table if not exists public.alley_promo_global_attempts (
  id smallint primary key check (id = 1),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0
);

insert into public.alley_promo_global_attempts (id, window_started_at, attempt_count)
values (1, now(), 0)
on conflict (id) do nothing;

alter table public.alley_promo_access enable row level security;
alter table public.alley_promo_attempts enable row level security;
alter table public.alley_promo_global_attempts enable row level security;

revoke all on table public.alley_promo_access from anon, authenticated;
grant select on table public.alley_promo_access to authenticated;
revoke all on table public.alley_promo_attempts from anon, authenticated;
revoke all on table public.alley_promo_global_attempts from anon, authenticated;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'alley_promo_access'
  loop
    execute format('drop policy if exists %I on public.alley_promo_access', p.policyname);
  end loop;
end $$;

create policy "Users can read their own promo access"
on public.alley_promo_access
for select to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.redeem_alley_fixed_promo(
  p_user_id uuid,
  p_code_valid boolean,
  p_admin_access boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.alley_promo_attempts%rowtype;
  v_global public.alley_promo_global_attempts%rowtype;
  v_redemption_number bigint;
begin
  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in first.');
  end if;

  insert into public.alley_promo_attempts (user_id, window_started_at, attempt_count)
  values (p_user_id, now(), 0)
  on conflict (user_id) do nothing;

  select * into v_attempt
    from public.alley_promo_attempts
   where user_id = p_user_id
   for update;

  if exists (select 1 from public.alley_promo_access a where a.user_id = p_user_id) then
    return jsonb_build_object('success', false, 'error', 'This account has already redeemed the ALLEY promo code.');
  end if;

  if v_attempt.window_started_at < now() - interval '15 minutes' then
    update public.alley_promo_attempts
       set window_started_at = now(), attempt_count = 1
     where user_id = p_user_id;
  elsif v_attempt.attempt_count >= 5 then
    return jsonb_build_object('success', false, 'error', 'Too many attempts. Try again in 15 minutes.');
  else
    update public.alley_promo_attempts
       set attempt_count = attempt_count + 1
     where user_id = p_user_id;
  end if;

  select * into v_global
    from public.alley_promo_global_attempts
   where id = 1
   for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Promo service is not initialized.');
  end if;

  if v_global.window_started_at < now() - interval '15 minutes' then
    update public.alley_promo_global_attempts
       set window_started_at = now(), attempt_count = 1
     where id = 1;
  elsif v_global.attempt_count >= 500 then
    return jsonb_build_object('success', false, 'error', 'Promo redemptions are temporarily rate-limited. Try again in 15 minutes.');
  else
    update public.alley_promo_global_attempts
       set attempt_count = attempt_count + 1
     where id = 1;
  end if;

  if coalesce(p_code_valid, false) is not true then
    return jsonb_build_object('success', false, 'error', 'That promo code is not valid.');
  end if;

  v_redemption_number := nextval('public.alley_promo_redemption_seq');

  insert into public.alley_promo_access (
    user_id, all_features, prime_access, admin_access, granted_at, promo_redemption_number
  ) values (
    p_user_id, true, true, coalesce(p_admin_access, false), now(), v_redemption_number
  );

  return jsonb_build_object(
    'success', true,
    'is_owner', coalesce(p_admin_access, false),
    'redemption_number', v_redemption_number,
    'permanent_code', true
  );
exception
  when unique_violation then
    return jsonb_build_object('success', false, 'error', 'This account has already redeemed the ALLEY promo code.');
end;
$$;

revoke all on function public.redeem_alley_fixed_promo(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.redeem_alley_fixed_promo(uuid, boolean, boolean) to service_role;

-- Retire the earlier rotating implementation so stale server code cannot call it.
drop function if exists public.redeem_alley_promo(uuid, text, text, boolean);

comment on table public.alley_promo_access is
  'Per-user permanent ALLEY Prime and all-feature promo entitlement. Admin is owner-only.';
