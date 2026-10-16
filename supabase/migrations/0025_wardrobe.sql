-- Molt's wardrobe: the items a player has unlocked, one row each. What Molt wears lives in profiles.companion (look)
-- and the colour theme in profiles.settings (theme), both already per user; this table is the permanent record of
-- what was earned, so an item never disappears (the rules in lib/cosmetics.js only decide when a new one is earned).
-- Owner-only RLS, same shape as subjects/assignments. `unlocked_on` is a local calendar day, sent as 'YYYY-MM-DD'.

create table public.wardrobe_items (
  user_id text not null default public.requesting_user_id() references public.profiles(id) on delete cascade,
  item_id text not null check (length(item_id) between 1 and 40),
  unlocked_on date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.wardrobe_items enable row level security;
create policy wardrobe_items_select on public.wardrobe_items for select to authenticated using (user_id = (select public.requesting_user_id()));
create policy wardrobe_items_insert on public.wardrobe_items for insert to authenticated with check (user_id = (select public.requesting_user_id()));
create policy wardrobe_items_update on public.wardrobe_items for update to authenticated using (user_id = (select public.requesting_user_id())) with check (user_id = (select public.requesting_user_id()));
create policy wardrobe_items_delete on public.wardrobe_items for delete to authenticated using (user_id = (select public.requesting_user_id()));

-- Data migration: the first version kept this in profiles.extra (seenItems: [id], earned: {id: day}). Idempotent.
insert into public.wardrobe_items (user_id, item_id, unlocked_on)
select p.id, left(s.id, 40), current_date
from public.profiles p, jsonb_array_elements_text(
  case when jsonb_typeof(p.extra->'seenItems') = 'array' then p.extra->'seenItems' else '[]'::jsonb end
) as s(id)
where btrim(s.id) <> ''
on conflict (user_id, item_id) do nothing;

insert into public.wardrobe_items (user_id, item_id, unlocked_on)
select p.id, left(e.key, 40), case when e.value ~ '^\d{4}-\d{2}-\d{2}$' then e.value::date else current_date end
from public.profiles p, jsonb_each_text(
  case when jsonb_typeof(p.extra->'earned') = 'object' then p.extra->'earned' else '{}'::jsonb end
) as e(key, value)
where btrim(e.key) <> ''
on conflict (user_id, item_id) do nothing;
