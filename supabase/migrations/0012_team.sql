-- The admin dashboard on molted.eu (admin.html): the team's members and photos.
-- * team_members and team_photos are readable by anyone (the anon key), so the site can show them.
-- * Only site admins write them. An admin is a Clerk account whose verified email is in site_admins; the email
--   comes from the session token's `email` claim (set up for 0010), so a client cannot pretend to be someone else.
-- * Photos live in the public `team` bucket; only admins can upload, replace or delete files there.
-- * Add or remove admins from the SQL editor:
--     insert into public.site_admins (email) values ('nume@exemplu.com');
--     delete from public.site_admins where email = 'nume@exemplu.com';

-- ------------------------------------------------------------ admins
create table public.site_admins (
  email text primary key check (email = lower(email))
);
alter table public.site_admins enable row level security;
revoke all on public.site_admins from anon, authenticated;

create function public.is_site_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.site_admins a where a.email = lower(nullif(auth.jwt() ->> 'email', '')));
$$;
revoke execute on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

-- ------------------------------------------------------------ content
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  role text not null default '' check (char_length(role) <= 60),
  bio text not null default '' check (char_length(bio) <= 400),
  instagram text not null default '' check (instagram ~ '^[A-Za-z0-9._]{0,30}$'), -- the handle, without @
  photo_path text check (photo_path is null or photo_path ~ '^members/[A-Za-z0-9._-]+$'),
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.team_photos (
  id uuid primary key default gen_random_uuid(),
  path text not null check (path ~ '^gallery/[A-Za-z0-9._-]+$'),
  caption text not null default '' check (char_length(caption) <= 140),
  sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.team_members enable row level security;
alter table public.team_photos enable row level security;

create policy team_members_read on public.team_members for select to anon, authenticated using (true);
create policy team_members_write on public.team_members for all to authenticated
  using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy team_photos_read on public.team_photos for select to anon, authenticated using (true);
create policy team_photos_write on public.team_photos for all to authenticated
  using ((select public.is_site_admin())) with check ((select public.is_site_admin()));

revoke all on public.team_members, public.team_photos from anon, authenticated;
grant select on public.team_members, public.team_photos to anon, authenticated;
grant insert, update, delete on public.team_members, public.team_photos to authenticated;

-- ------------------------------------------------------------ photos bucket
-- Paths: members/<file> (portraits) and gallery/<file>. Public, so the site can link them directly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team', 'team', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- storage needs a select policy for update and delete; public URLs work without it
create policy team_files_select on storage.objects for select to authenticated
  using (bucket_id = 'team' and (select public.is_site_admin()));
create policy team_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'team' and (select public.is_site_admin()));
create policy team_files_update on storage.objects for update to authenticated
  using (bucket_id = 'team' and (select public.is_site_admin()));
create policy team_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'team' and (select public.is_site_admin()));

-- ------------------------------------------------------------ starting content (edited from the admin page)
insert into public.team_members (name, sort) values ('Mihail', 1), ('Tudor', 2), ('Vlad', 3), ('Duku', 4);
