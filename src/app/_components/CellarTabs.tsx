"use client";

import { useState } from "react";
import type { ArchivedWine, Wine } from "@/lib/types";
import Fridge from "./Fridge";
import Archive from "./Archive";

type Tab = "cabinet" | "archive";

export default function CellarTabs({
  wines,
  archived,
}: {
  wines: Wine[];
  archived: ArchivedWine[];
}) {
  const [tab, setTab] = useState<Tab>("cabinet");

  return (
    <div className="w-full flex flex-col items-center gap-6 sm:gap-7">
      <div
        role="tablist"
        aria-label="Cellar views"
        className="inline-flex p-1 rounded-full"
        style={{
          background: "var(--surface-subtle)",
          border: "1px solid var(--border-soft)",
        }}
      >
        {(
          [
            { id: "cabinet", label: "Cabinet" },
            { id: "archive", label: "Archive" },
          ] as { id: Tab; label: string }[]
        ).map(({ id, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className="rounded-full px-5 py-1.5 text-sm font-medium transition-colors duration-150 ease-out min-h-[36px]"
              style={{
                background: active ? "#ffffff" : "transparent",
                color: active ? "var(--terracotta)" : "var(--text-muted)",
                boxShadow: active
                  ? "0 2px 8px -4px var(--shadow-warm-strong)"
                  : "none",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
              }}
            >
              {label}
              {id === "archive" && archived.length > 0 && (
                <span className="text-text-muted"> · {archived.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "cabinet" ? (
        <Fridge wines={wines} />
      ) : (
        <Archive archived={archived} />
      )}
    </div>
  );
}
