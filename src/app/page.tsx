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
    <main className="min-h-dvh px-4 py-6 sm:py-10 flex flex-col items-center">
      <div className="w-full max-w-[720px] flex flex-col items-center gap-6 sm:gap-7">
        <header className="flex flex-col items-center text-center">
          <h1
            className="font-semibold text-2xl sm:text-3xl text-text-deep"
            style={{ letterSpacing: "-0.02em" }}
          >
            Yahli&apos;s Cellar
          </h1>
        </header>
        <Fridge wines={wines} />
      </div>
    </main>
  );
}
