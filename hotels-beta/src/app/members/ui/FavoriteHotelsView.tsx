"use client";

import { useEffect, useMemo, useState } from "react";
import type { FavoriteHotel } from "@/lib/members/types";
import type { HotelRecord } from "@/lib/directus";
import {
  deleteFavoriteHotelBrowser,
  fetchFavoriteHotelsBrowser,
} from "@/lib/members/db";
import HotelSmallCard, { smallCardHasTopAction } from "@/components/hotels/HotelSmallCard";
import { bookingOrWebsiteHref } from "@/lib/hotels/buildBookingLink";
import { cityFromLocation, groupByCity } from "./groupByCity";
import ConfirmDialog from "./ConfirmDialog";

const FALLBACK_HOTEL_IMAGE = "/images/hero-lp.jpg";

/* The main Hotels page searched for this one hotel - the same /hotels?q=…
   handoff LandingSummary's hotel cards use (CLAUDE.md §15), minus the dates
   and guests a favourite does not carry. */
function buildHotelHref(hotelName: string): string {
  const params = new URLSearchParams();
  params.set("q", hotelName);
  params.set("submitted", "1");
  return `/hotels?${params.toString()}`;
}

function realId(item: FavoriteHotel): string | null {
  const id = item.hotelDirectusId?.trim();
  return id && /^\d+$/.test(id) ? id : null;
}

/* A stand-in record while the real one loads, or for a hotel no longer in
   Directus: the name, location and photo saved with the favourite. */
function fallbackHotel(item: FavoriteHotel): HotelRecord {
  const thumbnail = item.thumbnail?.trim();
  const hasPhoto = Boolean(thumbnail) && thumbnail !== FALLBACK_HOTEL_IMAGE;
  return {
    id: realId(item) ?? item.id,
    hotel_name: item.name,
    published: true,
    city: cityFromLocation(item.location),
    directus_images: hasPhoto ? [{ url: thumbnail, credit: null }] : undefined,
  };
}

export default function FavoriteHotelsView() {
  const [items, setItems] = useState<FavoriteHotel[]>([]);
  // Asked first, as Delete trip is (ConfirmDialog).
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  /* The live records, so each favourite draws the landing page's card with
     its photo and who sells it (Ulrik, 2026-10-05). By id, and by name for
     the seeded demo favourites, whose placeholder ids find nothing. */
  const [byId, setById] = useState<Record<string, HotelRecord>>({});
  const [byName, setByName] = useState<Record<string, HotelRecord>>({});

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setIsLoading(true);
        setErrorMessage("");

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
    const ids = items.map(realId).filter((id): id is string => Boolean(id));
    const names = items.filter((item) => !realId(item)).map((item) => item.name);
    if (!ids.length && !names.length) return;

    let active = true;

    void (async () => {
      try {
        const res = await fetch("/api/hotels/by-ids", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, names }),
        });
        const data = (await res.json()) as { ok?: boolean; hotels?: HotelRecord[] };
        if (!active || !data?.ok) return;
        const hotels = data.hotels ?? [];
        setById(Object.fromEntries(hotels.map((h) => [String(h.id), h])));
        setByName(
          Object.fromEntries(
            hotels.map((h) => [(h.hotel_name ?? "").trim().toLowerCase(), h])
          )
        );
      } catch {
        // Cards still render from the stored name, location and photo.
      }
    })();

    return () => {
      active = false;
    };
  }, [items]);

  const groups = useMemo(() => {
    const rows = items.map((item) => {
      const id = realId(item);
      const hotel =
        (id && byId[id]) ||
        byName[item.name.trim().toLowerCase()] ||
        fallbackHotel(item);
      return { item, hotel };
    });
    return groupByCity(
      rows,
      (row) => row.hotel.city ?? cityFromLocation(row.item.location),
      (row) => row.hotel.hotel_name ?? row.item.name
    );
  }, [items, byId, byName]);

  async function handleDelete(id: string) {
    try {
      setErrorMessage("");
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
      {errorMessage ? (
        <div className="members-section__header">
          <div className="members-note">{errorMessage}</div>
        </div>
      ) : null}

      {groups.length ? (
        /* City headers above the cards, in the left column; two cards to a
           row under each, left to right then down (Ulrik, 2026-10-05). The
           landing page's card at its two-frame density, with Delete where
           SAVE is - the Saved trips arrangement. */
        <div className="members-city-groups">
          {groups.map((group) => (
            <div key={group.city} className="members-city-group">
              <div className="oltra-label members-city-header">{group.city}</div>
              <div className="members-card-grid">
                {group.items.map(({ item, hotel }) => {
                  const href = buildHotelHref(hotel.hotel_name ?? item.name);
                  const bookingHref = bookingOrWebsiteHref(hotel);
                  return (
                    <HotelSmallCard
                      key={item.id}
                      hotel={hotel}
                      columns={2}
                      isFavourite
                      href={href}
                      bookingHref={bookingHref}
                      availability={{ status: "idle" }}
                      renderSaveControl={() => (
                        <button
                          type="button"
                          className={`oltra-btn oltra-btn--destructive oltra-btn--condensed oltra-btn--block${
                            smallCardHasTopAction(hotel, href, bookingHref)
                              ? " oltra-btn--stack-bottom"
                              : ""
                          }`}
                          onClick={() => setPendingDelete({ id: item.id, name: item.name })}
                        >
                          Delete
                        </button>
                      )}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="members-empty">No favorite hotels yet.</div>
      )}

      {pendingDelete ? (
        <ConfirmDialog
          text={`Remove "${pendingDelete.name}" from your favourites?`}
          onYes={() => {
            const id = pendingDelete.id;
            setPendingDelete(null);
            void handleDelete(id);
          }}
          onNo={() => setPendingDelete(null)}
        />
      ) : null}
    </section>
  );
}
