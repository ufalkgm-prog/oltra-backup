// src/app/editor/hotels/[id]/page.tsx
import Link from "next/link";
import {
  getEditorHotelById,
  getEditorTaxonomies,
  getPrevNextHotelIds,
} from "@/lib/editorHotels";
import EditorHotelForm from "./EditorHotelForm";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditorHotelDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [hotel, nav, taxonomies] = await Promise.all([
    getEditorHotelById(id),
    getPrevNextHotelIds(id),
    getEditorTaxonomies(),
  ]);

  const { prevId, nextId } = nav;

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">
              OLTRA Editor
            </p>
            <h1 className="mt-2 text-3xl font-light">
              {hotel.hotel_name || "Untitled hotel"}
            </h1>
            <p className="mt-2 text-sm text-white/55">
              ID {hotel.id} · {hotel.city || "—"} · {hotel.country || "—"}
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/editor/hotels"
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
            >
              Back to Search
            </Link>
            {prevId && (
              <Link
                href={`/editor/hotels/${prevId}`}
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
              >
                Previous
              </Link>
            )}
            {nextId && (
              <Link
                href={`/editor/hotels/${nextId}`}
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
              >
                Next
              </Link>
            )}
          </div>
        </div>

        <EditorHotelForm id={id} hotel={hotel} taxonomies={taxonomies} />
      </div>
    </main>
  );
}