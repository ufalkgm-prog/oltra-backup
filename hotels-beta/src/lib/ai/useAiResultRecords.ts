"use client";

import { useEffect, useState } from "react";
import type { RestaurantRecord } from "@/app/restaurants/types";
import type { AiHotelCard } from "./types";
import { useAiSearch } from "./aiSearchStore";

/* The records behind the current result set, for whoever needs them.
 *
 * Two consumers want the same rows: the frames on the landing page, and the
 * summary inside the concierge modal — which exists precisely because the
 * frames are dimmed behind it and the visitor cannot read them. Both are
 * mounted at once, so without a shared cache the same id list would be fetched
 * twice on every turn.
 *
 * The cache is module-level and keyed on the id list, with the in-flight
 * promise stored alongside so two simultaneous mounts share one request rather
 * than racing. It is not invalidated: these are editorial records, the ids
 * change whenever the answer does, and the page reloads clear it. Prices are
 * NOT in here — those are fetched live by the cards, per the rule that the
 * model never sees a figure and the card is the only place one appears. */

type Records = {
  hotels: AiHotelCard[];
  restaurants: RestaurantRecord[];
};

const EMPTY: Records = { hotels: [], restaurants: [] };

const cache = new Map<string, Records>();
const inFlight = new Map<string, Promise<Records>>();

function keyOf(hotelIds: number[], restaurantIds: number[]): string {
  return `${hotelIds.join(",")}|${restaurantIds.join(",")}`;
}

async function fetchHotels(ids: number[]): Promise<AiHotelCard[]> {
  if (!ids.length) return [];
  const res = await fetch("/api/ai/hotels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const json = (await res.json()) as { ok?: boolean; hotels?: AiHotelCard[] };
  return json.ok && json.hotels ? json.hotels : [];
}

async function fetchRestaurants(ids: number[]): Promise<RestaurantRecord[]> {
  if (!ids.length) return [];
  const res = await fetch("/api/restaurants/by-ids", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const json = (await res.json()) as {
    ok?: boolean;
    restaurants?: RestaurantRecord[];
  };
  if (!json.ok || !json.restaurants) return [];

  // by-ids is a plain _in lookup, so it comes back in Directus order. The
  // model's ranking IS the answer, so restore it here — the same reason
  // /api/ai/hotels preserves request order server-side.
  const rank = new Map(ids.map((id, index) => [Number(id), index]));
  return [...json.restaurants].sort(
    (a, b) => (rank.get(Number(a.id)) ?? 0) - (rank.get(Number(b.id)) ?? 0)
  );
}

function load(
  key: string,
  hotelIds: number[],
  restaurantIds: number[]
): Promise<Records> {
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = Promise.all([
    fetchHotels(hotelIds),
    fetchRestaurants(restaurantIds),
  ])
    .then(([hotels, restaurants]) => {
      const records = { hotels, restaurants };
      cache.set(key, records);
      return records;
    })
    .catch(() => EMPTY)
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/* `ids` defaults to the CURRENT answer in the store. The concierge passes an
 * earlier answer's own ids when it redraws that answer further up the
 * transcript — same cache, so a turn already fetched this session costs
 * nothing. */
export function useAiResultRecords(
  ids?: { hotelIds: number[]; restaurantIds: number[] }
): Records & { loading: boolean } {
  const { results: current } = useAiSearch();
  const results = ids ?? current;
  const key = keyOf(results.hotelIds, results.restaurantIds);
  const seeded = cache.get(key);

  const [records, setRecords] = useState<Records>(seeded ?? EMPTY);
  const [loading, setLoading] = useState(!seeded && key !== "|");

  useEffect(() => {
    if (!results.hotelIds.length && !results.restaurantIds.length) {
      setRecords(EMPTY);
      setLoading(false);
      return;
    }

    const hit = cache.get(key);
    if (hit) {
      setRecords(hit);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    // Drop the previous answer's records before fetching the new ones.
    // Without this they stay on screen for the length of the fetch, and the
    // panel reads out the last answer's hotels under this answer's framing —
    // "All 67 across Italy" over a list of Alpine ski hotels. The rationales
    // are keyed by id, so the stale names even kept their old reasons and the
    // whole thing looked deliberate. An honest "Gathering those…" is better
    // than a confident wrong answer.
    setRecords(EMPTY);
    load(key, results.hotelIds, results.restaurantIds).then((next) => {
      if (cancelled) return;
      setRecords(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // `key` already encodes both id lists; depending on the arrays themselves
    // would refetch on every render, since the store rebuilds them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { ...records, loading };
}
