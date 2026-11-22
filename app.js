// Keep the tag vocabulary here so browse filters and recipe tags stay in sync.
const TAG_GROUPS = [
  { name: "Season", tags: ["spring", "summer", "fall", "winter", "year-round"] },
  { name: "Meal", tags: ["breakfast", "lunch", "dinner", "snack", "dessert", "drink"] },
  { name: "Diet", tags: ["healthy", "vegetarian", "vegan", "gluten-free", "quick"] },
];

const PASSWORD_STORAGE_KEY = "familyRecipeBoxPassword";
const FAMILY_STORAGE_KEY = "familyRecipeBoxFamily";
const app = document.querySelector("#app");
const passwordDialog = document.querySelector("#password-dialog");
const passwordForm = document.querySelector("#password-form");
const passwordInput = document.querySelector("#family-password");
const passwordError = document.querySelector("#password-error");
const submitPasswordButton = document.querySelector("#submit-password");
document.querySelector("#add-recipe").addEventListener("click", () => {
  window.location.hash = "#/add";
});
const selectedTags = new Set();
let searchText = "";
let searchTimer;
let requestId = 0;
let routeVersion = 0;
let browseView;
let passwordPrompt;
let flashMessage = "";
let families = [];
let currentFamily = null;
let favoriteIds = new Set();
let familyStatePromise = null;
let browseMode = "home";

const familyMenuButton = document.querySelector("#family-menu-button");
const familyMenu = document.querySelector("#family-menu");

familyMenuButton.addEventListener("click", () => {
  const opening = familyMenu.hidden;
  familyMenu.hidden = !opening;
  familyMenuButton.setAttribute("aria-expanded", String(opening));
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".menu-wrap")) {
    familyMenu.hidden = true;
    familyMenuButton.setAttribute("aria-expanded", "false");
  }
});

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

function familyLoadErrorMessage(error) {
  if (error?.code === "42501") {
    return "Supabase is missing permission to read family data. In the Supabase SQL Editor, run the family-table GRANT statements documented in the README.";
  }
  return "Could not load your family. Please try again.";
}

function takeFlash() {
  if (!flashMessage) return null;
  const notice = makeElement("p", "form-feedback success-message", flashMessage);
  notice.setAttribute("role", "status");
  flashMessage = "";
  return notice;
}

function formatMeta(recipe) {
  const details = [];
  if (recipe.prep_time) details.push(`Prep ${recipe.prep_time}`);
  if (recipe.servings) details.push(`Serves ${recipe.servings}`);
  if (recipe.submitted_by) details.push(`Shared by ${recipe.submitted_by}`);
  return details.join(" · ");
}

function getStoredFamilyId() {
  try {
    return localStorage.getItem(FAMILY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearStoredFamily() {
  try {
    localStorage.removeItem(FAMILY_STORAGE_KEY);
  } catch {
    // The picker can still work for this page even if storage is unavailable.
  }
  currentFamily = null;
  favoriteIds = new Set();
  updateMenu();
}

function updateMenu() {
  familyMenu.replaceChildren();
  if (!currentFamily) {
    familyMenu.hidden = true;
    familyMenuButton.hidden = true;
    return;
  }

  familyMenuButton.hidden = false;
  const home = makeElement("a", "", `${currentFamily.name}'s Recipes`);
  home.href = "#/";
  familyMenu.append(home);

  const all = makeElement("a", "", "View all extended family recipes");
  all.href = "#/all";
  familyMenu.append(all);

  const switchFamily = makeElement("button", "", "Switch family");
  switchFamily.type = "button";
  switchFamily.addEventListener("click", () => {
    clearStoredFamily();
    familyMenu.hidden = true;
    familyMenuButton.setAttribute("aria-expanded", "false");
    window.location.hash = "#/family";
  });
  familyMenu.append(switchFamily);
}

async function ensureFamilyState(force = false) {
  if (!force && familyStatePromise) return familyStatePromise;

  familyStatePromise = (async () => {
    families = await window.recipeDb.listFamilies();
    const storedId = getStoredFamilyId();
    currentFamily =
      families.find((family) => String(family.id) === storedId) || null;

    if (currentFamily) {
      const ids = await window.recipeDb.getFavoriteRecipeIds(currentFamily.id);
      favoriteIds = new Set(ids);
    } else {
      favoriteIds = new Set();
    }
    updateMenu();
  })();

  try {
    await familyStatePromise;
  } catch (error) {
    familyStatePromise = null;
    throw error;
  }
  return familyStatePromise;
}

function renderFamilyPicker() {
  const picker = makeElement("section", "family-picker");
  picker.append(makeElement("h1", "", "Which family are you?"));

  const list = makeElement("div", "family-picker-list");
  for (const family of families) {
    const button = makeElement("button", "button button-primary family-picker-button", family.name);
    button.type = "button";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        localStorage.setItem(FAMILY_STORAGE_KEY, family.id);
      } catch {
        showStatus("This browser cannot remember your family. Enable local storage and try again.", {
          error: true,
        });
        button.disabled = false;
        return;
      }
      familyStatePromise = null;
      try {
        await ensureFamilyState(true);
        window.location.hash = "#/";
      } catch (error) {
        console.error("Could not load saved recipes:", error);
        showStatus("Could not open the family page. Please try again.", {
          error: true,
          retry: renderFamilyPicker,
        });
      }
    });
    list.append(button);
  }
  picker.append(list);

  if (families.length === 0) {
    picker.append(makeElement("p", "empty-message", "No families are available yet."));
  }
  app.replaceChildren(picker);
}

