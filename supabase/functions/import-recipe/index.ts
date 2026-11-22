const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-family-password",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function failure(code: string, message: string, status = 400) {
  return jsonResponse({ ok: false, error: code, message }, status);
}

function constantTimeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let difference = left.length === right.length ? 0 : 1;
  for (let i = 0; i < length; i++) {
    difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return difference === 0;
}

function normalizeHost(hostname: string) {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
}

function isPrivateV4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function isPrivateV6(address: string) {
  const normalized = address.toLowerCase().split("%", 1)[0];
  if (normalized === "::1") return true;
  if (/^(fc|fd)/.test(normalized)) return true;
  if (/^(fe[89ab])/i.test(normalized)) return true;
  return false;
}

function isIpAddress(host: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ||
    host.includes(":") ||
    /^\[/.test(host);
}

async function checkUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;

  const host = normalizeHost(url.hostname);
  if (!host || host === "localhost" || host.endsWith(".local") ||
      host.endsWith(".internal") || isIpAddress(host)) {
    return null;
  }

  const addresses: string[] = [];
  for (const family of ["A", "AAAA"] as const) {
    try {
      const found = await Deno.resolveDns(host, family);
      addresses.push(...found.map(String));
    } catch {
      // A hostname may not have records for one address family.
    }
  }
  if (addresses.length === 0) return null;
  for (const address of addresses) {
    if (isPrivateV4(address) || isPrivateV6(address)) return null;
  }
  return url;
}

