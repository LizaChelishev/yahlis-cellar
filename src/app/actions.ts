"use server";

// Wine identification switched from Gemini to Anthropic Claude (Haiku 4.5)
// in this revision. Gemini SDK (@google/genai) remains installed but is
// no longer called from server actions.

import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "@/lib/supabase";

const BUCKET = "wine-labels";
const MODEL = "claude-haiku-4-5";

const ALLOWED_COLORS = ["red", "white", "rose", "sparkling"] as const;
type AllowedColor = (typeof ALLOWED_COLORS)[number];

type AiWine = {
  name: string;
  producer: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  grape: string | null;
  color: AllowedColor | null;
  tasting_notes: string | null;
  price_range: string | null;
  price_source: string | null;
  food_pairings: string | null;
  drinking_window: string | null;
  extra_notes: string | null;
  product_image_url: string | null;
};

const FALLBACK: AiWine = {
  name: "Unknown wine",
  producer: null,
  vintage: null,
  region: null,
  country: null,
  grape: null,
  color: null,
  tasting_notes: null,
  price_range: null,
  price_source: null,
  food_pairings: null,
  drinking_window: null,
  extra_notes: null,
  product_image_url: null,
};

const RECORD_WINE_TOOL: Anthropic.Tool = {
  name: "record_wine",
  description:
    "Record the identified wine details. Call this exactly once after looking at the label and (if needed) using web_search to fill in details. If the wine cannot be identified at all, set name to \"Unknown wine\" and all other fields to null.",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "Full wine name as it appears on the label (or 'Unknown wine' if unidentifiable).",
      },
      producer: {
        type: ["string", "null"],
        description: "Winery / producer / estate name.",
      },
      vintage: {
        type: ["integer", "null"],
        description: "Vintage year (e.g. 2018). Null if non-vintage or unknown.",
      },
      region: {
        type: ["string", "null"],
        description: "Wine region (e.g. 'Barolo', 'Napa Valley').",
      },
      country: {
        type: ["string", "null"],
        description: "Country of origin.",
      },
      grape: {
        type: ["string", "null"],
        description: "Grape variety or blend.",
      },
      color: {
        type: ["string", "null"],
        enum: ["red", "white", "rose", "sparkling", null],
        description: "One of: red, white, rose, sparkling. Null if unknown.",
      },
      tasting_notes: {
        type: ["string", "null"],
        description: "Short tasting notes (aroma, palate, finish).",
      },
      price_range: {
        type: ["string", "null"],
        description:
          "Single retail price in ILS shekels, e.g. '₪150'. No ranges. No USD.",
      },
      price_source: {
        type: ["string", "null"],
        description:
          "Short human-readable name of the website the price was sourced from (e.g. 'דרך היין', 'Mano Vino', 'Tzora Vineyards', 'Vivino'). Not a URL. Null if no price was found.",
      },
      food_pairings: {
        type: ["string", "null"],
        description: "Recommended food pairings.",
      },
      drinking_window: {
        type: ["string", "null"],
        description: "When the wine is best consumed, e.g. '2024-2030'.",
      },
      extra_notes: {
        type: ["string", "null"],
        description: "Any other interesting context worth knowing.",
      },
      product_image_url: {
        type: ["string", "null"],
        description:
          "URL of a clean product photograph of this exact wine bottle on a white/neutral background, sourced from a wine retailer or producer website. Should look like a professional bottle shot, not a label closeup. Prefer images from wineroute.co.il, vivino.com, the producer's official site, or reputable wine retailers. Return null if no suitable image is found.",
      },
    },
    required: [
      "name",
      "producer",
      "vintage",
      "region",
      "country",
      "grape",
      "color",
      "tasting_notes",
      "price_range",
      "price_source",
      "food_pairings",
      "drinking_window",
      "extra_notes",
      "product_image_url",
    ],
  },
} as Anthropic.Tool;

