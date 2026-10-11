-- Knowledge base of the coach agent (supabase/functions/agent): a few dozen short, cited chunks
-- from research on habits. Reference data, read by every signed-in user, written only by the
-- service role (seed: supabase/seed/knowledge.sql, built from knowledge/*.md).
--
-- Embeddings are 384-dimensional (the `gte-small` model of the Edge Function runtime). The seed leaves
-- `embedding` empty and the function fills it on first use.

create extension if not exists vector with schema extensions;

create table public.knowledge_chunks (
  id text primary key,
  source text not null,
  kind text not null check (kind in ('shows', 'limits')),
  cite text not null,
  doi text not null,
  strength text not null check (strength in ('strong', 'moderate', 'theory')),
  body text not null,
  embedding extensions.vector(384)
);
create index knowledge_chunks_source on public.knowledge_chunks (source);

alter table public.knowledge_chunks enable row level security;
create policy knowledge_read on public.knowledge_chunks for select to authenticated using (true);
-- no insert/update/delete policy: only the service role (which bypasses RLS) writes

create function public.match_knowledge(query_embedding extensions.vector(384), k int default 4)
returns table (id text, source text, similarity double precision)
language sql stable set search_path = '' as $$
  select c.id, c.source, 1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.knowledge_chunks c
  where c.embedding is not null
  order by c.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(k, 1), 8);
$$;
revoke execute on function public.match_knowledge(extensions.vector, int) from public, anon;
grant execute on function public.match_knowledge(extensions.vector, int) to authenticated;
