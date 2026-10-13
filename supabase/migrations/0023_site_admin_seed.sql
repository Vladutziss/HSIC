-- First site admin (was appended to a duplicated copy of 0012_team.sql). Safe to rerun.
insert into public.site_admins (email) values ('admin@example.com') on conflict do nothing;