const RECORD_IMAGE_TOOL: Anthropic.Tool = {
  name: "record_image",
  description:
    "Record the best clean product photograph URL found for this wine. Call this exactly once after searching. If no suitable image is found, set product_image_url to null.",
  input_schema: {
    type: "object",
    properties: {
      product_image_url: {
        type: ["string", "null"],
        description:
          "Direct URL of a clean product photograph of this exact wine bottle on a white/neutral background, from a wine retailer or producer website. Must end in .jpg/.jpeg/.png/.webp. Null if none found.",
      },
    },
    required: ["product_image_url"],
  },
} as Anthropic.Tool;

const WEB_SEARCH_TOOL = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 3,
  allowed_callers: ["direct"],
} as const;

const WEB_FETCH_TOOL = {
  type: "web_fetch_20250910",
  name: "web_fetch",
  max_uses: 2,
  allowed_callers: ["direct"],
  allowed_domains: [
    "wineroute.co.il",
    "manovino.co.il",
    "pelter.co.il",
    "en.pelter.co.il",
    "avibenwine.com",
    "israelwineshop.com",
    "vivino.com",
    "wine-searcher.com",
  ],
} as const;

const SYSTEM_PROMPT = `You are a wine expert. The user will send a photo of a wine label. Identify the wine from the label, then use the web_search tool to look up additional details (producer, region, vintage notes, grape variety, tasting notes, price range, food pairings, drinking window) AND a clean product photograph of the bottle. Once you have what you can find, call the record_wine tool exactly once with the structured result.

STEP 0 — LABEL READING (mandatory, before any search):
Before any web_search, transcribe out loud — in a plain text block in your reasoning, BEFORE you call any tool — every word you can clearly read on the label:
  - Winery name
  - Wine name / cuvée
  - Vintage year (if visible)
  - Region / appellation
  - Grape variety (if printed)
  - Any other distinctive text
If a word is partially obscured, write "unclear: <best guess>" rather than confidently transcribing.
If you cannot read enough of the label to identify the wine with confidence, call record_wine with:
  name: "Unknown wine - label unclear"
  all other fields: null
Do NOT guess. Do NOT search for a wine you haven't actually read on the label.

You MUST follow these rules:

1. PRICE WORKFLOW — TIERED FALLBACK (do not return null without trying all tiers).
   You have access to BOTH web_search and web_fetch. Use web_search to find candidate retailer pages, then USE web_fetch to read the page and extract the actual price.

   Tier 1 — Israeli retailer (preferred):
     1. Search Israeli wine retailers (wineroute.co.il, manovino.co.il, pelter.co.il, en.pelter.co.il, avibenwine.com, israelwineshop.com, the producer's official site).
     2. If a relevant URL is found, USE web_fetch to read the page and extract the price.
     3. Format: "₪150" — single value, no decimals, no ranges, no "from", no commas in the number.
     4. price_source: short retailer name in Hebrew or English (e.g. "דרך היין", "מנו וינו", "Pelter", "Avi Ben").

   Tier 2 — International retail with conversion (fallback):
     If no Israeli price found after Tier 1, use an international price from Vivino, Wine-Searcher, Decanter, Wine Enthusiast, or the producer site. Use web_fetch on the source page when possible.
     - Convert to ILS at ~3.7 ILS per USD, ~4.0 ILS per EUR, ~4.6 ILS per GBP.
     - Prefix with "~" to mark as estimate: "~₪130".
     - price_source: "estimated from international retail".

   Tier 3 — Style-typical estimate (last resort):
     If no specific price found anywhere, estimate based on similar wines from the same producer / region / style at Israeli market levels.
     - Prefix with "~": "~₪90".
     - price_source: "estimated".

   Currency rule (applies to all tiers): the price_range field MUST start with "₪" (optionally preceded by "~"). NEVER use $, USD, EUR, GBP, or any other currency symbol or code in the output. Single value only — never a range like "₪150-180".

   Return null for price_range ONLY if you genuinely cannot make any reasonable estimate (extremely rare; should be near-zero for any commercially-existing wine). If you do return null, also set price_source to null.

   Do not duplicate the source in extra_notes — price_source is the single source of truth for that.

2. KOSHER-FRIENDLY FOOD PAIRINGS — the user keeps kosher.
   The food_pairings field MUST EXCLUDE:
     - Pork and pork products (bacon, prosciutto, ham, chorizo, pancetta, etc.)
     - Shellfish and crustaceans (shrimp, lobster, crab, oysters, mussels, clams, scallops, etc.)
     - Game meats (deer, venison, wild boar, rabbit, etc.)
     - Any combination of meat and dairy (no "ribeye with blue cheese", no "lamb with yogurt sauce", no cream-based sauces on meat dishes, etc.) — meat dishes get non-dairy accompaniments only.
   Use kosher-appropriate alternatives instead: beef, lamb, poultry, fish with fins and scales (salmon, tuna, sea bass, branzino, etc.), pasta, grains, legumes, vegetables. Hard cheeses are fine with non-meat dishes (pasta, vegetables, fruit).

3. PRODUCT IMAGE — REQUIRED MULTI-SEARCH.
   You MUST attempt at least 4 distinct web searches before giving up on product_image_url:
     1. "[producer] [wine name] [vintage] bottle png"
     2. "[wine name] [vintage] site:vivino.com"
     3. "[wine name] site:wineroute.co.il OR site:manovino.co.il"
     4. "[producer] official site [wine name]"
   The URL you return must:
     - Start with https://
     - End with .jpg, .jpeg, .png, or .webp (the URL itself, not the hosting page).
     - Show ONLY the bottle on a clean white or neutral solid background. NO hands, people, food, vineyards, store shelves, restaurants, wine glasses, or scene clutter.
     - NOT be a closeup of just the label.
     - NOT come from supabase.co/storage (that is the user upload).
   If after 4 searches no URL meets ALL criteria, return null. Better to return null than a wrong/messy image.

4. PLAIN TEXT ONLY — no citations, no HTML.
   - CRITICAL: Do NOT include any XML-style citation markers (e.g. <cite index=...>...</cite>), source references, footnote markers, or HTML/XML tags of any kind in any field of the record_wine tool input.
   - Provide plain text only. If your search results contain citation markers wrapping text, strip the markers and use only the underlying text.
   - This applies to every text field: name, producer, region, country, grape, tasting_notes, price_range, food_pairings, drinking_window, extra_notes.`;

