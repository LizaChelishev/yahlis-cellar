"use client";

import { useId, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import type { ArchivedWine, Rater, WineRating } from "@/lib/types";
import { formatScore, RATERS, tagLabel } from "@/lib/ratings";
import RatingEditor from "./RatingEditor";
import {
  bottleTint,
  BottleSilhouette,
  Chip,
  COLOR_DOT,
  COLOR_LABEL,
  Hero,
  initialHeroTier,
  LABEL_CAPS_CLASS,
  Modal,
  nextHeroTier,
  WineGlassIcon,
  type HeroTier,
} from "./wine-visuals";

// ── Grouping repeat bottles ────────────────────────────────────────────────
//
// archived_wines holds one row per finished bottle and finishWine() always
// inserts, so drinking the same wine twice leaves two rows. Those aren't
// accidental duplicates — each is a real tasting occasion with its own date and
// its own two ratings — so the rows stay untouched and we merge at render time:
// one card per wine, the occurrences kept underneath.

type WineGroup = {
  key: string;
  // Newest finished first; `representative` is always occurrences[0].
  occurrences: ArchivedWine[];
  representative: ArchivedWine;
};

// trim → lowercase → collapse internal runs of whitespace.
function normalize(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Names the identification pipeline writes when it cannot read a label, with
// every other field forced to null (see the record_wine fallback and
// normalizeAi in actions.ts). These are "we don't know what this is" markers,
// not wine names.
const UNIDENTIFIED_NAMES = new Set([
  "unknown wine",
  "unknown wine - label unclear",
]);

// A row carrying a placeholder name and nothing else to match on has no
// identity at all, so there is nothing it could legitimately be grouped by.
// Narrow on purpose: a placeholder name alongside a real producer or vintage
// still has something to match on and groups normally.
function isUnidentified(wine: ArchivedWine): boolean {
  return (
    UNIDENTIFIED_NAMES.has(normalize(wine.name)) &&
    normalize(wine.producer) === "" &&
    wine.vintage === null
  );
}

// Exact match on name + producer + vintage, no fuzzy matching. JSON.stringify
// rather than joining on a delimiter: any delimiter we picked could occur
// inside a wine name, and silently merging two different wines is the worst
// failure available here. A null producer normalizes to "" so it groups with a
// blank one but never with a named one; a null vintage is its own bucket and
// never a wildcard.
//
// Unidentified rows are the exception, and they key on their own id so each
// stands alone. Two bottles the AI couldn't read share a placeholder name and
// a pile of nulls, which under a plain exact match is indistinguishable from
// the same wine drunk twice — it would merge unrelated bottles today and fold
// every future unreadable label into the same ever-growing card.
function groupKeyOf(wine: ArchivedWine): string {
  if (isUnidentified(wine)) {
    // Two elements, so this can never collide with a real three-part key.
    return JSON.stringify(["unidentified", wine.id]);
  }
  return JSON.stringify([
    normalize(wine.name),
    normalize(wine.producer),
    wine.vintage,
  ]);
}

function finishedDesc(a: ArchivedWine, b: ArchivedWine): number {
  return new Date(b.finished_at).getTime() - new Date(a.finished_at).getTime();
}

// Identical finished_at is possible (two bottles finished in one sitting), so
// fall through to id — otherwise the representative would depend on the order
// the rows happened to arrive in.
function occurrenceOrder(a: ArchivedWine, b: ArchivedWine): number {
  return finishedDesc(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function buildGroups(archived: ArchivedWine[]): WineGroup[] {
  const byKey = new Map<string, ArchivedWine[]>();
  for (const wine of archived) {
    const key = groupKeyOf(wine);
    const rows = byKey.get(key);
    if (rows) rows.push(wine);
    else byKey.set(key, [wine]);
  }
  return [...byKey].map(([key, rows]) => {
    const occurrences = [...rows].sort(occurrenceOrder);
    return { key, occurrences, representative: occurrences[0] };
  });
}

// Small Y / L badges showing which raters have rated (filled = rated). Takes
// the occurrences rather than one row so a badge fills when that rater rated
// any tasting of the wine, not just the most recent one.
function RatedBadges({ occurrences }: { occurrences: ArchivedWine[] }) {
  const ratedBy: Record<Rater, boolean> = {
    yahli: occurrences.some((o) => o.yahli_rating != null),
    liza: occurrences.some((o) => o.liza_rating != null),
  };
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {RATERS.map(({ id, initial }) => {
        const rated = ratedBy[id];
        return (
          <span
            key={id}
            title={`${id === "yahli" ? "Yahli" : "Liza"}: ${rated ? "rated" : "not rated"}`}
            className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-semibold"
            style={{
              background: rated ? "var(--terracotta)" : "transparent",
              color: rated ? "#ffffff" : "var(--text-muted)",
              border: rated ? "none" : "1px solid var(--border-soft)",
            }}
          >
            {initial}
          </span>
        );
      })}
    </div>
  );
}

function formatFinished(iso: string): string {
  // Fixed en-US format so server and client render identically (no hydration drift).
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Compact thumbnail with the same product → label → silhouette fallback as the
// detail Hero, sized for the archive grid.
function ArchiveThumb({ wine }: { wine: ArchivedWine }) {
  const [tier, setTier] = useState<HeroTier>(() => initialHeroTier(wine));
  // The card is keyed by group key, so a newly finished occurrence can swap the
  // representative underneath this component without remounting it. Re-derive
  // the tier when the images actually change, or a stale fallback sticks.
  const heroSig = `${wine.product_image_url ?? ""}|${wine.label_image_url ?? ""}`;
  const [forHeroSig, setForHeroSig] = useState(heroSig);
  if (forHeroSig !== heroSig) {
    setForHeroSig(heroSig);
    setTier(initialHeroTier(wine));
  }
  const tint = bottleTint(wine.color);
  const advance = () => setTier((t) => nextHeroTier(t, wine));

  return (
    <div className="w-full aspect-[1/1.5] flex items-center justify-center overflow-hidden">
      {tier === "product" && wine.product_image_url ? (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{
            filter:
              "drop-shadow(0 6px 8px rgba(60, 40, 20, 0.12)) drop-shadow(0 1px 2px rgba(60, 40, 20, 0.08))",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={wine.product_image_url}
            alt={wine.name}
            onError={advance}
            className="block w-full h-full object-contain"
          />
        </div>
      ) : tier === "label" && wine.label_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={wine.label_image_url}
          alt={wine.name}
          onError={advance}
          className="block w-full h-full object-contain rounded-md"
        />
      ) : (
        <BottleSilhouette tint={tint} className="h-[78%] w-auto" />
      )}
    </div>
  );
}

function ArchiveCard({
  group,
  onClick,
}: {
  group: WineGroup;
  onClick: () => void;
}) {
  const wine = group.representative;
  const count = group.occurrences.length;
  // The date shown is the most recent tasting; the ×N badge says there are
  // earlier ones behind it.
  const meta = [
    wine.vintage !== null ? String(wine.vintage) : null,
    formatFinished(wine.finished_at),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        count > 1
          ? `View ${wine.name}, finished ${count} times`
          : `View ${wine.name}`
      }
      className="group flex flex-col text-left rounded-xl overflow-hidden bg-white transition-transform duration-150 ease-out hover:scale-[1.02] active:scale-[0.99]"
      style={{
        border: "1px solid var(--border-soft)",
        boxShadow: "0 4px 18px -12px var(--shadow-warm-strong)",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
    >
      {/* The badge hangs off this wrapper, not the thumb: the thumb's own box
          is overflow-hidden and would clip it. */}
      <div className="relative px-2 pt-2">
        <ArchiveThumb wine={wine} />
        {count > 1 && (
          <span
            aria-hidden="true"
            className="absolute top-3 right-3 inline-flex items-center justify-center h-5 min-w-[1.5rem] px-1.5 rounded-full text-[10px] font-semibold tabular-nums"
            style={{
              background: "var(--cream-card)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-soft)",
              boxShadow: "0 1px 4px -1px var(--shadow-warm-strong)",
            }}
          >
            ×{count}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 px-3 pb-3 pt-1">
        <span
          className="text-sm leading-snug text-text-deep line-clamp-2"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {wine.name}
        </span>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-text-muted">{meta}</span>
          <RatedBadges occurrences={group.occurrences} />
        </div>
      </div>
    </button>
  );
}

function ReadRow({ label, value }: { label: string; value: string | null }) {
  if (!value || !value.trim()) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className={LABEL_CAPS_CLASS}>{label}</span>
      <p className="text-sm text-text-deep whitespace-pre-line">{value.trim()}</p>
    </div>
  );
}

// Read-only display of one rater's tasting rating.
function RatingDisplay({
  label,
  rating,
}: {
  label: string;
  rating: WineRating | null;
}) {
  if (!rating) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-text-deep">{label}</span>
        <span className="text-xs italic text-text-muted">Not rated</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-text-deep">{label}</span>
        <span style={{ fontFamily: "var(--font-serif)" }}>
          <span className="text-xl text-text-deep">
            {formatScore(rating.score)}
          </span>
          <span className="text-xs text-text-muted"> / 5</span>
        </span>
      </div>
      {rating.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rating.tags.map((slug) => (
            <Chip key={slug}>{tagLabel(slug)}</Chip>
          ))}
        </div>
      )}
      {rating.would_buy_again !== null && (
        <p className="text-xs text-text-muted">
          Would buy again:{" "}
          <span className="text-text-deep">
            {rating.would_buy_again ? "Yes" : "No"}
          </span>
        </p>
      )}
      {rating.note?.trim() && (
        <p className="text-sm text-text-deep whitespace-pre-line">
          {rating.note.trim()}
        </p>
      )}
    </div>
  );
}

// One tasting occasion inside a multi-occurrence history: its own date, its own
// two ratings, its own edit button writing to its own row.
function TastingEntry({
  wine,
  onEdit,
}: {
  wine: ArchivedWine;
  onEdit: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg px-3.5 py-3.5"
      style={{ border: "1px solid var(--border-soft)" }}
    >
      <div className="flex items-center gap-2 text-sm text-text-deep">
        <WineGlassIcon className="w-4 h-4 shrink-0 text-text-muted" />
        <span>{formatFinished(wine.finished_at)}</span>
      </div>
      <div className="flex flex-col gap-4">
        <RatingDisplay label="Yahli" rating={wine.yahli_rating} />
        <RatingDisplay label="Liza" rating={wine.liza_rating} />
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-text-muted transition-colors duration-150 ease-out min-h-[44px] hover:text-terracotta"
        style={{
          border: "1px solid var(--border-soft)",
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
      >
        {wine.yahli_rating || wine.liza_rating
          ? "Add/edit rating"
          : "Add a rating"}
      </button>
    </div>
  );
}

function ArchiveDetail({
  group,
  onClose,
  onEditRating,
}: {
  group: WineGroup;
  onClose: () => void;
  onEditRating: (occurrence: ArchivedWine) => void;
}) {
  // Everything static — name, images, origin, notes, price, slot — comes from
  // the representative; none of it changes between tastings.
  const wine = group.representative;
  const { occurrences } = group;
  const count = occurrences.length;

  const [heroTier, setHeroTier] = useState<HeroTier>(() => initialHeroTier(wine));
  // Same staleness guard as ArchiveThumb: the modal is driven by group key, so
  // the representative can change underneath it without a remount.
  const heroSig = `${wine.product_image_url ?? ""}|${wine.label_image_url ?? ""}`;
  const [forHeroSig, setForHeroSig] = useState(heroSig);
  if (forHeroSig !== heroSig) {
    setForHeroSig(heroSig);
    setHeroTier(initialHeroTier(wine));
  }
  const advanceHeroTier = () => setHeroTier((t) => nextHeroTier(t, wine));

  const subtitleParts = [wine.producer, wine.region].filter(
    (s): s is string => !!s && s.trim().length > 0,
  );
  const colorChip = wine.color || null;
  const slotLabel =
    wine.shelf !== null && wine.position !== null
      ? `Shelf ${wine.shelf} · Slot ${wine.position}`
      : "—";

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col">
        <Hero wine={wine} tier={heroTier} onAdvance={advanceHeroTier} />

        {wine.label_image_url && heroTier === "product" && (
          <div className="px-5 sm:px-8 pt-3 flex items-center justify-end gap-2.5">
            <span
              className="italic text-[11px] text-text-muted"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Your photo
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={wine.label_image_url}
              alt="Your photo of the bottle"
              className="w-12 h-12 rounded-md object-cover"
              style={{
                border: "1px solid var(--border-soft)",
                boxShadow: "0 2px 6px rgba(60, 40, 20, 0.08)",
              }}
            />
          </div>
        )}

        {/* Heading */}
        <div className="flex flex-col gap-2 px-5 sm:px-8 pt-4 pb-1">
          <h2
            className="text-2xl sm:text-[28px] font-semibold text-text-deep leading-tight pr-9"
            style={{ fontFamily: "var(--font-serif)", fontWeight: 600 }}
          >
            {wine.name || "Untitled"}
          </h2>
          {subtitleParts.length > 0 && (
            <p
              className="italic text-sm text-text-muted"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {subtitleParts.join(" · ")}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {colorChip && (
              <Chip dotColor={COLOR_DOT[colorChip] ?? COLOR_DOT.unknown}>
                {COLOR_LABEL[colorChip] ?? colorChip}
              </Chip>
            )}
            {wine.price_range?.trim() && <Chip>{wine.price_range.trim()}</Chip>}
            {wine.country?.trim() && <Chip>{wine.country.trim()}</Chip>}
            {wine.vintage !== null && <Chip>{String(wine.vintage)}</Chip>}
          </div>
          {wine.price_range?.trim() && wine.price_source?.trim() && (
            <p
              className="italic text-[11px] text-text-muted"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              from {wine.price_source.trim()}
            </p>
          )}
        </div>

        {/* Read-only details */}
        <div className="flex flex-col gap-5 px-5 sm:px-8 pt-5 safe-pb">
          <div
            className="rounded-lg px-3 py-2.5 flex items-center gap-2 text-sm"
            style={{
              background: "rgba(200, 85, 61, 0.06)",
              border: "1px solid rgba(200, 85, 61, 0.2)",
              color: "var(--terracotta-hover)",
            }}
          >
            <WineGlassIcon className="w-4 h-4 shrink-0" />
            <span>
              {count > 1
                ? `Finished ${count} times`
                : `Finished ${formatFinished(wine.finished_at)}`}
            </span>
          </div>

          {(wine.region || wine.country || wine.grape) && (
            <>
              <div className={`${LABEL_CAPS_CLASS} pt-1`}>Origin &amp; Notes</div>
              <ReadRow label="Region" value={wine.region} />
              <ReadRow label="Country" value={wine.country} />
              <ReadRow label="Grape" value={wine.grape} />
            </>
          )}

          {(wine.drinking_window ||
            wine.tasting_notes ||
            wine.food_pairings ||
            wine.extra_notes) && (
            <>
              <div className={`${LABEL_CAPS_CLASS} pt-1`}>Tasting</div>
              <ReadRow label="Drinking window" value={wine.drinking_window} />
              <ReadRow label="Tasting notes" value={wine.tasting_notes} />
              <ReadRow label="Food pairings" value={wine.food_pairings} />
              <ReadRow label="Extra notes" value={wine.extra_notes} />
            </>
          )}

          <ReadRow label="Store" value={wine.store} />

          {/* Ratings. One tasting keeps the original single block — the common
              case shouldn't look different just because the feature exists. */}
          {count === 1 ? (
            <>
              <div className={`${LABEL_CAPS_CLASS} pt-1`}>Ratings</div>
              <div className="flex flex-col gap-4 -mt-2">
                <RatingDisplay label="Yahli" rating={wine.yahli_rating} />
                <RatingDisplay label="Liza" rating={wine.liza_rating} />
              </div>
              <button
                type="button"
                onClick={() => onEditRating(wine)}
                className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-text-muted transition-colors duration-150 ease-out min-h-[44px] hover:text-terracotta"
                style={{ border: "1px solid var(--border-soft)" }}
              >
                <WineGlassIcon className="w-4 h-4" />
                {wine.yahli_rating || wine.liza_rating
                  ? "Add/edit rating"
                  : "Add a rating"}
              </button>
            </>
          ) : (
            <>
              <div className={`${LABEL_CAPS_CLASS} pt-1`}>Tasting history</div>
              <div className="flex flex-col gap-3 -mt-2">
                {occurrences.map((occurrence) => (
                  <TastingEntry
                    key={occurrence.id}
                    wine={occurrence}
                    onEdit={() => onEditRating(occurrence)}
                  />
                ))}
              </div>
            </>
          )}

          <div className={`${LABEL_CAPS_CLASS} pt-1`}>Position</div>
          <p className="text-xs text-text-muted -mt-3">{slotLabel}</p>

          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-text-muted hover:text-text-deep transition-colors duration-150 ease-out px-2 py-2.5"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Filtering and sorting ──────────────────────────────────────────────────

type RatedFilter = "all" | "rated" | "unrated";
// The two raters are kept apart here on purpose: the archive exists so each of
// them can see what the other liked, so collapsing them into one "would buy
// again" would throw away the distinction the data is built around.
type BuyFilter = "all" | "yahli" | "liza" | "either" | "both";
type SortKey = "newest" | "score-yahli" | "score-liza";

// Canonical colour order, borrowed from COLOR_LABEL so the filter stays in step
// with the labels the rest of the UI uses.
const CANONICAL_COLORS = Object.keys(COLOR_LABEL);

const SORT_RATER: Record<Exclude<SortKey, "newest">, Rater> = {
  "score-yahli": "yahli",
  "score-liza": "liza",
};

// ArchivedWine.color is `string | null`, not the WineColor union — it can be
// null, blank, or something the AI produced that we never anticipated. "" means
// "no colour recorded", which never matches a specific colour option.
function colorKey(wine: ArchivedWine): string {
  return wine.color?.trim() ?? "";
}

function ratingOf(wine: ArchivedWine, rater: Rater): WineRating | null {
  return rater === "yahli" ? wine.yahli_rating : wine.liza_rating;
}

// Filters run over groups, not rows, so every predicate below aggregates the
// occurrences. Colour is the exception: it reads the representative only,
// because that's the chip the card shows — matching any occurrence would let a
// group match "White" while displaying a red chip.
//
// Rated is deliberately group-level and complementary: a group counts as rated
// if any occurrence carries a rating, and as not-yet-rated only if none does.
// Written as "any occurrence matches the filter" instead, a group with one
// rated and one unrated tasting would satisfy both options at once.
function groupIsRated(group: WineGroup): boolean {
  return group.occurrences.some(
    (o) => o.yahli_rating != null || o.liza_rating != null,
  );
}

// `=== true` on purpose: would_buy_again is `boolean | null`, and null is "no
// opinion recorded", which is not the same as a "no". Aggregated per rater
// first — one yes across any tasting is a yes for that rater — so Either and
// Both compose from the per-rater answers rather than from single rows.
function groupBuysAgain(group: WineGroup, rater: Rater): boolean {
  return group.occurrences.some(
    (o) => ratingOf(o, rater)?.would_buy_again === true,
  );
}

function matchesBuyFilter(group: WineGroup, filter: BuyFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "either":
      return (
        groupBuysAgain(group, "yahli") || groupBuysAgain(group, "liza")
      );
    case "both":
      return groupBuysAgain(group, "yahli") && groupBuysAgain(group, "liza");
    default:
      return groupBuysAgain(group, filter);
  }
}

// The score from the most recent occurrence that rater actually rated — their
// latest opinion, not their best or their first. occurrences is newest-first,
// so the first hit wins.
function groupScore(group: WineGroup, rater: Rater): number | null {
  for (const occurrence of group.occurrences) {
    const rating = ratingOf(occurrence, rater);
    if (rating) return rating.score;
  }
  return null;
}

// occurrences[0] is the most recent tasting, so the representative carries the
// group's finished_at for ordering purposes.
function groupFinishedDesc(a: WineGroup, b: WineGroup): number {
  return finishedDesc(a.representative, b.representative);
}

// Always returns a new array — the `archived` prop is never sorted in place.
function sortGroups(list: WineGroup[], sort: SortKey): WineGroup[] {
  if (sort === "newest") return [...list].sort(groupFinishedDesc);

  const rater = SORT_RATER[sort];
  return [...list].sort((a, b) => {
    const scoreA = groupScore(a, rater);
    const scoreB = groupScore(b, rater);
    // Wines this rater never scored sink below the scored ones rather than
    // counting as a zero, and hold newest-first order among themselves.
    if (scoreA === null || scoreB === null) {
      if (scoreA === null && scoreB === null) return groupFinishedDesc(a, b);
      return scoreA === null ? 1 : -1;
    }
    return scoreB - scoreA || groupFinishedDesc(a, b);
  });
}

// Native <select> so iOS gives us its picker, plus keyboard and screen-reader
// behaviour, for free. Only the chrome is restyled to match the cream/terracotta
// system, since the stock control looks wildly different across platforms.
function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={id} className={LABEL_CAPS_CLASS}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-full bg-cream-card pl-3.5 pr-9 py-2 text-sm text-text-deep min-h-[44px] transition-colors duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-terracotta/40"
        style={{
          border: "1px solid var(--border-soft)",
          // Chevron has to be a data URI, which can't read --terracotta, so the
          // hex is repeated here.
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5 11 1.5' fill='none' stroke='%23c8553d' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.85rem center",
          backgroundSize: "0.7rem",
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
      >
        {children}
      </select>
    </div>
  );
}

// Sliders glyph for the Filters pill.
function SlidersIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 4.5h6.5M12.6 4.5H14M2 11.5h1.4M7.5 11.5H14" />
      <circle cx="10.5" cy="4.5" r="1.7" />
      <circle cx="5.4" cy="11.5" r="1.7" />
    </svg>
  );
}

// One compact row: the pill that opens the panel, and the filtered count. Kept
// to a single 44px control so the grid stays high on a phone screen.
function FilterBar({
  activeCount,
  adjusted,
  onOpen,
  panelOpen,
  shown,
  total,
}: {
  activeCount: number;
  adjusted: boolean;
  onOpen: () => void;
  panelOpen: boolean;
  shown: number;
  total: number;
}) {
  return (
    <div className="w-full flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        className="inline-flex items-center gap-2 rounded-full px-4 text-sm font-medium min-h-[44px] transition-colors duration-150 ease-out"
        style={{
          background: adjusted ? "var(--terracotta)" : "var(--cream-card)",
          color: adjusted ? "#ffffff" : "var(--text-muted)",
          border: `1px solid ${adjusted ? "var(--terracotta)" : "var(--border-soft)"}`,
          boxShadow: adjusted
            ? "0 2px 8px -4px var(--shadow-warm-strong)"
            : "none",
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
      >
        <SlidersIcon className="w-4 h-4 shrink-0" />
        Filters
        {activeCount > 0 && (
          <span
            className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[11px] font-semibold"
            style={{ background: "rgba(255, 255, 255, 0.24)", color: "#ffffff" }}
          >
            {activeCount}
          </span>
        )}
      </button>

      <span className="text-[11px] text-text-muted shrink-0" aria-live="polite">
        {shown} of {total}
      </span>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="w-full flex flex-col items-center text-center gap-3 py-14 text-text-muted">
      <WineGlassIcon className="w-8 h-8" />
      <p
        className="italic text-base text-text-muted"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        No bottles match these filters
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-1 inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm text-text-muted transition-colors duration-150 ease-out min-h-[44px] hover:text-terracotta"
        style={{
          border: "1px solid var(--border-soft)",
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
      >
        Clear filters
      </button>
    </div>
  );
}

export default function Archive({ archived }: { archived: ArchivedWine[] }) {
  const router = useRouter();
  // Identifiers, not object snapshots. RatingEditor's onSaved triggers
  // router.refresh(), and a captured row or group would keep rendering the
  // ratings as they were before the save. Resolving an id against the current
  // `archived` prop on every render means refreshed data flows straight
  // through — which is also what lets the detail modal stay open across a save.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filter and sort state is deliberately local: it's a way of looking at the
  // list, not something worth surviving a tab switch or a refresh.
  const [colorFilter, setColorFilter] = useState("all");
  const [ratedFilter, setRatedFilter] = useState<RatedFilter>("all");
  const [buyFilter, setBuyFilter] = useState<BuyFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [panelOpen, setPanelOpen] = useState(false);

  // Only the three filters count here — sort changes the order, not the set, so
  // it never contributes to a number labelled "Filters".
  const activeFilterCount =
    (colorFilter !== "all" ? 1 : 0) +
    (ratedFilter !== "all" ? 1 : 0) +
    (buyFilter !== "all" ? 1 : 0);
  // A non-default sort still lights the pill, so a surprising order always has
  // something on screen explaining itself.
  const viewAdjusted = activeFilterCount > 0 || sort !== "newest";

  // Resets the filters only, matching what the button says. Sort is left alone.
  function clearFilters() {
    setColorFilter("all");
    setRatedFilter("all");
    setBuyFilter("all");
  }

  // One group per wine; everything below this line works in groups, not rows.
  const groups = buildGroups(archived);

  // A stale key (the group's rows vanished under a refresh) resolves to null
  // and simply renders no modal, rather than crashing or showing an empty one.
  const selectedGroup =
    (selectedKey !== null && groups.find((g) => g.key === selectedKey)) || null;
  const editingWine =
    (editingId !== null && archived.find((w) => w.id === editingId)) || null;

  // Only offer colours that actually appear, canonical ones first and anything
  // unexpected after, so the list is stable and never has dead options. Read
  // off representatives, matching what the colour filter actually tests.
  const presentColors = new Set(
    groups.map((g) => colorKey(g.representative)).filter((c) => c !== ""),
  );
  const colorOptions = [
    ...CANONICAL_COLORS.filter((c) => presentColors.has(c)),
    ...[...presentColors].filter((c) => !CANONICAL_COLORS.includes(c)).sort(),
  ];

  // Filter first, then sort the survivors, so the order is over the visible set
  // rather than the whole archive.
  const filtered = groups.filter((group) => {
    if (colorFilter !== "all" && colorKey(group.representative) !== colorFilter)
      return false;
    const rated = groupIsRated(group);
    if (ratedFilter === "rated" && !rated) return false;
    if (ratedFilter === "unrated" && rated) return false;
    if (!matchesBuyFilter(group, buyFilter)) return false;
    return true;
  });
  const visible = sortGroups(filtered, sort);

  // Naming the tasting in the heading: "Tasting rating" alone doesn't say which
  // occasion you're editing once there's a history to pick from.
  const editingHeading =
    editingWine && selectedGroup && selectedGroup.occurrences.length > 1
      ? `Tasting rating · ${formatFinished(editingWine.finished_at)}`
      : "Tasting rating";

  if (archived.length === 0) {
    return (
      <div className="w-full flex flex-col items-center text-center gap-3 py-16 text-text-muted">
        <WineGlassIcon className="w-8 h-8" />
        <p
          className="italic text-base text-text-muted"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          No finished bottles yet
        </p>
        <p className="text-xs text-text-muted max-w-[16rem]">
          When you finish a bottle, mark it as finished and it&apos;ll be kept here.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center gap-5 sm:gap-6">
      <div className={`${LABEL_CAPS_CLASS} -mb-1`}>Finished</div>

      <FilterBar
        activeCount={activeFilterCount}
        adjusted={viewAdjusted}
        onOpen={() => setPanelOpen(true)}
        panelOpen={panelOpen}
        shown={visible.length}
        total={groups.length}
      />

      {visible.length > 0 ? (
        <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {visible.map((group) => (
            <ArchiveCard
              key={group.key}
              group={group}
              onClick={() => setSelectedKey(group.key)}
            />
          ))}
        </div>
      ) : (
        <NoMatches onClear={clearFilters} />
      )}

      {panelOpen && (
        // Backdrop dismiss is right here: tapping away from a filter panel is
        // the expected way out and discards nothing.
        <Modal onClose={() => setPanelOpen(false)}>
          <div className="flex flex-col gap-5 px-5 sm:px-8 pt-7 sm:pt-9 safe-pb">
            <p className={`${LABEL_CAPS_CLASS} pr-9`}>Filter &amp; sort</p>

            <FilterSelect
              label="Colour"
              value={colorFilter}
              onChange={setColorFilter}
            >
              <option value="all">All</option>
              {colorOptions.map((c) => (
                <option key={c} value={c}>
                  {COLOR_LABEL[c] ?? c}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              label="Rating"
              value={ratedFilter}
              onChange={(v) => setRatedFilter(v as RatedFilter)}
            >
              <option value="all">All</option>
              <option value="rated">Rated</option>
              <option value="unrated">Not yet rated</option>
            </FilterSelect>

            <FilterSelect
              label="Would buy again"
              value={buyFilter}
              onChange={(v) => setBuyFilter(v as BuyFilter)}
            >
              <option value="all">All</option>
              {RATERS.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
              <option value="either">Either</option>
              <option value="both">Both</option>
            </FilterSelect>

            <FilterSelect
              label="Sort"
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
            >
              <option value="newest">Newest first</option>
              {RATERS.map(({ id, label }) => (
                <option key={id} value={`score-${id}`}>
                  {`${label}'s score, high to low`}
                </option>
              ))}
            </FilterSelect>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={clearFilters}
                disabled={activeFilterCount === 0}
                className="text-sm text-text-muted transition-colors duration-150 ease-out hover:text-text-deep disabled:opacity-50 px-2 py-2.5 min-h-[44px]"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                Clear filters
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-terracotta-hover min-h-[44px]"
                style={{
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "manipulation",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* The detail modal stays selected while the editor is open — it's just
          not rendered underneath it — so closing or saving the editor comes
          back here instead of dumping you out to the grid. With a button per
          tasting, ejecting after every save would make rating a history a
          chore. */}
      {selectedGroup && !editingWine && (
        <ArchiveDetail
          group={selectedGroup}
          onClose={() => setSelectedKey(null)}
          onEditRating={(occurrence) => setEditingId(occurrence.id)}
        />
      )}

      {editingWine && (
        <RatingEditor
          // Keyed by row so switching tastings re-reads the initial ratings
          // rather than reusing the previous occurrence's snapshot.
          key={editingWine.id}
          archived={editingWine}
          heading={editingHeading}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            flushSync(() => setEditingId(null));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
