-- Memory of the coach agent: what the player tells it (user_context) and what they did with its
-- proposals (proposal_feedback). Private to the owner: the Edge Functions read these rows with the
-- caller's own JWT, so RLS is the only gate. Both tables cascade away with the profile
-- (delete_my_account deletes the profile row), so no change to that function is needed.
-- user_id defaults to the caller, so the client never has to send it (and cannot pick another: RLS).

create table public.user_context (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default public.requesting_user_id() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('event', 'constraint', 'preference', 'note')),
  body text not null check (length(body) between 1 and 300),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index user_context_user_ends on public.user_context (user_id, ends_on);

create table public.proposal_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default public.requesting_user_id() references public.profiles(id) on delete cascade,
  -- the proposal as shown: action, habitId, name, diff, days, reason, sources
  proposal jsonb not null check (jsonb_typeof(proposal) = 'object' and pg_column_size(proposal) <= 8000),
  decision text not null check (decision in ('accepted', 'rejected')),
  reason text check (reason is null or length(reason) <= 200),
  created_at timestamptz not null default now()
);
create index proposal_feedback_user_created on public.proposal_feedback (user_id, created_at desc);

alter table public.user_context enable row level security;
alter table public.proposal_feedback enable row level security;

create policy user_context_all on public.user_context for all to authenticated
  using (user_id = (select public.requesting_user_id())) with check (user_id = (select public.requesting_user_id()));

-- feedback is an append-only log: read, add, delete (clearing the memory), never edit
create policy proposal_feedback_select on public.proposal_feedback for select to authenticated
  using (user_id = (select public.requesting_user_id()));
create policy proposal_feedback_insert on public.proposal_feedback for insert to authenticated
  with check (user_id = (select public.requesting_user_id()));
create policy proposal_feedback_delete on public.proposal_feedback for delete to authenticated
  using (user_id = (select public.requesting_user_id()));

-- At most 50 active notes (no end date, or ending today or later) per person. The app checks too
-- (memory.js addNote); this is the backstop. Not safe against two inserts racing, which only the
-- same signed-in person can cause and which costs them at most a few extra notes.
create function public.user_context_cap() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.user_context c
      where c.user_id = new.user_id and (c.ends_on is null or c.ends_on >= current_date)) >= 50 then
    raise exception 'context_limit';
  end if;
  return new;
end $$;
create trigger user_context_cap before insert on public.user_context
  for each row execute function public.user_context_cap();