// Focused prompt for re-running ONLY the product-image search step (Fix 2),
// reusing the exact image criteria from rule 3 of SYSTEM_PROMPT.
const IMAGE_SYSTEM_PROMPT = `You are a wine image finder. Given a wine's details, find a single clean product photograph of the bottle, then call record_image exactly once.

PRODUCT IMAGE — REQUIRED MULTI-SEARCH:
Attempt several distinct web searches before giving up. Useful queries:
  1. "[producer] [wine name] [vintage] bottle png"
  2. "[wine name] [vintage] site:vivino.com"
  3. "[wine name] site:wineroute.co.il OR site:manovino.co.il"
  4. "[producer] official site [wine name]"
Use web_fetch to confirm a candidate page when helpful.
The URL you return MUST:
  - Start with https://
  - End with .jpg, .jpeg, .png, or .webp (the URL itself, not the hosting page).
  - Show ONLY the bottle on a clean white or neutral solid background. NO hands, people, food, vineyards, store shelves, restaurants, wine glasses, or scene clutter.
  - NOT be a closeup of just the label.
  - NOT come from supabase.co/storage (that is the user's own upload).
If after your searches no URL meets ALL criteria, set product_image_url to null. Better null than a wrong or messy image.`;

function safeExt(name: string, fallback = "jpg"): string {
  const m = /\.([a-zA-Z0-9]{1,5})$/.exec(name);
  return m ? m[1].toLowerCase() : fallback;
}

function coerceColor(v: unknown): AllowedColor | null {
  if (typeof v !== "string") return null;
  const lower = v.toLowerCase();
  return (ALLOWED_COLORS as readonly string[]).includes(lower)
    ? (lower as AllowedColor)
    : null;
}

function coerceVintage(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < 1800 || i > 2100) return null;
  return i;
}

function coerceString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const cleaned = v
    .replace(/<\/?[^>]+>/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return cleaned === "" ? null : cleaned;
}

