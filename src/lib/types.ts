export type WineColor = "red" | "white" | "rose" | "sparkling";

// The two fixed, named raters. Kept separate, never merged.
export type Rater = "yahli" | "liza";

// One rater's tasting rating, stored as a jsonb blob on the archived row.
// score is 1–5 in 0.5 steps. A null blob means that rater hasn't rated.
export type WineRating = {
  score: number;
  tags: string[];
  note: string | null;
  would_buy_again: boolean | null;
  rated_at: string;
};

export type Wine = {
  id: string;
  created_at: string;
  name: string;
  store: string | null;
  producer: string | null;
  region: string | null;
  country: string | null;
  vintage: number | null;
  grape: string | null;
  color: string | null;
  tasting_notes: string | null;
  price_range: string | null;
  price_source: string | null;
  food_pairings: string | null;
  drinking_window: string | null;
  extra_notes: string | null;
  label_image_url: string | null;
  product_image_url: string | null;
  shelf: number | null;
  position: number | null;
};

// A finished bottle, archived out of the cabinet. Mirrors the display columns
// of Wine (so it can be passed straight to the shared detail UI) and adds the
// time it was finished. shelf/position are the slot it occupied before it was
// emptied from the cabinet. yahli_rating/liza_rating are the two separate
// tasting ratings (null when that rater hasn't rated).
export type ArchivedWine = {
  id: string;
  created_at: string;
  finished_at: string;
  name: string;
  store: string | null;
  producer: string | null;
  region: string | null;
  country: string | null;
  vintage: number | null;
  grape: string | null;
  color: string | null;
  tasting_notes: string | null;
  price_range: string | null;
  price_source: string | null;
  food_pairings: string | null;
  drinking_window: string | null;
  extra_notes: string | null;
  label_image_url: string | null;
  product_image_url: string | null;
  shelf: number | null;
  position: number | null;
  yahli_rating: WineRating | null;
  liza_rating: WineRating | null;
};
