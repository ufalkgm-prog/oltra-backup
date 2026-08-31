"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HotelSmallCard, {
  type SmallCardAvailability,
} from "@/components/hotels/HotelSmallCard";
import type { HotelRecord } from "@/lib/directus";
import { buildBookingLink } from "@/lib/hotels/buildBookingLink";
import { queryStateToParams } from "@/lib/ai/aiSearchStore";
import { voiceFont } from "@/lib/ai/fonts";
import type { AiHotelCard, AiQueryState, AiResultSet } from "@/lib/ai/types";
import styles from "./page.module.css";

/* The results region: editorial framing line, then the existing cards.
 *
 * The framing line is the only thing the model wrote here. Everything numeric
 * — price, availability — is fetched by this component from the live supplier
 * and rendered by the card, exactly as the structured search does it. The model
 * never sees those figures, so it cannot have written one into the framing. */

type Props = {
  framing: string;
  results: AiResultSet;
  query: AiQueryState;
};

export default function AskResults({ framing, results, query }: Props) {
  const [hotels, setHotels] = useState<AiHotelCard[]>([]);
  const [availability, setAvailability] = useState<Record<string, SmallCardAvailability>>({});
  const [loading, setLoading] = useState(false);

  const idKey = results.hotelIds.join(",");

  useEffect(() => {
    if (!results.hotelIds.length) {
      setHotels([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    fetch("/api/ai/hotels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: results.hotelIds }),
    })
      .then((res) => res.json())
      .then((json: { ok?: boolean; hotels?: AiHotelCard[] }) => {
        if (cancelled) return;
        setHotels(json.ok && json.hotels ? json.hotels : []);
      })
      .catch(() => {
        if (!cancelled) setHotels([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [idKey, results.hotelIds]);

  // Live prices, via the same batch route the structured landing summary uses.
  // Skipped entirely without dates — a price needs a stay to be a price.
  useEffect(() => {
    const priceable = hotels.filter(
      (h) => h.ratehawk_hid && h.ratehawk_status !== "passive"
    );
    if (!priceable.length || !query.from || !query.to) {
      setAvailability({});
      return;
    }

    let cancelled = false;
    setAvailability(
      Object.fromEntries(priceable.map((h) => [String(h.id), { status: "loading" as const }]))
    );

    fetch("/api/ratehawk/availability/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hids: priceable.map((h) => h.ratehawk_hid),
        checkInDate: query.from,
        checkOutDate: query.to,
        adults: query.adults,
        kids: query.kids,
        childrenAges: query.childrenAges,
        rooms: query.bedrooms,
        currency: query.currency,
        residency: "gb",
      }),
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          results?: Array<{ hid: number; headline: { pricePerStay: number; currency: string } | null }>;
        };
        if (cancelled) return;

        // Default everything to unavailable, then fill in what actually
        // priced — same shape the structured landing summary uses.
        const next: Record<string, SmallCardAvailability> = {};
        for (const hotel of priceable) next[String(hotel.id)] = { status: "unavailable" };

        if (res.ok && json.ok) {
          const hidToId = new Map(
            priceable.map((h) => [Number(h.ratehawk_hid), String(h.id)])
          );
          for (const entry of json.results ?? []) {
            const id = hidToId.get(Number(entry.hid));
            if (!id || !entry.headline) continue;
            next[id] = {
              status: "available",
              pricePerStay: entry.headline.pricePerStay,
              currency: entry.headline.currency,
            };
          }
        }

        setAvailability(next);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailability(
          Object.fromEntries(priceable.map((h) => [String(h.id), { status: "error" as const }]))
        );
      });

    return () => {
      cancelled = true;
    };
  }, [hotels, query.from, query.to, query.adults, query.kids, query.bedrooms, query.currency, query.childrenAges]);

  const hotelsHref = useMemo(() => {
    const params = queryStateToParams(query);
    if (results.hotelIds.length) params.set("ids", results.hotelIds.join(","));
    params.set("search_submitted", "1");
    return `/hotels?${params.toString()}`;
  }, [query, results.hotelIds]);

  const allInDestinationHref = useMemo(() => {
    const params = queryStateToParams(query);
    params.set("search_submitted", "1");
    return `/hotels?${params.toString()}`;
  }, [query]);

  const flightsHref = useMemo(() => {
    const params = queryStateToParams(query);
    if (results.flights) {
      params.set("origin", results.flights.origin);
      params.set("tripType", results.flights.returnDate ? "return" : "oneway");
    }
    return `/flights?${params.toString()}`;
  }, [query, results.flights]);

  const destinationLabel =
    query.destination.city ||
    query.destination.area ||
    query.destination.adminRegion ||
    query.destination.country;

  return (
    <section className={styles.askResults}>
      {framing ? (
        <p className={`${styles.askFraming} ${voiceFont.className}`}>{framing}</p>
      ) : null}

      {loading ? <p className={styles.askResultsNote}>Gathering those…</p> : null}

      {hotels.length ? (
        <div className={styles.askCardGrid}>
          {hotels.map((hotel) => {
            const record = hotel as unknown as HotelRecord;
            const reason = results.rationales[String(hotel.id)];
            return (
              <div key={hotel.id} className={styles.askCardCell}>
                <HotelSmallCard
                  hotel={record}
                  href={`/hotels?q=${encodeURIComponent(hotel.hotel_name ?? "")}&search_submitted=1`}
                  availability={availability[String(hotel.id)] ?? { status: "idle" }}
                  bookingHref={buildBookingLink(record)}
                />
                {reason ? <p className={styles.askRationale}>{reason}</p> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className={styles.askActions}>
        {results.hotelIds.length ? (
          <Link href={hotelsHref} className="oltra-button-primary" prefetch={false}>
            Go to hotels
          </Link>
        ) : null}
        {results.flights ? (
          <Link href={flightsHref} className="oltra-button-primary" prefetch={false}>
            Go to flights
          </Link>
        ) : null}
        {results.hotelIds.length && destinationLabel ? (
          // The way out of the AI subset, so nobody is stuck inside it.
          <Link href={allInDestinationHref} className={styles.askEscape} prefetch={false}>
            See all hotels in {destinationLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