function coerceUrl(v: unknown): string | null {
  const s = coerceString(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function coerceProductImageUrl(v: unknown): string | null {
  const s = coerceString(v);
  if (!s) return null;
  if (s.length < 20) {
    console.warn(
      `[wine-id] product_image_url rejected: too short (${s.length} chars): ${s}`,
    );
    return null;
  }
  if (s.toLowerCase().includes("supabase.co/storage")) {
    console.warn(
      `[wine-id] product_image_url rejected: supabase storage URL (user upload): ${s}`,
    );
    return null;
  }
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    console.warn(`[wine-id] product_image_url rejected: invalid URL: ${s}`);
    return null;
  }
  if (u.protocol !== "https:") {
    console.warn(
      `[wine-id] product_image_url rejected: not https (protocol=${u.protocol}): ${s}`,
    );
    return null;
  }
  if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(u.pathname)) {
    console.warn(
      `[wine-id] product_image_url rejected: not image extension (pathname=${u.pathname}): ${s}`,
    );
    return null;
  }
  return u.toString();
}

function normalizeAi(raw: unknown): AiWine {
  if (!raw || typeof raw !== "object") return FALLBACK;
  const o = raw as Record<string, unknown>;
  const name = coerceString(o.name) ?? "Unknown wine";
  return {
    name,
    producer: coerceString(o.producer),
    vintage: coerceVintage(o.vintage),
    region: coerceString(o.region),
    country: coerceString(o.country),
    grape: coerceString(o.grape),
    color: coerceColor(o.color),
    tasting_notes: coerceString(o.tasting_notes),
    price_range: coerceString(o.price_range),
    price_source: coerceString(o.price_source),
    food_pairings: coerceString(o.food_pairings),
    drinking_window: coerceString(o.drinking_window),
    extra_notes: coerceString(o.extra_notes),
    product_image_url: coerceProductImageUrl(o.product_image_url),
  };
}

