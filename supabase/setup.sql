-- Halo NFC Social Profiles: database and RLS setup
-- Run this in Supabase Dashboard > SQL Editor for the project shown in your screenshots.
-- The existing public profile-photos bucket is used as-is.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 1 and 70),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 60),
  bio text not null default '' check (length(bio) <= 180),
  photo_path text,
  theme_color text not null default '#c8a8ff' check (theme_color ~ '^#[0-9A-Fa-f]{6}$'),
  social_links jsonb not null default '[]'::jsonb check (jsonb_typeof(social_links) = 'array'),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_public_slug_idx on public.profiles (slug) where is_published;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

create or replace function private.keep_profile_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug <> old.slug then
    raise exception 'A public profile slug cannot be changed after creation.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_slug_immutable on public.profiles;
create trigger profiles_slug_immutable
before update of slug on public.profiles
for each row execute function private.keep_profile_slug();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.profiles enable row level security;

revoke all on public.admin_users from anon, authenticated;
grant select, insert, update, delete on public.admin_users to authenticated;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert, update, delete on public.profiles to authenticated;

drop policy if exists "Admins can read their own membership" on public.admin_users;
create policy "Admins can read their own membership"
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Admins can manage admin membership" on public.admin_users;
create policy "Admins can manage admin membership"
  on public.admin_users for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "Published profiles are public" on public.profiles;
create policy "Published profiles are public"
  on public.profiles for select to anon, authenticated
  using (is_published);

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
  on public.profiles for select to authenticated
  using ((select private.is_admin()));

drop policy if exists "Admins can create profiles" on public.profiles;
create policy "Admins can create profiles"
  on public.profiles for insert to authenticated
  with check ((select private.is_admin()));

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
  on public.profiles for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "Admins can delete profiles" on public.profiles;
create policy "Admins can delete profiles"
  on public.profiles for delete to authenticated
  using ((select private.is_admin()));

-- The existing bucket is public for image display. Public access to image URLs
-- does not grant upload/delete rights. Admins get Storage API write access here.
drop policy if exists "Halo admins manage profile photos" on storage.objects;
create policy "Halo admins manage profile photos"
  on storage.objects for all to authenticated
  using (bucket_id = 'profile-photos' and (select private.is_admin()))
  with check (bucket_id = 'profile-photos' and (select private.is_admin()));

-- Restrictive policy is an extra guard: it ANDs with any existing permissive
-- policies, so a broad older upload policy cannot open this bucket to visitors.
drop policy if exists "Only Halo admins can change profile photos" on storage.objects;
create policy "Only Halo admins can change profile photos"
  on storage.objects as restrictive for all to public
  using (bucket_id <> 'profile-photos' or (select private.is_admin()))
  with check (bucket_id <> 'profile-photos' or (select private.is_admin()));

-- Bootstrap the first administrator after creating their account in
-- Authentication > Users. Replace the UUID with that user's actual ID.
-- insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-000000000000');
