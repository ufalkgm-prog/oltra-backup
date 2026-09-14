// src/app/hotels/[hotelid]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/components/site/PageShell";
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

  // Same dark shell and tokens as the rest of the site (this page used to be
  // light zinc Tailwind). PageShell renders the <main>, header and background.
  return (
    <PageShell current="Hotels">
      <div className="mx-auto w-full max-w-5xl">
        {/* Top nav */}
        <div className="mb-10 flex items-center justify-between">
          <Link
            href="/hotels"
            className="text-sm text-[color:var(--oltra-text-muted)] hover:text-[color:var(--oltra-text-primary)]"
          >
            ← Back to hotels
          </Link>

          <div className="text-xs text-[color:var(--oltra-text-muted)]">
            {hotel.affiliation ? <span>{hotel.affiliation}</span> : null}
          </div>
        </div>

        {/* Hero */}
        <header className="mb-10">

          {agodaPhotos.length > 0 ? (
            <div className="mb-8 grid gap-3 sm:grid-cols-2">
              {agodaPhotos.slice(0, 5).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- Agoda's CDN serves the photo sized; see HotelsView
                <img
                  key={i}
                  src={src}
                  alt={i === 0 ? (hotel.hotel_name ?? "Hotel photo") : ""}
                  className={i === 0 ? "sm:col-span-2 h-[320px]" : "h-[240px]"}
                />
              ))}
            </div>
          ) : (
            <div className="oltra-photo-placeholder mb-8 h-[320px] rounded-[var(--oltra-radius-lg)]">
              Photos coming soon
            </div>
          )}

          <h1 className="text-4xl font-light tracking-wide text-[color:var(--oltra-text-primary)]">
            {hotel.hotel_name ?? "Hotel"}
          </h1>

          {loc ? (
            <p className="mt-3 text-base text-[color:var(--oltra-text-muted)]">{loc}</p>
          ) : (
            <p className="mt-3 text-base text-[color:var(--oltra-text-muted)]"> </p>
          )}

          {/* Editorial “chips” — very restrained, recessed like the Hotels page badges */}
          <div className="mt-6 flex flex-wrap gap-2">
            {settings.slice(0, 3).map((s) => (
              <span
                key={`setting-${s}`}
                className="rounded-full border border-[var(--oltra-field-border)] bg-[var(--oltra-field-bg)] px-3 py-1 text-xs text-[color:var(--oltra-badge-text)]"
              >
                {s}
              </span>
            ))}
            {styles.slice(0, 3).map((s) => (
              <span
                key={`style-${s}`}
                className="rounded-full border border-[var(--oltra-field-border)] bg-[var(--oltra-field-bg)] px-3 py-1 text-xs text-[color:var(--oltra-badge-text)]"
              >
                {s}
              </span>
            ))}
            {awards.slice(0, 2).map((s) => (
              <span
                key={`award-${s}`}
                className="rounded-full border border-[var(--oltra-field-border)] bg-[var(--oltra-field-bg)] px-3 py-1 text-xs text-[color:var(--oltra-badge-text)]"
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
                <h2 className="text-sm font-semibold tracking-wide text-[color:var(--oltra-text-primary)]">
                  Highlights
                </h2>
                <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-[color:var(--oltra-text-primary)]">
                  {hotel.highlights}
                </p>
              </div>
            ) : null}

            {hotel.description ? (
              <div className="mb-8">
                <h2 className="text-sm font-semibold tracking-wide text-[color:var(--oltra-text-primary)]">
                  Description
                </h2>
                <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-[color:var(--oltra-text-primary)]">
                  {hotel.description}
                </p>
              </div>
            ) : null}

            {activities.length > 0 ? (
              <div className="mb-2">
                <h2 className="text-sm font-semibold tracking-wide text-[color:var(--oltra-text-primary)]">
                  Activities
                </h2>
                <p className="mt-3 text-base leading-relaxed text-[color:var(--oltra-text-primary)]">
                  {activities.join(" · ")}
                </p>
              </div>
            ) : null}
          </article>

          {/* Key facts */}
          <aside className="md:pl-6">
            <div className="oltra-glass oltra-panel">
              <h2 className="text-sm font-semibold tracking-wide text-[color:var(--oltra-text-primary)]">
                Key facts
              </h2>

              <dl className="mt-5 space-y-3 text-sm">
                {hotel.total_rooms_suites_villas != null ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[color:var(--oltra-text-muted)]">Total rooms/suites/villas</dt>
                    <dd className="text-[color:var(--oltra-text-primary)]">{String(hotel.total_rooms_suites_villas)}</dd>
                  </div>
                ) : null}

                {hotel.editor_rank != null ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[color:var(--oltra-text-muted)]">Editor rank</dt>
                    <dd className="text-[color:var(--oltra-text-primary)]">{String(hotel.editor_rank)}</dd>
                  </div>
                ) : null}

                {hotel.ext_points != null ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[color:var(--oltra-text-muted)]">External points</dt>
                    <dd className="text-[color:var(--oltra-text-primary)]">{String(hotel.ext_points)}</dd>
                  </div>
                ) : null}
              </dl>

              {(hotel.www || hotel.insta) && (
                <div className="mt-6 border-t border-[var(--oltra-field-border)] pt-5">
                  <h3 className="text-xs font-semibold tracking-wide text-[color:var(--oltra-text-primary)]">
                    Links
                  </h3>
                  <div className="mt-3 flex flex-col gap-2 text-sm">
                    {hotel.www ? (
                      <a
                        href={hotel.www}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[color:var(--oltra-text-muted)] underline underline-offset-4 hover:text-[color:var(--oltra-text-primary)]"
                      >
                        Website
                      </a>
                    ) : null}
                    {hotel.insta ? (
                      <a
                        href={hotel.insta}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[color:var(--oltra-text-muted)] underline underline-offset-4 hover:text-[color:var(--oltra-text-primary)]"
                      >
                        Instagram
                      </a>
                    ) : null}
                  </div>
                </div>
              )}
              {bookingHref ? (
                <div className="mt-6 border-t border-[var(--oltra-field-border)] pt-5">
                  <a
                    href={bookingHref}
                    target="_blank"
                    rel="noreferrer"
                    className="oltra-btn oltra-btn--block"
                  >
                    {bookingLabel}
                  </a>
                </div>
              ) : null}
            </div>
          </aside>
        </section>
      </div>
    </PageShell>
  );
}