function createBrowseLayout(titleText) {
  const controls = makeElement("section", "browse-controls");
  const heading = makeElement("h1", "browse-title", titleText);
  if (browseMode === "all") {
    const back = makeElement("a", "detail-back", "← Your family’s recipes");
    back.href = "#/";
    controls.append(back);
  }
  controls.append(heading);

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

  const children = [];
  const notice = takeFlash();
  if (notice) children.push(notice);
  children.push(controls, results);
  app.replaceChildren(...children);
  browseView = { controls, summary, list };
  return browseView;
}

function favoriteLabel(recipeId) {
  const saved = favoriteIds.has(recipeId);
  return saved
    ? `Remove from ${currentFamily.name}'s recipes`
    : `Add to ${currentFamily.name}'s recipes`;
}

async function toggleFavorite(button, recipeId, errorMessage = null) {
  if (!currentFamily) return;
  const wasSaved = favoriteIds.has(recipeId);
  button.disabled = true;
  if (errorMessage) errorMessage.textContent = "";

  if (wasSaved) {
    favoriteIds.delete(recipeId);
  } else {
    favoriteIds.add(recipeId);
  }
  updateFavoriteButton(button, recipeId);

  try {
    if (wasSaved) {
      await window.recipeDb.removeFavorite(currentFamily.id, recipeId);
    } else {
      await window.recipeDb.addFavorite(currentFamily.id, recipeId);
    }
  } catch (error) {
    if (wasSaved) {
      favoriteIds.add(recipeId);
    } else {
      favoriteIds.delete(recipeId);
    }
    updateFavoriteButton(button, recipeId);
    if (errorMessage) {
      errorMessage.textContent = "Could not update this recipe. Please try again.";
    }
    console.error("Could not update favorite:", error);
  } finally {
    button.disabled = false;
  }
}

function updateFavoriteButton(button, recipeId) {
  const saved = favoriteIds.has(recipeId);
  button.classList.toggle("is-saved", saved);
  button.textContent = saved ? "✓" : "+";
  button.setAttribute("aria-label", favoriteLabel(recipeId));
  button.setAttribute("aria-pressed", String(saved));
  button.title = saved ? "Remove from our recipes" : "Add to our recipes";
}

function appendFavoriteControl(parent, recipeId) {
  const button = makeElement("button", "favorite-toggle");
  button.type = "button";
  updateFavoriteButton(button, recipeId);
  const errorMessage = makeElement("p", "favorite-error");
  errorMessage.setAttribute("role", "alert");
  button.addEventListener("click", () => toggleFavorite(button, recipeId, errorMessage));
  parent.append(button);
  parent.append(errorMessage);
}

