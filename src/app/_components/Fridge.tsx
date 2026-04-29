"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SHELVES, SLOTS_PER_SHELF } from "@/lib/fridge";
import type { Wine, WineColor } from "@/lib/types";
import {
  addBottleFromPhoto,
  deleteWine,
  updateWine,
  type WineUpdate,
} from "../actions";

const COLOR_FILL: Record<string, string> = {
  red: "#5a1521",
  white: "#c4b260",
  rose: "#d99ba3",
  sparkling: "#3d3520",
  unknown: "#6b5544",
};

const COLOR_DOT: Record<string, string> = {
  red: "#5a1521",
  white: "#c4b260",
  rose: "#d99ba3",
  sparkling: "#3d3520",
  unknown: "#6b5544",
};

const COLOR_LABEL: Record<string, string> = {
  red: "Red",
  white: "White",
  rose: "Rosé",
  sparkling: "Sparkling",
};

const COLOR_OPTIONS: WineColor[] = ["red", "white", "rose", "sparkling"];

const INPUT_CLASS =
  "w-full rounded-lg bg-cream border border-border-soft px-3 py-2 text-sm text-text-deep placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta transition-[border,box-shadow] duration-150 ease-out";

const FIELD_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted";

function colorFill(color: string | null) {
  if (!color) return COLOR_FILL.unknown;
  return COLOR_FILL[color] ?? COLOR_FILL.unknown;
}

async function downscaleImage(
  file: File,
  maxDim = 1600,
  quality = 0.82,
): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", quality),
    );
    if (!blob) return file;
    return new File(
      [blob],
      file.name.replace(/\.[^.]+$/, "") + ".jpg",
      { type: "image/jpeg" },
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function WineGlassIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7 3h10l-1 6a4 4 0 0 1-8 0Z" />
      <path d="M12 15v5" />
      <path d="M9 20h6" />
    </svg>
  );
}

type ModalState =
  | { kind: "none" }
  | { kind: "view"; wine: Wine }
  | { kind: "add"; shelf: number; position: number };

