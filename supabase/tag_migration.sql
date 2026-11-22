-- Safe storage upgrade for an existing recipes table.
-- This adds nothing destructive and is safe to run more than once.
alter table public.recipes
  add column if not exists tags text[] not null default '{}';

create index if not exists recipes_tags_idx
  on public.recipes using gin (tags);

-- Preview existing mappings (run this first):
-- breakfast, dessert, and snack tags that already line up are added to the list
-- as stable Meal keys. Existing array values are preserved.
select id, title, tags
from public.recipes
where exists (
  select 1
  from unnest(coalesce(tags, '{}')) as old_tag
  where lower(btrim(old_tag)) in ('breakfast', 'dessert', 'snack')
)
order by title;

-- Apply the additive, one-time migration.
-- This does not remove or replace any existing tag.
update public.recipes
set tags =
  (
    select array(
      select distinct canonical_tag
      from (
        select unnest(coalesce(tags, '{}')) as canonical_tag
        union all
        select lower(btrim(old_tag))
        from unnest(coalesce(tags, '{}')) as old_tag
        where lower(btrim(old_tag)) in ('breakfast', 'dessert', 'snack')
      ) mapped_tags
      where canonical_tag is not null
    )
  )
where exists (
  select 1
  from unnest(coalesce(tags, '{}')) as old_tag
  where lower(btrim(old_tag)) in ('breakfast', 'dessert', 'snack')
);
