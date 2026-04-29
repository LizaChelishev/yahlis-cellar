import { getSupabase } from "@/lib/supabase";
import type { Wine } from "@/lib/types";
import Fridge from "./_components/Fridge";

export const dynamic = "force-dynamic";

export default async function Page() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("wines")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const wines = (data ?? []) as Wine[];

  return (
    <main className="min-h-screen px-4 py-8 sm:py-14 flex flex-col items-center">
      <div className="w-full max-w-[720px] flex flex-col items-center gap-6 sm:gap-8">
        <header className="flex flex-col items-center gap-1.5 text-center">
          <h1
            className="font-serif text-4xl sm:text-5xl tracking-tight text-text-deep"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            The Wine Cellar
          </h1>
          <p
            className="italic text-sm sm:text-base text-text-muted"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            A home for every bottle
          </p>
        </header>
        <Fridge wines={wines} />
      </div>
    </main>
  );
}
