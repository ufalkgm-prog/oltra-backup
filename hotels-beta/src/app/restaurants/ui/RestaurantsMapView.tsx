"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  getMemberActionAccessBrowser,
} from "@/lib/members/db";
import { getMemberActionLoginMessage } from "@/lib/members/memberActionUi";
import { fetchMemberProfileBrowser } from "@/lib/members/db";
import {
  clearHotelFlightDestination,
  mergeHotelFlightSearch,
  readHotelFlightSearch,
} from "@/lib/searchSession";

import OltraSelect from "@/components/site/OltraSelect";
import { useDropdownDismiss } from "@/lib/useDropdownDismiss";
import { useAiPageContext } from "@/lib/ai/useAiPageContext";
import { aiResultsAreCurrent, useAiActions, useAiSearch } from "@/lib/ai/aiSearchStore";
import { restaurantsHref } from "@/lib/ai/handoff";
import type { RestaurantRecord } from "../types";
import { buildAwardsLabel, buildLocationLabel, buildAddressLabel } from "../utils";
import {
  addFavoriteRestaurantBrowser,
  addRestaurantToTripBrowser,
} from "@/lib/members/db";
import SaveToTripControl, { type SaveToTripResult } from "@/components/members/SaveToTripControl";
import { markFavourite, useFavouriteIds } from "@/lib/members/favourites";
import FavouriteStar from "@/components/members/FavouriteStar";
import { applyEnglishLabels } from "@/lib/maps/englishLabels";
import { placeNameMatches, storedPlaceFor } from "@/lib/locationAliases";
import { mapStyleUrl } from "@/lib/maps/style";

type HotelPin = {
  id: string | number;
  hotel_name: string;
  lat: number;
  lng: number;
};

type Props = {
  city: string;
  cityOptions: string[];
  restaurants: RestaurantRecord[];
  selectedHotel?: HotelPin | null;
};

const RESTAURANT_TYPES = [
  "All",
  "Fine dining",
  "High-end casual",
  "Informal local favorite",
  "Beach club",
] as const;

/* The concierge's picks, offered as one more choice in the type selector — the
   same words the Hotels and landing destination boxes use for an AI answer. */
const AI_CURATED = "AI curated results";

type RestaurantType = (typeof RESTAURANT_TYPES)[number] | typeof AI_CURATED;

/* With no city there is nothing to fit, so the map opens on the world. */
const EMPTY_MAP_VIEW = { center: [15, 30] as [number, number], zoom: 1.5 };

let _ml: typeof maplibregl | null = null;
async function loadMaplibre(): Promise<typeof maplibregl> {
  if (!_ml) _ml = (await import("maplibre-gl")).default;
  return _ml;
}

