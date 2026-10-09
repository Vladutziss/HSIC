-- First Clerk sign-in: if an account from the Supabase Auth days has the same verified email, its data moves to
-- the Clerk user. The email comes from the Clerk session token (claim `email`, Dashboard -> Sessions -> Customize
-- session token: { "email": "{{user.primary_email_address}}" }), so the client cannot claim someone else's data.
-- It runs once per account: the old profile is deleted afterwards. Skipped when the new user already has habits.

create or replace function public.ensure_profile(pname text default '', pavatar text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  mail constant text := lower(auth.jwt() ->> 'email');
  old_id text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into public.profiles (id, name, avatar_url) values (me, left(coalesce(pname, ''), 80), pavatar)
  on conflict (id) do nothing;

  if mail is null or exists (select 1 from public.habits where user_id = me) then return; end if;
  select p.id into old_id
  from public.profiles p join auth.users u on u.id::text = p.id
  where lower(u.email) = mail and u.email_confirmed_at is not null and p.id <> me
  limit 1;
  if old_id is null then return; end if;

  update public.profiles n
  set name = o.name, avatar_url = coalesce(o.avatar_url, n.avatar_url), path = o.path, goal = o.goal,
      companion = o.companion, settings = o.settings, start_date = o.start_date, extra = o.extra,
      onboarded = o.onboarded, created_at = o.created_at
  from public.profiles o
  where o.id = old_id and n.id = me;

  update public.habits set user_id = me where user_id = old_id;
  update public.completions set user_id = me where user_id = old_id;
  update public.day_reviews set user_id = me where user_id = old_id;
  update public.todos set user_id = me where user_id = old_id;
  update public.chapters set user_id = me where user_id = old_id;
  update public.streak_revives set user_id = me where user_id = old_id;
  update public.ai_usage set user_id = me where user_id = old_id;
  update public.groups set owner = me where owner = old_id;
  update public.group_members set user_id = me where user_id = old_id;
  update public.nudges set from_user = me where from_user = old_id;
  update public.nudges set to_users = array_replace(to_users, old_id, me) where old_id = any (to_users);
  update public.nudge_reads set user_id = me where user_id = old_id;
  delete from public.profiles where id = old_id;
end $$;
