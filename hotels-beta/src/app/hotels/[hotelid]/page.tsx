// src/app/hotels/[hotelid]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { directusFetchJson } from "@/lib/directus";
import {
  buildBookingLink,
  type BookingSearchParams,
} from "@/lib/hotels/buildBookingLink";
import { getAgodaPhotos } from "@/lib/agoda/content";

type Hotel = {
  id: string | number;
  hotel_name?: string | null;

  // Location
  affiliation?: string | null;
  region?: string | null;
  country?: string | null;
  state_province_county_island?: string | null;
  city?: string | null;
  local_area?: string | null;

  // Multiselect tag fields — flat string arrays, value === label.
  activities?: string[] | null;
  awards?: string[] | null;
  setting?: string[] | null;
  style?: string[] | null;

  // Descriptions
  highlights?: string | null;
  description?: string | null;

  // Stats/info
  ext_points?: number | string | null;
  editor_rank?: number | string | null;
  total_rooms_suites_villas?: number | string | null;

  // Links
  www?: string | null;
  insta?: string | null;

  // Booking
  booking_provider?: "booking" | "cj_booking" | "official" | "none" | null;
  booking_URL?: string | null;
  booking_hotel_ref?: string | null;
  booking_enabled?: boolean | null;
  booking_label?: string | null;
  booking_notes?: string | null;

  // Agoda
  agoda_hotel_id?: string | null;
  agoda_photo1?: string | null;
  agoda_photo2?: string | null;
  agoda_photo3?: string | null;
  agoda_photo4?: string | null;
  agoda_photo5?: string | null;
};

function toArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

function locationLine(h: Hotel): string {
  return [h.local_area, h.city, h.state_province_county_island, h.region, h.country]
    .filter(Boolean)
    .join(" · ");
}

const HOTEL_DETAIL_FIELDS = [
  "id",
  "hotel_name",
  "affiliation",
  "region",
  "country",
  "state_province_county_island",
  "city",
  "local_area",
  "highlights",
  "description",
  "ext_points",
  "editor_rank",
  "total_rooms_suites_villas",
  "www",
  "insta",
  "booking_provider",
  "booking_URL",
  "booking_hotel_ref",
  "booking_enabled",
  "booking_label",
  "booking_notes",
  "activities",
  "awards",
  "setting",
  "style",
  "agoda_hotel_id",
  "agoda_photo1",
  "agoda_photo2",
  "agoda_photo3",
  "agoda_photo4",
  "agoda_photo5",
].join(",");

async function fetchHotelById(param: string): Promise<Hotel | null> {
  // Try /items/hotels/{id} first (simplest, works when param is the numeric id).
  try {
    const byId = await directusFetchJson<Hotel>(
      `/items/hotels/${encodeURIComponent(param)}?fields=${encodeURIComponent(HOTEL_DETAIL_FIELDS)}`
    );
    if (byId?.id != null) return byId;
  } catch {
    // ignore and try filter fallback below
  }

  // Fallback: filter by id eq (works even if Directus rejects /{id} for some reason)
  const byIdFilter = await directusFetchJson<Hotel[]>(
    `/items/hotels?` +
      [
        `limit=1`,
        `filter[id][_eq]=${encodeURIComponent(param)}`,
        `fields=${encodeURIComponent(HOTEL_DETAIL_FIELDS)}`,
      ].join("&")
  );

  if (toArray(byIdFilter).length > 0) return byIdFilter[0];

  return null;
}

