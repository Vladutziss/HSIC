-- Demo data (seedDemo) is flagged so "remove demo data" can strip it again.
alter table public.todos add column demo boolean not null default false;
alter table public.proofs add column demo boolean not null default false;
alter table public.day_reviews add column demo boolean not null default false;
