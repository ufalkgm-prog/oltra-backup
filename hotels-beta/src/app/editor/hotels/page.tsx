// src/app/editor/hotels/page.tsx
import Link from "next/link";
import { searchEditorHotels } from "@/lib/editorHotels";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

export default async function EditorHotelsPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const q = params.q || "";
  const hotels = await searchEditorHotels(q);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">
              OLTRA Editor
            </p>
            <h1 className="mt-2 text-3xl font-light">Hotels Admin</h1>
          </div>

          <Link
            href="/hotels"
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
          >
            Back to Hotels
          </Link>
        </div>

        <form className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex gap-3">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search by hotel, city, country..."
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-white/35"
            />
            <button
              type="submit"
              className="rounded-2xl bg-white px-5 py-3 text-sm font-medium text-black"
            >
              Search
            </button>
          </div>
        </form>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="grid grid-cols-[120px_1.5fr_1fr_1fr_120px] gap-4 border-b border-white/10 px-5 py-4 text-xs uppercase tracking-[0.2em] text-white/45">
            <div>ID</div>
            <div>Hotel</div>
            <div>City</div>
            <div>Country</div>
            <div>Status</div>
          </div>

          {hotels.map((hotel) => (
            <Link
              key={hotel.id}
              href={`/editor/hotels/${hotel.id}`}
              className="grid grid-cols-[120px_1.5fr_1fr_1fr_120px] gap-4 border-b border-white/5 px-5 py-4 text-sm text-white/85 hover:bg-white/5"
            >
              <div>{hotel.id}</div>
              <div>{hotel.hotel_name || "Untitled"}</div>
              <div>{hotel.city || "—"}</div>
              <div>{hotel.country || "—"}</div>
              <div>
                {hotel.published ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">
                    Published
                  </span>
                ) : (
                  <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/60">
                    Draft
                  </span>
                )}
              </div>
            </Link>
          ))}

          {hotels.length === 0 && (
            <div className="px-5 py-10 text-sm text-white/55">
              No hotels found.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}