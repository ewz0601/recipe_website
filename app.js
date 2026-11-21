// Keep the tag vocabulary here so browse filters and recipe tags stay in sync.
const TAG_GROUPS = [
  { name: "Season", tags: ["spring", "summer", "fall", "winter", "year-round"] },
  { name: "Meal", tags: ["breakfast", "lunch", "dinner", "snack", "dessert", "drink"] },
  { name: "Diet", tags: ["healthy", "vegetarian", "vegan", "gluten-free", "quick"] },
];

const app = document.querySelector("#app");
const selectedTags = new Set();
let searchText = "";
let searchTimer;
let requestId = 0;
let browseView;

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function humanizeTag(tag) {
  return tag.replaceAll("-", " ");
}

function appendTagPills(parent, tags, className = "tag-list") {
  const list = makeElement("ul", className);
  for (const tag of tags || []) {
    const item = makeElement("li");
    item.append(makeElement("span", "tag-pill", humanizeTag(tag)));
    list.append(item);
  }
  parent.append(list);
}

function showStatus(message, options = {}) {
  const status = makeElement("div", "status-message");
  status.setAttribute("role", options.error ? "alert" : "status");
  status.append(makeElement("p", "", message));

  if (options.retry) {
    const retry = makeElement("button", "button", "Try again");
    retry.type = "button";
    retry.addEventListener("click", options.retry);
    status.append(retry);
  }

  app.replaceChildren(status);
}

function formatMeta(recipe) {
  const details = [];
  if (recipe.prep_time) details.push(`Prep ${recipe.prep_time}`);
  if (recipe.servings) details.push(`Serves ${recipe.servings}`);
  if (recipe.submitted_by) details.push(`Shared by ${recipe.submitted_by}`);
  return details.join(" · ");
}

function createBrowseLayout() {
  const controls = makeElement("section", "browse-controls");

  const searchLabel = makeElement("label", "search-label", "Search recipes");
  searchLabel.htmlFor = "recipe-search";
  controls.append(searchLabel);

  const search = makeElement("input", "search-input");
  search.id = "recipe-search";
  search.type = "search";
  search.placeholder = "Title or ingredient";
  search.autocomplete = "off";
  search.value = searchText;
  search.addEventListener("input", () => {
    searchText = search.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadRecipes, 250);
  });
  controls.append(search);

  const groups = makeElement("div", "filter-groups");
  for (const group of TAG_GROUPS) {
    const section = makeElement("section", "filter-group");
    const heading = makeElement("h2", "filter-heading", group.name);
    section.append(heading);

    const chips = makeElement("div", "chip-list");
    for (const tag of group.tags) {
      const chip = makeElement("button", "chip", humanizeTag(tag));
      chip.type = "button";
      chip.dataset.tag = tag;
      chip.setAttribute("aria-pressed", String(selectedTags.has(tag)));
      chip.addEventListener("click", () => {
        if (selectedTags.has(tag)) {
          selectedTags.delete(tag);
        } else {
          selectedTags.add(tag);
        }
        loadRecipes();
      });
      chips.append(chip);
    }

    section.append(chips);
    groups.append(section);
  }
  controls.append(groups);

  const actions = makeElement("div", "filter-actions");
  const clear = makeElement("button", "text-button", "Clear filters");
  clear.type = "button";
  clear.addEventListener("click", () => {
    selectedTags.clear();
    searchText = "";
    loadRecipes();
  });
  actions.append(clear);
  controls.append(actions);

  const summary = makeElement("p", "results-summary");
  summary.setAttribute("aria-live", "polite");
  const list = makeElement("section", "recipe-list");
  list.setAttribute("aria-label", "Recipes");
  const results = makeElement("div", "recipe-results");
  results.append(summary, list);

  app.replaceChildren(controls, results);
  browseView = { controls, summary, list };
  return browseView;
}

function appendRecipeRow(list, recipe) {
  const row = makeElement("article", "recipe-row");
  const details = makeElement("div", "recipe-row-main");
  const title = makeElement("a", "recipe-title", recipe.title || "Untitled recipe");
  title.href = `#/recipe/${encodeURIComponent(recipe.id)}`;
  details.append(title);

  if (recipe.description) {
    details.append(makeElement("p", "recipe-description", recipe.description));
  }
  if (recipe.tags && recipe.tags.length) {
    appendTagPills(details, recipe.tags);
  }

  const meta = makeElement("div", "recipe-row-meta");
  if (recipe.prep_time) {
    meta.append(makeElement("p", "", `Prep ${recipe.prep_time}`));
  }
  if (recipe.submitted_by) {
    meta.append(makeElement("p", "", `Shared by ${recipe.submitted_by}`));
  }

  row.append(details, meta);
  list.append(row);
}

