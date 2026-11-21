# Family Recipe Box: Build Instructions

Build a small recipe-sharing website for a family. Anyone with the link can browse recipes. Adding or editing a recipe requires one shared family password, entered once per device (no individual accounts). Recipes can be edited but never deleted from the site. Recipes are stored in a Supabase table. The site is plain HTML, CSS and vanilla JavaScript (no framework, no build step) and is hosted on GitHub Pages.

## Already set up (do not redo)

The Supabase project already exists and the database is fully set up: the `recipes` and `family_settings` tables, the security rules, the `check_family_password`, `add_recipe` and `update_recipe` functions, and the family password. Do not ask the user to create a project, run SQL, or choose a password. Just connect to it using these public values (the publishable key is safe to put in front-end code):

- `SUPABASE_URL`: `https://ayxdfrxxhrwoaspqimcl.supabase.co`
- `SUPABASE_ANON_KEY` (the publishable key): `sb_publishable_efrF_POgYeSkFAgG4hwzAA_8rrsW0EZ`

Put these in `config.js`. Never use any other Supabase key.

Work in two passes if the request is too large: (1) database setup file + `config.js` + data layer, then (2) the UI.

## Files to create

- `index.html`, `style.css`, `app.js`: the site (single page, hash routing)
- `config.js`: exports `SUPABASE_URL` and `SUPABASE_ANON_KEY` using the values above (the key is public by design; Row Level Security and the password-checking functions protect the data)
- `supabase/schema.sql`: a copy of the SQL below, for reference only (it has already been run)
- `.github/workflows/keepalive.yml`: keeps the free Supabase project from pausing
- `README.md`: short beginner-friendly notes: how the site connects to Supabase, how to enable GitHub Pages, how to add the keep-alive secrets, and how to change the family password later

Load supabase-js from a CDN `<script>` tag pinned to an exact version (e.g. jsDelivr `@supabase/supabase-js@2.x.y` UMD build). Do not use `latest` or a version range.

## Database (Supabase, Postgres) and the shared password

Security model: the public (anon) key can only READ recipes directly. All writes go through database functions that check the shared family password first, so nobody can write to the table without it. The password is stored only as a bcrypt hash in a table the public key cannot read. Do NOT check the password in JavaScript alone, since that would not protect anything.

Save this in `supabase/schema.sql` for reference only. It has ALREADY been run in Supabase; do not ask the user to run it again:

```sql
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
```

The family password has ALREADY been set; do not ask the user for it or set it again, and never put the real password in any file in the repo. In the README, briefly explain how an admin can change it later in the Supabase SQL Editor, using this pattern with a placeholder:

```sql
update public.family_settings
set password_hash = extensions.crypt('NEW-LONG-FAMILY-PASSPHRASE', extensions.gen_salt('bf'));
```

Notes:
- `ingredients` and `instructions` are multi-line text, one item per line.
- `tags` is a text array holding lowercase tag slugs, e.g. `{dessert,fall}`.
- The site never deletes. If a recipe must be removed, the admin deletes the row in the Supabase Table Editor. The README should also suggest exporting the table to CSV from the Table Editor now and then as a backup.

## Password flow in the website

- Reading and browsing never ask for a password.
- When someone clicks "+ Add a recipe" or "Edit recipe" and no password is stored yet, show a small modal: "Enter the family password" with one password field. Validate it with `supabase.rpc('check_family_password', { p_password })`. If true, store it in `localStorage` (so it is only asked once per device) and continue. If false, show "That password didn't work" and let them retry.
- Every write calls `supabase.rpc('add_recipe', { p_password, p })` or `supabase.rpc('update_recipe', { p_password, p_id, p })`. If a write fails with "invalid password" (for example the password was changed), clear the stored password and show the modal again.
- There is no "forgot password" or reset feature. If the password ever changes, the stored one stops working, the modal reappears, and the user types the new one. The admin changes the password in the Supabase SQL Editor.
- Never log or display the password, and never put it in the URL.

## Tags (define once, in one constant at the top of `app.js`)

- Season: spring, summer, fall, winter, year-round
- Meal: breakfast, lunch, dinner, snack, dessert, drink
- Diet: healthy, vegetarian, vegan, gluten-free, quick

Filtering: tags are toggle chips. Selecting several tags narrows results (a recipe must have all selected tags). Use `.contains('tags', selectedTags)` in supabase-js. Include a "Clear filters" button.

## Pages and features

