-- RLS checks for 0014_agent_memory.sql (user_context, proposal_feedback). Same style as rls.sql:
-- one transaction, rolled back. Dashboard SQL editor, or: psql "$DATABASE_URL" -f supabase/tests/rls_memory.sql
-- Raises an exception naming the first leak; success ends with NOTICE 'memory RLS checks passed'.

begin;

insert into public.profiles (id, name) values ('user_aaa', 'Ana'), ('user_bbb', 'Bob');

do $$
declare
  a constant text := '{"sub":"user_aaa","role":"authenticated"}';
  b constant text := '{"sub":"user_bbb","role":"authenticated"}';
  ida constant text := 'user_aaa';
  idb constant text := 'user_bbb';
  n int;
  blocked boolean;
  msg text;
  t text;
begin
  -- ---- A writes her own memory
  perform set_config('request.jwt.claims', a, true);
  set local role authenticated;
  insert into public.user_context (user_id, kind, body, ends_on) values (ida, 'event', 'Examen vineri', '2099-01-01');
  insert into public.proposal_feedback (user_id, proposal, decision, reason)
    values (ida, '{"action":"add","name":"Alergare"}', 'rejected', 'Prea greu');
  select count(*) into n from public.user_context;
  if n <> 1 then raise exception 'A should see her own note, saw %', n; end if;
  select count(*) into n from public.proposal_feedback;
  if n <> 1 then raise exception 'A should see her own feedback, saw %', n; end if;
  reset role;

  -- ---- B sees nothing of A's and cannot write into it
  perform set_config('request.jwt.claims', b, true);
  set local role authenticated;
  foreach t in array array['user_context', 'proposal_feedback'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception 'LEAK: B reads % rows of A in %', n, t; end if;
  end loop;

  blocked := false;
  begin
    insert into public.user_context (user_id, kind, body) values (ida, 'note', 'x');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'LEAK: B inserted a note as A'; end if;

  blocked := false;
  begin
    insert into public.proposal_feedback (user_id, proposal, decision) values (ida, '{}', 'accepted');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'LEAK: B inserted feedback as A'; end if;

  update public.user_context set body = 'hacked';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'LEAK: B updated % notes of A', n; end if;
  update public.proposal_feedback set decision = 'accepted';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'LEAK: B updated feedback of A'; end if;
  delete from public.user_context;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'LEAK: B deleted % notes of A', n; end if;
  delete from public.proposal_feedback;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'LEAK: B deleted feedback of A'; end if;

  -- B cannot move his own row to A (with check)
  insert into public.user_context (user_id, kind, body) values (idb, 'note', 'a lui B');
  blocked := false;
  begin
    update public.user_context set user_id = ida where user_id = idb;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'LEAK: B handed a note to A'; end if;
  reset role;

  -- ---- A's rows are intact
  perform set_config('request.jwt.claims', a, true);
  set local role authenticated;
  select count(*) into n from public.user_context where body = 'Examen vineri';
  if n <> 1 then raise exception 'A''s note was changed or lost'; end if;
  -- feedback is append-only for the owner
  update public.proposal_feedback set decision = 'accepted';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'feedback should not be editable, % rows changed', n; end if;

  -- ---- constraints and the 50-note cap
  blocked := false;
  begin
    insert into public.user_context (user_id, kind, body, starts_on, ends_on) values (ida, 'note', 'x', '2026-10-05', '2026-10-04');
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'ends_on before starts_on was accepted'; end if;
  blocked := false;
  begin
    insert into public.user_context (user_id, kind, body) values (ida, 'note', repeat('x', 301));
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'a 301-character note was accepted'; end if;
  for i in 1..49 loop
    insert into public.user_context (user_id, kind, body) values (ida, 'note', 'n' || i);
  end loop;
  msg := null;
  begin
    insert into public.user_context (user_id, kind, body) values (ida, 'note', 'a 51-a');
  exception when others then msg := sqlerrm;
  end;
  if msg is distinct from 'context_limit' then raise exception 'the 51st active note should hit context_limit, got %', msg; end if;
  reset role;

  -- ---- anon gets nothing
  set local role anon;
  foreach t in array array['user_context', 'proposal_feedback'] loop
    blocked := false;
    n := 0;
    begin
      execute format('select count(*) from public.%I', t) into n;
    exception when insufficient_privilege then blocked := true;
    end;
    if not blocked and n <> 0 then raise exception 'LEAK: anon reads % rows of %', n, t; end if;
  end loop;
  blocked := false;
  begin
    insert into public.user_context (user_id, kind, body) values (ida, 'note', 'anon');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'LEAK: anon inserted a note'; end if;
  reset role;

  raise notice 'memory RLS checks passed';
end $$;

rollback;
