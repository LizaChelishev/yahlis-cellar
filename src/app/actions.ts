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
        description: "Typical retail price range, e.g. '$20-30'.",
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
      "food_pairings",
      "drinking_window",
      "extra_notes",
      "product_image_url",
    ],
  },
} as Anthropic.Tool;

const WEB_SEARCH_TOOL = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 5,
  allowed_callers: ["direct"],
} as const;

const SYSTEM_PROMPT = `You are a wine expert. The user will send a photo of a wine label. Identify the wine from the label, then use the web_search tool to look up additional details (producer, region, vintage notes, grape variety, tasting notes, price range, food pairings, drinking window) AND a clean product photograph of the bottle. Once you have what you can find, call the record_wine tool exactly once with the structured result. If you cannot identify the wine at all, call record_wine with name="Unknown wine" and every other field set to null.

You MUST follow these rules:

1. CURRENCY — Israeli Shekels only.
   - The price_range field MUST be in Israeli Shekels (ILS), formatted with the ₪ symbol. Examples: "₪150", "₪250-350".
   - Never use $, USD, EUR, GBP, or any other currency symbol or code anywhere in the output. If a source quotes a non-ILS price, convert it to ILS using a recent approximate exchange rate before returning.

2. PRIMARY PRICE SOURCE — Israeli retailers, wineroute.co.il first.
   - When searching for pricing, search "wineroute.co.il" first (this is דרך היין / The Wine Route, an Israeli wine retailer chain). If a price is listed there, use it for price_range.
   - If not found on wineroute.co.il, fall back to other Israeli wine retailer sites, then general web search — but always output the price in ILS/₪.
   - In extra_notes, briefly note where the price came from (e.g. "Price from דרך היין" or "Price from another Israeli retailer" or "Price converted from USD via general web search").

3. KOSHER-FRIENDLY FOOD PAIRINGS — the user keeps kosher.
   The food_pairings field MUST EXCLUDE:
     - Pork and pork products (bacon, prosciutto, ham, chorizo, pancetta, etc.)
     - Shellfish and crustaceans (shrimp, lobster, crab, oysters, mussels, clams, scallops, etc.)
     - Game meats (deer, venison, wild boar, rabbit, etc.)
     - Any combination of meat and dairy (no "ribeye with blue cheese", no "lamb with yogurt sauce", no cream-based sauces on meat dishes, etc.) — meat dishes get non-dairy accompaniments only.
   Use kosher-appropriate alternatives instead: beef, lamb, poultry, fish with fins and scales (salmon, tuna, sea bass, branzino, etc.), pasta, grains, legumes, vegetables. Hard cheeses are fine with non-meat dishes (pasta, vegetables, fruit).

4. PRODUCT IMAGE — find a clean bottle shot.
   - Use web_search to find a product photograph of the bottle for the product_image_url field.
   - The image MUST show the full bottle on a clean white or neutral background — a professional product/retailer shot, NOT a closeup of just the label, NOT a lifestyle/restaurant photo, NOT a vineyard scene.
   - Prefer, in order: the producer's official website, wineroute.co.il, vivino.com, then other reputable wine retailers.
   - Return the direct URL to the image file (the image source URL, not the page URL).
   - If you cannot confidently find a clean product shot of THIS exact wine (matching producer, name, and ideally vintage), return null. Do not guess, do not substitute a generic wine image, and do not return a label closeup.`;

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
  const t = v.trim();
  return t === "" ? null : t;
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
    food_pairings: coerceString(o.food_pairings),
    drinking_window: coerceString(o.drinking_window),
    extra_notes: coerceString(o.extra_notes),
    product_image_url: coerceUrl(o.product_image_url),
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

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "record_wine") {
      return normalizeAi(block.input);
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

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (upErr) {
    return { ok: false, error: `Image upload failed: ${upErr.message}` };
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const labelUrl = pub.publicUrl;

  const base64 = Buffer.from(buffer).toString("base64");

  let ai: AiWine;
  try {
    ai = await identifyWine(base64, contentType);
  } catch (err) {
    console.error("[wine-id] Identification failed after retries:", err);
    await sb.storage.from(BUCKET).remove([path]);
    return {
      ok: false,
      error: "AI service is temporarily busy. Please try again in a minute.",
    };
  }

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
