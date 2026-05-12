"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  getMemberActionAccessBrowser,
} from "@/lib/members/db";
import {
  getMemberActionButtonClass,
  getMemberActionLoginMessage,
} from "@/lib/members/memberActionUi";
import { fetchMemberProfileBrowser } from "@/lib/members/db";
import { readHotelFlightSearch } from "@/lib/searchSession";

import type { RestaurantRecord } from "../types";
import { buildAwardsLabel, buildLocationLabel, buildAddressLabel } from "../utils";
import {
  addFavoriteRestaurantBrowser,
  addRestaurantToTripBrowser,
  createTripBrowser,
  fetchTripChoicesBrowser,
} from "@/lib/members/db";

type Props = {
  city: string;
  cityOptions: string[];
  restaurants: RestaurantRecord[];
  mapRestaurants: RestaurantRecord[];
};

const DEFAULT_FALLBACK_CENTER: [number, number] = [103.8198, 1.3521];

export default function RestaurantsMapView({
  city,
  cityOptions,
  restaurants,
  mapRestaurants,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const selectionFromMapRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const cityInputRef = useRef<HTMLInputElement | null>(null);
  const tripPickerRef = useRef<HTMLDivElement | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(
    restaurants[0]?.id ?? null
  );
  const [cityInput, setCityInput] = useState(city);
  const [showCityOptions, setShowCityOptions] = useState(false);

  const [memberActionMessage, setMemberActionMessage] = useState("");
  const [memberActionError, setMemberActionError] = useState("");
  const [memberActionLoading, setMemberActionLoading] = useState<
    "trip" | "favorite" | null
  >(null);

  const [tripChoices, setTripChoices] = useState<
    Array<{ id: string; name: string; label: string }>
  >([]);
  const [selectedTripIdForAdd, setSelectedTripIdForAdd] = useState("");
  const [showTripPicker, setShowTripPicker] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const [creatingTrip, setCreatingTrip] = useState(false);

  const [isMemberLoggedIn, setIsMemberLoggedIn] = useState(false);

  useEffect(() => {
    setCityInput(city);
    setShowCityOptions(false);
  }, [city]);

  // If the user landed on /restaurants without an explicit ?city= param,
  // try saved hotel/flight search → member home airport → leave default (Paris).
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
    if (!restaurants.length) {
      setSelectedId(null);
      return;
    }

    if (!restaurants.some((r) => r.id === selectedId)) {
      setSelectedId(restaurants[0].id);
    }
  }, [restaurants, selectedId]);

  const selectedRestaurant = useMemo(() => {
    if (!restaurants.length) return null;
    return restaurants.find((r) => r.id === selectedId) ?? restaurants[0];
  }, [restaurants, selectedId]);

  async function handleAddRestaurantToTrip(tripId?: string) {
    if (!selectedRestaurant) return;
    if (!isMemberLoggedIn) {
      setMemberActionError(getMemberActionLoginMessage("favorite"));
      return;
    }
    try {
      setMemberActionLoading("trip");
      setMemberActionMessage("");
      setMemberActionError("");

      const result = await addRestaurantToTripBrowser({
        tripId: tripId || selectedTripIdForAdd || null,
        restaurantDirectusId: String(selectedRestaurant.id),
        name: selectedRestaurant.restaurant_name,
        location: buildLocationLabel(selectedRestaurant),
        reservationLabel: null,
        thumbnail: "/images/hero-lp.jpg",
      });

      if (result.duplicate) {
        setMemberActionMessage("Restaurant already exists in this trip.");
      } else {
        setMemberActionMessage("Restaurant added to trip.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";

      if (
        message.includes("auth") ||
        message.includes("login") ||
        message.includes("sign in") ||
        message.includes("unauthorized") ||
        message.includes("not authenticated")
      ) {
        setMemberActionError("Log in to add to trip.");
      } else {
        setMemberActionError("Could not add restaurant to trip.");
      }
    } finally {
      setMemberActionLoading(null);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadTripChoices() {
      try {
        const trips = await fetchTripChoicesBrowser();
        if (!active) return;

        setTripChoices(trips);
        setSelectedTripIdForAdd((prev) => prev || trips[0]?.id || "");
      } catch {
        if (!active) return;
        setTripChoices([]);
        setSelectedTripIdForAdd("");
      }
    }

    loadTripChoices();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!tripPickerRef.current) return;

      if (!tripPickerRef.current.contains(event.target as Node)) {
        setShowTripPicker(false);
      }
    }

    if (showTripPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showTripPicker]);

  useEffect(() => {
    if (!memberActionMessage && !memberActionError) return;

    const timer = window.setTimeout(() => {
      setMemberActionMessage("");
      setMemberActionError("");
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [memberActionMessage, memberActionError]);

  async function handleCreateTripAndAddRestaurant() {
    if (!selectedRestaurant) return;
    if (!isMemberLoggedIn) {
      setShowTripPicker(false);
      setMemberActionError(getMemberActionLoginMessage("trip"));
      return;
    }
    try {
      setCreatingTrip(true);
      setMemberActionMessage("");
      setMemberActionError("");

      const createdTrip = await createTripBrowser({
        name: newTripName || "New trip",
        destination: buildLocationLabel(selectedRestaurant) || null,
        periodLabel: null,
      });

      setTripChoices((prev) => [...prev, createdTrip]);
      setSelectedTripIdForAdd(createdTrip.id);

      const result = await addRestaurantToTripBrowser({
        tripId: createdTrip.id,
        restaurantDirectusId: String(selectedRestaurant.id),
        name: selectedRestaurant.restaurant_name,
        location: buildLocationLabel(selectedRestaurant),
        reservationLabel: null,
        thumbnail: "/images/hero-lp.jpg",
      });

      setNewTripName("");
      setShowTripPicker(false);

      if (result.duplicate) {
        setMemberActionMessage("Restaurant already exists in this trip.");
      } else {
        setMemberActionMessage("New trip created and restaurant added.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";

      if (
        message.includes("auth") ||
        message.includes("login") ||
        message.includes("sign in") ||
        message.includes("unauthorized") ||
        message.includes("not authenticated")
      ) {
        setMemberActionError("Log in to add to trip.");
      } else {
        setMemberActionError("Could not create trip.");
      }
    } finally {
      setCreatingTrip(false);
    }
  }

  async function handleAddRestaurantToFavorites() {
    if (!selectedRestaurant) return;
    if (!isMemberLoggedIn) {
      setShowTripPicker(false);
      setMemberActionError(getMemberActionLoginMessage("trip"));
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

      setMemberActionMessage("Restaurant added to favourites.");
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

  const filteredCityOptions = useMemo(() => {
    const query = cityInput.trim().toLowerCase();

    if (!query) return cityOptions;

    return cityOptions.filter((option) =>
      option.toLowerCase().includes(query)
    );
  }, [cityInput, cityOptions]);

  function updateCity(nextCityRaw: string) {
    const normalizedInput = nextCityRaw.trim().toLowerCase();
    if (!normalizedInput) {
      setCityInput(city);
      setShowCityOptions(false);
      return;
    }

    const matchedCity = cityLookup.get(normalizedInput);
    if (!matchedCity) {
      const fallbackMatch = cityOptions.find(
        (option) => option.toLowerCase() === normalizedInput
      );

      if (!fallbackMatch) {
        setCityInput(city);
        setShowCityOptions(false);
        cityInputRef.current?.blur();
        return;
      }
    }

    const nextCity =
      cityLookup.get(normalizedInput) ??
      cityOptions.find((option) => option.toLowerCase() === normalizedInput) ??
      city;

    setCityInput(nextCity);
    setShowCityOptions(false);

    if (nextCity !== city) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("city", nextCity);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
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

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: `https://api.maptiler.com/maps/streets-v4/style.json?key=${key}`,
      center: DEFAULT_FALLBACK_CENTER,
      zoom: 12,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.resize();
      window.setTimeout(() => map.resize(), 100);
      window.setTimeout(() => map.resize(), 350);
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
      map.resize();
    };

    window.addEventListener("resize", onWindowResize);

    if (typeof ResizeObserver !== "undefined" && mapRef.current) {
      const observer = new ResizeObserver(() => {
        map.resize();
      });
      observer.observe(mapRef.current);
      resizeObserverRef.current = observer;
    }

    return () => {
      window.removeEventListener("resize", onWindowResize);

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

      try {
        map.remove();
      } catch {}

      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

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

    const bounds = new maplibregl.LngLatBounds();
    let hasBounds = false;

    for (const restaurant of mapRestaurants) {
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

      const popup = new maplibregl.Popup({
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
        selectionFromMapRef.current = true;
        setSelectedId(restaurant.id);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([restaurant.lng, restaurant.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
      bounds.extend([restaurant.lng, restaurant.lat]);
      hasBounds = true;
    }

    if (hasBounds) {
      map.fitBounds(bounds, {
        padding: { top: 72, right: 72, bottom: 72, left: 72 },
        maxZoom: 15,
        duration: 0,
      });
    } else {
      map.jumpTo({
        center: DEFAULT_FALLBACK_CENTER,
        zoom: 11,
      });
    }

    map.resize();
  }, [city, mapRestaurants]);

  useEffect(() => {
    markersRef.current.forEach((marker) => {
      const el = marker.getElement() as HTMLElement | null;
      if (!el) return;

      const restaurantId = Number(el.dataset.restaurantId);
      el.dataset.selected = String(restaurantId === selectedRestaurant?.id);
    });
  }, [selectedRestaurant]);

    useEffect(() => {
    if (selectionFromMapRef.current) {
      selectionFromMapRef.current = false;
      return;
    }

    const map = mapInstanceRef.current;
    if (!map || !selectedRestaurant) return;
    if (selectedRestaurant.lng === null || selectedRestaurant.lat === null) return;

    map.easeTo({
      center: [selectedRestaurant.lng, selectedRestaurant.lat],
      zoom: map.getZoom(),
      duration: 500,
      essential: true,
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
          <div className="oltra-label restaurants-sidebar__label">CITY</div>

          <div className="restaurants-city-lookup">
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

          <p className="restaurants-sidebar__count">TOP RESTAURANTS</p>
        </div>

        <div className="restaurants-sidebar__list">
          <div className="restaurants-sidebar__list-inner">
            {restaurants.map((restaurant) => {
              const active = restaurant.id === selectedRestaurant?.id;

              return (
                <button
                  key={restaurant.id}
                  type="button"
                  onClick={() => {
                    selectionFromMapRef.current = false;
                    setSelectedId(restaurant.id);
                  }}
                  className={`oltra-output restaurant-row${active ? " is-active" : ""}`}
                >
                  <div className="restaurant-row__title">
                    {restaurant.restaurant_name}
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

            <article className="oltra-output restaurant-detail-card">
              <h2 className="restaurant-detail-card__title">
                {selectedRestaurant.restaurant_name}
              </h2>

              {(selectedRestaurant.www || selectedRestaurant.insta) && (
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

              {buildLocationLabel(selectedRestaurant) && (
                <div className="restaurant-detail-card__location">
                  {buildLocationLabel(selectedRestaurant)}
                </div>
              )}

              {selectedRestaurant.highlights && (
                <p className="restaurant-detail-card__highlights">
                  {selectedRestaurant.highlights}
                </p>
              )}

              {selectedRestaurant.description && (
                <p className="restaurant-detail-card__description">
                  {selectedRestaurant.description}
                </p>
              )}

              {selectedRestaurant.hotel_name_hint && (
                <div className="restaurant-detail-card__hotel-context">
                  Hotel: {selectedRestaurant.hotel_name_hint}
                </div>
              )}

              {buildAddressLabel(selectedRestaurant) && (
                <div className="restaurant-detail-card__address">
                  {buildAddressLabel(selectedRestaurant)}
                </div>
              )}

              <div ref={tripPickerRef} className="relative pt-1">
                {showTripPicker && (
                  <div
                    className="oltra-popup-panel oltra-popup-panel--bounded oltra-popup-panel--up absolute left-0 right-0 z-50 mb-2"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="oltra-subheader">Select trip</div>

                    <div className="mt-2 flex flex-col gap-2">
                      {tripChoices.length ? (
                        tripChoices.map((trip) => (
                          <button
                            key={trip.id}
                            type="button"
                            onClick={() => {
                              setSelectedTripIdForAdd(trip.id);
                              setShowTripPicker(false);
                              void handleAddRestaurantToTrip(trip.id);
                            }}
                            className="oltra-dropdown-item"
                          >
                            {trip.label}
                          </button>
                        ))
                      ) : (
                        <div className="text-[12px] text-white/65">
                          No trips available.
                        </div>
                      )}

                      <div className="mt-3 border-t border-white/10 pt-3">
                        <div className="oltra-subheader">Create new trip</div>

                        <div className="mt-2 flex flex-col gap-2">
                          <input
                            type="text"
                            value={newTripName}
                            onChange={(e) => setNewTripName(e.target.value)}
                            placeholder="Trip name"
                            className="oltra-input"
                          />

                          <button
                            type="button"
                            onClick={handleCreateTripAndAddRestaurant}
                            disabled={creatingTrip}
                            className="oltra-dropdown-item"
                          >
                            {creatingTrip ? "Creating..." : "Create new trip"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMemberActionMessage("");
                      setMemberActionError("");

                      if (!isMemberLoggedIn) {
                        setShowTripPicker(false);
                        setMemberActionError(getMemberActionLoginMessage("trip"));
                        return;
                      }

                      setShowTripPicker((prev) => !prev);
                    }}
                    className={`${getMemberActionButtonClass(isMemberLoggedIn)} w-full`}
                    aria-disabled={!isMemberLoggedIn}
                  >
                    {memberActionLoading === "trip" ? "ADDING..." : "ADD TO TRIP"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMemberActionMessage("");
                      setMemberActionError("");

                      if (!isMemberLoggedIn) {
                        setMemberActionError(getMemberActionLoginMessage("favorite"));
                        return;
                      }

                      void handleAddRestaurantToFavorites();
                    }}
                    className={`${getMemberActionButtonClass(isMemberLoggedIn)} w-full`}
                    aria-disabled={!isMemberLoggedIn}
                  >
                    {memberActionLoading === "favorite"
                      ? "ADDING..."
                      : "ADD TO FAVOURITES"}
                  </button>
                </div>
              </div>

              {(memberActionError || memberActionMessage) ? (
                <div className="pt-2 text-[12px] text-white/65">
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