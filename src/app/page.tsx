import { getSupabase } from "@/lib/supabase";
import type { ArchivedWine, Wine } from "@/lib/types";
import CellarTabs from "./_components/CellarTabs";

export const dynamic = "force-dynamic";

export default async function Page() {
  const sb = getSupabase();
  const [winesRes, archivedRes] = await Promise.all([
    sb.from("wines").select("*").order("created_at", { ascending: false }),
    sb
      .from("archived_wines")
      .select("*")
      .order("finished_at", { ascending: false }),
  ]);
  if (winesRes.error) throw new Error(winesRes.error.message);
  if (archivedRes.error) throw new Error(archivedRes.error.message);
  const wines = (winesRes.data ?? []) as Wine[];
  const archived = (archivedRes.data ?? []) as ArchivedWine[];

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
        <CellarTabs wines={wines} archived={archived} />
      </div>
    </main>
  );
}
