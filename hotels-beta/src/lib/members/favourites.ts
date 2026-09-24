"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  fetchFavoriteHotelDirectusIdsBrowser,
  fetchFavoriteRestaurantDirectusIdsBrowser,
} from "@/lib/members/db";
import { useIsMember } from "@/lib/members/useIsMember";

/* THE MEMBER'S FAVOURITES, ONCE FOR THE WHOLE PAGE (Ulrik, 2026-09-24).
 *
 * Every hotel and restaurant card marks a favourite with a star, and the
 * Favourite buttons go passive once something is one. The ids are held here,
 * outside any component, and read by the LISTS (which pass a flag to each
 * card) rather than by every card: fetched when a list mounts unless fetched
 * in the last minute — so a favourite removed under Members is not left
 * starred on the next page — and updated in place when a favourite is added,
 * so every list showing that place agrees at once.
 *
 * Keyed on the Directus id, never the favourite row's own uuid (db.ts). */

type Kind = "hotels" | "restaurants";

type FavouriteIds = { hotels: ReadonlySet<string>; restaurants: ReadonlySet<string> };

const EMPTY: FavouriteIds = { hotels: new Set(), restaurants: new Set() };

const FRESH_MS = 60_000;

let state: FavouriteIds = EMPTY;
let loading: Promise<void> | null = null;
let loadedAt = 0;
const listeners = new Set<() => void>();

function publish(next: FavouriteIds) {
  state = next;
  listeners.forEach((listener) => listener());
}

function load() {
  if (loading) return loading;
  if (Date.now() - loadedAt < FRESH_MS) return Promise.resolve();
  loading = Promise.all([
    fetchFavoriteHotelDirectusIdsBrowser(),
    fetchFavoriteRestaurantDirectusIdsBrowser(),
  ])
    .then(([hotels, restaurants]) => {
      loadedAt = Date.now();
      publish({ hotels: new Set(hotels), restaurants: new Set(restaurants) });
    })
    .catch(() => {
      // Not critical: the cards work without their stars.
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => state;
const serverSnapshot = () => EMPTY;

/** Marks a place a favourite everywhere on the page, after a successful add
 * (or an add that found it was one already). */
export function markFavourite(kind: Kind, id: string | number) {
  const key = String(id);
  if (state[kind].has(key)) return;
  publish({ ...state, [kind]: new Set([...state[kind], key]) });
}

/** The signed-in member's favourite hotel and restaurant ids; empty while
 * signed out or loading. */
export function useFavouriteIds(): FavouriteIds {
  const isMember = useIsMember();

  useEffect(() => {
    if (isMember === true) void load();
    else if (isMember === false && state !== EMPTY) {
      loadedAt = 0;
      publish(EMPTY);
    }
  }, [isMember]);

  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
