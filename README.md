# The Family Recipe Box

A simple, public recipe index for the family. Anyone can browse and search recipes. Adding or editing asks for the shared family password; the site has no individual accounts and does not delete recipes.

Families can also keep a private-to-the-family list of favorite recipes on this device. A family is chosen once and remembered in localStorage. The family names and favorites are stored in Supabase and are shared across devices after the same family is picked.

## How it works

The site is plain HTML, CSS, and JavaScript. `index.html` loads the Supabase JavaScript client from a pinned CDN version, and `config.js` contains the project's URL and public browser key. The public key can read recipes. Adding and editing go through database functions that check the shared password; the password is saved in this browser after it is checked so it is only requested once per device.

On first visit, the family picker asks which family is using the device. Its names come from the `families` table. Favorites are stored in the `favorites` table and can be added or removed without the recipe-editing password. Use the menu to switch families or open all extended family recipes.

The `anon` database role needs table privileges in addition to the RLS policies. If the site reports a family-table permission error, run these statements in the Supabase SQL Editor (they grant table access but do not bypass RLS):

```sql
grant select on public.families to anon;
grant select, insert, delete on public.favorites to anon;
```

The Supabase project and database are already configured. `supabase/schema.sql` is kept as a reference and does not need to be run again.

## Run locally

From the project folder, start a simple static server:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a browser. Stop the server with Ctrl+C.

## Publish with GitHub Pages

1. Push the site files to the repository's `main` branch.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Choose the `main` branch and the `/(root)` folder, then save.
5. After GitHub finishes publishing, use the Pages URL shown in Settings.

## Keep Supabase awake

The scheduled workflow in `.github/workflows/keepalive.yml` makes a small read-only request to the recipes API every three days. It can also be started manually from the repository's **Actions** tab.

Add these repository secrets in **Settings → Secrets and variables → Actions → New repository secret**:

- `SUPABASE_URL`: the project URL from `config.js`
- `SUPABASE_ANON_KEY`: the public key from `config.js`

GitHub may disable scheduled workflows in repositories without activity for 60 days. If that happens, open the workflow in **Actions** and re-enable it.

## Family password and backups

An administrator can change the shared password in the Supabase SQL Editor by updating the stored hash. Replace the placeholder with a new, long family passphrase before running this statement:

```sql
update public.family_settings
set password_hash = extensions.crypt('NEW-LONG-FAMILY-PASSPHRASE', extensions.gen_salt('bf'));
```

After a password change, each browser will ask for the new password the next time someone adds or edits a recipe. The website has no password reset feature.

Export the `recipes` table to CSV from the Supabase Table Editor now and then as a backup. The website does not delete recipes; if one must be removed, an administrator can delete its row from the Table Editor.

## Import recipes from a link

On the Add a recipe form, a person can paste a recipe webpage link and choose **Retrieve recipe**. The website retrieves recipe title, ingredients, steps, servings, and prep time when the page publishes that information in Recipe JSON-LD. It fills the form for review; it does not save anything or choose tags automatically.

Set a shared `FAMILY_PASSWORD` secret in Supabase Edge Functions. It should match the password used by the existing family-password flow. The importer requires the browser to send that password in `x-family-password`.

To deploy the importer:

1. In Supabase, open **Edge Functions → New function** and name it `import-recipe`.
2. Open `supabase/functions/import-recipe/index.ts` in this repository, copy its contents, and paste them into the dashboard editor.
3. In **Edge Function secrets**, add `FAMILY_PASSWORD` and deploy the function.
4. Turn off **Verify JWT** for this function, because the browser uses the public Supabase publishable key and the shared family password instead.