async function loadRecipes() {
  const currentRequest = ++requestId;
  const view =
    browseView && browseView.controls.isConnected
      ? browseView
      : createBrowseLayout();
  const { summary, list } = view;
  for (const chip of view.controls.querySelectorAll(".chip")) {
    const tag = chip.dataset.tag;
    chip.setAttribute("aria-pressed", String(selectedTags.has(tag)));
  }
  summary.textContent = "Loading recipes…";
  list.replaceChildren();

  try {
    const recipes = await window.recipeDb.list({
      search: searchText,
      tags: [...selectedTags],
    });
    if (currentRequest !== requestId) return;

    const count = recipes.length;
    summary.textContent = `Showing ${count} ${count === 1 ? "recipe" : "recipes"}`;
    if (count === 0) {
      list.append(makeElement("p", "empty-message", "No recipes match those filters"));
      return;
    }

    for (const recipe of recipes) {
      appendRecipeRow(list, recipe);
    }
  } catch (error) {
    if (currentRequest !== requestId) return;
    console.error("Could not load recipes:", error);
    showStatus("Could not load recipes. Please try again.", {
      error: true,
      retry: loadRecipes,
    });
  }
}

function appendIngredients(parent, ingredients) {
  const list = makeElement("ul", "ingredient-list");
  for (const [index, ingredient] of ingredients.entries()) {
    const item = makeElement("li", "ingredient-item");
    const label = makeElement("label");
    const checkbox = makeElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `ingredient-${index}`;
    const text = makeElement("span", "", ingredient);
    label.htmlFor = checkbox.id;
    label.append(checkbox, text);
    item.append(label);
    list.append(item);
  }
  parent.append(list);
}

function appendMethod(parent, instructions) {
  const list = makeElement("ol", "method-list");
  for (const instruction of instructions) {
    const item = makeElement("li");
    item.append(makeElement("p", "", instruction));
    list.append(item);
  }
  parent.append(list);
}

function appendSafeSourceLink(parent, sourceUrl) {
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return;

  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    const link = makeElement("a", "source-link", "View recipe source");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    parent.append(link);
  } catch {
    // Ignore malformed URLs rather than rendering an unsafe or broken link.
  }
}

async function loadRecipeDetail(id) {
  const currentRequest = ++requestId;
  showStatus("Loading recipe…");

  try {
    const recipe = await window.recipeDb.get(id);
    if (currentRequest !== requestId) return;
    if (!recipe) {
      showRecipeNotFound();
      return;
    }
    renderRecipeDetail(recipe);
  } catch (error) {
    if (currentRequest !== requestId) return;
    console.error("Could not load recipe:", error);
    showStatus("Could not load this recipe. Please try again.", {
      error: true,
      retry: () => loadRecipeDetail(id),
    });
  }
}

function showRecipeNotFound() {
  const back = makeElement("a", "detail-back", "← All recipes");
  back.href = "#/";
  const message = makeElement("p", "empty-message", "Recipe not found.");
  app.replaceChildren(back, message);
}

function renderRecipeDetail(recipe) {
  const back = makeElement("a", "detail-back", "← All recipes");
  back.href = "#/";

  const card = makeElement("article", "detail-card");
  const top = makeElement("header", "detail-heading");

  if (recipe.tags && recipe.tags.length) {
    appendTagPills(top, recipe.tags, "tag-list detail-tags");
  }
  top.append(makeElement("h1", "detail-title", recipe.title || "Untitled recipe"));

  const meta = formatMeta(recipe);
  if (meta) top.append(makeElement("p", "detail-meta", meta));
  if (recipe.description) {
    top.append(makeElement("p", "detail-description", recipe.description));
  }
  if (recipe.updated_at && recipe.last_edited_by) {
    top.append(makeElement("p", "detail-updated", `Last edited by ${recipe.last_edited_by}`));
  }
  card.append(top);

  const divider = makeElement("hr", "detail-divider");
  card.append(divider);

  const columns = makeElement("div", "detail-columns");
  const ingredients = makeElement("section", "ingredients-panel");
  ingredients.append(makeElement("h2", "", "Ingredients"));
  appendIngredients(
    ingredients,
    (recipe.ingredients || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  );

  const method = makeElement("section", "method-panel");
  method.append(makeElement("h2", "", "Method"));
  appendMethod(
    method,
    (recipe.instructions || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  );
  columns.append(ingredients, method);
  card.append(columns);

  if (recipe.notes) {
    const notes = makeElement("aside", "family-notes");
    notes.append(makeElement("h2", "", "Family notes"));
    notes.append(makeElement("p", "", recipe.notes));
    method.append(notes);
  }

  appendSafeSourceLink(card, recipe.source_url);
  app.replaceChildren(back, card);
}

function route() {
  clearTimeout(searchTimer);
  const match = window.location.hash.match(/^#\/recipe\/([^/]+)\/?$/);
  if (!match) {
    loadRecipes();
    return;
  }

  let id;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    ++requestId;
    showRecipeNotFound();
    return;
  }
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) {
    ++requestId;
    showRecipeNotFound();
    return;
  }
  loadRecipeDetail(id);
}

window.addEventListener("hashchange", route);
route();
