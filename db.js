// Browser data layer for the Family Recipe Box.
// Reads are direct Supabase reads. Every insert or update goes through an RPC.
(function () {
  "use strict";

  if (!window.supabase) {
    throw new Error("Supabase browser library is not loaded.");
  }

  const client = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );

  function requireNoError(result) {
    if (result.error) {
      throw result.error;
    }
    return result.data;
  }

  function escapeLikeValue(value) {
    return value
      .replaceAll("\\", "\\\\")
      .replaceAll(",", "")
      .replaceAll("'", "")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_");
  }

  async function listRecipes(options = {}) {
    const search = (options.search || "").trim();

    let query = client
      .from("recipes")
      .select("*")
      .order("title", { ascending: true });

    if (search) {
      const safeSearch = escapeLikeValue(search);
      query = query.or(
        `title.ilike.%${safeSearch}%,ingredients.ilike.%${safeSearch}%`
      );
    }

    const result = await query;
    return requireNoError(result);
  }

  async function getRecipe(id) {
    const result = await client
      .from("recipes")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    return requireNoError(result);
  }

  async function checkFamilyPassword(password) {
    const result = await client.rpc("check_family_password", {
      p_password: password,
    });
    return requireNoError(result);
  }

  async function addRecipe(password, recipe) {
    const result = await client.rpc("add_recipe", {
      p_password: password,
      p: recipe,
    });
    return requireNoError(result);
  }

  async function updateRecipe(password, id, recipe) {
    const result = await client.rpc("update_recipe", {
      p_password: password,
      p_id: id,
      p: recipe,
    });
    return requireNoError(result);
  }

  async function listFamilies() {
    const result = await client
      .from("families")
      .select("id,name")
      .order("name", { ascending: true });
    return requireNoError(result);
  }

  async function getFavoriteRecipeIds(familyId) {
    const result = await client
      .from("favorites")
      .select("recipe_id")
      .eq("family_id", familyId);
    const favorites = requireNoError(result);
    return favorites.map((favorite) => favorite.recipe_id);
  }

  async function addFavorite(familyId, recipeId) {
    const result = await client
      .from("favorites")
      .insert({ family_id: familyId, recipe_id: recipeId });
    return requireNoError(result);
  }

  async function removeFavorite(familyId, recipeId) {
    const result = await client
      .from("favorites")
      .delete()
      .eq("family_id", familyId)
      .eq("recipe_id", recipeId);
    return requireNoError(result);
  }

  window.recipeDb = Object.freeze({
    list: listRecipes,
    get: getRecipe,
    checkPassword: checkFamilyPassword,
    add: addRecipe,
    update: updateRecipe,
    listFamilies,
    getFavoriteRecipeIds,
    addFavorite,
    removeFavorite,
  });
})();
