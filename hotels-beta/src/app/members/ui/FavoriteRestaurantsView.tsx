"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_FAVORITE_RESTAURANTS } from "@/lib/members/defaults";
import type { FavoriteRestaurant } from "@/lib/members/types";
import {
  deleteFavoriteRestaurantBrowser,
  fetchFavoriteRestaurantsBrowser,
  seedFavoriteRestaurantsIfEmptyBrowser,
} from "@/lib/members/db";
import type { RestaurantRecord } from "@/app/restaurants/types";
import {
  buildAwardsLabel,
  buildAddressLabel,
} from "@/app/restaurants/utils";

export default function FavoriteRestaurantsView() {
  const [items, setItems] = useState<FavoriteRestaurant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  // The favourite row stores only a name, a location label and a meta line.
  // The editorial text shown on the Restaurants page lives in Directus, so it
  // is fetched here by id - see /api/restaurants/by-ids.
  const [records, setRecords] = useState<Record<string, RestaurantRecord>>({});

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        await seedFavoriteRestaurantsIfEmptyBrowser(
          DEFAULT_FAVORITE_RESTAURANTS
        );
        const next = await fetchFavoriteRestaurantsBrowser();

        if (!active) return;
        setItems(next);
      } catch (error) {
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
    const ids = items
      .map((item) => item.restaurantDirectusId)
      .filter((id): id is string => Boolean(id));
    if (!ids.length) return;

    let active = true;

    void (async () => {
      try {
        const res = await fetch("/api/restaurants/by-ids", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          restaurants?: RestaurantRecord[];
        };
        if (!active || !data?.ok) return;
        setRecords(
          Object.fromEntries(
            (data.restaurants ?? []).map((r) => [String(r.id), r])
          )
        );
      } catch {
        // The cards still render from the stored name/location/meta.
      }
    })();

    return () => {
      active = false;
    };
  }, [items]);

  // Grouped by city so a member with favourites in several places reads them
  // city by city rather than in save order.
  const sortedItems = useMemo(() => {
    function cityOf(item: FavoriteRestaurant): string {
      const record = item.restaurantDirectusId
        ? records[item.restaurantDirectusId]
        : undefined;
      return (record?.city ?? item.location ?? "").trim();
    }

    return [...items].sort(
      (a, b) =>
        cityOf(a).localeCompare(cityOf(b)) || a.name.localeCompare(b.name)
    );
  }, [items, records]);

  async function handleDelete(id: string) {
    try {
      setErrorMessage("");
      setStatusMessage("");

      await deleteFavoriteRestaurantBrowser(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
      setStatusMessage("Favorite restaurant removed.");
    } catch (error) {
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
      {(errorMessage || statusMessage) ? (
        <div className="members-section__header">
          <div className="members-note">
            {errorMessage || statusMessage}
          </div>
        </div>
      ) : null}

      <div className="members-favorite-restaurant-grid">
        {sortedItems.length ? (
          sortedItems.map((item) => {
            const record = item.restaurantDirectusId
              ? records[item.restaurantDirectusId]
              : undefined;

            const address = record ? buildAddressLabel(record) : "";
            const awards = record ? buildAwardsLabel(record) : "";
            const meta = record
              ? [record.cuisine, record.restaurant_setting, record.restaurant_style]
                  .filter(Boolean)
                  .join(" · ")
              : item.meta;

            return (
              <article key={item.id} className="members-item">
                <div className="members-item__content">
                  <div className="members-item__title">{item.name}</div>
                  <div className="members-item__location">
                    {address || item.location}
                  </div>

                  {record?.www || record?.insta ? (
                    <div className="members-favorite-restaurant__links">
                      {record.www ? (
                        <a href={record.www} target="_blank" rel="noreferrer">
                          Website
                        </a>
                      ) : null}
                      {record.www && record.insta ? <span>·</span> : null}
                      {record.insta ? (
                        <a href={record.insta} target="_blank" rel="noreferrer">
                          Instagram
                        </a>
                      ) : null}
                    </div>
                  ) : null}

                  {meta ? <div className="members-item__meta">{meta}</div> : null}
                  {awards ? <div className="members-item__meta">{awards}</div> : null}

                  {record?.highlights ? (
                    <p className="members-favorite-restaurant__highlights">
                      {record.highlights}
                    </p>
                  ) : null}

                  {record?.description
                    ? record.description
                        .split(/\n+/)
                        .filter(Boolean)
                        .map((para, index) => (
                          <p
                            key={index}
                            className="members-favorite-restaurant__description"
                          >
                            {para}
                          </p>
                        ))
                    : null}

                  <div className="members-item__actions">
                    <button
                      type="button"
                      className="oltra-button-primary members-action-button"
                    >
                      View restaurant
                    </button>
                    <button
                      type="button"
                      className="members-text-danger-action"
                      onClick={() => handleDelete(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="members-empty">No favorite restaurants yet.</div>
        )}
      </div>
    </section>
  );
}