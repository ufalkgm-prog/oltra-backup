"use client";

import { useEffect, useState } from "react";
import { DEFAULT_FAVORITE_RESTAURANTS } from "@/lib/members/defaults";
import type { FavoriteRestaurant } from "@/lib/members/types";
import {
  deleteFavoriteRestaurantBrowser,
  fetchFavoriteRestaurantsBrowser,
  seedFavoriteRestaurantsIfEmptyBrowser,
} from "@/lib/members/db";

export default function FavoriteRestaurantsView() {
  const [items, setItems] = useState<FavoriteRestaurant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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

      <div className="members-section__body">
        {items.length ? (
          items.map((item) => (
            <article key={item.id} className="members-item">
              <div className="members-item__layout">
                <div
                  className="members-item__thumb"
                  style={{ backgroundImage: `url(${item.thumbnail})` }}
                />
                <div className="members-item__content">
                  <div className="members-item__title">{item.name}</div>
                  <div className="members-item__location">{item.location}</div>
                  <div className="members-item__meta">{item.meta}</div>

                  <div className="members-item__actions">
                    <button
                      type="button"
                      className="oltra-button-primary members-action-button"
                    >
                      View restaurant
                    </button>
                    <button
                      type="button"
                      className="oltra-button-secondary members-action-button"
                      onClick={() => handleDelete(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="members-empty">No favorite restaurants yet.</div>
        )}
      </div>
    </section>
  );
}