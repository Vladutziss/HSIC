-- History of what Molt's single-shot abilities answered (Molt -> Planul zilei, Teme și examene, Planul săptămânii,
-- Scop în pași, Tipare), one row per answer, so a result survives a refresh or a change of page.
--
-- `kind` is the ability, `label` the short line the history list shows (what was asked), `data` the answer exactly as
-- the screen rendered it. The player reads, adds and removes their own rows; the newest 20 per ability are kept.

create table public.ai_results (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default public.requesting_user_id() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('day', 'school', 'week', 'goal', 'patterns')),
  label text not null default '' check (length(label) <= 200),
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index ai_results_user_kind on public.ai_results (user_id, kind, created_at desc);

alter table public.ai_results enable row level security;
create policy ai_results_select on public.ai_results for select to authenticated
  using (user_id = (select public.requesting_user_id()));
create policy ai_results_insert on public.ai_results for insert to authenticated
  with check (user_id = (select public.requesting_user_id()) and pg_column_size(data) < 60000);
create policy ai_results_delete on public.ai_results for delete to authenticated
  using (user_id = (select public.requesting_user_id()));
revoke all on public.ai_results from anon;
grant select, insert, delete on public.ai_results to authenticated;

-- keep the newest 20 per ability
create function public.ai_results_prune() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.ai_results
  where user_id = new.user_id and kind = new.kind
    and id in (
      select id from public.ai_results where user_id = new.user_id and kind = new.kind
      order by created_at desc offset 20
    );
  return null;
end $$;
revoke execute on function public.ai_results_prune() from public, anon, authenticated;
create trigger ai_results_prune after insert on public.ai_results
  for each row execute function public.ai_results_prune();
