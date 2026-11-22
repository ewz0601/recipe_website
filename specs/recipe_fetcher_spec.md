Pass 2e: Import a recipe from a link

GOAL
On the add-recipe page, a person can paste a recipe link, click "Retrieve recipe", and the form fills in with the recipe's title, ingredients and steps. Nothing saves automatically: the person reviews, edits and saves with the normal flow.

CONSTRAINTS
Keep the tech simple: no build step, no new front-end libraries, keep the cozy rustic styling. Do not change the database schema or any existing tables in this pass.

1. NEW SUPABASE EDGE FUNCTION
File: supabase/functions/import-recipe/index.ts (Deno/TypeScript, no external dependencies if possible).

Request: POST with JSON body {"url": "..."} and a header x-family-password.
Response: always JSON.
- Success: {"ok": true, "recipe": {"title", "ingredients": [strings], "steps": [strings], "servings": string or null, "prepTime", "cookTime", "totalTime" (readable, like "1 hr 15 min", or null)}}
- Failure: {"ok": false, "error": "<code>", "message": "<one friendly sentence>"}
  Codes: bad_password (HTTP 401), bad_url (400), fetch_failed, timeout, not_html, too_large, no_recipe_found.

Safeguards (all required):
a. Password: read the secret FAMILY_PASSWORD with Deno.env.get and compare it to the x-family-password header using a constant-time comparison. If it is missing or wrong, return bad_password before doing anything else. Never log the password.
b. URL checks: only http and https; no username/password inside the URL; reject localhost, .local and .internal hostnames; reject IP addresses (typed or resolved) in private, loopback or link-local ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7, fe80::/10). Resolve the hostname with Deno.resolveDns (A and AAAA) and check every address.
c. Redirects: follow them manually, at most 3, and re-run all URL checks on every hop.
d. Limits: 10 second total timeout; stop reading after 3 MB; accept only text/html responses.
e. Send a normal browser-like User-Agent and Accept header when fetching.
f. CORS: handle OPTIONS preflight; allow any origin; allow headers authorization, apikey, content-type and x-family-password.
g. Return only the fields above, never the raw page.

Parsing:
- Find every <script type="application/ld+json"> block and JSON.parse each one inside try/catch.
- Handle a top-level object, an array, and an @graph list. Use the first node whose @type is "Recipe" (the type may be a string or an array).
- Map: name -> title; recipeIngredient -> ingredients; recipeInstructions -> steps. Instructions may be a single string (split on line breaks), an array of strings, HowToStep objects (use text, or name), or HowToSection objects (flatten itemListElement).
- recipeYield (string, number or array) -> servings. Convert ISO 8601 durations like PT1H15M into readable text.
- Decode HTML entities, strip HTML tags, trim whitespace and drop empty items.
- If no Recipe node is found, return no_recipe_found.
- Keep the helpers (URL check, parse, duration conversion) as separate small functions so they are easy to read.

2. FRONT END
- On the add-recipe page only (not the edit page), add an "Import from a link (optional)" section at the top of the form: a URL input and a "Retrieve recipe" button, styled to match the site.
- On click, POST to the project URL from config.js plus /functions/v1/import-recipe. Send the public key in the apikey and Authorization: Bearer headers the same way the existing code does, and the family password in x-family-password.
- Reuse however the existing code already gets and stores the family password. If it isn't saved on this device yet, show the existing password dialog first. If the page code can't reach the password in a way that lets you send it, STOP and tell me instead of inventing a new mechanism.
- While waiting, show "Retrieving..." and disable the button.
- On success, fill the form's existing fields (title, ingredients, steps, and servings/times only if the form already has those fields), matching the existing format of each field (for example, one ingredient per line). If those fields already contain text, ask for confirmation before overwriting. Then show: "Imported. Please check everything before saving."
- On error, show the message from the response in the form's existing error style. Never block manual entry.
- If the error is bad_password, use the existing re-enter-password flow.
- Do not pick tags automatically; the person chooses them.

3. DOCS
- Add a README section covering: what the feature does, the FAMILY_PASSWORD secret, deploying the function by pasting index.ts into the Supabase dashboard editor, and turning off "Verify JWT" for this function.
- Add a pass 2e section to the instructions md file.

When finished, list the files you changed and anything you could not test.