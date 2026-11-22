# Pass 2f: new tag system and filter layout

Add this section to the existing Copilot instructions md. Keep the same constraints as earlier passes: plain static files, no build step, Supabase for data, cozy and rustic look (warm colors, serif fonts), text only, no photos. Work in small steps and tell me what you changed. You can't test against Supabase from here, so list anything I need to test by hand.

## 1. Single source of truth for tags

Create one tag config (for example `tags.js`) that every part of the site reads from. Adding or renaming a tag later should mean editing only this file. Each group has: a key, a display label, whether it is required, and whether it allows one or multiple tags.

| Group | Required | Choose | Tags |
|---|---|---|---|
| Meal | Yes (at least one) | Multiple | Breakfast, Lunch, Dinner, Appetizer, Side, Snack, Dessert, Drink |
| Cuisine | Yes (exactly one) | Single | American, Italian, Mexican, Asian, Mediterranean, Indian, Other |
| Occasion | No | Multiple | Date night, Hosting, Weeknight, Holiday, Potluck, Meal prep |
| Diet | No | Multiple | Healthy, Gluten free |
| Season | No | Multiple | Spring, Summer, Fall, Winter (use the season tags the site already has if they differ) |

Notes:
- Cuisine is one tag per recipe. "Other" is the fallback so nobody is ever stuck.
- No write-in or custom tags. People can only pick from this list.

## 2. Storage

- Store each recipe's tags as a simple list on the recipe row (for example a text array column), not one column per group. Keep tag values as stable keys (like `date-night`), with display labels coming from the config.
- Give me the SQL to run in Supabase, and keep it separate from the code. It should be safe to run on the existing table and not delete any data.
- Update `supabase/schema.sql` and the README to match.
- Keep the existing tags working while I migrate (see section 6).

## 3. Add and edit form

- Show tags grouped by their group, as tappable chips. Meal and Occasion and Diet and Season allow multiple selections. Cuisine allows one.
- Meal and Cuisine are required. If either is missing on save, show a short inline message next to that group and do not save.
- Editing an old recipe that is missing Meal or Cuisine should show the same message until the person picks them.
- Keep the existing family password flow exactly as it is.

## 4. Browse filters (family homepage and "View all extended family recipes")

Use the same filter bar on both pages. Filters reset when switching between the two pages or switching families.

Phone layout:
- A single row of quick chips for Meal: All, Breakfast, Dinner, Dessert, Snack. Scroll sideways if needed.
- A "More filters" button next to it.
- "More filters" opens a panel with collapsible groups (Meal, Cuisine, Occasion, Diet, Season). Show the number of active filters on the button, for example "Filters (2)". Open the first group by default and keep the rest collapsed.
- Active filters show as removable chips above the list.

Laptop and wide screens:
- Show the same collapsible groups as a left sidebar that is always visible. Quick chips can be skipped here.

Filter logic:
- Within one group, show recipes that match any selected tag (Dinner or Lunch).
- Across groups, require all (Dinner and Asian and Gluten free).
- If nothing matches, show a friendly message and a "Clear filters" button.
- Do not show tag counts for now.

## 5. Showing tags on recipes

- Show a recipe's tags as small chips on the recipe cards in the list and on the detail page.
- Tapping a tag on a card or the detail page should take the person to the list with that tag already filtered.
- Keep the look consistent with the cozy and rustic style already used.

## 6. Migrating existing recipes

- Write a one-time migration (SQL or a small script) that maps the old tags that line up: breakfast, dessert, and snack become Meal tags. Do not guess anything else.
- Cuisine will be added by hand to each existing recipe after that.
- Recipes missing Meal or Cuisine should still appear under "All" and keep working. They just won't show up under the new filters until updated.
- Show me what the migration will change before I run it, and make sure it can't delete or overwrite anything it does not need to.

## 7. Done when

- Tags come from one config file.
- Add and edit forms enforce required Meal and Cuisine.
- Both homepages have the new filter bar, and it works on phone and laptop.
- Tags appear on cards and the detail page and are tappable.
- SQL, migration, schema docs, and README are updated.
- You've listed what I still need to test by hand in the browser and in Supabase.