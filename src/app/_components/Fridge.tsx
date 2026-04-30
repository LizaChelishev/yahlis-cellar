"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { SHELVES, SLOTS_PER_SHELF } from "@/lib/fridge";
import type { Wine, WineColor } from "@/lib/types";
import {
  addBottleFromPhoto,
  deleteWine,
  updateWine,
  type WineUpdate,
} from "../actions";

const COLOR_DOT: Record<string, string> = {
  red: "#7a1f2b",
  white: "#d8c373",
  rose: "#e0a4ad",
  sparkling: "#d4b97a",
  unknown: "#b8ad96",
};

const COLOR_LABEL: Record<string, string> = {
  red: "Red",
  white: "White",
  rose: "Rosé",
  sparkling: "Sparkling",
};

const COLOR_OPTIONS: WineColor[] = ["red", "white", "rose", "sparkling"];

const INPUT_CLASS =
  "w-full rounded-lg bg-white border border-border-soft px-3 py-2 text-sm text-text-deep placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta transition-[border,box-shadow] duration-150 ease-out";

const LABEL_CAPS_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted";

async function downscaleImage(
  file: File,
  maxDim = 2400,
  quality = 0.88,
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

function bottleTint(color: string | null): string {
  return COLOR_DOT[color ?? "unknown"] ?? COLOR_DOT.unknown;
}

function BottleSilhouette({
  tint,
  className = "",
}: {
  tint: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 80"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path
        fill={tint}
        d="M10 2 h4 v14 c0 1 0.6 2 1.4 3 C17 22 19 25 19 30 V70 c0 4 -2 6 -6 6 h-2 c-4 0 -6 -2 -6 -6 V30 c0 -5 2 -8 3.6 -11 c0.8 -1 1.4 -2 1.4 -3 z"
      />
    </svg>
  );
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

function CameraIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <circle cx="12" cy="13" r="4" />
      <path d="M8 6l1.5-2h5L16 6" />
    </svg>
  );
}

