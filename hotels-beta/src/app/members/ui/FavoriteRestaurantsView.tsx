"use client";

import { useEffect, useMemo, useState } from "react";
import type { FavoriteRestaurant } from "@/lib/members/types";
import {
  deleteFavoriteRestaurantBrowser,
  fetchFavoriteRestaurantsBrowser,
} from "@/lib/members/db";
import type { RestaurantRecord } from "@/app/restaurants/types";
import RestaurantSmallCard from "@/components/restaurants/RestaurantSmallCard";
import { cityFromLocation, groupByCity } from "./groupByCity";

function realId(item: FavoriteRestaurant): string | null {
  const id = item.restaurantDirectusId?.trim();
  return id && /^\d+$/.test(id) ? id : null;
}

/* A stand-in record while the real one loads, or for a restaurant no longer
   in Directus (a closure is deleted, not archived): the name and city saved
   with the favourite. */
function fallbackRestaurant(item: FavoriteRestaurant): RestaurantRecord {
  return {
    id: Number(realId(item)) || 0,
    restaurant_name: item.name,
    city: cityFromLocation(item.location),
    lat: null,
    lng: null,
  };
}

export default function FavoriteRestaurantsView() {
  const [items, setItems] = useState<FavoriteRestaurant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  /* The live records, so each favourite draws the landing page's card (Ulrik,
     2026-10-05). By id, and by name for the seeded demo favourites, whose
     placeholder ids find nothing - see /api/restaurants/by-ids. */
  const [byId, setById] = useState<Record<string, RestaurantRecord>>({});
  const [byName, setByName] = useState<Record<string, RestaurantRecord>>({});

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const next = await fetchFavoriteRestaurantsBrowser();

        if (!active) return;
        setItems(next);
      } catch {
        if (!active) return;
        setErrorMessage("Could not load favorite restaurants.");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const ids = items.map(realId).filter((id): id is string => Boolean(id));
    const names = items.filter((item) => !realId(item)).map((item) => item.name);
    if (!ids.length && !names.length) return;

    let active = true;

    void (async () => {
      try {
        const res = await fetch("/api/restaurants/by-ids", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, names }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          restaurants?: RestaurantRecord[];
        };
        if (!active || !data?.ok) return;
        const restaurants = data.restaurants ?? [];
        setById(Object.fromEntries(restaurants.map((r) => [String(r.id), r])));
        setByName(
          Object.fromEntries(
            restaurants.map((r) => [(r.restaurant_name ?? "").trim().toLowerCase(), r])
          )
        );
      } catch {
        // The cards still render from the stored name and city.
      }
    })();

    return () => {
      active = false;
    };
  }, [items]);

  const groups = useMemo(() => {
    const rows = items.map((item) => {
      const id = realId(item);
      const record = (id && byId[id]) || byName[item.name.trim().toLowerCase()];
      return { item, record, restaurant: record ?? fallbackRestaurant(item) };
    });
    return groupByCity(
      rows,
      (row) => row.restaurant.city ?? cityFromLocation(row.item.location),
      (row) => row.restaurant.restaurant_name ?? row.item.name
    );
  }, [items, byId, byName]);

  async function handleDelete(id: string) {
    try {
      setErrorMessage("");
      await deleteFavoriteRestaurantBrowser(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch {
      setErrorMessage("Could not remove favorite restaurant.");
    }
  }

  if (isLoading) {
    return (
      <section className="oltra-glass members-section">
        <div className="members-empty">Loading favorite restaurants...</div>
      </section>
    );
  }

  return (
    <section className="oltra-glass members-section">
      {errorMessage ? (
        <div className="members-section__header">
          <div className="members-note">{errorMessage}</div>
        </div>
      ) : null}

      {groups.length ? (
        /* The Favorite hotels arrangement: city headers in the left column,
           two cards to a row under each (Ulrik, 2026-10-05). The landing
           page's restaurant card, with Delete where SAVE is. The Restaurants
           page takes only ?city=, so a card opens its city. */
        <div className="members-city-groups">
          {groups.map((group) => (
            <div key={group.city} className="members-city-group">
              <div className="oltra-label members-city-header">{group.city}</div>
              <div className="members-card-grid">
                {group.items.map(({ item, record, restaurant }) => (
                  <RestaurantSmallCard
                    key={item.id}
                    restaurant={restaurant}
                    columns={2}
                    isFavourite
                    href={
                      record?.city
                        ? `/restaurants?${new URLSearchParams({ city: record.city }).toString()}`
                        : undefined
                    }
                    renderSaveControl={() => (
                      <button
                        type="button"
                        className="oltra-btn oltra-btn--destructive oltra-btn--condensed oltra-btn--block"
                        onClick={() => handleDelete(item.id)}
                      >
                        Delete
                      </button>
                    )}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="members-empty">No favorite restaurants yet.</div>
      )}
    </section>
  );
}
