"use client";

import { useEffect, useState } from "react";
import { DEFAULT_FAVORITE_HOTELS } from "@/lib/members/defaults";
import type { FavoriteHotel } from "@/lib/members/types";
import {
  deleteFavoriteHotelBrowser,
  fetchFavoriteHotelsBrowser,
  seedFavoriteHotelsIfEmptyBrowser,
} from "@/lib/members/db";

const FALLBACK_HOTEL_IMAGE = "/images/hero-lp.jpg";

function getHotelImage(item: FavoriteHotel): string {
  const thumbnail = item.thumbnail?.trim();

  if (!thumbnail || thumbnail === FALLBACK_HOTEL_IMAGE) {
    return FALLBACK_HOTEL_IMAGE;
  }

  return thumbnail;
}

export default function FavoriteHotelsView() {
  const [items, setItems] = useState<FavoriteHotel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setIsLoading(true);
        setErrorMessage("");
        setStatusMessage("");

        await seedFavoriteHotelsIfEmptyBrowser(DEFAULT_FAVORITE_HOTELS);
        const next = await fetchFavoriteHotelsBrowser();

        if (!active) return;
        setItems(next);
      } catch {
        if (!active) return;
        setErrorMessage("Could not load favorite hotels.");
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

      await deleteFavoriteHotelBrowser(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch {
      setErrorMessage("Could not remove favorite hotel.");
    }
  }

  if (isLoading) {
    return (
      <section className="oltra-glass members-section">
        <div className="members-empty">Loading favorite hotels...</div>
      </section>
    );
  }

  return (
    <section className="oltra-glass members-section">
      {errorMessage || statusMessage ? (
        <div className="members-section__header">
          <div className="members-note">{errorMessage || statusMessage}</div>
        </div>
      ) : null}

      <div className="members-section__body">
        {items.length ? (
          items.map((item) => {
            const imageUrl = getHotelImage(item);

            return (
              <article key={item.id} className="members-item">
                <div className="members-item__layout">
                  <div
                    className="members-item__thumb"
                    style={{ backgroundImage: `url(${imageUrl})` }}
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
                        View hotel
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
                </div>
              </article>
            );
          })
        ) : (
          <div className="members-empty">No favorite hotels yet.</div>
        )}
      </div>
    </section>
  );
}