function appendDetailFavorite(parent, recipeId) {
  const wrapper = makeElement("div", "favorite-detail");
  const button = makeElement("button", "favorite-toggle-detail");
  button.type = "button";
  const icon = makeElement("span", "favorite-toggle");
  updateFavoriteButton(icon, recipeId);
  const label = makeElement("span", "", "");
  const updateLabel = () => {
    label.textContent = favoriteIds.has(recipeId)
      ? "Remove from our recipes"
      : "Add to our recipes";
  };
  updateLabel();

  button.append(icon, label);
  const errorMessage = makeElement("p", "favorite-error");
  errorMessage.setAttribute("role", "alert");
  button.addEventListener("click", async () => {
    await toggleFavorite(icon, recipeId, errorMessage);
    updateLabel();
  });

  wrapper.append(button, errorMessage);
  parent.append(wrapper);
  return wrapper;
}

function appendRecipeRow(list, recipe, showFavorite = false) {
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
  if (showFavorite) {
    appendFavoriteControl(meta, recipe.id);
  }

  row.append(details, meta);
  list.append(row);
}

async function loadRecipes() {
  const currentRequest = ++requestId;
  const titleText = browseMode === "all"
    ? "All Extended Family Recipes"
    : `${currentFamily?.name || "Family"}'s Recipes`;
  const view =
    browseView && browseView.controls.isConnected
      ? browseView
      : createBrowseLayout(titleText);
  if (!view.controls.querySelector(".browse-title")) {
    view.controls.prepend(makeElement("h1", "browse-title", titleText));
  } else {
    view.controls.querySelector(".browse-title").textContent = titleText;
  }
  const { summary, list } = view;
  for (const chip of view.controls.querySelectorAll(".chip")) {
    const tag = chip.dataset.tag;
    chip.setAttribute("aria-pressed", String(selectedTags.has(tag)));
  }
  summary.textContent = "Loading recipes…";
  list.replaceChildren();

  try {
    let recipes = await window.recipeDb.list({
      search: searchText,
      tags: [...selectedTags],
    });
    if (currentRequest !== requestId) return;
    if (browseMode === "home") {
      recipes = recipes.filter((recipe) => favoriteIds.has(recipe.id));
    }

    const count = recipes.length;
    summary.textContent = `Showing ${count} ${count === 1 ? "recipe" : "recipes"}`;
    if (count === 0) {
      if (browseMode === "home" && !searchText && selectedTags.size === 0) {
        const empty = makeElement("div", "empty-message");
        empty.append(makeElement("p", "", "No saved recipes yet. Pick a few favorites from the family collection."));
        const allLink = makeElement("a", "button button-primary", "View all recipes");
        allLink.href = "#/all";
        empty.append(allLink);
        list.append(empty);
      } else {
        list.append(makeElement("p", "empty-message", "No recipes match those filters"));
      }
      return;
    }

    for (const recipe of recipes) {
      appendRecipeRow(list, recipe, browseMode === "all");
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
  const back = makeElement("a", "detail-back", "← All Extended Family Recipes");
  back.href = "#/all";

  const card = makeElement("article", "detail-card");
  const top = makeElement("header", "detail-heading");
  const headingTop = makeElement("div", "detail-heading-top");
  const editButton = makeElement("button", "button button-secondary edit-button", "Edit recipe");
  editButton.type = "button";
  editButton.addEventListener("click", () => {
    window.location.hash = `#/recipe/${encodeURIComponent(recipe.id)}/edit`;
  });

  if (recipe.tags && recipe.tags.length) {
    appendTagPills(headingTop, recipe.tags, "tag-list detail-tags");
  }
  headingTop.append(editButton);
  appendDetailFavorite(top, recipe.id);
  top.append(headingTop);
  top.append(makeElement("h1", "detail-title", recipe.title || "Untitled recipe"));

  const meta = formatMeta(recipe);
  if (meta) top.append(makeElement("p", "detail-meta", meta));
  if (recipe.description) {
    top.append(makeElement("p", "detail-description", recipe.description));
  }
  if (recipe.updated_at && recipe.last_edited_by) {
    top.append(makeElement("p", "detail-updated", `Last edited by ${recipe.last_edited_by}`));
  }
  const notice = takeFlash();
  if (notice) top.append(notice);
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

function completePasswordPrompt(password) {
  if (!passwordPrompt) return;
  const resolvePrompt = passwordPrompt.resolve;
  passwordPrompt = null;
  passwordForm.reset();
  passwordError.textContent = "";
  passwordError.hidden = true;
  if (passwordDialog.open) passwordDialog.close();
  resolvePrompt(password);
}

function promptForFamilyPassword() {
  if (passwordPrompt) return passwordPrompt.promise;

  passwordError.textContent = "";
  passwordError.hidden = true;
  passwordPrompt = {};
  passwordPrompt.promise = new Promise((resolve) => {
    passwordPrompt.resolve = resolve;
  });
  passwordDialog.showModal();
  passwordInput.focus();
  return passwordPrompt.promise;
}

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!passwordForm.reportValidity()) return;

  const password = passwordInput.value;
  submitPasswordButton.disabled = true;
  passwordError.textContent = "";
  passwordError.hidden = true;

  try {
    const isValid = await window.recipeDb.checkPassword(password);
    if (!isValid) {
      passwordError.textContent = "That password didn't work.";
      passwordError.hidden = false;
      passwordInput.focus();
      return;
    }

    try {
      localStorage.setItem(PASSWORD_STORAGE_KEY, password);
    } catch {
      passwordError.textContent = "This browser cannot remember the password. Enable local storage and try again.";
      passwordError.hidden = false;
      passwordInput.focus();
      return;
    }
    completePasswordPrompt(password);
  } catch (error) {
    console.error("Could not check the family password.", error?.code || "unknown");
    passwordError.textContent = "Could not check the password. Please try again.";
    passwordError.hidden = false;
    passwordInput.focus();
  } finally {
    submitPasswordButton.disabled = false;
  }
});