function mediaTypeFor(
  contentType: string,
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const t = contentType.toLowerCase();
  if (t.includes("png")) return "image/png";
  if (t.includes("gif")) return "image/gif";
  if (t.includes("webp")) return "image/webp";
  return "image/jpeg";
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [1000, 2000, 4000];
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      const retryable = status !== undefined && RETRYABLE_STATUSES.has(status);
      console.error(
        `[wine-id] Anthropic call failed (attempt ${attempt}/3, status=${status ?? "n/a"}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      if (!retryable || attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt - 1]));
    }
  }
  throw lastError;
}

async function identifyWine(
  imageBase64: string,
  contentType: string,
): Promise<AiWine> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY in environment");

  const client = new Anthropic({ apiKey });

  const response = await withRetry(() =>
    client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [
        WEB_SEARCH_TOOL as unknown as Anthropic.ToolUnion,
        WEB_FETCH_TOOL as unknown as Anthropic.ToolUnion,
        RECORD_WINE_TOOL,
      ],
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaTypeFor(contentType),
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: "Identify this wine and record the structured details via the record_wine tool.",
            },
          ],
        },
      ],
    }),
  );

  try {
    console.log(
      "[wine-id] raw response:",
      JSON.stringify(response, null, 2),
    );
  } catch {
    console.log("[wine-id] raw response (unserializable):", response);
  }

  let webSearchCount = 0;
  let webSearchResultCount = 0;
  let webFetchCount = 0;
  let webFetchResultCount = 0;
  let ocrTranscript: string | null = null;
  let firstToolSeen = false;
  for (const rawBlock of response.content) {
    const block = rawBlock as unknown as Record<string, unknown>;
    const blockType = block.type as string | undefined;
    if (
      blockType === "text" &&
      !firstToolSeen &&
      ocrTranscript === null &&
      typeof block.text === "string"
    ) {
      ocrTranscript = block.text as string;
    }
    if (
      blockType === "server_tool_use" ||
      blockType === "tool_use"
    ) {
      firstToolSeen = true;
    }
    if (blockType === "server_tool_use" && block.name === "web_search") {
      webSearchCount++;
      const input = block.input as { query?: unknown } | undefined;
      const query = typeof input?.query === "string" ? input.query : "(unknown)";
      console.log(`[wine-id] web_search query #${webSearchCount}:`, query);
    } else if (blockType === "web_search_tool_result") {
      const content = block.content;
      const count = Array.isArray(content) ? content.length : 0;
      webSearchResultCount++;
      const errorType =
        content && typeof content === "object" && !Array.isArray(content)
          ? (content as { type?: unknown }).type
          : undefined;
      if (errorType && errorType !== "web_search_tool_result") {
        console.warn(
          `[wine-id] web_search result #${webSearchResultCount}: error type=${String(errorType)}`,
          content,
        );
      } else {
        console.log(
          `[wine-id] web_search result #${webSearchResultCount}: ${count} hits`,
        );
      }
    } else if (blockType === "server_tool_use" && block.name === "web_fetch") {
      webFetchCount++;
      const input = block.input as { url?: unknown } | undefined;
      const url = typeof input?.url === "string" ? input.url : "(unknown)";
      console.log(`[wine-id] web_fetch URL #${webFetchCount}:`, url);
    } else if (blockType === "web_fetch_tool_result") {
      webFetchResultCount++;
      const content = block.content as Record<string, unknown> | undefined;
      const errType = content && typeof content === "object" ? (content.type as string | undefined) : undefined;
      if (errType === "web_fetch_tool_error") {
        const code = (content as { error_code?: unknown })?.error_code;
        console.warn(
          `[wine-id] web_fetch result #${webFetchResultCount}: error code=${String(code)}`,
        );
      } else {
        const inner = (content as { content?: unknown })?.content as
          | Record<string, unknown>
          | undefined;
        const source = inner?.source as Record<string, unknown> | undefined;
        const data = source?.data;
        const len = typeof data === "string" ? data.length : 0;
        console.log(
          `[wine-id] web_fetch response #${webFetchResultCount}: ${len} chars`,
        );
      }
    }
  }
  console.log(
    `[wine-id] tool summary: ${webSearchCount} web_search queries (${webSearchResultCount} results), ${webFetchCount} web_fetch URLs (${webFetchResultCount} results)`,
  );
  console.log(
    "[wine-id] OCR transcript:",
    ocrTranscript ?? "(none)",
  );

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "record_wine") {
      const parsed = block.input;
      console.log("[wine-id] AI parsed:", parsed);
      const normalized = normalizeAi(parsed);
      console.log("[wine-id] AI normalized:", normalized);

      const confidence = normalized.name.toLowerCase().startsWith("unknown wine")
        ? "low"
        : "high";
      console.log(`[wine-id] confidence: ${confidence}`);

      const price = normalized.price_range;
      const source = normalized.price_source;
      if (price === null) {
        console.warn(
          "[wine-id] price tier used: NONE (price_range=null) — should be rare",
        );
      } else if (price.startsWith("~")) {
        const tier =
          source && source.toLowerCase().includes("international") ? 2 : 3;
        const label =
          tier === 2 ? "international with conversion" : "style-typical estimate";
        console.log(
          `[wine-id] price tier used: ${tier} (${label}) — ${price} from ${source ?? "(no source)"}`,
        );
      } else {
        console.log(
          `[wine-id] price tier used: 1 (Israeli retailer) — ${price} from ${source ?? "(no source)"}`,
        );
      }

      return normalized;
    }
  }

  console.error(
    `[wine-id] Claude did not call record_wine (stop_reason=${response.stop_reason}); falling back to Unknown wine`,
  );
  return FALLBACK;
}

