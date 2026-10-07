-- Removes the demo seed: the generated history of accounts that started with it, the demo flags and the
-- demo marker in profiles.extra. Only days inside each account's own demo range (extra.meta.demo) are
-- touched, so anything the player did after the demo ends is kept.

do $$
declare
  p record;
  d_to date;
begin
  for p in select id, (extra #>> '{meta,demo,to}') as demo_to from public.profiles where extra #> '{meta,demo}' is not null loop
    d_to := p.demo_to::date;
    delete from public.completions where user_id = p.id and day <= d_to;
    delete from public.day_reviews where user_id = p.id and day <= d_to;
    delete from public.streak_revives where user_id = p.id and missed_day <= d_to;
    delete from public.todos where user_id = p.id and demo;
    delete from public.proofs where user_id = p.id and demo;
    update public.habits set created_at = d_to + 1 where user_id = p.id and created_at <= d_to;
    update public.profiles
      set start_date = d_to + 1,
          extra = (extra #- '{meta,demo}') #- '{seen}',
          companion = case when companion ? 'name' then companion || '{"name": ""}' else companion end
      where id = p.id;
  end loop;
end $$;

alter table public.todos drop column demo;
alter table public.proofs drop column demo;
alter table public.day_reviews drop column demo;
