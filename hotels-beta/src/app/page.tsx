import Link from "next/link";
import PageShell from "@/components/site/PageShell";
import LandingBackground from "@/components/site/LandingBackground";
import { getHotels } from "@/lib/directus";
import { buildHotelsDirectusFilter } from "@/lib/hotelFilters";
import { getHotelSuggestionDataset } from "@/lib/hotelSearchSuggestions";
import LandingSearchPanel from "./LandingSearchPanel";
import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

function normalizeParam(v: string | string[] | undefined): string {
  if (!v) return "";
  return Array.isArray(v) ? v[0] ?? "" : v;
}

function listFromParam(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v.filter(Boolean) : [v].filter(Boolean);
}

function buildQueryString(params: SearchParams): string {
  const out = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) out.append(key, item);
      }
    } else if (value) {
      out.set(key, value);
    }
  }

  return out.toString();
}

function cleanLabel(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function pickHotelGeographyLabel(
  q: string,
  hotels: Array<{
    city?: string | null;
    country?: string | null;
    region?: string | null;
  }>
): string {
  if (!hotels.length) return q || "selected destination";

  const cities = new Set(hotels.map((h) => cleanLabel(h.city)).filter(Boolean));
  const countries = new Set(hotels.map((h) => cleanLabel(h.country)).filter(Boolean));
  const regions = new Set(hotels.map((h) => cleanLabel(h.region)).filter(Boolean));

  if (cities.size === 1) return [...cities][0];
  if (countries.size === 1) return [...countries][0];
  if (regions.size === 1) return [...regions][0];

  return q || "selected destination";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const submitted = normalizeParam(resolvedSearchParams.submitted) === "1";

  const includes = ["hotels"];

  const q = normalizeParam(resolvedSearchParams.q).trim();

  const dataset = await getHotelSuggestionDataset();

  let hotelCount: number | null = null;
  let hotelLine: string | null = null;

  if (submitted && includes.includes("hotels")) {
    const filter = buildHotelsDirectusFilter(resolvedSearchParams);

    const hotels = await getHotels({
      fields: ["id", "hotelid", "hotel_name", "city", "country", "region"],
      filter,
      sort: ["-editor_rank_13", "-ext_points", "hotel_name"],
    });

    hotelCount = hotels.length;

    const geography = pickHotelGeographyLabel(q, hotels);

    const hotelNames = hotels
      .slice(0, 10)
      .map((item: any) => item.hotel_name ?? "")
      .filter(Boolean);

    if (hotelCount === 0) {
      hotelLine = `0 hotels identified in ${geography}`;
    } else if (hotelCount > 25) {
      hotelLine = `More than 25 hotels match your criteria including ${hotelNames.join(", ")}`;
    } else {
      hotelLine = `${hotelCount} hotels match your criteria: ${hotelNames.join(", ")}`;
    }
  }

  const sharedQuery = buildQueryString({
    ...resolvedSearchParams,
    submitted: undefined,
  });

  const hotelsHref = `/hotels${sharedQuery ? `?${sharedQuery}` : ""}`;

  return (
    <PageShell current="" disableBackground>
      <LandingBackground />

      <main className={styles.landingPage}>
        <section className={styles.heroPanel}>
          <LandingSearchPanel
            initialSearchParams={resolvedSearchParams}
            dataset={dataset}
          />

          {submitted ? (
            <div className={`oltra-glass oltra-panel ${styles.summaryPanel}`}>
              <div className={styles.summaryHeader}>
                <div className="oltra-label">Search overview</div>
              </div>

              <div className={styles.summaryLines}>
                {includes.includes("hotels") && hotelLine ? (
                  <div className={styles.summaryLine}>{hotelLine}</div>
                ) : null}
              </div>

              <div className={styles.summaryActions}>
                {includes.includes("hotels") ? (
                  <Link
                    href={hotelsHref}
                    className={`oltra-button-primary ${styles.summaryButton}`}
                    prefetch={false}
                  >
                    Hotels
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </PageShell>
  );
}