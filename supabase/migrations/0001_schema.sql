-- Momentum: schema. Ids are text because the app generates them client-side
-- (uid("h"), uid("t"), ...). Scores, levels and streaks are NOT stored: the
-- client derives them from these raw rows with src/lib/engine.js.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  avatar_url text,
  path text,
  goal text,
  companion jsonb not null default '{}',
  settings jsonb not null default '{}',
  start_date date,
  -- everything else the app keeps in `state` that is not worth a column
  -- (v, meta.created/months/demo, seen, moments)
  extra jsonb not null default '{}',
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.habits (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  target text,
  diff smallint not null default 2 check (diff between 1 and 3),
  days smallint[] not null default '{}',
  time text,
  icon text,
  cat text,
  color text,
  catalog_id text,
  proof_hint text,
  created_at date,
  archived_at date,
  sort int not null default 0
);

create table public.completions (
  user_id uuid not null references auth.users on delete cascade,
  habit_id text not null references public.habits on delete cascade,
  day date not null,
  code smallint not null check (code between 1 and 5),
  primary key (habit_id, day)
);

-- one row per day: the numeric part lives in state.reviews, the text in the month document
create table public.day_reviews (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  ai_score smallint check (ai_score between 0 and 100),
  at timestamptz,
  summary text,
  highlight text,
  tip text,
  ai boolean not null default false,
  primary key (user_id, day)
);

create table public.todos (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  title text not null default '',
  date date,
  time text,
  dur smallint not null default 30,
  done boolean not null default false,
  done_on date,
  created_at date
);

create table public.proofs (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  habit_id text references public.habits on delete set null,
  day date not null,
  type text not null check (type in ('photo', 'voice', 'note')),
  note text,
  verdict text,
  reason text,
  title text,
  story text,
  ai boolean not null default false,
  at timestamptz not null default now(),
  asset_path text, -- path in the `proofs` storage bucket: <user_id>/<proof id>.<ext>
  thumb text, -- small data URL, so lists need no signed URL
  seconds int
);

create table public.chapters (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  title text,
  story text,
  stage text,
  ai boolean not null default false,
  at timestamptz not null default now()
);

create table public.streak_revives (
  user_id uuid not null references auth.users on delete cascade,
  missed_day date not null,
  revived_on date not null,
  primary key (user_id, missed_day)
);

-- ------------------------------------------------------------ groups

create table public.groups (
  id text primary key,
  name text not null check (char_length(name) between 1 and 40),
  code text not null unique,
  kind text not null default 'group',
  owner uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id text not null references public.groups on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  stats jsonb not null default '{}', -- public numbers each member publishes for themselves
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.nudges (
  id text primary key,
  group_id text not null references public.groups on delete cascade,
  from_user uuid not null references auth.users on delete cascade,
  to_users uuid[] not null,
  text text not null check (char_length(text) between 1 and 200),
  at timestamptz not null default now()
);

create table public.nudge_reads (
  nudge_id text not null references public.nudges on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  at timestamptz not null default now(),
  primary key (nudge_id, user_id)
);

-- per-user daily counter for the AI function (rate limit)
create table public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);

-- ------------------------------------------------------------ indexes
create index habits_user_idx on public.habits (user_id);
create index completions_user_day_idx on public.completions (user_id, day);
create index todos_user_date_idx on public.todos (user_id, date);
create index proofs_user_day_idx on public.proofs (user_id, day);
create index chapters_user_day_idx on public.chapters (user_id, day);
create index nudges_group_idx on public.nudges (group_id, at desc);
create index group_members_user_idx on public.group_members (user_id);

-- ------------------------------------------------------------ new user -> profile row
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
