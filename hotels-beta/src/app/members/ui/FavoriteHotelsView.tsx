"use client";

import { useEffect, useState } from "react";
import { DEFAULT_FAVORITE_HOTELS } from "@/lib/members/defaults";
import type { FavoriteHotel } from "@/lib/members/types";
import {
  deleteFavoriteHotelBrowser,
  fetchFavoriteHotelsBrowser,
  seedFavoriteHotelsIfEmptyBrowser,
} from "@/lib/members/db";
import {
  RATEHAWK_THUMB_SIZE,
  resolveRatehawkUrl,
} from "@/lib/hotels/cardHelpers";

const FALLBACK_HOTEL_IMAGE = "/images/hero-lp.jpg";

/** How many thumbnails fill out the right-hand side of a card. */
const STRIP_IMAGE_COUNT = 5;

function getHotelImage(item: FavoriteHotel): string | null {
  const thumbnail = item.thumbnail?.trim();

  if (!thumbnail || thumbnail === FALLBACK_HOTEL_IMAGE) {
    return null;
  }

  return thumbnail;
}

export default function FavoriteHotelsView() {
  const [items, setItems] = useState<FavoriteHotel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  // Directus id -> resolved thumbnail urls. The favourite row only stores one
  // thumbnail, so the strip comes from the same per-hotel image route the
  // Hotels page uses (§29 - the bulk hotel fetch deliberately carries only
  // ratehawk_image_1).
  const [stripsByHotelId, setStripsByHotelId] = useState<
    Record<string, string[]>
  >({});
  // Highlights are not stored on the favourite row - read live so the text
  // stays current if an editor revises it. See /api/hotels/by-ids.
  const [detailsByHotelId, setDetailsByHotelId] = useState<
    Record<string, { highlights: string | null; affiliation: string | null }>
  >({});

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

  useEffect(() => {
    const ids = items
      .map((item) => item.hotelDirectusId)
      .filter((id): id is string => Boolean(id));
    if (!ids.length) return;

    let active = true;

    void (async () => {
      try {
        const res = await fetch("/api/hotels/by-ids", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          hotels?: Array<{
            id: string | number;
            highlights: string | null;
            affiliation: string | null;
          }>;
        };
        if (!active || !data?.ok) return;
        setDetailsByHotelId(
          Object.fromEntries(
            (data.hotels ?? []).map((h) => [
              String(h.id),
              { highlights: h.highlights, affiliation: h.affiliation },
            ])
          )
        );
      } catch {
        // Cards still render from the stored name/location/meta.
      }
    })();

    void Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/hotels/${id}/ratehawk-images`);
          const data = (await res.json()) as {
            ok?: boolean;
            images?: { url: string }[];
          };
          if (!data?.ok) return [id, []] as const;
          return [
            id,
            (data.images ?? [])
              .slice(0, STRIP_IMAGE_COUNT)
              .map((image) => resolveRatehawkUrl(image.url, RATEHAWK_THUMB_SIZE)),
          ] as const;
        } catch {
          return [id, []] as const;
        }
      })
    ).then((entries) => {
      if (active) setStripsByHotelId(Object.fromEntries(entries));
    });

    return () => {
      active = false;
    };
  }, [items]);

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
            const fallbackImage = getHotelImage(item);
            const strip = item.hotelDirectusId
              ? stripsByHotelId[item.hotelDirectusId] ?? []
              : [];
            // Until the strip resolves (or for a hotel with no Ratehawk
            // images) fall back to the one thumbnail saved with the favourite.
            const images = strip.length
              ? strip
              : fallbackImage
                ? [fallbackImage]
                : [];
            const detail = item.hotelDirectusId
              ? detailsByHotelId[item.hotelDirectusId]
              : undefined;

            return (
              <article key={item.id} className="members-item">
                {/* Text first, images filling out the card to its right. */}
                <div className="members-favorite-layout">
                  <div className="members-item__content">
                    <div className="members-item__title">{item.name}</div>
                    <div className="members-item__location">{item.location}</div>
                    {detail?.affiliation || item.meta ? (
                      <div className="members-item__meta">
                        {detail?.affiliation || item.meta}
                      </div>
                    ) : null}
                    {detail?.highlights ? (
                      <p className="members-favorite-highlights">
                        {detail.highlights}
                      </p>
                    ) : null}

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

                  {images.length ? (
                    <div className="members-favorite-strip">
                      {images.map((url, index) => (
                        <div
                          key={`${item.id}-${index}`}
                          className="members-favorite-strip__image"
                          style={{ backgroundImage: `url(${url})` }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="members-favorite-strip">
                      <div className="members-favorite-strip__image members-favorite-strip__image--placeholder">
                        Photos coming soon
                      </div>
                    </div>
                  )}
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