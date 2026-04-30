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
