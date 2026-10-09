-- Row level security checks. Plain SQL, runs in one transaction that is rolled back:
--   * Supabase dashboard -> SQL editor: paste and run
--   * local:  psql "$DATABASE_URL" -f supabase/tests/rls.sql
-- (ids are Clerk-style text; the JWT `sub` claim is what requesting_user_id() reads)
-- It raises an exception naming the first leak it finds; success ends with NOTICE 'RLS checks passed'.

begin;

-- Clerk ids are text; profiles are created by ensure_profile() on first sign-in, here inserted directly
insert into public.profiles (id, name) values ('user_aaa', 'Ana'), ('user_bbb', 'Bob'), ('user_ccc', 'Cris');

do $$
declare
  a constant text := '{"sub":"user_aaa","role":"authenticated"}';
  b constant text := '{"sub":"user_bbb","role":"authenticated"}';
  c constant text := '{"sub":"user_ccc","role":"authenticated"}';
  ida constant text := 'user_aaa';
  idb constant text := 'user_bbb';
  idc constant text := 'user_ccc';
  n int;
  gid text;
  gcode text;
  blocked boolean;
  ok boolean;
begin
  -- ---- A writes her own data
  perform set_config('request.jwt.claims', a, true);
  set local role authenticated;
  insert into public.habits (id, user_id, name) values ('h-a', ida, 'Alergare');
  insert into public.completions (user_id, habit_id, day, code) values (ida, 'h-a', '2026-10-05', 1);
  insert into public.todos (id, user_id, title) values ('t-a', ida, 'Cumpărături');
  insert into public.chapters (id, user_id, day, title, story) values ('c-a', ida, '2026-10-05', 'Capitol', 'Poveste');
  update public.profiles set onboarded = true, name = 'Ana' where id = ida;
  select count(*) into n from public.habits;
  if n <> 1 then raise exception 'A should see her own habit, saw %', n; end if;
  reset role;

  -- ---- B sees nothing of A's, and cannot write into A's data
  perform set_config('request.jwt.claims', b, true);
  set local role authenticated;
  foreach gid in array array['habits', 'completions', 'todos', 'day_reviews', 'chapters', 'streak_revives'] loop
    execute format('select count(*) from public.%I', gid) into n;
    if n <> 0 then raise exception 'LEAK: B reads % rows of A in %', n, gid; end if;
  end loop;
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'LEAK: B sees % profiles (expected only their own)', n; end if;

  blocked := false;
  begin
    insert into public.habits (id, user_id, name) values ('h-evil', ida, 'x');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'LEAK: B inserted a habit as A'; end if;

  blocked := false;
  begin
    insert into public.completions (user_id, habit_id, day, code) values (idb, 'h-a', '2026-10-06', 1);
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'LEAK: B attached a completion to A''s habit'; end if;

  update public.habits set name = 'hacked' where id = 'h-a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'LEAK: B updated A''s habit'; end if;
  delete from public.todos where id = 't-a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'LEAK: B deleted A''s todo'; end if;
  update public.profiles set name = 'hacked' where id = ida;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'LEAK: B updated A''s profile'; end if;
  reset role;

  -- ---- anon gets nothing
  set local role anon;
  blocked := false;
  begin
    perform 1 from public.habits;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'LEAK: anon can read habits'; end if;
  reset role;

  -- ---- groups: B creates one; A cannot see it until she joins with the code
  perform set_config('request.jwt.claims', b, true);
  set local role authenticated;
  select g.id, g.code into gid, gcode from public.create_group('Clubul', 'group', '{"level":3}') g;
  if gid is null or length(gcode) <> 6 then raise exception 'create_group returned % / %', gid, gcode; end if;
  reset role;

  perform set_config('request.jwt.claims', a, true);
  set local role authenticated;
  select count(*) into n from public.groups;
  if n <> 0 then raise exception 'LEAK: A sees a group she is not in'; end if;
  select count(*) into n from public.group_members;
  if n <> 0 then raise exception 'LEAK: A sees members of a group she is not in'; end if;
  if public.join_group('ZZZZZZ') is not null then raise exception 'join_group accepted an unknown code'; end if;
  if public.join_group(lower(gcode)) is distinct from gid then raise exception 'join_group did not find the group by code'; end if;
  select count(*) into n from public.groups;
  if n <> 1 then raise exception 'A should see the group after joining'; end if;
  select count(*) into n from public.group_members;
  if n <> 2 then raise exception 'A should see both members, saw %', n; end if;
  select count(*) into n from public.group_profiles where id = idb;
  if n <> 1 then raise exception 'A should see B''s name through group_profiles'; end if;
  reset role;

  -- ---- C (outsider) sees nothing about the group or its people
  perform set_config('request.jwt.claims', c, true);
  set local role authenticated;
  select count(*) into n from public.groups;
  if n <> 0 then raise exception 'LEAK: outsider sees a group'; end if;
  select count(*) into n from public.group_profiles where id in (ida, idb);
  if n <> 0 then raise exception 'LEAK: outsider sees names through group_profiles'; end if;
  blocked := false;
  begin
    insert into public.group_members (group_id, user_id) values (gid, idc);
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'LEAK: outsider joined a group without the code'; end if;
  reset role;

  -- ---- nudges: only to members; read by the recipient only
  perform set_config('request.jwt.claims', b, true);
  set local role authenticated;
  insert into public.nudges (id, group_id, from_user, to_users, text) values ('n1', gid, idb, array[ida], 'Hai!');
  blocked := false;
  begin
    insert into public.nudges (id, group_id, from_user, to_users, text) values ('n2', gid, idb, array[idc], 'x');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'LEAK: nudge to a non-member was accepted'; end if;
  blocked := false;
  begin
    insert into public.nudges (id, group_id, from_user, to_users, text) values ('n3', gid, ida, array[idb], 'spoofed');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'LEAK: nudge sent in someone else''s name'; end if;
  reset role;

  perform set_config('request.jwt.claims', a, true);
  set local role authenticated;
  select count(*) into n from public.nudges;
  if n <> 1 then raise exception 'A should receive the nudge, saw %', n; end if;
  insert into public.nudge_reads (nudge_id, user_id) values ('n1', ida);
  reset role;

  perform set_config('request.jwt.claims', c, true);
  set local role authenticated;
  select count(*) into n from public.nudges;
  if n <> 0 then raise exception 'LEAK: outsider reads nudges'; end if;
  blocked := false;
  begin
    insert into public.nudge_reads (nudge_id, user_id) values ('n1', idc);
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'LEAK: outsider marked a nudge as read'; end if;
  reset role;

  -- ---- the AI rate limit counts per user and stops at the maximum
  perform set_config('request.jwt.claims', a, true);
  set local role authenticated;
  ok := public.bump_ai_usage(2);
  ok := ok and public.bump_ai_usage(2);
  if not ok then raise exception 'bump_ai_usage refused calls under the limit'; end if;
  if public.bump_ai_usage(2) then raise exception 'bump_ai_usage allowed a call over the limit'; end if;
  blocked := false;
  begin
    update public.ai_usage set count = 0;
  exception when insufficient_privilege then blocked := true;
  end;
  get diagnostics n = row_count;
  if not blocked and n <> 0 then raise exception 'LEAK: user reset their own AI counter'; end if;
  reset role;

  -- ---- storage: the proofs bucket is closed to signed-in users (0007 dropped its policies)
  perform set_config('request.jwt.claims', a, true);
  set local role authenticated;
  blocked := false;
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('proofs', ida || '/p1.jpg', ida);
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'LEAK: A can still store files in the proofs bucket'; end if;
  reset role;

  raise notice 'RLS checks passed';
end $$;

rollback;
