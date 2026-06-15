import type { Rater } from "./types";

// The two fixed raters, in display order.
export const RATERS: { id: Rater; label: string; initial: string }[] = [
  { id: "yahli", label: "Yahli", initial: "Y" },
  { id: "liza", label: "Liza", initial: "L" },
];

// Fixed taste-tag set (slug + display label). Tap-to-toggle chips.
export const TASTE_TAGS: { slug: string; label: string }[] = [
  { slug: "fruity", label: "Fruity" },
  { slug: "floral", label: "Floral" },
  { slug: "oaky", label: "Oaky" },
  { slug: "spicy", label: "Spicy" },
  { slug: "earthy", label: "Earthy" },
  { slug: "herbal", label: "Herbal" },
  { slug: "tannic", label: "Tannic" },
  { slug: "acidic", label: "Acidic" },
  { slug: "smooth", label: "Smooth" },
  { slug: "dry", label: "Dry" },
  { slug: "sweet", label: "Sweet" },
  { slug: "full-bodied", label: "Full-bodied" },
  { slug: "light", label: "Light" },
];

export const TASTE_TAG_SLUGS = new Set(TASTE_TAGS.map((t) => t.slug));
const TASTE_TAG_LABELS = new Map(TASTE_TAGS.map((t) => [t.slug, t.label]));

export function tagLabel(slug: string): string {
  return TASTE_TAG_LABELS.get(slug) ?? slug;
}

export const SCORE_MIN = 1;
export const SCORE_MAX = 5;
export const SCORE_STEP = 0.5;

// Valid score: a number in [1, 5] that is a multiple of 0.5.
export function isValidScore(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isFinite(n) &&
    n >= SCORE_MIN &&
    n <= SCORE_MAX &&
    Number.isInteger(n * 2)
  );
}

// Display: whole numbers as "4", half-points as "4.5".
export function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
