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

// Small Y / L badges showing which raters have rated (filled = rated).
function RatedBadges({ wine }: { wine: ArchivedWine }) {
  const ratedBy: Record<Rater, boolean> = {
    yahli: wine.yahli_rating != null,
    liza: wine.liza_rating != null,
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
  wine,
  onClick,
}: {
  wine: ArchivedWine;
  onClick: () => void;
}) {
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
      aria-label={`View ${wine.name}`}
      className="group flex flex-col text-left rounded-xl overflow-hidden bg-white transition-transform duration-150 ease-out hover:scale-[1.02] active:scale-[0.99]"
      style={{
        border: "1px solid var(--border-soft)",
        boxShadow: "0 4px 18px -12px var(--shadow-warm-strong)",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
    >
      <div className="px-2 pt-2">
        <ArchiveThumb wine={wine} />
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
          <RatedBadges wine={wine} />
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

function ArchiveDetail({
  wine,
  onClose,
  onEditRating,
}: {
  wine: ArchivedWine;
  onClose: () => void;
  onEditRating: () => void;
}) {
  const [heroTier, setHeroTier] = useState<HeroTier>(() => initialHeroTier(wine));
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
            <span>Finished {formatFinished(wine.finished_at)}</span>
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

          {/* Ratings */}
          <div className={`${LABEL_CAPS_CLASS} pt-1`}>Ratings</div>
          <div className="flex flex-col gap-4 -mt-2">
            <RatingDisplay label="Yahli" rating={wine.yahli_rating} />
            <RatingDisplay label="Liza" rating={wine.liza_rating} />
          </div>
          <button
            type="button"
            onClick={onEditRating}
            className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-text-muted transition-colors duration-150 ease-out min-h-[44px] hover:text-terracotta"
            style={{ border: "1px solid var(--border-soft)" }}
          >
            <WineGlassIcon className="w-4 h-4" />
            {wine.yahli_rating || wine.liza_rating
              ? "Add/edit rating"
              : "Add a rating"}
          </button>

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

// ── Filtering ──────────────────────────────────────────────────────────────

type RatedFilter = "all" | "rated" | "unrated";
type BuyFilter = "all" | "yes";

// Canonical colour order, borrowed from COLOR_LABEL so the filter stays in step
// with the labels the rest of the UI uses.
const CANONICAL_COLORS = Object.keys(COLOR_LABEL);

// ArchivedWine.color is `string | null`, not the WineColor union — it can be
// null, blank, or something the AI produced that we never anticipated. "" means
// "no colour recorded", which never matches a specific colour option.
function colorKey(wine: ArchivedWine): string {
  return wine.color?.trim() ?? "";
}

// Mirrors RatedBadges: a bottle counts as rated once either rater has scored it.
function isRated(wine: ArchivedWine): boolean {
  return wine.yahli_rating != null || wine.liza_rating != null;
}

// `=== true` on purpose: would_buy_again is `boolean | null`, and null is "no
// opinion recorded", which is not the same as a "no".
function wouldBuyAgain(wine: ArchivedWine): boolean {
  return (
    wine.yahli_rating?.would_buy_again === true ||
    wine.liza_rating?.would_buy_again === true
  );
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
  const [selected, setSelected] = useState<ArchivedWine | null>(null);
  const [editing, setEditing] = useState<ArchivedWine | null>(null);

  // Filter state is deliberately local: it's a way of looking at the list, not
  // something worth surviving a tab switch or a refresh.
  const [colorFilter, setColorFilter] = useState("all");
  const [ratedFilter, setRatedFilter] = useState<RatedFilter>("all");
  const [buyFilter, setBuyFilter] = useState<BuyFilter>("all");

  function clearFilters() {
    setColorFilter("all");
    setRatedFilter("all");
    setBuyFilter("all");
  }

  // Only offer colours that actually appear, canonical ones first and anything
  // unexpected after, so the list is stable and never has dead options.
  const presentColors = new Set(
    archived.map(colorKey).filter((c) => c !== ""),
  );
  const colorOptions = [
    ...CANONICAL_COLORS.filter((c) => presentColors.has(c)),
    ...[...presentColors].filter((c) => !CANONICAL_COLORS.includes(c)).sort(),
  ];

  // `archived` arrives newest-finished-first; filter() keeps that order.
  const filtered = archived.filter((wine) => {
    if (colorFilter !== "all" && colorKey(wine) !== colorFilter) return false;
    if (ratedFilter === "rated" && !isRated(wine)) return false;
    if (ratedFilter === "unrated" && isRated(wine)) return false;
    if (buyFilter === "yes" && !wouldBuyAgain(wine)) return false;
    return true;
  });

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

      <div className="w-full flex flex-col gap-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
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
            <option value="yes">Would buy again</option>
          </FilterSelect>
        </div>

        <p className="text-[11px] text-text-muted text-right" aria-live="polite">
          {filtered.length} of {archived.length}
        </p>
      </div>

      {filtered.length > 0 ? (
        <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((wine) => (
            <ArchiveCard
              key={wine.id}
              wine={wine}
              onClick={() => setSelected(wine)}
            />
          ))}
        </div>
      ) : (
        <NoMatches onClear={clearFilters} />
      )}

      {selected && (
        <ArchiveDetail
          wine={selected}
          onClose={() => setSelected(null)}
          onEditRating={() => {
            // Replace the detail modal with the rating editor.
            const wine = selected;
            flushSync(() => setSelected(null));
            setEditing(wine);
          }}
        />
      )}

      {editing && (
        <RatingEditor
          archived={editing}
          heading="Tasting rating"
          onClose={() => setEditing(null)}
          onSaved={() => {
            flushSync(() => setEditing(null));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
