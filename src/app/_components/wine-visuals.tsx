"use client";

// Shared presentational primitives for the cabinet (Fridge) and the archive.
// Kept dependency-free of view state so both the live detail modal and the
// read-only archive modal render with one visual system.

import type { Wine } from "@/lib/types";

export const LABEL_CAPS_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted";

export const COLOR_DOT: Record<string, string> = {
  red: "#7a1f2b",
  white: "#d8c373",
  rose: "#e0a4ad",
  sparkling: "#d4b97a",
  unknown: "#b8ad96",
};

export const COLOR_LABEL: Record<string, string> = {
  red: "Red",
  white: "White",
  rose: "Rosé",
  sparkling: "Sparkling",
};

export function bottleTint(color: string | null): string {
  return COLOR_DOT[color ?? "unknown"] ?? COLOR_DOT.unknown;
}

export function BottleSilhouette({
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

export function WineGlassIcon({ className = "" }: { className?: string }) {
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

export function Chip({
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

export function Modal({
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

export type HeroTier = "product" | "label" | "silhouette";

export function initialHeroTier(wine: Wine): HeroTier {
  if (wine.product_image_url) return "product";
  if (wine.label_image_url) return "label";
  return "silhouette";
}

// Next tier to fall back to when the current image fails to load.
export function nextHeroTier(current: HeroTier, wine: Wine): HeroTier {
  if (current === "product") {
    return wine.label_image_url ? "label" : "silhouette";
  }
  return "silhouette";
}

export function Hero({
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
          <BottleSilhouette tint={tint} className="h-[200px] sm:h-[260px] w-auto" />
        </div>
      )}
    </div>
  );
}
