export type WineColor = "red" | "white" | "rose" | "sparkling";

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
// emptied from the cabinet.
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
};
