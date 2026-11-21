// Keep the tag vocabulary here so browse filters and recipe tags stay in sync.
const TAG_GROUPS = [
  { name: "Season", tags: ["spring", "summer", "fall", "winter", "year-round"] },
  { name: "Meal", tags: ["breakfast", "lunch", "dinner", "snack", "dessert", "drink"] },
  { name: "Diet", tags: ["healthy", "vegetarian", "vegan", "gluten-free", "quick"] },
];

const PASSWORD_STORAGE_KEY = "familyRecipeBoxPassword";
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

  const children = [];
  const notice = takeFlash();
  if (notice) children.push(notice);
  children.push(controls, results);
  app.replaceChildren(...children);
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

function route() {
  clearTimeout(searchTimer);
  const version = ++routeVersion;
  ++requestId;
  const hash = window.location.hash;

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
