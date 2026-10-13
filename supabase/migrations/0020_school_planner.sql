  -- Homework planner: subjects, assignments, exams and study sessions as rows, instead of
  -- profiles.extra->'schoolPlanner'. Owner-only RLS (same shape as agent_actions).
  --
  -- `due` / `date` are calendar days (type date, no time zone): the app sends and reads 'YYYY-MM-DD'
  -- strings of the player's own local day and never converts them through UTC.
  -- The app maps today only subjects + assignments; exams and study_sessions are ready for the next slice.
  -- Ids are client-generated text (like habits and todos); subject ids are `<user_id>:<lowercase name>`.

  create table public.subjects (
    id text primary key,
    user_id text not null default public.requesting_user_id() references public.profiles(id) on delete cascade,
    name text not null check (length(name) between 1 and 60),
    created_at timestamptz not null default now()
  );
  create index subjects_user on public.subjects (user_id);

  create table public.assignments (
    id text primary key,
    user_id text not null default public.requesting_user_id() references public.profiles(id) on delete cascade,
    subject_id text references public.subjects(id) on delete set null,
    title text not null check (length(title) between 1 and 120),
    due date,
    estimated_minutes int not null default 30 check (estimated_minutes between 1 and 1440),
    done boolean not null default false,
    created_at timestamptz not null default now()
  );
  create index assignments_user_due on public.assignments (user_id, due);

  create table public.exams (
    id text primary key,
    user_id text not null default public.requesting_user_id() references public.profiles(id) on delete cascade,
    subject_id text references public.subjects(id) on delete set null,
    title text not null check (length(title) between 1 and 120),
    date date not null,
    done boolean not null default false,
    created_at timestamptz not null default now()
  );
  create index exams_user_date on public.exams (user_id, date);

  create table public.study_sessions (
    id text primary key,
    user_id text not null default public.requesting_user_id() references public.profiles(id) on delete cascade,
    subject_id text references public.subjects(id) on delete set null,
    assignment_id text references public.assignments(id) on delete set null,
    day date not null,
    minutes int not null check (minutes between 1 and 1440),
    created_at timestamptz not null default now()
  );
  create index study_sessions_user_day on public.study_sessions (user_id, day);

  do $$
  declare t text;
  begin
    foreach t in array array['subjects', 'assignments', 'exams', 'study_sessions'] loop
      execute format('alter table public.%I enable row level security', t);
      execute format('create policy %I on public.%I for select to authenticated using (user_id = (select public.requesting_user_id()))', t || '_select', t);
      execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select public.requesting_user_id()))', t || '_insert', t);
      execute format('create policy %I on public.%I for update to authenticated using (user_id = (select public.requesting_user_id())) with check (user_id = (select public.requesting_user_id()))', t || '_update', t);
      execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select public.requesting_user_id()))', t || '_delete', t);
    end loop;
  end $$;

  -- Data migration: copy extra.schoolPlanner.assignments. Idempotent: rows already there are left alone.
  insert into public.subjects (id, user_id, name)
  select distinct on (p.id, lower(btrim(a->>'subject')))
    p.id || ':' || lower(btrim(a->>'subject')), p.id, left(btrim(a->>'subject'), 60)
  from public.profiles p, jsonb_array_elements(
    case when jsonb_typeof(p.extra->'schoolPlanner'->'assignments') = 'array' then p.extra->'schoolPlanner'->'assignments' else '[]'::jsonb end
  ) a
  where btrim(coalesce(a->>'subject', '')) <> ''
  on conflict (id) do nothing;

  insert into public.assignments (id, user_id, subject_id, title, due, estimated_minutes, done)
  select
    coalesce(nullif(a->>'id', ''), 'a-' || p.id || '-' || n),
    p.id,
    case when btrim(coalesce(a->>'subject', '')) <> '' then p.id || ':' || lower(btrim(a->>'subject')) end,
    left(btrim(a->>'title'), 120),
    case when a->>'due' ~ '^\d{4}-\d{2}-\d{2}$' then (a->>'due')::date end,
    least(1440, greatest(1, coalesce(case when a->>'estimatedMinutes' ~ '^\d+$' then (a->>'estimatedMinutes')::int end, 30))),
    coalesce((a->>'done')::boolean, false)
  from public.profiles p, jsonb_array_elements(
    case when jsonb_typeof(p.extra->'schoolPlanner'->'assignments') = 'array' then p.extra->'schoolPlanner'->'assignments' else '[]'::jsonb end
  ) with ordinality as t(a, n)
  where btrim(coalesce(a->>'title', '')) <> ''
  on conflict (id) do nothing;
