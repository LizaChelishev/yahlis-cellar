"use client";

import { useState } from "react";
import type { ArchivedWine, Rater, WineRating } from "@/lib/types";
import {
  formatScore,
  RATERS,
  SCORE_MAX,
  SCORE_MIN,
  SCORE_STEP,
  TASTE_TAGS,
} from "@/lib/ratings";
import { saveArchivedRatings } from "../actions";
import { LABEL_CAPS_CLASS, Modal } from "./wine-visuals";

type Form = {
  score: number | null;
  tags: string[];
  note: string;
  wouldBuyAgain: boolean | null;
};

function toForm(r: WineRating | null): Form {
  return {
    score: r?.score ?? null,
    tags: r?.tags ?? [],
    note: r?.note ?? "",
    wouldBuyAgain: r?.would_buy_again ?? null,
  };
}

// Order-independent signature for change detection.
function sig(f: Form): string {
  return JSON.stringify({
    s: f.score,
    t: [...f.tags].sort(),
    n: f.note.trim(),
    w: f.wouldBuyAgain,
  });
}

export default function RatingEditor({
  archived,
  heading,
  onClose,
  onSaved,
}: {
  archived: ArchivedWine;
  heading: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Snapshot of the ratings as the editor opened, for change detection.
  // Lazy useState (not a ref) so it's stable without reading ref.current
  // during render.
  const [initial] = useState<Record<Rater, Form>>(() => ({
    yahli: toForm(archived.yahli_rating),
    liza: toForm(archived.liza_rating),
  }));
  const [forms, setForms] = useState<Record<Rater, Form>>(initial);
  const [active, setActive] = useState<Rater>("yahli");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = forms[active];

  function setField(partial: Partial<Form>) {
    setForms((prev) => ({ ...prev, [active]: { ...prev[active], ...partial } }));
  }

  function toggleTag(slug: string) {
    setField({
      tags: form.tags.includes(slug)
        ? form.tags.filter((t) => t !== slug)
        : [...form.tags, slug],
    });
  }

  const subtitleParts = [archived.producer, archived.region].filter(
    (s): s is string => !!s && s.trim().length > 0,
  );

  async function handleSave() {
    if (saving) return;
    const payload: Partial<Record<Rater, unknown>> = {};
    for (const { id } of RATERS) {
      if (sig(forms[id]) !== sig(initial[id])) {
        const f = forms[id];
        payload[id] =
          f.score === null
            ? null
            : {
                score: f.score,
                tags: f.tags,
                note: f.note,
                would_buy_again: f.wouldBuyAgain,
              };
      }
    }
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    const res = await saveArchivedRatings(archived.id, payload);
    if (res.ok) {
      onSaved();
    } else {
      setSaving(false);
      setError(res.error || "Couldn't save rating — try again");
    }
  }

  const fillPct =
    (((form.score ?? 3) - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100;

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col px-5 sm:px-8 pt-7 sm:pt-9 safe-pb gap-6">
        {/* Header */}
        <header className="flex flex-col gap-1 pr-9">
          <p className={LABEL_CAPS_CLASS}>{heading}</p>
          <h2
            className="text-2xl sm:text-[28px] font-semibold text-text-deep leading-tight"
            style={{ fontFamily: "var(--font-serif)", fontWeight: 600 }}
          >
            {archived.name || "Untitled"}
          </h2>
          {subtitleParts.length > 0 && (
            <p
              className="italic text-sm text-text-muted"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {subtitleParts.join(" · ")}
            </p>
          )}
        </header>

        {/* Rater selector */}
        <div
          role="tablist"
          aria-label="Whose rating"
          className="inline-flex self-start p-1 rounded-full"
          style={{
            background: "var(--surface-subtle)",
            border: "1px solid var(--border-soft)",
          }}
        >
          {RATERS.map(({ id, label }) => {
            const isActive = active === id;
            const hasScore = forms[id].score !== null;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(id)}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150 ease-out min-h-[36px]"
                style={{
                  background: isActive ? "#ffffff" : "transparent",
                  color: isActive ? "var(--terracotta)" : "var(--text-muted)",
                  boxShadow: isActive
                    ? "0 2px 8px -4px var(--shadow-warm-strong)"
                    : "none",
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "manipulation",
                }}
              >
                {label}
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{
                    background: hasScore
                      ? "var(--terracotta)"
                      : "var(--border-soft)",
                  }}
                />
              </button>
            );
          })}
        </div>

        {/* Score */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className={LABEL_CAPS_CLASS}>Score</span>
            <span
              className="text-text-deep leading-none"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {form.score === null ? (
                <span className="text-base italic text-text-muted">
                  Not rated yet
                </span>
              ) : (
                <>
                  <span className="text-3xl sm:text-4xl">
                    {formatScore(form.score)}
                  </span>
                  <span className="text-base text-text-muted"> / 5</span>
                </>
              )}
            </span>
          </div>
          <input
            type="range"
            min={SCORE_MIN}
            max={SCORE_MAX}
            step={SCORE_STEP}
            value={form.score ?? 3}
            onChange={(e) => setField({ score: parseFloat(e.target.value) })}
            className="score-range"
            style={{ ["--score-fill" as string]: `${fillPct}%` }}
            aria-label="Score, 1 to 5 in half-point steps"
          />
          <div className="flex justify-between text-[11px] text-text-muted px-0.5">
            <span>1</span>
            <span>5</span>
          </div>
        </div>

        {/* Taste tags */}
        <div className="flex flex-col gap-2">
          <span className={LABEL_CAPS_CLASS}>Taste</span>
          <div className="flex flex-wrap gap-1.5">
            {TASTE_TAGS.map(({ slug, label }) => {
              const on = form.tags.includes(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(slug)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-out min-h-[34px]"
                  style={{
                    background: on ? "var(--terracotta)" : "#ffffff",
                    color: on ? "#ffffff" : "var(--text-deep)",
                    border: `1px solid ${on ? "var(--terracotta)" : "var(--border-soft)"}`,
                    WebkitTapHighlightColor: "transparent",
                    touchAction: "manipulation",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Would buy again */}
        <div className="flex flex-col gap-2">
          <span className={LABEL_CAPS_CLASS}>Would buy again?</span>
          <div className="flex gap-2">
            {[
              { val: true, label: "Yes" },
              { val: false, label: "No" },
            ].map(({ val, label }) => {
              const on = form.wouldBuyAgain === val;
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setField({ wouldBuyAgain: on ? null : val })}
                  className="rounded-full px-5 py-2 text-sm font-medium transition-colors duration-150 ease-out min-h-[44px]"
                  style={{
                    background: on ? "var(--terracotta)" : "#ffffff",
                    color: on ? "#ffffff" : "var(--text-deep)",
                    border: `1px solid ${on ? "var(--terracotta)" : "var(--border-soft)"}`,
                    WebkitTapHighlightColor: "transparent",
                    touchAction: "manipulation",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Note */}
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_CAPS_CLASS}>Note</span>
          <textarea
            rows={2}
            value={form.note}
            onChange={(e) => setField({ note: e.target.value })}
            placeholder="A few words…"
            className="w-full rounded-lg bg-white border border-border-soft px-3 py-2 text-sm text-text-deep placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta transition-[border,box-shadow] duration-150 ease-out"
          />
        </label>

        {error && (
          <div
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              background: "rgba(200, 85, 61, 0.08)",
              border: "1px solid rgba(200, 85, 61, 0.3)",
              color: "var(--terracotta-hover)",
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-sm text-text-muted hover:text-text-deep transition-colors duration-150 ease-out disabled:opacity-50 px-2 py-2.5"
          >
            {heading === "Rate this wine?" ? "Skip" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white transition-colors duration-150 ease-out disabled:opacity-50 min-h-[44px]"
            style={{
              background: saving
                ? "var(--terracotta-hover)"
                : "var(--terracotta)",
            }}
          >
            {saving ? "Saving…" : "Save rating"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