document.querySelector("#cancel-password").addEventListener("click", () => {
  completePasswordPrompt(null);
});

passwordDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  completePasswordPrompt(null);
});

async function getOrPromptForPassword() {
  let storedPassword;
  try {
    storedPassword = localStorage.getItem(PASSWORD_STORAGE_KEY);
  } catch {
    showStatus("This browser cannot store the family password. Enable local storage and try again.", {
      error: true,
    });
    return null;
  }
  return storedPassword || promptForFamilyPassword();
}

function addFormField(form, labelText, name, options = {}) {
  const wrapper = makeElement("div", `form-field${options.wide ? " form-field-wide" : ""}`);
  const id = `recipe-${name}`;
  const label = makeElement("label", "form-label", labelText);
  label.htmlFor = id;
  wrapper.append(label);

  const field = makeElement(options.multiline ? "textarea" : "input", "form-input");
  field.id = id;
  field.name = name;
  field.required = Boolean(options.required);
  if (options.multiline) {
    field.rows = options.rows || 4;
  } else {
    field.type = options.type || "text";
  }
  if (options.maxLength) field.maxLength = options.maxLength;
  if (options.placeholder) field.placeholder = options.placeholder;
  if (options.value) field.value = options.value;
  wrapper.append(field);
  form.append(wrapper);
  return field;
}

function addRecipeTagFields(form, recipeTags = []) {
  const fieldset = makeElement("fieldset", "form-field form-field-wide tag-fieldset");
  const legend = makeElement("legend", "form-label", "Tags");

  for (const group of TAG_GROUPS) {
    const section = makeElement("div", "form-tag-group");
    section.append(makeElement("p", "form-tag-heading", group.name));
    const options = makeElement("div", "form-tag-options");
    for (const tag of group.tags) {
      const wrapper = makeElement("label", "form-tag-chip");
      const input = makeElement("input");
      input.type = "checkbox";
      input.name = "tags";
      input.value = tag;
      input.checked = recipeTags.includes(tag);
      const text = makeElement("span", "", humanizeTag(tag));
      wrapper.append(input, text);
      options.append(wrapper);
    }
    section.append(options);
    fieldset.append(section);
  }

  fieldset.prepend(legend);
  form.append(fieldset);
}

function showFormFeedback(element, message, isError = true) {
  element.textContent = message;
  element.classList.toggle("success-message", !isError);
  element.classList.toggle("error-message", isError);
  element.hidden = !message;
  element.setAttribute("role", isError ? "alert" : "status");
}

function isInvalidPasswordError(error) {
  return (
    error?.code === "28000" ||
    String(error?.message || "").toLowerCase().includes("invalid password")
  );
}

