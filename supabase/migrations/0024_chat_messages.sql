-- Chat with your Molt: the conversation history (Chat screen).
--
-- One row per message. Owner-only select/insert/delete (the player may clear the conversation);
-- no update policy. `plan` holds the plan an assistant message proposed. Account deletion cascades
-- through profiles. Written by the app with the player's own JWT.

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default public.requesting_user_id() references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) between 1 and 2000),
  plan jsonb,
  created_at timestamptz not null default now()
);
create index chat_messages_user on public.chat_messages (user_id, created_at desc);

alter table public.chat_messages enable row level security;
create policy chat_messages_select on public.chat_messages for select to authenticated
  using (user_id = (select public.requesting_user_id()));
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (user_id = (select public.requesting_user_id()));
create policy chat_messages_delete on public.chat_messages for delete to authenticated
  using (user_id = (select public.requesting_user_id()));
-- no update policy
