"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import maplibregl from "maplibre-gl";
import type { RestaurantRecord } from "../types";
import { buildAwardsLabel, buildLocationLabel } from "../utils";
import "maplibre-gl/dist/maplibre-gl.css";
import "../restaurants.css";
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

  useEffect(() => {
    setCityInput(city);
    setShowCityOptions(false);
  }, [city]);

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
      setMemberActionError("Could not add restaurant to trip.");
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

  async function handleCreateTripAndAddRestaurant() {
    if (!selectedRestaurant) return;

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
      setMemberActionError("Could not create trip.");
    } finally {
      setCreatingTrip(false);
    }
  }

  async function handleAddRestaurantToFavorites() {
    if (!selectedRestaurant) return;

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
      setMemberActionError("Could not add restaurant to favourites.");
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

    if (!query) return cityOptions.slice(0, 12);

    return cityOptions
      .filter((option) => option.toLowerCase().includes(query))
      .slice(0, 12);
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

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: true,
        closeOnMove: false,
        offset: 14,
      }).setHTML(`
        <div class="oltra-glass oltra-output restaurant-map-popup">
          <div class="restaurant-map-popup__title">
            ${restaurant.restaurant_name}
          </div>
          ${
            restaurant.cuisine
              ? `<div class="restaurant-map-popup__meta">${restaurant.cuisine}</div>`
              : ""
          }
          ${
            restaurant.local_area || restaurant.city
              ? `<div class="restaurant-map-popup__location">${
                  restaurant.local_area ?? restaurant.city ?? ""
                }</div>`
              : ""
          }
          ${
            firstAward
              ? `<div class="restaurant-map-popup__award">${firstAward}</div>`
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

        markersRef.current.forEach((marker: any) => {
          const markerPopup = marker.getPopup?.();
          if (markerPopup && markerPopup !== popup && markerPopup.isOpen()) {
            try {
              markerPopup.remove();
            } catch {}
          }
        });

        try {
          popup.setLngLat([restaurant.lng!, restaurant.lat!]).addTo(map);
        } catch {}

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
  }, [city, mapRestaurants, selectedRestaurant?.id]);

  useEffect(() => {
    markersRef.current.forEach((marker) => {
      const el = marker.getElement() as HTMLElement | null;
      if (!el) return;

      const restaurantId = Number(el.dataset.restaurantId);
      el.dataset.selected = String(restaurantId === selectedRestaurant?.id);
    });
  }, [selectedRestaurant]);

  useEffect(() => {
    if (selectionFromMapRef.current) return;

    const map = mapInstanceRef.current;
    if (!map || !selectedRestaurant) return;
    if (selectedRestaurant.lng === null || selectedRestaurant.lat === null) return;

    map.easeTo({
      center: [selectedRestaurant.lng, selectedRestaurant.lat],
      duration: 600,
      essential: true,
    });
  }, [selectedRestaurant]);

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
                  Hotel context: {selectedRestaurant.hotel_name_hint}
                </div>
              )}

                <div
                  ref={tripPickerRef}
                  className="restaurant-detail-card__actions restaurant-detail-card__actions--relative"
                >
                <button
                  type="button"
                  className="oltra-button-secondary restaurant-detail-card__link"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTripPicker((prev) => !prev);
                  }}
                  disabled={memberActionLoading !== null}
                >
                  {memberActionLoading === "trip" ? "Adding..." : "Add to trip"}
                </button>

                {showTripPicker && (
                  <div
                    className="restaurant-trip-popup"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="restaurant-trip-popup__label">
                      Select trip
                    </div>

                    <div className="restaurant-trip-popup__list">
                      {tripChoices.length ? (
                        tripChoices.map((trip) => (
                          <button
                            key={trip.id}
                            type="button"
                            className="restaurant-trip-popup__item"
                            onClick={() => {
                              setSelectedTripIdForAdd(trip.id);
                              setShowTripPicker(false);
                              void handleAddRestaurantToTrip(trip.id);
                            }}
                          >
                            {trip.label}
                          </button>
                        ))
                      ) : (
                        <button
                          type="button"
                          className="restaurant-trip-popup__item"
                          onClick={() => {
                            handleAddRestaurantToTrip();
                            setShowTripPicker(false);
                          }}
                        >
                          My trip
                        </button>
                      )}
                    </div>
                    <div className="restaurant-trip-popup__create">
                      <div className="restaurant-trip-popup__label">
                        Create new trip
                      </div>

                      <div className="restaurant-trip-popup__list">
                        <input
                          type="text"
                          value={newTripName}
                          onChange={(e) => setNewTripName(e.target.value)}
                          placeholder="Trip name"
                          className="oltra-input"
                        />

                        <button
                          type="button"
                          className="restaurant-trip-popup__item"
                          onClick={() => {
                            handleCreateTripAndAddRestaurant();
                          }}
                          disabled={creatingTrip}
                        >
                          {creatingTrip ? "Creating..." : "Create new trip"}
                        </button>
                      </div>
                    </div>                    
                  </div>
                )}

                <button
                  type="button"
                  className="oltra-button-secondary restaurant-detail-card__link"
                  onClick={handleAddRestaurantToFavorites}
                  disabled={memberActionLoading !== null}
                >
                  {memberActionLoading === "favorite"
                    ? "Adding..."
                    : "Add to favourites"}
                </button>

                {selectedRestaurant.www && (
                  <a
                    href={selectedRestaurant.www}
                    target="_blank"
                    rel="noreferrer"
                    className="oltra-button-secondary restaurant-detail-card__link"
                  >
                    Website
                  </a>
                )}

                {selectedRestaurant.insta && (
                  <a
                    href={selectedRestaurant.insta}
                    target="_blank"
                    rel="noreferrer"
                    className="oltra-button-secondary restaurant-detail-card__link"
                  >
                    Instagram
                  </a>
                )}
              </div>

              {(memberActionError || memberActionMessage) ? (
                <div className="restaurant-detail-card__status">
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