async function retrieveImportedRecipe(url, feedback) {
  const password = await getOrPromptForPassword();
  if (!password) return null;

  async function requestWithPassword(familyPassword) {
    const config = window.RECIPE_CONFIG;
    return fetch(`${config.supabaseUrl}/functions/v1/import-recipe`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.supabaseAnonKey}`,
        "apikey": config.supabaseAnonKey,
        "content-type": "application/json",
        "x-family-password": familyPassword,
      },
      body: JSON.stringify({ url }),
    });
  }

  try {
    let response = await requestWithPassword(password);
    let data;
    try {
      data = await response.json();
    } catch {
      showFormFeedback(feedback, "The recipe importer returned an unreadable response.");
      return null;
    }

    if (data?.error === "bad_password") {
      try {
        localStorage.removeItem(PASSWORD_STORAGE_KEY);
      } catch {
        showFormFeedback(feedback, "This browser could not clear the saved password. Please check its storage settings.");
        return null;
      }
      const renewedPassword = await promptForFamilyPassword();
      if (!renewedPassword) return null;
      response = await requestWithPassword(renewedPassword);
      try {
        data = await response.json();
      } catch {
        showFormFeedback(feedback, "The recipe importer returned an unreadable response.");
        return null;
      }
    }

    if (!response.ok || !data?.ok) {
      showFormFeedback(feedback, data?.message || "We could not retrieve that recipe.");
      return null;
    }
    return data.recipe;
  } catch (error) {
    console.error("Could not retrieve the recipe.", error?.code || "unknown");
    showFormFeedback(feedback, "We could not retrieve that recipe. Please try again.");
    return null;
  }
}

async function writeWithPassword(write, feedback) {
  const password = await getOrPromptForPassword();
  if (!password) return false;

  try {
    await write(password);
    return true;
  } catch (error) {
    if (!isInvalidPasswordError(error)) {
      console.error("Could not save the recipe.", error?.code || "unknown");
      showFormFeedback(feedback, "Could not save your recipe. Please try again.");
      return false;
    }
  }

  try {
    localStorage.removeItem(PASSWORD_STORAGE_KEY);
  } catch {
    showFormFeedback(feedback, "This browser could not clear the saved password. Please check its storage settings.");
    return false;
  }

  const renewedPassword = await promptForFamilyPassword();
  if (!renewedPassword) return false;

  try {
    await write(renewedPassword);
    return true;
  } catch (error) {
    if (isInvalidPasswordError(error)) {
      try {
        localStorage.removeItem(PASSWORD_STORAGE_KEY);
      } catch {
        showFormFeedback(feedback, "This browser could not clear the saved password. Please check its storage settings.");
        return false;
      }
      showFormFeedback(feedback, "The password was rejected. Please try again.");
      return false;
    }
    console.error("Could not save the recipe.", error?.code || "unknown");
    showFormFeedback(feedback, "Could not save your recipe. Please try again.");
    return false;
  }
}

function renderRecipeForm(mode, recipe = null) {
  const editing = mode === "edit";
  const back = makeElement("a", "detail-back", editing ? "← Back to recipe" : "← All recipes");
  back.href = editing ? `#/recipe/${encodeURIComponent(recipe.id)}` : "#/";

  const card = makeElement("section", "editor-card");
  card.append(makeElement("h1", "editor-title", editing ? "Edit recipe" : "Add a recipe"));
  const feedback = makeElement("p", "form-feedback");
  feedback.hidden = true;
  feedback.setAttribute("role", "alert");

  const form = makeElement("form", "recipe-form");
  if (!editing) {
    const importSection = makeElement("section", "import-recipe-section");
    importSection.append(makeElement("h2", "import-recipe-heading", "Import from a link (optional)"));
    const importField = addFormField(importSection, "Recipe URL", "import-url", {
      type: "url",
      placeholder: "https://",
    });
    importField.id = "recipe-import-url";
    const importActions = makeElement("div", "import-recipe-actions");
    const retrieve = makeElement("button", "button button-secondary", "Retrieve recipe");
    retrieve.type = "button";
    importActions.append(retrieve);
    importSection.append(importActions);
    const importFeedback = makeElement("p", "form-feedback");
    importFeedback.hidden = true;
    importSection.append(importFeedback);
    form.append(importSection);

    retrieve.addEventListener("click", async () => {
      const url = importField.value.trim();
      if (!url) {
        showFormFeedback(importFeedback, "Enter a recipe link.");
        importField.focus();
        return;
      }
      retrieve.disabled = true;
      retrieve.textContent = "Retrieving...";
      showFormFeedback(importFeedback, "", false);
      const imported = await retrieveImportedRecipe(url, importFeedback);
      retrieve.disabled = false;
      retrieve.textContent = "Retrieve recipe";
      if (!imported) return;

      const titleField = form.elements.namedItem("title");
      const ingredientsField = form.elements.namedItem("ingredients");
      const instructionsField = form.elements.namedItem("instructions");
      const servingsField = form.elements.namedItem("servings");
      const prepTimeField = form.elements.namedItem("prep_time");
      const coreFields = [
        titleField,
        ingredientsField,
        instructionsField,
        servingsField,
        prepTimeField,
      ];
      const hasExistingText = coreFields.some((field) => field.value.trim());

      if (hasExistingText) {
        const confirmed = window.confirm("Overwrite the existing recipe details with imported recipe data?");
        if (!confirmed) return;
      }

      if (imported.title) titleField.value = imported.title;
      if (Array.isArray(imported.ingredients) && imported.ingredients.length) {
        ingredientsField.value = imported.ingredients.join("\n");
      }
      if (Array.isArray(imported.steps) && imported.steps.length) {
        instructionsField.value = imported.steps.join("\n");
      }
      if (imported.servings) servingsField.value = imported.servings;
      if (imported.prepTime) prepTimeField.value = imported.prepTime;
      showFormFeedback(importFeedback, "Imported. Please check everything before saving.", false);
    });
  }

  addFormField(form, "Recipe title", "title", {
    maxLength: 120,
    required: true,
    value: recipe?.title || "",
  });
  addFormField(form, "Your name", "name", {
    maxLength: 60,
    required: true,
    value: editing ? recipe?.last_edited_by || "" : recipe?.submitted_by || "",
  });
  addFormField(form, "Short description", "description", {
    maxLength: 300,
    multiline: true,
    rows: 2,
    value: recipe?.description || "",
  });
  addFormField(form, "Ingredients (one per line)", "ingredients", {
    maxLength: 4000,
    multiline: true,
    required: true,
    value: recipe?.ingredients || "",
  });
  addFormField(form, "Instructions (one step per line)", "instructions", {
    maxLength: 8000,
    multiline: true,
    required: true,
    value: recipe?.instructions || "",
  });
  addFormField(form, "Family notes (optional)", "notes", {
    maxLength: 1000,
    multiline: true,
    rows: 3,
    value: recipe?.notes || "",
  });

  const details = makeElement("div", "form-details-grid");
  addFormField(details, "Prep time", "prep_time", {
    maxLength: 40,
    value: recipe?.prep_time || "",
    placeholder: "e.g. 1 hr 15 min",
  });
  addFormField(details, "Servings", "servings", {
    maxLength: 40,
    value: recipe?.servings || "",
    placeholder: "e.g. 8",
  });
  form.append(details);
  addFormField(form, "Source URL (optional)", "source_url", {
    maxLength: 500,
    type: "url",
    value: recipe?.source_url || "",
    placeholder: "https://",
  });
  addRecipeTagFields(form, recipe?.tags || []);

  const honeypot = makeElement("input", "honeypot");
  honeypot.type = "text";
  honeypot.name = "website";
  honeypot.autocomplete = "off";
  honeypot.tabIndex = -1;
  honeypot.setAttribute("aria-hidden", "true");
  form.append(honeypot);

  const actions = makeElement("div", "form-actions");
  const cancel = makeElement("a", "button button-secondary", "Cancel");
  cancel.href = back.href;
  const submit = makeElement("button", "button button-primary", editing ? "Save changes" : "Add recipe");
  submit.type = "submit";
  actions.append(cancel, submit);
  form.append(actions);

  card.append(feedback, form);
  app.replaceChildren(back, card);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (honeypot.value.trim()) {
      window.location.hash = editing ? back.href : "#/";
      return;
    }

    const values = new FormData(form);
    for (const [name, label] of [
      ["title", "Recipe title"],
      ["name", "Your name"],
      ["ingredients", "Ingredients"],
      ["instructions", "Instructions"],
    ]) {
      if (String(values.get(name) || "").trim()) continue;
      showFormFeedback(feedback, `${label} cannot be blank.`);
      form.elements.namedItem(name).focus();
      return;
    }

    const sourceUrl = String(values.get("source_url") || "").trim();
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("Unsupported protocol");
        }
      } catch {
        showFormFeedback(feedback, "Enter a valid source URL starting with http:// or https://.");
        return;
      }
    }

    const optionalValue = (name) => String(values.get(name) || "").trim() || null;
    const recipeData = {
      title: String(values.get("title")).trim(),
      description: optionalValue("description"),
      ingredients: String(values.get("ingredients")).trim(),
      instructions: String(values.get("instructions")).trim(),
      notes: optionalValue("notes"),
      tags: values.getAll("tags").map(String),
      prep_time: optionalValue("prep_time"),
      servings: optionalValue("servings"),
      source_url: sourceUrl || null,
    };

    submit.disabled = true;
    showFormFeedback(feedback, "", false);
    const succeeded = await writeWithPassword(
      (password) =>
        editing
          ? window.recipeDb.update(password, recipe.id, {
              ...recipeData,
              edited_by: String(values.get("name")).trim(),
            })
          : window.recipeDb.add(password, {
              ...recipeData,
              submitted_by: String(values.get("name")).trim(),
            }),
      feedback
    );
    submit.disabled = false;
    if (!succeeded) return;

    flashMessage = editing ? "Recipe updated." : "Recipe added.";
    window.location.hash = editing ? `#/recipe/${encodeURIComponent(recipe.id)}` : "#/";
  });
}