export default async function HotelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotelid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hotelid } = await params;
  const resolvedSearchParams = await searchParams;
  const hotel = await fetchHotelById(hotelid);

  if (!hotel) notFound();

  const agodaPhotos = getAgodaPhotos(hotel.agoda_hotel_id);

  const loc = locationLine(hotel);

  const activities = toArray(hotel.activities);
  const settings = toArray(hotel.setting);
  const styles = toArray(hotel.style);
  const awards = toArray(hotel.awards);
  const bookingSearchParams: BookingSearchParams = {
    from:
      typeof resolvedSearchParams.from === "string"
        ? resolvedSearchParams.from
        : null,
    to:
      typeof resolvedSearchParams.to === "string"
        ? resolvedSearchParams.to
        : null,
    adults:
      typeof resolvedSearchParams.adults === "string"
        ? resolvedSearchParams.adults
        : null,
    kids:
      typeof resolvedSearchParams.kids === "string"
        ? resolvedSearchParams.kids
        : null,
    bedrooms:
      typeof resolvedSearchParams.bedrooms === "string"
        ? resolvedSearchParams.bedrooms
        : null,
  };
  const bookingHref = buildBookingLink(hotel, bookingSearchParams);
  const bookingLabel = hotel.booking_label?.trim() || "BOOK";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {/* Top nav */}
      <div className="mb-10 flex items-center justify-between">
        <Link href="/hotels" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Back to hotels
        </Link>

        <div className="text-xs text-zinc-500">
          {hotel.affiliation ? <span>{hotel.affiliation}</span> : null}
        </div>
      </div>

      {/* Hero */}
      <header className="mb-10">

        {agodaPhotos.length > 0 ? (
          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            {agodaPhotos.slice(0, 5).map((src, i) => (
              <img
                key={i}
                src={src}
                className={i === 0 ? "sm:col-span-2 h-[320px]" : "h-[240px]"}
              />
            ))}
          </div>
        ) : (
          <div className="mb-8 flex h-[320px] items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">
            Photos coming soon
          </div>
        )}
        
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950">
          {hotel.hotel_name ?? "Hotel"}
        </h1>

        {loc ? (
          <p className="mt-3 text-base text-zinc-600">{loc}</p>
        ) : (
          <p className="mt-3 text-base text-zinc-500"> </p>
        )}

        {/* Editorial “chips” — very restrained */}
        <div className="mt-6 flex flex-wrap gap-2">
          {settings.slice(0, 3).map((s) => (
            <span
              key={`setting-${s}`}
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-700"
            >
              {s}
            </span>
          ))}
          {styles.slice(0, 3).map((s) => (
            <span
              key={`style-${s}`}
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-700"
            >
              {s}
            </span>
          ))}
          {awards.slice(0, 2).map((s) => (
            <span
              key={`award-${s}`}
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-700"
            >
              {s}
            </span>
          ))}
        </div>
      </header>

      {/* Body */}
      <section className="grid gap-10 md:grid-cols-[1.3fr_0.7fr]">
        {/* Editorial narrative */}
        <article className="min-w-0">
          {hotel.highlights ? (
            <div className="mb-8">
              <h2 className="text-sm font-semibold tracking-wide text-zinc-900">
                Highlights
              </h2>
              <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-zinc-700">
                {hotel.highlights}
              </p>
            </div>
          ) : null}

          {hotel.description ? (
            <div className="mb-8">
              <h2 className="text-sm font-semibold tracking-wide text-zinc-900">
                Description
              </h2>
              <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-zinc-700">
                {hotel.description}
              </p>
            </div>
          ) : null}

          {activities.length > 0 ? (
            <div className="mb-2">
              <h2 className="text-sm font-semibold tracking-wide text-zinc-900">
                Activities
              </h2>
              <p className="mt-3 text-base leading-relaxed text-zinc-700">
                {activities.join(" · ")}
              </p>
            </div>
          ) : null}
        </article>

        {/* Key facts */}
        <aside className="md:pl-6">
          <div className="rounded-2xl border border-zinc-200 p-6">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-900">
              Key facts
            </h2>

            <dl className="mt-5 space-y-3 text-sm">
              {hotel.total_rooms_suites_villas != null ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-zinc-600">Total rooms/suites/villas</dt>
                  <dd className="text-zinc-900">{String(hotel.total_rooms_suites_villas)}</dd>
                </div>
              ) : null}

              {hotel.editor_rank != null ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-zinc-600">Editor rank</dt>
                  <dd className="text-zinc-900">{String(hotel.editor_rank)}</dd>
                </div>
              ) : null}

              {hotel.ext_points != null ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-zinc-600">External points</dt>
                  <dd className="text-zinc-900">{String(hotel.ext_points)}</dd>
                </div>
              ) : null}
            </dl>

            {(hotel.www || hotel.insta) && (
              <div className="mt-6 border-t border-zinc-200 pt-5">
                <h3 className="text-xs font-semibold tracking-wide text-zinc-900">
                  Links
                </h3>
                <div className="mt-3 flex flex-col gap-2 text-sm">
                  {hotel.www ? (
                    <a
                      href={hotel.www}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-700 hover:text-zinc-950 underline underline-offset-4 decoration-zinc-300"
                    >
                      Website
                    </a>
                  ) : null}
                  {hotel.insta ? (
                    <a
                      href={hotel.insta}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-700 hover:text-zinc-950 underline underline-offset-4 decoration-zinc-300"
                    >
                      Instagram
                    </a>
                  ) : null}
                </div>
              </div>
            )}
            {bookingHref ? (
              <div className="mt-6 border-t border-zinc-200 pt-5">
                <a
                  href={bookingHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm tracking-[0.16em] text-zinc-900 transition hover:bg-zinc-50"
                >
                  {bookingLabel}
                </a>
              </div>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
  );
}