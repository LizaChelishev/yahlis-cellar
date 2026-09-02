"use client";

import { useEffect } from "react";

/**
 * Error boundary for the cellar. Catches throws from the server component
 * render of page.tsx - most often the Supabase fetch failing because the
 * project is paused or unreachable - so the app shows a readable message
 * instead of Next's blank "This page couldn't load" screen.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-dvh px-4 py-6 sm:py-10 flex flex-col items-center justify-center">
      <div className="w-full max-w-[420px] flex flex-col items-center text-center gap-4 rounded-2xl border border-border-soft bg-cream-card px-6 py-10 shadow-[0_8px_24px_-12px_var(--shadow-warm-strong)]">
        <h1
          className="font-serif text-2xl text-text-deep"
          style={{ letterSpacing: "-0.02em" }}
        >
          The cellar is closed
        </h1>
        <p className="text-sm leading-relaxed text-text-muted">
          We can&apos;t reach the wine database right now. This is usually
          temporary - try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-2 rounded-full bg-terracotta px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-terracotta-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
        >
          Try again
        </button>
        {error.digest ? (
          <p className="mt-1 font-mono text-[11px] text-text-muted/70">
            {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