async function loadRecipeForm(mode, id, version) {
  const password = await getOrPromptForPassword();
  if (version !== routeVersion) return;
  if (!password) {
    window.location.hash = "#/";
    return;
  }

  if (mode === "add") {
    renderRecipeForm("add");
    return;
  }

  showStatus("Loading recipe…");
  try {
    const recipe = await window.recipeDb.get(id);
    if (version !== routeVersion) return;
    if (!recipe) {
      showRecipeNotFound();
      return;
    }
    renderRecipeForm("edit", recipe);
  } catch (error) {
    if (version !== routeVersion) return;
    console.error("Could not load recipe for editing.", error?.code || "unknown");
    showStatus("Could not load this recipe. Please try again.", {
      error: true,
      retry: () => loadRecipeForm(mode, id, version),
    });
  }
}

async function route() {
  clearTimeout(searchTimer);
  const version = ++routeVersion;
  ++requestId;
  browseView = null;
  const hash = window.location.hash;

  if (hash === "#/family") {
    try {
      await ensureFamilyState(true);
      if (version !== routeVersion) return;
      renderFamilyPicker();
    } catch (error) {
      console.error("Could not load families:", error);
      showStatus("Could not load families. Please try again.", {
        error: true,
        retry: route,
      });
    }
    return;
  }

  try {
    await ensureFamilyState();
  } catch (error) {
    if (version !== routeVersion) return;
    console.error("Could not load family state:", error);
    showStatus(familyLoadErrorMessage(error), {
      error: true,
      retry: route,
    });
    return;
  }
  if (version !== routeVersion) return;

  if (!currentFamily) {
    window.location.hash = "#/family";
    return;
  }

  if (hash === "#/add") {
    loadRecipeForm("add", null, version);
    return;
  }

  const editMatch = hash.match(/^#\/recipe\/([^/]+)\/edit\/?$/);
  if (editMatch) {
    let id;
    try {
      id = decodeURIComponent(editMatch[1]);
    } catch {
      showRecipeNotFound();
      return;
    }
    if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) {
      showRecipeNotFound();
      return;
    }
    loadRecipeForm("edit", id, version);
    return;
  }

  if (passwordPrompt) completePasswordPrompt(null);
  const match = window.location.hash.match(/^#\/recipe\/([^/]+)\/?$/);
  if (!match) {
    if (hash === "#/all") {
      browseMode = "all";
    } else {
      browseMode = "home";
    }
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