function Spinner({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} animate-spin`}
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

function ProcessingSlot() {
  return (
    <div
      role="status"
      aria-label="Identifying wine..."
      className="w-full min-w-0 aspect-[1/2.4] rounded-md flex items-center justify-center text-text-muted"
      style={{
        background: "#ffffff",
        border: "1px dashed var(--cabinet-frame-border)",
      }}
    >
      <Spinner className="w-5 h-5 pointer-events-none" />
    </div>
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
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const slotMap = new Map<string, Wine>();
  for (const w of wines) {
    if (w.shelf !== null && w.position !== null) {
      slotMap.set(`${w.shelf}:${w.position}`, w);
    }
  }

  useEffect(() => {
    setProcessing((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const key of prev) {
        const [s, p] = key.split("-");
        if (slotMap.has(`${s}:${p}`)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wines]);

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
    const shelf = fd.get("shelf");
    const position = fd.get("position");
    const slotKey = `${String(shelf)}-${String(position)}`;

    setErrorToast(null);
    setProcessing((prev) => {
      const next = new Set(prev);
      next.add(slotKey);
      return next;
    });

    flushSync(() => {
      setModal({ kind: "none" });
    });

    try {
      const res = await addBottleFromPhoto(fd);
      if (res.ok) {
        router.refresh();
        // useEffect on `wines` clears slotKey from `processing` once the row arrives.
      } else {
        setProcessing((prev) => {
          const next = new Set(prev);
          next.delete(slotKey);
          return next;
        });
        setErrorToast(res.error || "Couldn't identify wine — try again");
      }
    } catch (err) {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(slotKey);
        return next;
      });
      setErrorToast(
        err instanceof Error ? err.message : "Couldn't identify wine — try again",
      );
    }
  }

  async function handleUpdate(id: string, fields: WineUpdate) {
    setErrorMsg(null);
    setPending(true);
    try {
      const res = await updateWine(id, fields);
      if (res.ok) {
        flushSync(() => {
          setModal({ kind: "none" });
          setPending(false);
        });
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
      flushSync(() => {
        setModal({ kind: "none" });
        setPending(false);
      });
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full flex flex-col items-center gap-5 sm:gap-6">
      {errorToast && (
        <div
          className="w-full rounded-lg px-4 py-2.5 flex items-center justify-between text-sm"
          style={{
            background: "rgba(200, 85, 61, 0.08)",
            border: "1px solid rgba(200, 85, 61, 0.3)",
            color: "var(--terracotta-hover)",
          }}
          role="alert"
        >
          <span>{errorToast}</span>
          <button
            type="button"
            onClick={() => setErrorToast(null)}
            className="text-text-muted hover:text-text-deep ml-3 text-xs px-2 py-1"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Plaque (outside cabinet) */}
      <div className={`${LABEL_CAPS_CLASS} -mb-1`}>Cellar</div>

      {/* Cabinet */}
      <div
        className="w-full rounded-2xl p-3 sm:p-4"
        style={{
          background: "var(--cabinet-frame)",
          border: "1px solid var(--cabinet-frame-border)",
          boxShadow: "0 12px 28px -16px var(--shadow-warm-strong)",
        }}
      >
        <div
          className="rounded-xl px-2 sm:px-3 py-3 sm:py-4"
          style={{ background: "var(--cabinet-interior)" }}
        >
          <div className="flex flex-col">
            {Array.from({ length: SHELVES }).map((_, shelfIdx) => {
              const shelf = shelfIdx + 1;
              const isLast = shelfIdx === SHELVES - 1;
              return (
                <div key={shelf} className="flex flex-col">
                  <div
                    className="grid gap-1.5 sm:gap-2 px-1 pb-2.5"
                    style={{
                      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    }}
                  >
                    {Array.from({ length: SLOTS_PER_SHELF }).map((_, posIdx) => {
                      const position = posIdx + 1;
                      const wine = slotMap.get(`${shelf}:${position}`);
                      const isProcessing = processing.has(`${shelf}-${position}`);
                      return (
                        <div key={position} className="min-w-0 w-full">
                          <Slot
                            wine={wine}
                            processing={isProcessing}
                            shelf={shelf}
                            position={position}
                            onClick={() => {
                              if (wine) {
                                setModal({ kind: "view", wine });
                              } else if (!isProcessing) {
                                setModal({ kind: "add", shelf, position });
                              }
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {!isLast && (
                    <div
                      className="h-px mx-1 mb-2.5"
                      style={{ background: "var(--shelf-line)" }}
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
        className="w-full rounded-xl px-5 py-5 sm:px-7 sm:py-6 flex flex-wrap items-center justify-between gap-4"
        style={{
          background: "#ffffff",
          border: "1px solid var(--border-soft)",
          boxShadow: "0 4px 18px -10px var(--shadow-warm)",
        }}
      >
        <div className="flex items-baseline gap-2">
          <span
            className="text-3xl sm:text-4xl text-text-deep"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {filledCount} <span className="text-text-muted">/ 28</span>
          </span>
          <span className="text-sm text-text-muted">bottles</span>
        </div>
        {filledCount > 0 && (
          <div className="flex flex-wrap gap-3 text-xs text-text-muted">
            {Object.entries(colorCounts).map(([color, count]) => (
              <span key={color} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: COLOR_DOT[color] ?? COLOR_DOT.unknown,
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
        <Modal onClose={close}>
          <AddPhotoForm
            shelf={modal.shelf}
            position={modal.position}
            onClose={close}
            onSubmit={handleAdd}
          />
        </Modal>
      )}
    </div>
  );
}

function SilhouetteSlotContent({
  tint,
  name,
}: {
  tint: string;
  name: string;
}) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-1 gap-1 pointer-events-none">
      <div className="flex-1 min-h-0 w-full flex items-center justify-center pt-1 pointer-events-none">
        <BottleSilhouette
          tint={tint}
          className="h-full max-w-full pointer-events-none"
        />
      </div>
      <span
        className="italic text-[8px] leading-tight line-clamp-2 text-center text-text-muted pb-1 px-0.5 pointer-events-none"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {name}
      </span>
    </div>
  );
}

function ProductSlotContent({
  src,
  name,
  onImgError,
}: {
  src: string;
  name: string;
  onImgError: () => void;
}) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-1 gap-1 pointer-events-none">
      <div
        className="flex-1 min-h-0 w-full flex items-center justify-center pt-1 pointer-events-none"
        style={{
          filter:
            "drop-shadow(0 6px 8px rgba(60, 40, 20, 0.12)) drop-shadow(0 1px 2px rgba(60, 40, 20, 0.08))",
        }}
      >
        <div className="w-full h-full flex items-center justify-center overflow-hidden pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={name}
            onError={onImgError}
            className="block w-full h-full object-contain pointer-events-none"
            style={{ transform: "scale(1.35)", transformOrigin: "center" }}
          />
        </div>
      </div>
      <span
        className="italic text-[8px] leading-tight line-clamp-2 text-center text-text-muted pb-1 px-0.5 pointer-events-none"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {name}
      </span>
    </div>
  );
}

function FilledSlot({ wine, onClick }: { wine: Wine; onClick: () => void }) {
  const tint = bottleTint(wine.color);
  const [imgErrored, setImgErrored] = useState(false);
  const showImage = !!wine.product_image_url && !imgErrored;

  return (
    <div className="relative group">
      <div
        className="bottle-in relative block w-full min-w-0 aspect-[1/2.4] rounded-md overflow-hidden bg-white transition-transform duration-150 ease-out hover:scale-[1.03]"
      >
        {showImage ? (
          <ProductSlotContent
            src={wine.product_image_url!}
            name={wine.name}
            onImgError={() => setImgErrored(true)}
          />
        ) : (
          <SilhouetteSlotContent tint={tint} name={wine.name} />
        )}
        <button
          type="button"
          onClick={onClick}
          aria-label={`View ${wine.name}`}
          className="absolute inset-0 w-full h-full bg-transparent border-0 cursor-pointer z-10"
          style={{
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
          }}
        />
      </div>

      {/* Tooltip — desktop only */}
      <div
        role="tooltip"
        className="hidden sm:block pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full z-20 whitespace-nowrap rounded-full px-3 py-1.5 text-xs italic opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out"
        style={{
          background: "#ffffff",
          color: "var(--text-deep)",
          border: "1px solid var(--border-soft)",
          boxShadow: "0 6px 16px -8px var(--shadow-warm-strong)",
          fontFamily: "var(--font-serif)",
        }}
      >
        {wine.name}
        {wine.region ? <span className="text-text-muted"> · {wine.region}</span> : null}
      </div>
    </div>
  );
}

function Slot({
  wine,
  processing,
  shelf,
  position,
  onClick,
}: {
  wine: Wine | undefined;
  processing: boolean;
  shelf: number;
  position: number;
  onClick: () => void;
}) {
  if (wine) {
    return <FilledSlot wine={wine} onClick={onClick} />;
  }
  if (processing) {
    return <ProcessingSlot />;
  }
  return (
    <div
      className="relative group w-full min-w-0 aspect-[1/2.4] rounded-md flex items-center justify-center transition-colors duration-150 ease-out hover:[--plus-color:var(--terracotta)]"
      style={{
        background: "#ffffff",
        border: "1px dashed var(--cabinet-frame-border)",
        ["--plus-color" as string]: "#c9bda5",
      }}
    >
      <span
        className="text-base leading-none font-light transition-colors duration-150 ease-out pointer-events-none"
        style={{ color: "var(--plus-color)" }}
      >
        +
      </span>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Add bottle to shelf ${shelf}, position ${position}`}
        className="absolute inset-0 w-full h-full bg-transparent border-0 cursor-pointer z-10"
        style={{
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
      />
    </div>
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
      style={{ backgroundColor: "rgba(250, 246, 239, 0.8)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-md max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto rounded-none sm:rounded-2xl"
        style={{
          background: "#ffffff",
          color: "var(--text-deep)",
          boxShadow: "0 30px 70px -20px rgba(60, 40, 20, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {progress && (
          <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden rounded-t-2xl">
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
          className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full text-text-muted hover:text-text-deep hover:bg-cream transition-colors duration-150 ease-out"
        >
          <span className="text-base leading-none">✕</span>
        </button>
        {children}
      </div>
    </div>
  );
}

function AddPhotoForm({
  shelf,
  position,
  onClose,
  onSubmit,
}: {
  shelf: number;
  position: number;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
    if (!file || submitting) return;
    setSubmitting(true);
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
    // Parent unmounts the modal immediately after this returns; the form is gone.
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-6 px-5 sm:px-8 pt-7 sm:pt-9 safe-pb"
    >
      <header className="flex flex-col gap-1.5 pr-9">
        <h2
          className="text-2xl sm:text-3xl text-text-deep leading-tight"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Add a bottle
        </h2>
        <p className={LABEL_CAPS_CLASS}>
          Shelf {shelf} · Slot {position}
        </p>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={submitting}
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
            className="w-full max-h-72 object-contain rounded-lg bg-white"
            style={{ boxShadow: "0 8px 22px -12px rgba(60, 40, 20, 0.25)" }}
          />
          {!submitting && (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="self-start text-xs text-text-muted hover:text-terracotta transition-colors duration-150 ease-out"
            >
              Choose a different photo
            </button>
          )}
        </div>
      ) : (
        <label
          htmlFor="wine-photo-input"
          className="flex flex-col items-center justify-center gap-2 rounded-xl cursor-pointer text-center px-6 py-12 transition-colors duration-150 ease-out hover:bg-cream"
          style={{
            border: "1.5px dashed #c9bda5",
            color: "var(--text-muted)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--terracotta)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#c9bda5";
          }}
        >
          <CameraIcon className="w-7 h-7" />
          <span className="text-sm text-text-deep">Tap to take a photo</span>
          <span className="text-xs text-text-muted">
            We&apos;ll read the label for you
          </span>
        </label>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="text-sm text-text-muted hover:text-text-deep transition-colors duration-150 ease-out disabled:opacity-50 px-2 py-2.5"
        >
          Cancel
        </button>
        <SubmitButton pending={submitting} disabled={!file}>
          {submitting ? "Sending photo…" : "Identify this wine"}
        </SubmitButton>
      </div>
    </form>
  );
}

function ErrorAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-sm"
      style={{
        background: "rgba(200, 85, 61, 0.08)",
        border: "1px solid rgba(200, 85, 61, 0.3)",
        color: "var(--terracotta-hover)",
      }}
    >
      {children}
    </div>
  );
}

function SubmitButton({
  pending,
  disabled,
  children,
}: {
  pending: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white transition-colors duration-150 ease-out disabled:opacity-50 min-h-[44px]"
      style={{ background: pending ? "var(--terracotta-hover)" : "var(--terracotta)" }}
      onMouseEnter={(e) => {
        if (!pending && !disabled)
          e.currentTarget.style.background = "var(--terracotta-hover)";
      }}
      onMouseLeave={(e) => {
        if (!pending) e.currentTarget.style.background = "var(--terracotta)";
      }}
    >
      {pending && <Spinner />}
      {children}
    </button>
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
  price_source: string;
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
    price_source: wine.price_source ?? "",
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
  if (current.price_source !== initial.price_source)
    out.price_source = current.price_source.trim() || null;
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
      <span className={LABEL_CAPS_CLASS}>{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${LABEL_CAPS_CLASS} pt-2`}>{children}</div>
  );
}

function Chip({
  children,
  dotColor,
}: {
  children: React.ReactNode;
  dotColor?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-text-deep"
      style={{
        background: "#ffffff",
        border: "1px solid var(--border-soft)",
      }}
    >
      {dotColor && (
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      {children}
    </span>
  );
}

type HeroTier = "product" | "label" | "silhouette";

function initialHeroTier(wine: Wine): HeroTier {
  if (wine.product_image_url) return "product";
  if (wine.label_image_url) return "label";
  return "silhouette";
}

function Hero({
  wine,
  tier,
  onAdvance,
}: {
  wine: Wine;
  tier: HeroTier;
  onAdvance: () => void;
}) {
  const tint = bottleTint(wine.color);
  const imageFilter =
    "drop-shadow(0 18px 22px rgba(60, 40, 20, 0.18)) drop-shadow(0 4px 6px rgba(60, 40, 20, 0.08))";

  return (
    <div
      className="relative w-full flex flex-col items-center px-6 pt-9 pb-6 sm:pt-12 sm:pb-8 rounded-t-none sm:rounded-t-2xl"
      style={{
        background: "linear-gradient(180deg, #faf6ef 0%, #ffffff 100%)",
      }}
    >
      {tier === "product" && wine.product_image_url && (
        <div
          className="flex items-center justify-center w-full"
          style={{ filter: imageFilter }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={wine.product_image_url}
            alt={wine.name}
            onError={onAdvance}
            className="block max-h-[240px] sm:max-h-[320px] max-w-full object-contain"
          />
        </div>
      )}
      {tier === "label" && wine.label_image_url && (
        <>
          <div
            className="flex items-center justify-center w-full"
            style={{ filter: imageFilter }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={wine.label_image_url}
              alt={wine.name}
              onError={onAdvance}
              className="block max-h-[240px] sm:max-h-[320px] max-w-full object-contain"
            />
          </div>
          <p
            className="italic text-[11px] text-text-muted mt-3"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Your photo
          </p>
        </>
      )}
      {tier === "silhouette" && (
        <div
          className="flex items-center justify-center"
          style={{
            filter:
              "drop-shadow(0 12px 16px rgba(60, 40, 20, 0.12)) drop-shadow(0 2px 4px rgba(60, 40, 20, 0.06))",
          }}
        >
          <BottleSilhouette
            tint={tint}
            className="h-[200px] sm:h-[260px] w-auto"
          />
        </div>
      )}
    </div>
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
  const [heroTier, setHeroTier] = useState<HeroTier>(() => initialHeroTier(wine));

  function advanceHeroTier() {
    setHeroTier((current) => {
      if (current === "product") {
        return wine.label_image_url ? "label" : "silhouette";
      }
      if (current === "label") return "silhouette";
      return "silhouette";
    });
  }

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
  const colorChip = state.color || null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
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
        <div className="flex flex-wrap gap-1.5 pt-1">
          {colorChip && (
            <Chip dotColor={COLOR_DOT[colorChip] ?? COLOR_DOT.unknown}>
              {COLOR_LABEL[colorChip] ?? colorChip}
            </Chip>
          )}
          {state.price_range.trim() && <Chip>{state.price_range.trim()}</Chip>}
          {state.country.trim() && <Chip>{state.country.trim()}</Chip>}
          {state.vintage.trim() && <Chip>{state.vintage.trim()}</Chip>}
        </div>
        {state.price_range.trim() && state.price_source.trim() && (
          <p
            className="italic text-[11px] text-text-muted"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            from {state.price_source.trim()}
          </p>
        )}
      </div>

      {/* Form */}
      <div className="flex flex-col gap-5 px-5 sm:px-8 pt-5 safe-pb">
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

        <SectionTitle>Origin &amp; Notes</SectionTitle>

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
          <Field label="Price">
            <input
              value={state.price_range}
              onChange={(e) => set("price_range", e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Price source">
            <input
              value={state.price_source}
              onChange={(e) => set("price_source", e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        <Field label="Store">
          <input
            value={state.store}
            onChange={(e) => set("store", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>

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

        {errorMsg && <ErrorAlert>{errorMsg}</ErrorAlert>}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-3">
          <button
            type="button"
            onClick={handleDeleteClick}
            onBlur={() => setConfirmDelete(false)}
            disabled={pending}
            className="rounded-full px-4 py-2.5 text-sm transition-colors duration-150 ease-out disabled:opacity-50 min-h-[44px]"
            style={{
              background: confirmDelete ? "var(--terracotta)" : "transparent",
              color: confirmDelete ? "#ffffff" : "var(--text-muted)",
              border: confirmDelete
                ? "1px solid var(--terracotta)"
                : "1px solid transparent",
            }}
            onMouseEnter={(e) => {
              if (!confirmDelete) e.currentTarget.style.color = "var(--terracotta)";
            }}
            onMouseLeave={(e) => {
              if (!confirmDelete) e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            {pending ? "…" : confirmDelete ? "Click again to confirm" : "Delete"}
          </button>
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="text-sm text-text-muted hover:text-text-deep transition-colors duration-150 ease-out disabled:opacity-50 px-2 py-2.5"
            >
              Close
            </button>
            <SubmitButton pending={pending}>
              {pending ? "Saving…" : "Save changes"}
            </SubmitButton>
          </div>
        </div>
      </div>
    </form>
  );
}
