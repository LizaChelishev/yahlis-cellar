"use client";

import { useState } from "react";
import { updateArchivedWines } from "../actions";
import { LABEL_CAPS_CLASS, Modal } from "./wine-visuals";

const INPUT_CLASS =
  "w-full rounded-lg bg-white border border-border-soft px-3 py-2 text-sm text-text-deep placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta transition-[border,box-shadow] duration-150 ease-out";

export type ArchivedWineIdentity = {
  name: string;
  producer: string | null;
  vintage: number | null;
};

// Corrects the three fields that decide which card a finished bottle belongs
// to. Scope is deliberately narrow: everything else on an archived row is
// read-only, and widening this form would make it a general editor rather than
// a way to fix a misread label.
export default function ArchivedWineEditor({
  ids,
  initial,
  onClose,
  onSaved,
}: {
  ids: string[];
  initial: ArchivedWineIdentity;
  onClose: () => void;
  // Partial: only the fields actually submitted come back, which is exactly
  // what the caller spreads over the representative to recompute its key.
  onSaved: (saved: Partial<ArchivedWineIdentity>) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [producer, setProducer] = useState(initial.producer ?? "");
  const [vintage, setVintage] = useState(
    initial.vintage === null ? "" : String(initial.vintage),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (saving) return;
    // Catch the empty name here as well as in the action, so the common slip
    // doesn't need a server round-trip to report.
    if (!name.trim()) {
      setError("Name cannot be empty");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await updateArchivedWines(ids, { name, producer, vintage });
    if (!res.ok) {
      setSaving(false);
      setError(res.error || "Couldn't save changes — try again");
      return;
    }

    // The action hands back what it actually wrote, so the group key is
    // recomputed from the stored values rather than from a second copy of the
    // coercion rules here.
    onSaved(res.saved);
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col px-5 sm:px-8 pt-7 sm:pt-9 safe-pb gap-5">
        {/* Header */}
        <header className="flex flex-col gap-1 pr-9">
          <p className={LABEL_CAPS_CLASS}>Edit details</p>
          <h2
            className="text-2xl sm:text-[28px] font-semibold text-text-deep leading-tight"
            style={{ fontFamily: "var(--font-serif)", fontWeight: 600 }}
          >
            {initial.name || "Untitled"}
          </h2>
          <p className="text-xs text-text-muted">
            {ids.length > 1
              ? `Applies to all ${ids.length} bottles of this wine`
              : "Name, producer and vintage decide which card this bottle sits on"}
          </p>
        </header>

        <label className="flex flex-col gap-1.5">
          <span className={LABEL_CAPS_CLASS}>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Wine name"
            autoComplete="off"
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={LABEL_CAPS_CLASS}>Producer</span>
          <input
            type="text"
            value={producer}
            onChange={(e) => setProducer(e.target.value)}
            placeholder="Optional"
            autoComplete="off"
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={LABEL_CAPS_CLASS}>Vintage</span>
          <input
            // inputMode numeric rather than type="number": this is a PWA on a
            // phone, and it gets the digit keypad without the spinner and
            // scroll-to-change behaviour a number input brings on desktop.
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={vintage}
            onChange={(e) => setVintage(e.target.value)}
            placeholder="Optional"
            autoComplete="off"
            className={INPUT_CLASS}
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
            Cancel
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
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