export default function RestaurantsMapView({
  city,
  cityOptions,
  restaurants,
  selectedHotel = null,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const cityInputRef = useRef<HTMLInputElement | null>(null);
  const cityLookupRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Set by a marker click, so the list follows a choice made on the map.
  const revealInListRef = useRef(false);

  const [selectedId, setSelectedId] = useState<number | null>(
    restaurants[0]?.id ?? null
  );
  const [cityInput, setCityInput] = useState(city);
  const [showCityOptions, setShowCityOptions] = useState(false);
  /* The type is held WITH the city it was chosen in, so a new city reads All
     from its very first render (2026-10-05). Reset only by the effect below,
     the old city's type filtered the new city for one render: Paris on
     "High-end casual", then Saint-Tropez, selected Beefbar - the first
     high-end casual there - and kept it once the list went back to All. */
  const [typeChoice, setTypeChoice] = useState<{ type: RestaurantType; city: string }>({
    type: "All",
    city,
  });
  const selectedType: RestaurantType = typeChoice.city === city ? typeChoice.type : "All";
  const setSelectedType = useCallback(
    (next: RestaurantType | ((prev: RestaurantType) => RestaurantType)) =>
      setTypeChoice((prev) => {
        const current = prev.city === city ? prev.type : "All";
        return { type: typeof next === "function" ? next(current) : next, city };
      }),
    [city]
  );

  /* THE CONCIERGE'S RESTAURANTS, ON THE RESTAURANTS PAGE (2026-09-15). Asked
     here for somewhere to eat in Rome, the concierge named three and the page
     behind went on listing all 35 with the first alphabetically selected — the
     answer was nowhere on the page it was asked from. The picks that are in
     this city now lead as "AI curated results", in the answer's order, while
     the answer is current (aiResultsAreCurrent: nothing has superseded it).
     Choosing another type is how the visitor leaves them; the answer itself is
     untouched, as the type filter has always been page-local. */
  const {
    ready: aiReady,
    results: aiResults,
    query: aiQuery,
    presentedAt,
    searchedAt,
  } = useAiSearch();
  const { markClassicSearch } = useAiActions();
  const curatedRestaurants = useMemo(() => {
    if (!aiResultsAreCurrent(aiResults, presentedAt, searchedAt)) return [];
    const byId = new Map(restaurants.map((r) => [r.id, r]));
    return aiResults.restaurantIds
      .map((id) => byId.get(id))
      .filter((r): r is RestaurantRecord => Boolean(r));
  }, [aiResults, presentedAt, searchedAt, restaurants]);
  const curatedKey = curatedRestaurants.map((r) => r.id).join(",");

  const filteredRestaurants = useMemo(() => {
    if (selectedType === AI_CURATED) {
      return curatedRestaurants.length ? curatedRestaurants : restaurants;
    }
    if (selectedType === "All") return restaurants;
    return restaurants.filter((r) => r.restaurant_type === selectedType);
  }, [restaurants, selectedType, curatedRestaurants]);

  const availableTypes = useMemo(() => {
    const set = new Set(restaurants.map((r) => r.restaurant_type).filter(Boolean));
    return set as Set<string>;
  }, [restaurants]);

  const [memberActionMessage, setMemberActionMessage] = useState("");
  const [memberActionError, setMemberActionError] = useState("");
  const [memberActionLoading, setMemberActionLoading] = useState<
    "trip" | "favorite" | null
  >(null);

  const [isMemberLoggedIn, setIsMemberLoggedIn] = useState(false);
  // The shared store (lib/members/favourites.ts), so a restaurant starred here
  // is starred on every page, and one favourited there is starred here.
  const favoriteRestaurantIds = useFavouriteIds().restaurants;

  useEffect(() => {
    setCityInput(city);
    setShowCityOptions(false);
    setSelectedType("All");
  }, [city, setSelectedType]);

  /* Declared after the city reset so it wins it: a new city that holds the
     answer's picks opens on them, as does a new answer for this city. When the
     answer stops being current, its option goes and the list returns to All. */
  useEffect(() => {
    if (curatedKey) setSelectedType(AI_CURATED);
    else setSelectedType((prev) => (prev === AI_CURATED ? "All" : prev));
  }, [curatedKey, setSelectedType]);

  /* A new answer about another city, given while this page is open, moves the
     page to that city — the Restaurants half of what AiResultsSync does for
     Hotels and Flights. Any answer naming a city we cover, not only one with
     restaurants in it (Ulrik, 2026-09-23: a city in the chat is the
     destination on every page). Only a NEW answer: arriving with an older one
     leaves the city the visitor chose alone (the shared session already
     carries the concierge's destination to a bare /restaurants). */
  const seenPresentedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!aiReady) return;
    if (seenPresentedAt.current === null) {
      seenPresentedAt.current = presentedAt;
      return;
    }
    if (presentedAt <= seenPresentedAt.current) return;
    seenPresentedAt.current = presentedAt;

    const target = aiQuery.destination.city.trim().toLowerCase();
    const covered = cityOptions.some((option) => option.toLowerCase() === target);
    /* Or the same city measured from another hotel (2026-09-24): "dinner near
       the second one" walked from the Shangri-La while the map still marked the
       Bulgari, the hotel last selected on Hotels. */
    const nearHotel = aiResults.nearHotelId;
    const hotelMoved = Boolean(nearHotel) && String(nearHotel) !== searchParams.get("hotel_id");
    if (covered && (target !== city.toLowerCase() || hotelMoved)) {
      router.replace(restaurantsHref(aiQuery, nearHotel), { scroll: false });
    }
  }, [aiReady, presentedAt, aiQuery, aiResults.nearHotelId, city, cityOptions, router, searchParams]);

  // If the user landed on /restaurants without an explicit ?city= param,
  // try saved hotel/flight search → member home airport → leave it blank.
  useEffect(() => {
    if (searchParams.get("city")) return;

    const matchOption = (candidate: string): string => {
      const target = candidate.trim().toLowerCase();
      if (!target) return "";
      return (
        cityOptions.find((option) => option.toLowerCase() === target) ?? ""
      );
    };

    let cancelled = false;

    async function resolveDefault() {
      const saved = readHotelFlightSearch();
      const fromSaved = matchOption(saved?.city ?? "");
      if (fromSaved && fromSaved.toLowerCase() !== city.toLowerCase()) {
        if (!cancelled) {
          router.replace(
            `${pathname}?city=${encodeURIComponent(fromSaved)}`,
            { scroll: false }
          );
        }
        return;
      }

      try {
        const profile = await fetchMemberProfileBrowser();
        if (cancelled) return;
        const raw = profile?.homeAirport ?? "";
        // homeAirport looks like "Copenhagen (CPH)" — take the part before "("
        const cityName = raw.split("(")[0]?.trim() ?? "";
        const fromMember = matchOption(cityName);
        if (fromMember && fromMember.toLowerCase() !== city.toLowerCase()) {
          router.replace(
            `${pathname}?city=${encodeURIComponent(fromMember)}`,
            { scroll: false }
          );
        }
      } catch {
        /* ignore */
      }
    }

    resolveDefault();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!filteredRestaurants.length) {
      setSelectedId(null);
      return;
    }

    if (!filteredRestaurants.some((r) => r.id === selectedId)) {
      setSelectedId(filteredRestaurants[0].id);
    }
  }, [filteredRestaurants, selectedId]);

  const selectedRestaurant = useMemo(() => {
    if (!filteredRestaurants.length) return null;
    return filteredRestaurants.find((r) => r.id === selectedId) ?? filteredRestaurants[0];
  }, [filteredRestaurants, selectedId]);

  /* A restaurant picked on the map is scrolled into the list (2026-10-05): the
     row was highlighted out of view. The list only, never the page. */
  useEffect(() => {
    if (!revealInListRef.current) return;
    revealInListRef.current = false;
    const list = listRef.current;
    const id = selectedRestaurant?.id;
    if (!list || id == null) return;
    const row = list.querySelector<HTMLElement>(`[data-restaurant-id="${id}"]`);
    if (!row) return;
    const listBox = list.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    if (rowBox.top < listBox.top) list.scrollTop -= listBox.top - rowBox.top + 8;
    else if (rowBox.bottom > listBox.bottom) list.scrollTop += rowBox.bottom - listBox.bottom + 8;
  }, [selectedRestaurant?.id]);

  const selectedIsFavourite = Boolean(
    selectedRestaurant && favoriteRestaurantIds.has(String(selectedRestaurant.id))
  );

  /* What the concierge should assume if it is opened from this page. It still
     answers hotel and flight questions asked here — the city is a default,
     not a filter. */
  useAiPageContext({
    page: "restaurants",
    city,
    country: selectedRestaurant?.country ?? "",
    restaurantName: selectedRestaurant?.restaurant_name ?? "",
  });

  // Layered alongside (not replacing) the input's existing onBlur +
  // setTimeout(120) + onMouseDown-preventDefault mechanism below, which
  // correctly handles Tab/keyboard-driven focus loss - this hook only adds
  // hover-away and Escape closing on top of that.
  const cityLookupDismissProps = useDropdownDismiss({
    open: showCityOptions,
    onClose: () => setShowCityOptions(false),
    refs: cityLookupRef,
  });

  useEffect(() => {
    if (!memberActionMessage && !memberActionError) return;

    const timer = window.setTimeout(() => {
      setMemberActionMessage("");
      setMemberActionError("");
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [memberActionMessage, memberActionError]);

  async function handleSaveRestaurant(
    tripId: string,
    restaurant: RestaurantRecord
  ): Promise<SaveToTripResult> {
    const result = await addRestaurantToTripBrowser({
      tripId,
      restaurantDirectusId: String(restaurant.id),
      name: restaurant.restaurant_name,
      location: buildLocationLabel(restaurant),
      reservationLabel: null,
      thumbnail: "/images/hero-lp.jpg",
    });
    return { message: result.duplicate ? "Already in that trip." : "Saved to trip." };
  }

  async function handleAddRestaurantToFavorites() {
    if (!selectedRestaurant) return;
    if (!isMemberLoggedIn) {
      setMemberActionError(getMemberActionLoginMessage("favorite"));
      return;
    }
    try {
      setMemberActionLoading("favorite");
      setMemberActionMessage("");
      setMemberActionError("");

      await addFavoriteRestaurantBrowser({
        restaurantDirectusId: String(selectedRestaurant.id),
        name: selectedRestaurant.restaurant_name,
        location: buildLocationLabel(selectedRestaurant),
        meta: [selectedRestaurant.cuisine, selectedRestaurant.restaurant_style]
          .filter(Boolean)
          .join(" · "),
        thumbnail: "/images/hero-lp.jpg",
      });

      // The button turning passive, labelled FAVOURITE, is the confirmation.
      markFavourite("restaurants", selectedRestaurant.id);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";

      if (
        message.includes("auth") ||
        message.includes("login") ||
        message.includes("sign in") ||
        message.includes("unauthorized") ||
        message.includes("not authenticated")
      ) {
        setMemberActionError("Log in to add favorites.");
      } else {
        setMemberActionError("Could not add restaurant to favourites.");
      }
    } finally {
      setMemberActionLoading(null);
    }
  }

  const cityLookup = useMemo(() => {
    const map = new Map<string, string>();

    for (const option of cityOptions) {
      const normalized = option.trim().toLowerCase();
      if (!normalized) continue;
      map.set(normalized, option);
    }

    return map;
  }, [cityOptions]);

  /* The destination field's rule (2026-10-04): the start of a word, through
     the search fold, under the city's own name or another one - "St Tropez"
     finds Saint-Tropez – Ramatuelle, "Porto Cervo" finds Costa Smeralda. */
  const filteredCityOptions = useMemo(() => {
    const query = cityInput.trim();

    if (!query) return cityOptions;

    return cityOptions.filter((option) => placeNameMatches(option, query));
  }, [cityInput, cityOptions]);

  function updateCity(nextCityRaw: string) {
    const normalizedInput = nextCityRaw.trim().toLowerCase();
    if (!normalizedInput) {
      setCityInput(city);
      setShowCityOptions(false);
      return;
    }

    // Typed whole, under any of its names ("St Tropez", "Porto Cervo").
    const matchedCity =
      cityLookup.get(normalizedInput) ?? storedPlaceFor(nextCityRaw, cityOptions);
    if (!matchedCity) {
      setCityInput(city);
      setShowCityOptions(false);
      cityInputRef.current?.blur();
      return;
    }

    const nextCity = matchedCity;

    setCityInput(nextCity);
    setShowCityOptions(false);

    if (nextCity !== city) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("city", nextCity);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      /* A city chosen here is the site's destination now, as one searched on
         Hotels or Flights is: written to the shared search the other pages
         read, and superseding the concierge's answer so no page brings the
         conversation's city back over it (2026-09-23). */
      clearHotelFlightDestination();
      mergeHotelFlightSearch({ city: nextCity });
      markClassicSearch();
    }

    cityInputRef.current?.blur();
  }

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (!key) {
      console.error("Missing NEXT_PUBLIC_MAPTILER_KEY");
      return;
    }

    let cancelled = false;
    let map: maplibregl.Map | null = null;

    loadMaplibre().then((ml) => {
      if (cancelled || !mapRef.current) return;

      map = new ml.Map({
        container: mapRef.current,
        style: mapStyleUrl(key),
        center: EMPTY_MAP_VIEW.center,
        zoom: EMPTY_MAP_VIEW.zoom,
      });

      map.addControl(new ml.NavigationControl(), "top-right");

      map.on("load", () => {
        /* English labels, on every map (Ulrik, 2026-09-21). streets-v4 is
           only partly English on its own — see lib/maps/englishLabels.ts. */
        applyEnglishLabels(map!);
        map!.resize();
        window.setTimeout(() => map!.resize(), 100);
        window.setTimeout(() => map!.resize(), 350);
      });

      map.on("click", () => {
        markersRef.current.forEach((marker: any) => {
          const popup = marker.getPopup?.();
          if (popup?.isOpen()) {
            try {
              popup.remove();
            } catch {}
          }
        });
      });

      mapInstanceRef.current = map;

      const onWindowResize = () => {
        map!.resize();
      };

      window.addEventListener("resize", onWindowResize);

      if (typeof ResizeObserver !== "undefined" && mapRef.current) {
        const observer = new ResizeObserver(() => {
          map!.resize();
        });
        observer.observe(mapRef.current);
        resizeObserverRef.current = observer;
      }

      setMapReady(true);
    });

    return () => {
      cancelled = true;

      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      markersRef.current.forEach((marker: any) => {
        const popup = marker.getPopup?.();
        if (popup?.isOpen()) {
          try {
            popup.remove();
          } catch {}
        }

        try {
          marker.remove();
        } catch {}
      });
      markersRef.current = [];

      if (map) {
        try {
          map.remove();
        } catch {}
      }

      mapInstanceRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const ml = _ml;
    if (!map || !ml) return;

    markersRef.current.forEach((marker: any) => {
      const popup = marker.getPopup?.();
      if (popup?.isOpen()) {
        try {
          popup.remove();
        } catch {}
      }

      try {
        marker.remove();
      } catch {}
    });
    markersRef.current = [];

    const bounds = new ml.LngLatBounds();
    let hasBounds = false;

    for (const restaurant of filteredRestaurants) {
      if (restaurant.lng === null || restaurant.lat === null) continue;

      const el = document.createElement("button");
      el.type = "button";
      el.className = "restaurant-marker";
      el.dataset.restaurantId = String(restaurant.id);
      el.dataset.selected = String(restaurant.id === selectedRestaurant?.id);
      el.setAttribute("aria-label", restaurant.restaurant_name);

      const inner = document.createElement("span");
      inner.className = "restaurant-marker__inner";
      inner.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" class="restaurant-marker__icon">
          <g transform="translate(0 -1)">
            <path d="M12 2.2l3.35 6.7 7.45 1.05-5.4 5.25 1.28 7.35L12 18.98 5.32 22.3l1.28-7.35-5.4-5.25 7.45-1.05L12 2.2z" fill="currentColor"/>
          </g>
        </svg>
      `;
      el.appendChild(inner);

      const firstAward = buildAwardsLabel(restaurant).split(" · ")[0] || "";
      const locationLine = restaurant.local_area || restaurant.city || "";

      const popup = new ml.Popup({
        closeButton: false,
        closeOnClick: true,
        closeOnMove: false,
        offset: 14,
        className: "oltra-map-popup",
      }).setHTML(`
        <div class="oltra-map-popup__box">
          <div class="oltra-map-popup__title">${restaurant.restaurant_name}</div>
          ${
            restaurant.cuisine
              ? `<div class="oltra-map-popup__meta">${restaurant.cuisine}</div>`
              : ""
          }
          ${
            locationLine
              ? `<div class="oltra-map-popup__meta">${locationLine}</div>`
              : ""
          }
          ${
            firstAward
              ? `<div class="oltra-map-popup__meta">${firstAward}</div>`
              : ""
          }
        </div>
      `);

      el.addEventListener("mouseenter", () => {
        try {
          popup.setLngLat([restaurant.lng!, restaurant.lat!]).addTo(map);
        } catch {}
      });

      el.addEventListener("mouseleave", () => {
        if (popup.isOpen()) {
          try {
            popup.remove();
          } catch {}
        }
      });

      el.addEventListener("click", (event) => {
        event.stopPropagation();
        revealInListRef.current = true;
        setSelectedId(restaurant.id);
      });

      const marker = new ml.Marker({ element: el })
        .setLngLat([restaurant.lng, restaurant.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
      bounds.extend([restaurant.lng, restaurant.lat]);
      hasBounds = true;
    }

    if (selectedHotel) {
      const hotelEl = document.createElement("button");
      hotelEl.type = "button";
      hotelEl.className = "hotel-marker";
      hotelEl.setAttribute("aria-label", `${selectedHotel.hotel_name} (hotel)`);

      const hotelInner = document.createElement("span");
      hotelInner.className = "hotel-marker__inner";
      hotelInner.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" class="hotel-marker__icon">
          <path d="M4 21V6.5A1.5 1.5 0 0 1 5.5 5h4A1.5 1.5 0 0 1 11 6.5V21M4 21h16M4 21H2.5M20 21V6.5A1.5 1.5 0 0 0 18.5 5h-4A1.5 1.5 0 0 0 13 6.5V21M20 21h1.5M7 9h1M7 13h1M15 9h1M15 13h1M11 21v-4a1 1 0 0 1 1-1v0a1 1 0 0 1 1 1v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
      hotelEl.appendChild(hotelInner);

      const hotelPopup = new ml.Popup({
        closeButton: false,
        closeOnClick: true,
        closeOnMove: false,
        offset: 14,
        className: "oltra-map-popup",
      }).setHTML(`
        <div class="oltra-map-popup__box">
          <div class="oltra-map-popup__title">${selectedHotel.hotel_name}</div>
          <div class="oltra-map-popup__meta">Your hotel - click to go back</div>
        </div>
      `);

      hotelEl.addEventListener("mouseenter", () => {
        try {
          hotelPopup.setLngLat([selectedHotel.lng, selectedHotel.lat]).addTo(map);
        } catch {}
      });

      hotelEl.addEventListener("mouseleave", () => {
        if (hotelPopup.isOpen()) {
          try {
            hotelPopup.remove();
          } catch {}
        }
      });

      hotelEl.addEventListener("click", (event) => {
        event.stopPropagation();
        router.push(`/hotels?q=${encodeURIComponent(selectedHotel.hotel_name)}&submitted=1`);
      });

      const hotelMarker = new ml.Marker({ element: hotelEl })
        .setLngLat([selectedHotel.lng, selectedHotel.lat])
        .setPopup(hotelPopup)
        .addTo(map);

      markersRef.current.push(hotelMarker);
      bounds.extend([selectedHotel.lng, selectedHotel.lat]);
      hasBounds = true;
    }

    if (hasBounds) {
      map.fitBounds(bounds, {
        padding: { top: 72, right: 72, bottom: 72, left: 72 },
        maxZoom: 15,
        duration: 0,
      });
    } else if (restaurants.length === 0) {
      map.jumpTo(EMPTY_MAP_VIEW);
    }
    // filtered to empty — leave map where it is

    map.resize();
    // selectedRestaurant is read above only to mark the initial selection. The
    // effect after this one keeps data-selected in step on every selection;
    // depending on it here would rebuild every marker and refit the map each
    // time a restaurant is picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, restaurants, filteredRestaurants, mapReady, selectedHotel, router]);

  useEffect(() => {
    markersRef.current.forEach((marker) => {
      const el = marker.getElement() as HTMLElement | null;
      if (!el) return;

      const restaurantId = Number(el.dataset.restaurantId);
      el.dataset.selected = String(restaurantId === selectedRestaurant?.id);
    });
  }, [selectedRestaurant]);

    useEffect(() => {
    let active = true;

    async function loadMemberAccess() {
      try {
        const result = await getMemberActionAccessBrowser();
        if (!active) return;
        setIsMemberLoggedIn(result.isLoggedIn);
      } catch {
        if (!active) return;
        setIsMemberLoggedIn(false);
      }
    }

    void loadMemberAccess();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="restaurants-layout">
      <aside className="oltra-glass oltra-panel restaurants-sidebar">
        <div className="restaurants-sidebar__intro">
          {/* City and Restaurant type share one row at equal width. */}
          <div className="restaurants-sidebar__filters">
          <div className="restaurants-sidebar__filter">
          <div className="oltra-label restaurants-sidebar__label">CITY</div>

          <div
            ref={cityLookupRef}
            className="restaurants-city-lookup"
            data-oltra-control="true"
            {...cityLookupDismissProps}
          >
            <input
              ref={cityInputRef}
              id="restaurants-city"
              name="city"
              value={cityInput}
              onChange={(e) => {
                setCityInput(e.target.value);
                setShowCityOptions(true);
              }}
              onFocus={() => {
                setCityInput("");
                setShowCityOptions(true);
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  setShowCityOptions(false);
                  if (!cityInput.trim()) {
                    setCityInput(city);
                  }
                }, 120);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  updateCity(cityInput);
                }
                if (e.key === "Escape") {
                  setShowCityOptions(false);
                  setCityInput(city);
                  cityInputRef.current?.blur();
                }
              }}
              placeholder="Type city"
              autoComplete="off"
              className="oltra-input restaurants-city-lookup__input"
            />

            {showCityOptions && filteredCityOptions.length > 0 && (
              <div className="oltra-dropdown-panel restaurants-city-lookup__menu">
                <div className="oltra-dropdown-list">
                  {filteredCityOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className="oltra-dropdown-item restaurants-city-lookup__option"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        updateCity(option);
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          </div>

          <div className="restaurants-sidebar__filter">
            <div className="oltra-label restaurants-sidebar__label">RESTAURANT TYPE</div>
            <OltraSelect
              name="restaurant_type"
              value={selectedType}
              placeholder="All"
              align="left"
              options={[
                ...(curatedRestaurants.length ? [AI_CURATED] : []),
                ...RESTAURANT_TYPES.filter(
                  (type) => type === "All" || availableTypes.has(type)
                ),
              ].map((type) => ({ value: type, label: type }))}
              onValueChange={(v) => setSelectedType(v as RestaurantType)}
            />
          </div>
          </div>

          <p className="restaurants-sidebar__count">
            {filteredRestaurants.length} RESTAURANT{filteredRestaurants.length !== 1 ? "S" : ""}
          </p>
        </div>

        <div ref={listRef} className="restaurants-sidebar__list oltra-scroll-fade">
          <div className="restaurants-sidebar__list-inner">
            {filteredRestaurants.map((restaurant) => {
              const active = restaurant.id === selectedRestaurant?.id;

              return (
                <button
                  key={restaurant.id}
                  type="button"
                  data-restaurant-id={restaurant.id}
                  onClick={() => {
                    setSelectedId(restaurant.id);
                    const map = mapInstanceRef.current;
                    if (map && restaurant.lat != null && restaurant.lng != null) {
                      if (!map.getBounds().contains([restaurant.lng, restaurant.lat])) {
                        map.easeTo({ center: [restaurant.lng, restaurant.lat], duration: 400 });
                      }
                    }
                  }}
                  className={`oltra-output restaurant-row${active ? " is-active" : ""}`}
                >
                  <div className="restaurant-row__title">
                    {restaurant.restaurant_name}
                    {favoriteRestaurantIds.has(String(restaurant.id)) ? (
                      <FavouriteStar />
                    ) : null}
                  </div>
                  <div className="restaurant-row__meta">
                    {[restaurant.cuisine, restaurant.local_area, restaurant.city]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selectedRestaurant && (
          <div className="restaurants-sidebar__detail">
            <div className="oltra-label restaurants-sidebar__label">SELECTED</div>

            <article className="oltra-output restaurant-detail-card oltra-scroll-fade">
              <h2 className="restaurant-detail-card__title">
                {selectedRestaurant.restaurant_name}
                {favoriteRestaurantIds.has(String(selectedRestaurant.id)) ? (
                  <FavouriteStar />
                ) : null}
              </h2>

              {/* The street address ends with city and country, so beside it
                  the area line keeps only the neighbourhood. */}
              {(selectedRestaurant.address
                ? selectedRestaurant.local_area
                : buildAddressLabel(selectedRestaurant)) && (
                <div className="restaurant-detail-card__address">
                  {selectedRestaurant.address
                    ? selectedRestaurant.local_area
                    : buildAddressLabel(selectedRestaurant)}
                </div>
              )}

              {selectedRestaurant.address && (
                <div className="restaurant-detail-card__street">
                  {selectedRestaurant.address}
                </div>
              )}

              {(selectedRestaurant.www ||
                selectedRestaurant.insta ||
                selectedRestaurant.phone) && (
                <div className="restaurant-detail-card__links">
                  {selectedRestaurant.www && (
                    <a
                      href={selectedRestaurant.www}
                      target="_blank"
                      rel="noreferrer"
                      className="restaurant-detail-card__link-text"
                    >
                      Website
                    </a>
                  )}
                  {selectedRestaurant.www && selectedRestaurant.insta && (
                    <span className="restaurant-detail-card__link-sep">·</span>
                  )}
                  {selectedRestaurant.insta && (
                    <a
                      href={selectedRestaurant.insta}
                      target="_blank"
                      rel="noreferrer"
                      className="restaurant-detail-card__link-text"
                    >
                      Instagram
                    </a>
                  )}
                  {(selectedRestaurant.www || selectedRestaurant.insta) &&
                    selectedRestaurant.phone && (
                      <span className="restaurant-detail-card__link-sep">·</span>
                    )}
                  {selectedRestaurant.phone && (
                    <a
                      href={`tel:${selectedRestaurant.phone.replace(/[^\d+]/g, "")}`}
                      className="restaurant-detail-card__link-text"
                    >
                      {selectedRestaurant.phone}
                    </a>
                  )}
                </div>
              )}

              <div className="restaurant-detail-card__meta">
                {[
                  selectedRestaurant.cuisine,
                  selectedRestaurant.restaurant_setting,
                  selectedRestaurant.restaurant_style,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>

              {buildAwardsLabel(selectedRestaurant) && (
                <div className="restaurant-detail-card__meta">
                  {buildAwardsLabel(selectedRestaurant)}
                </div>
              )}

              {selectedRestaurant.highlights && (
                <p className="restaurant-detail-card__highlights">
                  {selectedRestaurant.highlights}
                </p>
              )}

              {selectedRestaurant.description && (
                <div className="restaurant-detail-card__description">
                  {selectedRestaurant.description.split(/\n+/).filter(Boolean).map((para, i) => (
                    <p key={i} className={i > 0 ? "mt-2" : ""}>{para}</p>
                  ))}
                </div>
              )}

              {selectedRestaurant.hotel_name_hint && (
                <div className="restaurant-detail-card__hotel-context">
                  Hotel: {selectedRestaurant.hotel_name_hint}
                </div>
              )}

              {/* The shared trip picker (2026-10-05), as on Hotels, Flights and
                  Landing. This page had its own copy, which opened inside the
                  fixed-height panel, clipped, and never showed a saved state;
                  the shared one is portalled, flips up when there is no room,
                  and goes passive once saved. */}
              <div className="relative pt-1" data-oltra-control="true">
                {/* Side by side and equal width (Ulrik, 2026-09-21), through
                    §35A's own pair primitive rather than a local grid. Stacked
                    they cost the fixed-height pane a whole row, and the labels
                    fit the half-width comfortably at the condensed size. */}
                <div className="oltra-btn-pair w-full">
                  <SaveToTripControl
                    onSave={(tripId) => handleSaveRestaurant(tripId, selectedRestaurant)}
                    newTripDefaults={{
                      destination: buildLocationLabel(selectedRestaurant) || null,
                      periodLabel: null,
                    }}
                    savedKey={`restaurant|${selectedRestaurant.id}`}
                    label="SAVE TO TRIP"
                    compact
                    dropUp
                    className="oltra-btn oltra-btn--condensed oltra-btn--block"
                  />

                  {/* Passive and labelled FAVOURITE once it is one (Ulrik,
                      2026-09-24): nothing left to do, and the label says so. */}
                  <button
                    type="button"
                    onClick={() => {
                      if (isMemberLoggedIn && selectedIsFavourite) return;

                      setMemberActionMessage("");
                      setMemberActionError("");

                      if (!isMemberLoggedIn) {
                        setMemberActionError(getMemberActionLoginMessage("favorite"));
                        return;
                      }

                      void handleAddRestaurantToFavorites();
                    }}
                    className="oltra-btn oltra-btn--condensed"
                    aria-disabled={!isMemberLoggedIn || selectedIsFavourite}
                    data-reason={
                      !isMemberLoggedIn
                        ? "Log in to add favourites"
                        : selectedIsFavourite
                          ? "Your favourite"
                          : undefined
                    }
                  >
                    {memberActionLoading === "favorite"
                      ? "ADDING..."
                      : isMemberLoggedIn && selectedIsFavourite
                        ? "FAVOURITE"
                        : "ADD TO FAVOURITES"}
                  </button>
                </div>
              </div>

              {(memberActionError || memberActionMessage) ? (
                <div className="pt-2 text-[12px] text-[color:var(--oltra-text-muted)]">
                  {memberActionError || memberActionMessage}
                </div>
              ) : null}
            </article>
          </div>
        )}
      </aside>

      <section className="restaurants-map-pane">
        <div ref={mapRef} className="restaurants-map-canvas" />
      </section>
    </div>
  );
}