export async function addBottleFromPhoto(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const file = formData.get("photo");
  const shelf = Number(formData.get("shelf"));
  const position = Number(formData.get("position"));

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No photo provided" };
  }
  if (!Number.isInteger(shelf) || !Number.isInteger(position)) {
    return { ok: false, error: "Invalid shelf or position" };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "Server is missing ANTHROPIC_API_KEY" };
  }

  const sb = getSupabase();
  const ext = safeExt(file.name);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const contentType = file.type || "image/jpeg";

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  const uploadPromise = (async () => {
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (error) throw error;
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  })();

  const identifyPromise = identifyWine(base64, contentType);

  const [uploadResult, identifyResult] = await Promise.allSettled([
    uploadPromise,
    identifyPromise,
  ]);

  if (uploadResult.status === "rejected") {
    const reason = uploadResult.reason;
    const msg =
      reason && typeof reason === "object" && "message" in reason
        ? String((reason as { message: unknown }).message)
        : String(reason);
    return { ok: false, error: `Image upload failed: ${msg}` };
  }
  const labelUrl = uploadResult.value;

  if (identifyResult.status === "rejected") {
    console.error(
      "[wine-id] Identification failed after retries:",
      identifyResult.reason,
    );
    await sb.storage.from(BUCKET).remove([path]);
    return {
      ok: false,
      error: "AI service is temporarily busy. Please try again in a minute.",
    };
  }
  const ai: AiWine = identifyResult.value;

  const { error: insErr } = await sb.from("wines").insert({
    name: ai.name,
    producer: ai.producer,
    vintage: ai.vintage,
    region: ai.region,
    country: ai.country,
    grape: ai.grape,
    color: ai.color,
    tasting_notes: ai.tasting_notes,
    price_range: ai.price_range,
    price_source: ai.price_source,
    food_pairings: ai.food_pairings,
    drinking_window: ai.drinking_window,
    extra_notes: ai.extra_notes,
    label_image_url: labelUrl,
    product_image_url: ai.product_image_url,
    shelf,
    position,
  });

  if (insErr) {
    await sb.storage.from(BUCKET).remove([path]);
    return { ok: false, error: `Could not save bottle: ${insErr.message}` };
  }

  revalidatePath("/");
  return { ok: true };
}

const UPDATABLE_FIELDS = [
  "name",
  "store",
  "producer",
  "vintage",
  "region",
  "country",
  "grape",
  "color",
  "tasting_notes",
  "price_range",
  "price_source",
  "food_pairings",
  "drinking_window",
  "extra_notes",
  "product_image_url",
] as const;

type UpdatableField = (typeof UPDATABLE_FIELDS)[number];

export type WineUpdate = Partial<{
  name: string;
  store: string | null;
  producer: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  grape: string | null;
  color: AllowedColor | null;
  tasting_notes: string | null;
  price_range: string | null;
  price_source: string | null;
  food_pairings: string | null;
  drinking_window: string | null;
  extra_notes: string | null;
  product_image_url: string | null;
}>;

export async function updateWine(
  id: string,
  fields: WineUpdate,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Missing id" };

  const patch: Record<string, unknown> = {};
  for (const key of UPDATABLE_FIELDS) {
    if (!(key in fields)) continue;
    const k = key as UpdatableField;
    const v = fields[k];
    if (k === "name") {
      const s = coerceString(v);
      if (!s) return { ok: false, error: "Name cannot be empty" };
      patch.name = s;
    } else if (k === "vintage") {
      patch.vintage = coerceVintage(v);
    } else if (k === "color") {
      patch.color = coerceColor(v);
    } else if (k === "product_image_url") {
      patch.product_image_url = v === null ? null : coerceUrl(v);
    } else {
      patch[k] = coerceString(v);
    }
  }

  if (Object.keys(patch).length === 0) return { ok: true };

  const sb = getSupabase();
  const { error } = await sb.from("wines").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true };
}