export default function Fridge({ wines }: { wines: Wine[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const slotMap = new Map<string, Wine>();
  for (const w of wines) {
    if (w.shelf !== null && w.position !== null) {
      slotMap.set(`${w.shelf}:${w.position}`, w);
    }
  }

  const filledCount = slotMap.size;
  const colorCounts: Record<string, number> = {};
  for (const w of slotMap.values()) {
    const key = w.color ?? "unknown";
    colorCounts[key] = (colorCounts[key] ?? 0) + 1;
  }

  function close() {
    if (pending) return;
    setErrorMsg(null);
    setModal({ kind: "none" });
  }

  async function handleAdd(fd: FormData) {
    setErrorMsg(null);
    setPending(true);
    try {
      const res = await addBottleFromPhoto(fd);
      if (res.ok) {
        setModal({ kind: "none" });
        router.refresh();
      } else {
        setErrorMsg(res.error);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function handleUpdate(id: string, fields: WineUpdate) {
    setErrorMsg(null);
    setPending(true);
    try {
      const res = await updateWine(id, fields);
      if (res.ok) {
        setModal({ kind: "none" });
        router.refresh();
      } else {
        setErrorMsg(res.error);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    setErrorMsg(null);
    setPending(true);
    try {
      await deleteWine(id);
      setModal({ kind: "none" });
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full flex flex-col items-center gap-6">
      {/* Cabinet */}
      <div
        className="w-full rounded-2xl p-3 sm:p-4"
        style={{
          background:
            "linear-gradient(180deg, #5c3a22 0%, #3d2817 55%, #2a1810 100%)",
          boxShadow:
            "0 22px 40px -18px rgba(42, 24, 16, 0.45), 0 2px 0 rgba(255, 255, 255, 0.04) inset",
        }}
      >
        <div
          className="relative rounded-xl px-2 sm:px-3 py-3 sm:py-4"
          style={{
            background: "#1f1408",
            backgroundImage:
              "radial-gradient(120% 60% at 50% 0%, rgba(244, 184, 96, 0.08) 0%, rgba(244, 184, 96, 0) 60%)",
            boxShadow:
              "inset 0 8px 24px rgba(0, 0, 0, 0.55), inset 0 -2px 6px rgba(0, 0, 0, 0.4)",
          }}
        >
          {/* Brass plaque */}
          <div className="flex justify-center pt-1 pb-3">
            <div
              className="px-3 py-1 rounded-sm text-[10px] font-bold tracking-[0.32em]"
              style={{
                background:
                  "linear-gradient(180deg, #d9a85a 0%, #b8893d 55%, #8a6529 100%)",
                color: "#2a1810",
                boxShadow:
                  "0 1px 0 rgba(255, 255, 255, 0.25) inset, 0 1px 2px rgba(0, 0, 0, 0.5)",
              }}
            >
              CELLAR
            </div>
          </div>

          <div className="flex flex-col gap-0">
            {Array.from({ length: SHELVES }).map((_, shelfIdx) => {
              const shelf = shelfIdx + 1;
              const isLast = shelfIdx === SHELVES - 1;
              return (
                <div key={shelf} className="flex flex-col">
                  <div className="grid grid-cols-4 gap-1.5 sm:gap-2 px-1 pb-2.5">
                    {Array.from({ length: SLOTS_PER_SHELF }).map((_, posIdx) => {
                      const position = posIdx + 1;
                      const wine = slotMap.get(`${shelf}:${position}`);
                      return (
                        <Slot
                          key={position}
                          wine={wine}
                          onClick={() => {
                            if (wine) {
                              setModal({ kind: "view", wine });
                            } else {
                              setModal({ kind: "add", shelf, position });
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                  {!isLast && (
                    <div
                      className="h-px mx-1 mb-2.5"
                      style={{
                        background:
                          "linear-gradient(90deg, rgba(184, 137, 61, 0) 0%, rgba(184, 137, 61, 0.7) 20%, rgba(217, 168, 90, 0.9) 50%, rgba(184, 137, 61, 0.7) 80%, rgba(184, 137, 61, 0) 100%)",
                        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.55)",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div
        className="w-full rounded-xl px-5 py-4 sm:px-6 sm:py-5 flex flex-wrap items-center justify-between gap-4"
        style={{
          background: "var(--cream-card)",
          borderBottom: "2px solid var(--terracotta)",
          boxShadow: "0 4px 18px -8px rgba(42, 24, 16, 0.18)",
        }}
      >
        <div className="flex items-baseline gap-2">
          <span
            className="text-3xl sm:text-4xl text-text-deep"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {filledCount}
          </span>
          <span
            className="italic text-sm sm:text-base text-text-muted"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            of 28 bottles
          </span>
        </div>
        {filledCount > 0 && (
          <div className="flex flex-wrap gap-3 text-xs text-text-muted">
            {Object.entries(colorCounts).map(([color, count]) => (
              <span key={color} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: COLOR_DOT[color] ?? COLOR_DOT.unknown,
                    boxShadow: "0 0 0 1px rgba(42, 24, 16, 0.08)",
                  }}
                />
                <span className="font-medium text-text-deep">{count}</span>
                <span>{COLOR_LABEL[color] ?? "Unknown"}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {modal.kind === "view" && (
        <Modal onClose={close}>
          <EditWineForm
            wine={modal.wine}
            pending={pending}
            errorMsg={errorMsg}
            onClose={close}
            onSave={(fields) => handleUpdate(modal.wine.id, fields)}
            onDelete={() => handleDelete(modal.wine.id)}
          />
        </Modal>
      )}

      {modal.kind === "add" && (
        <Modal onClose={close} progress={pending}>
          <AddPhotoForm
            shelf={modal.shelf}
            position={modal.position}
            pending={pending}
            errorMsg={errorMsg}
            onClose={close}
            onSubmit={handleAdd}
          />
        </Modal>
      )}
    </div>
  );
}

function Slot({ wine, onClick }: { wine: Wine | undefined; onClick: () => void }) {
  if (wine) {
    const hasPhoto = !!wine.label_image_url;
    return (
      <div className="relative group">
        <button
          type="button"
          onClick={onClick}
          aria-label={`View ${wine.name}`}
          className="bottle-in block w-full aspect-[1/2.4] rounded-md overflow-hidden transition-[transform,box-shadow,filter] duration-150 ease-out hover:-translate-y-0.5"
          style={{
            border: "1px solid rgba(232, 217, 184, 0.4)",
            boxShadow: "0 3px 8px -2px rgba(20, 10, 4, 0.55)",
          }}
        >
          {hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={wine.label_image_url!}
              alt={wine.name}
              className="block w-full h-full object-cover transition-[filter] duration-150 ease-out group-hover:brightness-110"
            />
          ) : (
            <div
              className="w-full h-full flex flex-col items-center justify-center px-1 text-center"
              style={{
                backgroundColor: colorFill(wine.color),
                color: "rgba(253, 246, 232, 0.92)",
              }}
            >
              <WineGlassIcon className="w-5 h-5 opacity-80" />
              <span
                className="mt-1 text-[8px] leading-tight line-clamp-3 px-0.5"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {wine.name}
              </span>
            </div>
          )}
        </button>

        {/* Tooltip — desktop only */}
        <div
          role="tooltip"
          className="hidden sm:block pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full z-20 whitespace-nowrap rounded-full px-3 py-1.5 text-xs italic opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out"
          style={{
            background: "var(--cream-card)",
            color: "var(--text-deep)",
            border: "1px solid var(--border-soft)",
            boxShadow: "0 6px 16px -6px rgba(42, 24, 16, 0.35)",
            fontFamily: "var(--font-serif)",
          }}
        >
          {wine.name}
          {wine.region ? <span className="text-text-muted"> · {wine.region}</span> : null}
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add bottle"
      className="group w-full aspect-[1/2.4] rounded-md flex items-center justify-center transition-[border-color,background-color,color] duration-150 ease-out"
      style={{
        border: "1.5px dashed rgba(184, 137, 61, 0.35)",
        color: "rgba(232, 217, 184, 0.45)",
        backgroundColor: "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(244, 184, 96, 0.7)";
        e.currentTarget.style.backgroundColor = "rgba(244, 184, 96, 0.06)";
        e.currentTarget.style.color = "rgba(244, 184, 96, 0.9)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(184, 137, 61, 0.35)";
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = "rgba(232, 217, 184, 0.45)";
      }}
    >
      <span className="text-lg leading-none font-light">+</span>
    </button>
  );
}

function Modal({
  onClose,
  progress = false,
  children,
}: {
  onClose: () => void;
  progress?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center sm:p-6"
      style={{ backgroundColor: "rgba(42, 24, 16, 0.6)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-md max-h-[100vh] sm:max-h-[90vh] overflow-y-auto rounded-none sm:rounded-xl"
        style={{
          background: "var(--cream-card)",
          color: "var(--text-deep)",
          boxShadow: "0 24px 60px -16px rgba(42, 24, 16, 0.55)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {progress && (
          <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden rounded-t-xl">
            <div
              className="progress-bar h-full w-1/4"
              style={{ background: "var(--terracotta)" }}
            />
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:text-text-deep hover:bg-cream transition-colors duration-150 ease-out"
        >
          <span className="text-base leading-none">✕</span>
        </button>
        <div className="px-4 sm:px-6 py-6 sm:py-7">{children}</div>
      </div>
    </div>
  );
}

function AddPhotoForm({
  shelf,
  position,
  pending,
  errorMsg,
  onClose,
  onSubmit,
}: {
  shelf: number;
  position: number;
  pending: boolean;
  errorMsg: string | null;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || pending) return;
    let toUpload: File = file;
    try {
      toUpload = await downscaleImage(file);
    } catch {
      toUpload = file;
    }
    const fd = new FormData();
    fd.set("photo", toUpload);
    fd.set("shelf", String(shelf));
    fd.set("position", String(position));
    onSubmit(fd);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2
          className="text-2xl sm:text-3xl text-text-deep"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Add a bottle
        </h2>
        <p
          className="italic text-sm text-text-muted"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Shelf {shelf} · Slot {position}
        </p>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={pending}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="sr-only"
        id="wine-photo-input"
      />

      {previewUrl ? (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Selected wine label"
            className="w-full max-h-72 object-contain rounded-lg bg-cream"
            style={{ boxShadow: "0 8px 22px -10px rgba(42, 24, 16, 0.4)" }}
          />
          {!pending && (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="self-start text-xs italic text-text-muted hover:text-terracotta transition-colors duration-150 ease-out"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Choose a different photo
            </button>
          )}
        </div>
      ) : (
        <label
          htmlFor="wine-photo-input"
          className="flex flex-col items-center justify-center gap-2 rounded-lg cursor-pointer text-center px-6 py-10 transition-colors duration-150 ease-out hover:bg-cream"
          style={{
            border: "2px dashed var(--terracotta)",
            color: "var(--text-muted)",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-7 h-7"
            style={{ color: "var(--terracotta)" }}
            aria-hidden="true"
          >
            <rect x="3" y="6" width="18" height="14" rx="2" />
            <circle cx="12" cy="13" r="4" />
            <path d="M8 6l1.5-2h5L16 6" />
          </svg>
          <span className="text-sm text-text-deep">
            Tap to take a photo or upload
          </span>
          <span
            className="italic text-xs text-text-muted"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            We&apos;ll read the label for you
          </span>
        </label>
      )}

      {errorMsg && (
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            background: "rgba(200, 85, 61, 0.1)",
            border: "1px solid rgba(200, 85, 61, 0.35)",
            color: "var(--terracotta-hover)",
          }}
        >
          {errorMsg}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-full px-4 py-2.5 text-sm text-text-muted hover:text-text-deep hover:bg-cream transition-colors duration-150 ease-out disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || !file}
          className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-cream transition-colors duration-150 ease-out disabled:opacity-50"
          style={{ background: pending ? "var(--terracotta-hover)" : "var(--terracotta)" }}
          onMouseEnter={(e) => {
            if (!pending && file)
              e.currentTarget.style.background = "var(--terracotta-hover)";
          }}
          onMouseLeave={(e) => {
            if (!pending) e.currentTarget.style.background = "var(--terracotta)";
          }}
        >
          {pending && <Spinner />}
          {pending ? "Reading the label…" : "Identify this wine"}
        </button>
      </div>
    </form>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-3.5 h-3.5 animate-spin"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeOpacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type EditState = {
  name: string;
  store: string;
  producer: string;
  vintage: string;
  region: string;
  country: string;
  grape: string;
  color: string;
  tasting_notes: string;
  price_range: string;
  food_pairings: string;
  drinking_window: string;
  extra_notes: string;
};

function wineToEditState(wine: Wine): EditState {
  return {
    name: wine.name ?? "",
    store: wine.store ?? "",
    producer: wine.producer ?? "",
    vintage: wine.vintage !== null ? String(wine.vintage) : "",
    region: wine.region ?? "",
    country: wine.country ?? "",
    grape: wine.grape ?? "",
    color: wine.color ?? "",
    tasting_notes: wine.tasting_notes ?? "",
    price_range: wine.price_range ?? "",
    food_pairings: wine.food_pairings ?? "",
    drinking_window: wine.drinking_window ?? "",
    extra_notes: wine.extra_notes ?? "",
  };
}

function diffToUpdate(initial: EditState, current: EditState): WineUpdate {
  const out: WineUpdate = {};
  if (current.name !== initial.name) out.name = current.name.trim();
  if (current.store !== initial.store) out.store = current.store.trim() || null;
  if (current.producer !== initial.producer)
    out.producer = current.producer.trim() || null;
  if (current.vintage !== initial.vintage) {
    const v = current.vintage.trim();
    out.vintage = v === "" ? null : Number(v);
  }
  if (current.region !== initial.region) out.region = current.region.trim() || null;
  if (current.country !== initial.country)
    out.country = current.country.trim() || null;
  if (current.grape !== initial.grape) out.grape = current.grape.trim() || null;
  if (current.color !== initial.color)
    out.color = (current.color || null) as WineUpdate["color"];
  if (current.tasting_notes !== initial.tasting_notes)
    out.tasting_notes = current.tasting_notes.trim() || null;
  if (current.price_range !== initial.price_range)
    out.price_range = current.price_range.trim() || null;
  if (current.food_pairings !== initial.food_pairings)
    out.food_pairings = current.food_pairings.trim() || null;
  if (current.drinking_window !== initial.drinking_window)
    out.drinking_window = current.drinking_window.trim() || null;
  if (current.extra_notes !== initial.extra_notes)
    out.extra_notes = current.extra_notes.trim() || null;
  return out;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="italic text-sm text-text-muted pt-1"
      style={{ fontFamily: "var(--font-serif)" }}
    >
      {children}
    </h3>
  );
}

function EditWineForm({
  wine,
  pending,
  errorMsg,
  onSave,
  onDelete,
  onClose,
}: {
  wine: Wine;
  pending: boolean;
  errorMsg: string | null;
  onSave: (fields: WineUpdate) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const initialRef = useRef<EditState>(wineToEditState(wine));
  const [state, setState] = useState<EditState>(initialRef.current);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set<K extends keyof EditState>(key: K, value: EditState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const update = diffToUpdate(initialRef.current, state);
    if (Object.keys(update).length === 0) {
      onClose();
      return;
    }
    onSave(update);
  }

  function handleDeleteClick() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete();
  }

  const slotLabel =
    wine.shelf !== null && wine.position !== null
      ? `Shelf ${wine.shelf} · Slot ${wine.position}`
      : "—";

  const subtitleParts = [state.producer, state.region].filter((s) => s.trim());

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {wine.label_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={wine.label_image_url}
          alt={`${wine.name} label`}
          className="w-full max-h-[280px] object-cover rounded-lg"
          style={{ boxShadow: "0 10px 28px -12px rgba(42, 24, 16, 0.4)" }}
        />
      )}

      <header className="flex flex-col gap-1 pr-8">
        <h2
          className="text-2xl sm:text-3xl text-text-deep leading-tight"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {state.name || "Untitled"}
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

      <Field label="Name">
        <input
          value={state.name}
          required
          onChange={(e) => set("name", e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Color">
          <div className="relative">
            <select
              value={state.color}
              onChange={(e) => set("color", e.target.value)}
              className={`${INPUT_CLASS} pl-7 appearance-none`}
            >
              <option value="">— Unknown</option>
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {COLOR_LABEL[c]}
                </option>
              ))}
            </select>
            <span
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full pointer-events-none"
              style={{
                backgroundColor: COLOR_DOT[state.color] ?? COLOR_DOT.unknown,
                boxShadow: "0 0 0 1px rgba(42, 24, 16, 0.1)",
              }}
            />
          </div>
        </Field>
        <Field label="Vintage">
          <input
            type="number"
            inputMode="numeric"
            value={state.vintage}
            onChange={(e) => set("vintage", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      <Field label="Producer">
        <input
          value={state.producer}
          onChange={(e) => set("producer", e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>

      <SectionTitle>Notes &amp; origin</SectionTitle>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Region">
          <input
            value={state.region}
            onChange={(e) => set("region", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Country">
          <input
            value={state.country}
            onChange={(e) => set("country", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      <Field label="Grape">
        <input
          value={state.grape}
          onChange={(e) => set("grape", e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Price range">
          <input
            value={state.price_range}
            onChange={(e) => set("price_range", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Store">
          <input
            value={state.store}
            onChange={(e) => set("store", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      <SectionTitle>Tasting</SectionTitle>

      <Field label="Drinking window">
        <input
          value={state.drinking_window}
          onChange={(e) => set("drinking_window", e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>

      <Field label="Tasting notes">
        <textarea
          rows={3}
          value={state.tasting_notes}
          onChange={(e) => set("tasting_notes", e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>

      <Field label="Food pairings">
        <textarea
          rows={2}
          value={state.food_pairings}
          onChange={(e) => set("food_pairings", e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>

      <Field label="Extra notes">
        <textarea
          rows={2}
          value={state.extra_notes}
          onChange={(e) => set("extra_notes", e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>

      <SectionTitle>Position</SectionTitle>
      <p className="text-xs text-text-muted -mt-3">{slotLabel}</p>

      {errorMsg && (
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            background: "rgba(200, 85, 61, 0.1)",
            border: "1px solid rgba(200, 85, 61, 0.35)",
            color: "var(--terracotta-hover)",
          }}
        >
          {errorMsg}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-2">
        <button
          type="button"
          onClick={handleDeleteClick}
          onBlur={() => setConfirmDelete(false)}
          disabled={pending}
          className="rounded-full px-4 py-2.5 text-sm border transition-colors duration-150 ease-out disabled:opacity-50"
          style={{
            background: confirmDelete ? "var(--terracotta)" : "transparent",
            color: confirmDelete ? "var(--cream)" : "var(--terracotta)",
            borderColor: "var(--terracotta)",
          }}
        >
          {pending ? "…" : confirmDelete ? "Click again to confirm" : "Delete"}
        </button>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-full px-4 py-2.5 text-sm text-text-muted hover:text-text-deep hover:bg-cream transition-colors duration-150 ease-out disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-cream transition-colors duration-150 ease-out disabled:opacity-50"
            style={{ background: "var(--terracotta)" }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.background = "var(--terracotta-hover)";
            }}
            onMouseLeave={(e) => {
              if (!pending) e.currentTarget.style.background = "var(--terracotta)";
            }}
          >
            {pending && <Spinner />}
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