1. **Browse page (the home view): recipe index list.**
   - Header: site title "The Family Recipe Box", tagline "Recipes we love, passed around the table.", and a "+ Add a recipe" button.
   - Search box (label: "Search recipes", placeholder "Title or ingredient") that filters by title and ingredients (use `ilike`/`or` in the query or filter client-side).
   - Tag filter chips, grouped by Season / Meal / Diet, each group on its own row with a small uppercase label.
   - A count line, e.g. "Showing all 6 recipes".
   - Recipes as a list of rows, like a cookbook table of contents: dashed divider between rows; left side has the recipe title (a link to the detail view), a one-line description, and tag pills; right side (right-aligned) has prep time and "Shared by NAME".
   - Loading state and empty state ("No recipes match those filters").
2. **Recipe detail view** (hash route, e.g. `#/recipe/<id>`), with a "← All recipes" link. It has two layouts chosen by screen width (see "Responsive recipe view").
3. **Add a recipe form** (modal or separate view, requires the family password as described above): title, your name, short description, ingredients (textarea, one per line), instructions (textarea, one step per line), family notes (optional), prep time, servings, optional source URL, and tag checkboxes using the same groups. Include a hidden honeypot field ("website") and silently discard submissions where it is filled in. On submit, call the `add_recipe` function, show a success or error message, and refresh the list.
4. **Edit recipe**: an "Edit recipe" button (top right of the recipe detail view) opens the same form pre-filled with the recipe. It also needs the family password. Include a "Your name" field for who edited it (saved as `last_edited_by`), and show "Last edited by NAME" in small muted text on the detail view when `updated_at` is set. Saving calls `update_recipe`. There is no delete button anywhere.

## Responsive recipe view

Use a CSS breakpoint at `min-width: 900px`.

- **Phones / narrow screens (below 900px): "cookbook page" layout.** A single centered column inside a cream card (`#FFFBF3`, 1px `#DCC9A8` border, 10px radius, generous padding). Order: tag pills, large title, meta line ("Prep 1 hr 15 min · Serves 8 · Shared by Mom"), description, a dashed divider, "Ingredients" with a checkbox for each item, "Method" as a numbered list, and a "Family notes" box (dashed border, `#FFF6E3` background).
- **Laptops / wide screens (900px and up): "cooking layout", two columns.** Title, tags, meta line and description span the top. Below them, a left panel (about 340px, same card styling) holds the ingredient checkboxes, and the right column holds "Method" with large terracotta numerals (Playfair Display, about 40px) beside each step, followed by the "Family notes" box.
- Build this as one component with CSS media queries, not two separate pages. Ingredient checkboxes are only for ticking things off while cooking; they do not need to be saved.

## Visual design: cozy and rustic, text only (no photos)

- Colors: page background `#F6EEDF`; card surface `#FFFBF3`; border `#DCC9A8`; text `#3B2A1E`; muted text `#6B5645`; accent terracotta `#A8482B` (hover `#7A311B`); tag pill background `#EADBC2` with text `#5A3F2B`; notes background `#FFF6E3`; dashed dividers `#B9A07C`.
- Fonts (Google Fonts): Playfair Display (600, 700) for headings, Lora (400, 500, 600) for body. Always include fallback stacks (Georgia, serif).
- Chips: pill shape, 1px `#B9A07C` border, transparent background, minimum 44px tall; selected state is filled terracotta with cream text (`#FFF8EC`).
- Inputs: 48px minimum height, 8px radius, `#FFFBF3` background, 1px `#B9A07C` border.
- The password modal and the buttons use the same chip/input styling as the rest of the site.
- Accessibility: real `<button>`, `<a>`, `<label for>` elements; keyboard-friendly chips; text contrast at least 4.5:1; touch targets at least 44px.
- No emoji, gradients or stock-photo placeholders. Mobile first, and the page body must never scroll sideways.

## Keeping the free Supabase project awake

Free Supabase projects are paused after about a week of low activity. Add `.github/workflows/keepalive.yml` that runs on a schedule every 3 days (and manually via `workflow_dispatch`) and makes a lightweight request to the REST API, for example `curl` on `$SUPABASE_URL/rest/v1/recipes?select=id&limit=1` with the `apikey` header set from GitHub repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Explain in the README how to add those secrets. Note that GitHub may disable scheduled workflows in repos with no activity for 60 days, and the README should say to re-enable it if that happens.

## Constraints

- No secrets in the code other than the public anon key; never use or mention the `service_role` key.
- The site must never insert, update or delete in the `recipes` table directly. Writes only go through the `add_recipe` and `update_recipe` functions.
- Escape or sanitize all user-provided text before inserting it into the DOM (use `textContent`, not `innerHTML`), and only render `source_url` as a link if it starts with `http://` or `https://`.
- Keep code simple and well commented so a beginner can edit it. The tag lists and colors should each be changeable in one place.
- Do not add features beyond this list (no photos, individual accounts, favorites or delete) unless asked.

## Deployment

Explain how to enable GitHub Pages (Settings, Pages, deploy from the `main` branch root) and how to test locally by opening `index.html` with a simple static server.