export async function deleteWine(id: string) {
  if (!id) throw new Error("Missing id");
  const sb = getSupabase();
  const { error } = await sb.from("wines").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

// Move a bottle to another slot, swapping with any occupant. Delegates to the
// move_bottle SQL function (migration 0006) so the park → swap → place sequence
// runs in a single transaction and never violates the slot unique index.
export async function moveBottle(
  srcId: string,
  dstShelf: number,
  dstPosition: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!srcId) return { ok: false, error: "Missing source id" };
  if (!Number.isInteger(dstShelf) || !Number.isInteger(dstPosition)) {
    return { ok: false, error: "Invalid destination slot" };
  }

  const sb = getSupabase();
  const { error } = await sb.rpc("move_bottle", {
    p_src_id: srcId,
    p_dst_shelf: dstShelf,
    p_dst_position: dstPosition,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true };
}

// Mark a bottle as finished: copy its enriched data (plus the slot it was in)
// into archived_wines, then delete it from the cabinet. Deleting the wines row
// frees the slot via the existing (shelf, position) unique index. Text fields
// are run back through coerceString so nothing AI-sourced is archived raw.
export async function finishWine(id: string) {
  if (!id) throw new Error("Missing id");
  const sb = getSupabase();

  const { data: wine, error: selErr } = await sb
    .from("wines")
    .select("*")
    .eq("id", id)
    .single();
  if (selErr) throw new Error(selErr.message);
  if (!wine) throw new Error("Wine not found");

  const { error: insErr } = await sb.from("archived_wines").insert({
    name: coerceString(wine.name) ?? "Unknown wine",
    store: coerceString(wine.store),
    producer: coerceString(wine.producer),
    region: coerceString(wine.region),
    country: coerceString(wine.country),
    vintage: coerceVintage(wine.vintage),
    grape: coerceString(wine.grape),
    color: coerceColor(wine.color),
    tasting_notes: coerceString(wine.tasting_notes),
    price_range: coerceString(wine.price_range),
    price_source: coerceString(wine.price_source),
    food_pairings: coerceString(wine.food_pairings),
    drinking_window: coerceString(wine.drinking_window),
    extra_notes: coerceString(wine.extra_notes),
    label_image_url: wine.label_image_url,
    product_image_url: wine.product_image_url,
    shelf: wine.shelf,
    position: wine.position,
    // finished_at defaults to now() in the DB.
  });
  if (insErr) throw new Error(insErr.message);

  const { error: delErr } = await sb.from("wines").delete().eq("id", id);
  if (delErr) throw new Error(delErr.message);

  revalidatePath("/");
}

// Re-run ONLY the product-image search step of the enrichment workflow for an
// already-saved wine, using its known text details. Reuses the same model,
// web tools (and their usage caps), retry, and coerceProductImageUrl as the
// add flow. Returns a sanitized URL or null.
async function findProductImage(wine: {
  name: string;
  producer: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY in environment");
  const client = new Anthropic({ apiKey });

  const details = [
    `Name: ${wine.name}`,
    wine.producer ? `Producer: ${wine.producer}` : null,
    wine.vintage !== null ? `Vintage: ${wine.vintage}` : null,
    wine.region ? `Region: ${wine.region}` : null,
    wine.country ? `Country: ${wine.country}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await withRetry(() =>
    client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: IMAGE_SYSTEM_PROMPT,
      tools: [
        WEB_SEARCH_TOOL as unknown as Anthropic.ToolUnion,
        WEB_FETCH_TOOL as unknown as Anthropic.ToolUnion,
        RECORD_IMAGE_TOOL,
      ],
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Find a clean product bottle photo for this wine and record it via record_image.\n\n${details}`,
            },
          ],
        },
      ],
    }),
  );

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "record_image") {
      const input = block.input as { product_image_url?: unknown };
      const url = coerceProductImageUrl(input.product_image_url);
      console.log(`[refetch-image] result for "${wine.name}":`, url ?? "(none)");
      return url;
    }
  }
  console.warn(
    `[refetch-image] Claude did not call record_image (stop_reason=${response.stop_reason})`,
  );
  return null;
}

// Per-bottle "find a better image" action. Searches for a product photo and,
// only if one is found, writes it through coerceProductImageUrl. On no result
// or error, leaves the bottle untouched and reports back for an inline toast.
export async function refetchProductImage(
  id: string,
): Promise<
  { ok: true; productImageUrl: string } | { ok: false; error: string }
> {
  if (!id) return { ok: false, error: "Missing id" };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "Server is missing ANTHROPIC_API_KEY" };
  }

  const sb = getSupabase();
  const { data: wine, error: selErr } = await sb
    .from("wines")
    .select("name, producer, vintage, region, country")
    .eq("id", id)
    .single();
  if (selErr) return { ok: false, error: selErr.message };
  if (!wine) return { ok: false, error: "Wine not found" };

  let url: string | null;
  try {
    url = await findProductImage(wine);
  } catch (err) {
    console.error("[refetch-image] search failed:", err);
    return {
      ok: false,
      error: "AI service is temporarily busy. Please try again in a minute.",
    };
  }

  if (!url) {
    return { ok: false, error: "Couldn't find a better image — try again." };
  }

  const { error: updErr } = await sb
    .from("wines")
    .update({ product_image_url: url })
    .eq("id", id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/");
  return { ok: true, productImageUrl: url };
}
