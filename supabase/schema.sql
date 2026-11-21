create extension if not exists pgcrypto with schema extensions;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  last_edited_by text check (char_length(last_edited_by) <= 60),
  title text not null check (char_length(title) between 1 and 120),
  submitted_by text not null check (char_length(submitted_by) between 1 and 60),
  description text check (char_length(description) <= 300),
  ingredients text not null check (char_length(ingredients) <= 4000),
  instructions text not null check (char_length(instructions) <= 8000),
  notes text check (char_length(notes) <= 1000),
  tags text[] not null default '{}',
  prep_time text check (char_length(prep_time) <= 40),
  servings text check (char_length(servings) <= 40),
  source_url text check (char_length(source_url) <= 500)
);

create index recipes_tags_idx on public.recipes using gin (tags);

-- Holds the hashed family password. RLS is on with NO policies, so the public key cannot read it.
create table public.family_settings (
  id int primary key default 1 check (id = 1),
  password_hash text not null
);

alter table public.recipes enable row level security;
alter table public.family_settings enable row level security;

-- The public key can only read recipes. No direct insert, update or delete.
create policy "anyone can read" on public.recipes for select to anon using (true);
revoke all on public.recipes from anon;
grant select on public.recipes to anon;
revoke all on public.family_settings from anon;

-- Returns true if the password is correct (used for the one-time unlock prompt).
create or replace function public.check_family_password(p_password text)
returns boolean language sql security definer stable
set search_path = public, extensions as $$
  select exists (select 1 from family_settings where password_hash = crypt(p_password, password_hash));
$$;

-- Adds a recipe. p is a JSON object with the recipe fields.
create or replace function public.add_recipe(p_password text, p jsonb)
returns uuid language plpgsql security definer
set search_path = public, extensions as $$
declare new_id uuid;
begin
  if not check_family_password(p_password) then
    raise exception 'invalid password' using errcode = '28000';
  end if;
  insert into recipes (title, submitted_by, description, ingredients, instructions, notes, tags, prep_time, servings, source_url)
  values (p->>'title', p->>'submitted_by', p->>'description', p->>'ingredients', p->>'instructions', p->>'notes',
          coalesce(array(select jsonb_array_elements_text(p->'tags')), '{}'),
          p->>'prep_time', p->>'servings', p->>'source_url')
  returning id into new_id;
  return new_id;
end $$;

-- Edits a recipe. There is intentionally NO delete function.
create or replace function public.update_recipe(p_password text, p_id uuid, p jsonb)
returns void language plpgsql security definer
set search_path = public, extensions as $$
begin
  if not check_family_password(p_password) then
    raise exception 'invalid password' using errcode = '28000';
  end if;
  update recipes set
    title = p->>'title', description = p->>'description', ingredients = p->>'ingredients',
    instructions = p->>'instructions', notes = p->>'notes',
    tags = coalesce(array(select jsonb_array_elements_text(p->'tags')), '{}'),
    prep_time = p->>'prep_time', servings = p->>'servings', source_url = p->>'source_url',
    last_edited_by = p->>'edited_by', updated_at = now()
  where id = p_id;
end $$;

revoke all on function public.check_family_password(text) from public;
revoke all on function public.add_recipe(text, jsonb) from public;
revoke all on function public.update_recipe(text, uuid, jsonb) from public;
grant execute on function public.check_family_password(text) to anon;
grant execute on function public.add_recipe(text, jsonb) to anon;
grant execute on function public.update_recipe(text, uuid, jsonb) to anon;
