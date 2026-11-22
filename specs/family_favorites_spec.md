# Pass 2d: family favorites and Home Page

Add this section to the existing Copilot instructions file. Passes 1 through 2c are finished and tested, so build on the existing code and match its patterns (config.js, db.js, the current CSS palette, the current browse and detail pages). Keep everything simple: plain HTML, CSS, and JavaScript, no new frameworks or build tools.

## Decisions already made

- Each family can save recipes to its own list. There are no accounts and no logins.
- A family is picked once and remembered on that device (localStorage). Anyone can pick any family (honor system).
- Families for now: "Eli and Lizzie" and "Mark and Chris". More will be added later by inserting a row in Supabase, so family names must come from the database and never be hard-coded in the page.
- Saving a recipe uses a plus sign (not a heart). It means "add to my family's recipes".
- A saved recipe shows a filled check in the same spot. Tapping the check removes the recipe from that family's list. Adding and removing are the same button.
- Removing only affects that family's list. The recipe itself stays in the shared collection and is never deleted.
- Adding and removing favorites does not need the shared family password. Editing recipes still does, as before.
- Look and feel stays as is: cozy and rustic, warm colors, serif fonts, cookbook feel, text only, no photos.

## Database (already done by the owner in Supabase)

Two new tables exist: `families` (id, name) and `favorites` (family_id, recipe_id, created_at). The primary key of `favorites` is (family_id, recipe_id), so a recipe can only be saved once per family. Row level security allows the public key to read families, and to read, insert, and delete favorites.

Do not change the existing `recipes` table. Add the two tables and their policies to `supabase/schema.sql` so the repo documents them.

## Tasks

1. **db.js**: add functions to get all families, get the saved recipe IDs for a family, add a favorite, and remove a favorite. Match the style of the existing functions.
2. **Family picker**: on first visit, if no family is saved on this device, show a simple, cozy screen that asks "Which family are you?" and lists the families from the database. Save the choice in localStorage and go to the Home Page. The menu has "Switch family", which clears the choice and shows the picker again.
3. **Home Page**: the new landing page. Same layout as the current recipe index list with tag filters, but it shows only the current family's saved recipes. The title is "[family name]'s Recipes" (for example, "Eli and Lizzie's Recipes"). If the family has no saved recipes, show a friendly empty state with a button that goes to all recipes.
4. **Menu**: a menu icon in the top right of the header opens a small dropdown with: the family's own page ("[family name]'s Recipes"), "View all extended family recipes", and "Switch family". Keep it to these three items for now, but build it so more items (such as a grocery list or meal planner) can be added later.
5. **All Extended Family Recipes page**: this is the current browse page, retitled "All Extended Family Recipes", with a back link to the Home Page. Each row on the right shows a plus in a circle if the recipe is not saved, or a filled check if it is saved. Tapping toggles it. Update the button right away and handle errors gracefully (revert the button and show a short message if the save fails).
6. **Recipe detail page**: show the same plus or check button, plus "Remove from our recipes" wording for the saved state, so removal is also possible from the detail page.
7. **Responsive**: all of this must work well on phones first, and keep the existing responsive behavior of the recipe detail page.
8. **Accessibility**: the plus and check buttons need clear labels, for example "Add to Eli and Lizzie's recipes" and "Remove from Eli and Lizzie's recipes".

## Not in this pass

No grocery list and no meal planner yet. Do not add accounts, login, or per-family passwords. Do not add photos.

## When finished

Update the README to mention the family picker and favorites, and report what changed so the owner can test: picking a family, saving and removing a recipe, switching families, and checking that favorites show up on a second device after picking the same family.