function decodeHtmlEntities(text: string) {
  const named: Record<string, string> = {
    amp: "&", quot: "\"", apos: "'", nbsp: " ", lt: "<", gt: ">",
    hellip: "...", middot: "\u00b7", ndash: "\u2013", mdash: "\u2014",
  };
  return text
    .replace(/&#(\d+);?/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);?/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
    .replace(/&([a-z]+);?/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function splitLines(value: unknown) {
  if (typeof value !== "string") return [];
  return value.split(/\r?\n/).map(cleanText).filter(Boolean);
}

function flattenInstructions(value: unknown): string[] {
  if (typeof value === "string") return splitLines(value);
  if (Array.isArray(value)) {
    const steps: string[] = [];
    for (const item of value) steps.push(...flattenInstructions(item));
    return steps;
  }
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  if (item.itemListElement) return flattenInstructions(item.itemListElement);
  return [cleanText(item.text) || cleanText(item.name)].filter(Boolean);
}

function hasType(node: Record<string, unknown>, wanted: string) {
  const type = node["@type"];
  if (typeof type === "string") return type === wanted || type.endsWith(`/${wanted}`);
  if (Array.isArray(type)) {
    return type.some((entry) => typeof entry === "string" &&
      (entry === wanted || entry.endsWith(`/${wanted}`)));
  }
  return false;
}

function findRecipeNode(document: unknown): Record<string, unknown> | null {
  if (Array.isArray(document)) {
    for (const item of document) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
  } else if (document && typeof document === "object") {
    const node = document as Record<string, unknown>;
    if (hasType(node, "Recipe")) return node;
    if (Array.isArray(node["@graph"])) {
      for (const item of node["@graph"]) {
        if (item && typeof item === "object" &&
            hasType(item as Record<string, unknown>, "Recipe")) {
          return item as Record<string, unknown>;
        }
      }
    }
  }
  return null;
}

function parseServings(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    return cleanText(String(value)) || null;
  }
  if (Array.isArray(value)) {
    const entries = value.map((entry) => cleanText(String(entry))).filter(Boolean);
    return entries.length ? entries.join(", ") : null;
  }
  return null;
}

function formatDuration(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return null;
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);
  const totalHours = days * 24 + hours;
  const parts: string[] = [];
  if (totalHours) parts.push(`${totalHours} hr`);
  if (minutes) parts.push(`${minutes} min`);
  if (!totalHours && !minutes && seconds) parts.push(`${seconds} sec`);
  return parts.length ? parts.join(" ") : null;
}

function parseRecipe(html: string) {
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    const typeMatch = match[1].match(/(?:^|\s)type\s*=\s*(["'])(.*?)\1/i);
    if (!typeMatch || typeMatch[2].trim().split(";")[0].toLowerCase() !== "application/ld+json") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[2].trim());
    } catch {
      continue;
    }
    const recipe = findRecipeNode(parsed);
    if (!recipe) continue;

    const ingredients = Array.isArray(recipe.recipeIngredient)
      ? recipe.recipeIngredient.map(cleanText).filter(Boolean)
      : [];
    return {
      title: cleanText(recipe.name),
      ingredients,
      steps: flattenInstructions(recipe.recipeInstructions),
      servings: parseServings(recipe.recipeYield),
      prepTime: formatDuration(recipe.prepTime),
      cookTime: formatDuration(recipe.cookTime),
      totalTime: formatDuration(recipe.totalTime),
    };
  }
  return null;
}

async function fetchHtml(startUrl: URL) {
  let url = startUrl;
  const started = Date.now();
  for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
    if (Date.now() - started >= 10000) throw new Error("timeout");
    const checked = await checkUrl(url.toString());
    if (!checked) throw new Error("bad_url");

    let response: Response;
    try {
      response = await fetch(checked, {
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(Math.max(1, 10000 - (Date.now() - started))),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") throw new Error("timeout");
      throw new Error("fetch_failed");
    }

    if (response.status >= 300 && response.status < 400) {
      if (redirectCount === 3) throw new Error("fetch_failed");
      const location = response.headers.get("location");
      if (!location) throw new Error("fetch_failed");
      try {
        url = new URL(location, checked);
        continue;
      } catch {
        throw new Error("fetch_failed");
      }
    }
    if (!response.ok) throw new Error("fetch_failed");

    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (contentType !== "text/html") throw new Error("not_html");
    if (!response.body) throw new Error("fetch_failed");

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        if (Date.now() - started >= 10000) throw new Error("timeout");
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 3 * 1024 * 1024) throw new Error("too_large");
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8").decode(bytes);
  }
  throw new Error("fetch_failed");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") {
    return failure("bad_url", "Send a POST request with a recipe link.", 405);
  }

  const familyPassword = Deno.env.get("FAMILY_PASSWORD");
  if (!familyPassword) {
    return failure("bad_password", "The family password is not configured.", 401);
  }
  const suppliedPassword = request.headers.get("x-family-password") || "";
  if (!constantTimeEqual(suppliedPassword, familyPassword)) {
    return failure("bad_password", "That family password did not work.", 401);
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return failure("bad_url", "Send a valid JSON request with a recipe link.", 400);
  }
  if (typeof body.url !== "string" || !body.url.trim()) {
    return failure("bad_url", "Enter a valid http or https recipe link.", 400);
  }

  let initialUrl: URL;
  try {
    initialUrl = new URL(body.url.trim());
  } catch {
    return failure("bad_url", "Enter a valid http or https recipe link.", 400);
  }
  const checked = await checkUrl(initialUrl.toString());
  if (!checked) {
    return failure("bad_url", "That recipe link is not allowed.", 400);
  }

  try {
    const html = await fetchHtml(checked);
    const recipe = parseRecipe(html);
    if (!recipe) {
      return failure("no_recipe_found", "We could not find a recipe on that page.", 404);
    }
    if (!recipe.title || (!recipe.ingredients.length && !recipe.steps.length)) {
      return failure("no_recipe_found", "We could not find a complete recipe on that page.", 404);
    }
    return jsonResponse({ ok: true, recipe });
  } catch (error) {
    const code = error instanceof Error ? error.message : "fetch_failed";
    if (code === "timeout") {
      return failure("timeout", "Retrieving the recipe took too long. Please try again.", 504);
    }
    if (code === "bad_url") {
      return failure("bad_url", "That recipe link is not allowed.", 400);
    }
    if (code === "too_large") {
      return failure("too_large", "That page is too large to retrieve.", 413);
    }
    if (code === "not_html") {
      return failure("not_html", "That link does not point to a web page.", 415);
    }
    return failure("fetch_failed", "We could not retrieve that recipe link.", 502);
  }
});
