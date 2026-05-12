"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type {
  InspireCityMatch,
  InspireMonth,
} from "@/lib/inspire/types";
import { INSPIRE_CITY_METADATA } from "@/lib/inspire/cityMetadata";
import "maplibre-gl/dist/maplibre-gl.css";

type TempUnit = "C" | "F";

type Origin = {
  label: string;
  lat: number;
  lng: number;
};

type Props = {
  matches: InspireCityMatch[];
  origin: Origin;
  month: InspireMonth;
  maxFlightHours: number;
  activeCityId: string | null;
  onSelectCity: (match: InspireCityMatch) => void;
};

const DEFAULT_WORLD_ZOOM = 1.5;
const HOTEL_MARKER_ZOOM = 8.2;
const TEMP_BAND_SOURCE_ID = "inspire-temp-bands";
const TEMP_BAND_LAYER_ID = "inspire-temp-band";
const TEMP_LABEL_SOURCE_ID = "inspire-temp-labels";
const TEMP_LABEL_LAYER_ID = "inspire-temp-label";
const FLIGHT_KM_PER_HOUR = 750;

const BAND_STEP_LAT = 6;
const BAND_STEP_LNG = 10;
const IDW_POWER = 2;
const MAX_CITY_DISTANCE_KM = 2500;

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) *
      Math.cos(lat2 * toRad) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function idwSample(
  lat: number,
  lng: number,
  month: InspireMonth
): { temp: number; nearest: number } {
  let weightedSum = 0;
  let weightTotal = 0;
  let nearest = Infinity;

  for (const city of INSPIRE_CITY_METADATA) {
    const d = haversineKm(lat, lng, city.lat, city.lng);
    if (d < nearest) nearest = d;
    if (d < 1) return { temp: city.monthlyAvgTempC[month], nearest: 0 };
    const w = 1 / Math.pow(d, IDW_POWER);
    weightedSum += w * city.monthlyAvgTempC[month];
    weightTotal += w;
  }

  return { temp: weightedSum / weightTotal, nearest };
}

function buildTempBandsGeoJSON(
  month: InspireMonth
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

  for (let lat = -78; lat < 78; lat += BAND_STEP_LAT) {
    for (let lng = -180; lng < 180; lng += BAND_STEP_LNG) {
      const midLat = lat + BAND_STEP_LAT / 2;
      const midLng = lng + BAND_STEP_LNG / 2;
      const { temp, nearest } = idwSample(midLat, midLng, month);
      if (nearest > MAX_CITY_DISTANCE_KM) continue;

      features.push({
        type: "Feature",
        properties: { temp },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [lng, lat],
              [lng + BAND_STEP_LNG, lat],
              [lng + BAND_STEP_LNG, lat + BAND_STEP_LAT],
              [lng, lat + BAND_STEP_LAT],
              [lng, lat],
            ],
          ],
        },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

function buildTempLabelsGeoJSON(
  month: InspireMonth,
  unit: TempUnit
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

  for (let lat = -78; lat < 78; lat += BAND_STEP_LAT) {
    for (let lng = -180; lng < 180; lng += BAND_STEP_LNG) {
      const midLat = lat + BAND_STEP_LAT / 2;
      const midLng = lng + BAND_STEP_LNG / 2;
      const { temp, nearest } = idwSample(midLat, midLng, month);
      if (nearest > MAX_CITY_DISTANCE_KM) continue;

      const value =
        unit === "C"
          ? `${Math.round(temp)}°C`
          : `${Math.round((temp * 9) / 5 + 32)}°F`;
      features.push({
        type: "Feature",
        properties: { tempLabel: value },
        geometry: {
          type: "Point",
          coordinates: [midLng, midLat],
        },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

export default function InspireMapView({
  matches,
  origin,
  month,
  maxFlightHours,
  activeCityId,
  onSelectCity,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const cityMarkersRef = useRef<maplibregl.Marker[]>([]);
  const hotelMarkersRef = useRef<maplibregl.Marker[]>([]);
  const originMarkerRef = useRef<maplibregl.Marker | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const onSelectCityRef = useRef(onSelectCity);
  const monthRef = useRef(month);

  const [tempUnit, setTempUnit] = useState<TempUnit>("C");
  const [tempsVisible, setTempsVisible] = useState<boolean>(true);
  const tempUnitRef = useRef(tempUnit);

  useEffect(() => {
    onSelectCityRef.current = onSelectCity;
  }, [onSelectCity]);

  useEffect(() => {
    monthRef.current = month;
  }, [month]);

  useEffect(() => {
    tempUnitRef.current = tempUnit;
  }, [tempUnit]);

  function syncMarkerVisibility() {
    const map = mapInstanceRef.current;
    if (!map) return;

    const showHotels = map.getZoom() >= HOTEL_MARKER_ZOOM;

    cityMarkersRef.current.forEach((marker) => {
      marker.getElement().style.display = showHotels ? "none" : "";
    });

    hotelMarkersRef.current.forEach((marker) => {
      marker.getElement().style.display = showHotels ? "" : "none";
    });
  }

  function clearMarkers() {
    cityMarkersRef.current.forEach((marker) => marker.remove());
    hotelMarkersRef.current.forEach((marker) => marker.remove());
    originMarkerRef.current?.remove();

    cityMarkersRef.current = [];
    hotelMarkersRef.current = [];
    originMarkerRef.current = null;
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
      center: [origin.lng, origin.lat],
      zoom: DEFAULT_WORLD_ZOOM,
      minZoom: 1.3,
      renderWorldCopies: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource(TEMP_BAND_SOURCE_ID, {
        type: "geojson",
        data: buildTempBandsGeoJSON(monthRef.current),
      });

      map.addSource(TEMP_LABEL_SOURCE_ID, {
        type: "geojson",
        data: buildTempLabelsGeoJSON(monthRef.current, tempUnitRef.current),
      });

      const firstSymbolLayer = map
        .getStyle()
        .layers.find((layer) => layer.type === "symbol");

      map.addLayer(
        {
          id: TEMP_BAND_LAYER_ID,
          type: "fill",
          source: TEMP_BAND_SOURCE_ID,
          paint: {
            "fill-color": [
              "step",
              ["get", "temp"],
              "#1e3a8a",
              0, "#1d4ed8",
              5, "#3b82f6",
              10, "#06b6d4",
              15, "#14b8a6",
              20, "#84cc16",
              25, "#f59e0b",
              30, "#ea580c",
              35, "#b91c1c",
            ],
            "fill-opacity": 0.42,
            "fill-outline-color": "rgba(255, 255, 255, 0.35)",
          },
        },
        firstSymbolLayer?.id
      );

      map.addLayer({
        id: TEMP_LABEL_LAYER_ID,
        type: "symbol",
        source: TEMP_LABEL_SOURCE_ID,
        layout: {
          "text-field": ["get", "tempLabel"],
          "text-font": ["Open Sans Bold", "Noto Sans Bold"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0, 11,
            4, 13,
            8, 15,
          ],
          "text-allow-overlap": false,
          "text-padding": 4,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0, 0, 0, 0.55)",
          "text-halo-width": 1.2,
        },
      });

      safeResize();
      window.setTimeout(safeResize, 100);
      window.setTimeout(safeResize, 350);
    });

    function safeResize() {
      if (mapInstanceRef.current !== map) return;
      try {
        map.resize();
      } catch {
        /* map was removed mid-callback */
      }
    }

    map.on("zoom", syncMarkerVisibility);
    map.on("moveend", syncMarkerVisibility);

    const onWindowResize = safeResize;
    window.addEventListener("resize", onWindowResize);

    if (typeof ResizeObserver !== "undefined" && mapRef.current) {
      const observer = new ResizeObserver(safeResize);
      observer.observe(mapRef.current);
      resizeObserverRef.current = observer;
    }

    mapInstanceRef.current = map;

    return () => {
      window.removeEventListener("resize", onWindowResize);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      clearMarkers();

      try {
        map.remove();
      } catch {}

      mapInstanceRef.current = null;
    };
  }, [origin]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    function applyData() {
      const bandSource = map!.getSource(TEMP_BAND_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (bandSource) {
        bandSource.setData(buildTempBandsGeoJSON(month));
      }
      const labelSource = map!.getSource(TEMP_LABEL_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (labelSource) {
        labelSource.setData(buildTempLabelsGeoJSON(month, tempUnit));
      }
    }

    if (map.isStyleLoaded() && map.getSource(TEMP_LABEL_SOURCE_ID)) {
      applyData();
    } else {
      map.once("load", applyData);
    }
  }, [month, tempUnit]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    function applyVisibility() {
      if (!map) return;
      const visibility = tempsVisible ? "visible" : "none";
      if (map.getLayer(TEMP_LABEL_LAYER_ID)) {
        map.setLayoutProperty(TEMP_LABEL_LAYER_ID, "visibility", visibility);
      }
      if (map.getLayer(TEMP_BAND_LAYER_ID)) {
        map.setLayoutProperty(TEMP_BAND_LAYER_ID, "visibility", visibility);
      }
    }

    if (map.isStyleLoaded() && map.getLayer(TEMP_LABEL_LAYER_ID)) {
      applyVisibility();
    } else {
      map.once("load", applyVisibility);
    }
  }, [tempsVisible]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    clearMarkers();

    const originEl = document.createElement("button");
    originEl.type = "button";
    originEl.className = "oltra-map-origin-marker";
    originEl.setAttribute("aria-label", `Starting point: ${origin.label}`);
    originEl.innerHTML = `
      <span class="oltra-map-origin-marker__star" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26">
          <path d="M12 2.4l2.95 6.08 6.7.96-4.85 4.72 1.14 6.66L12 17.68l-5.94 3.14 1.14-6.66-4.85-4.72 6.7-.96L12 2.4z" fill="currentColor"/>
        </svg>
      </span>
    `;

    originMarkerRef.current = new maplibregl.Marker({ element: originEl })
      .setLngLat([origin.lng, origin.lat])
      .addTo(map);

    for (const match of matches) {
      const cityEl = document.createElement("button");
      cityEl.type = "button";
      cityEl.className = "oltra-map-city-marker";
      cityEl.dataset.cityId = match.city.id;
      cityEl.dataset.selected = String(match.city.id === activeCityId);
      cityEl.setAttribute("aria-label", `${match.city.city}, ${match.city.country}`);
      cityEl.innerHTML = `
        <span class="oltra-map-city-marker__inner">
          <span class="oltra-map-city-marker__count">${match.city.hotelCount}</span>
        </span>
      `;

      const avgDay = Math.round(match.selectedMonthTempC + 4);
      const avgNight = Math.round(match.selectedMonthTempC - 4);

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        closeOnMove: false,
        offset: 14,
        className: "oltra-map-popup",
      }).setHTML(`
        <div class="oltra-map-popup__box">
          <div class="oltra-map-popup__title">${match.city.city}, ${match.city.country}</div>
          <div class="oltra-map-popup__meta">${match.city.region}</div>
          <div class="oltra-map-popup__meta">${match.city.hotelCount} OLTRA hotel${match.city.hotelCount === 1 ? "" : "s"}</div>
          <div class="oltra-map-popup__meta">${avgDay}°C day · ${avgNight}°C night · approx. ${match.estimatedFlightHours}h flight</div>
        </div>
      `);

      cityEl.addEventListener("mouseenter", () => {
        popup.setLngLat([match.city.lng, match.city.lat]).addTo(map);
      });

      cityEl.addEventListener("mouseleave", () => {
        popup.remove();
      });

      cityEl.addEventListener("click", () => {
        onSelectCityRef.current(match);
      });

      cityMarkersRef.current.push(
        new maplibregl.Marker({ element: cityEl })
          .setLngLat([match.city.lng, match.city.lat])
          .setPopup(popup)
          .addTo(map)
      );

      for (const hotel of match.city.hotels) {
        const hotelEl = document.createElement("button");
        hotelEl.type = "button";
        hotelEl.className = "hotel-marker";
        hotelEl.dataset.cityId = match.city.id;
        hotelEl.dataset.selected = String(match.city.id === activeCityId);
        hotelEl.setAttribute("aria-label", hotel.hotel_name);
        hotelEl.innerHTML = `
          <span class="hotel-marker__inner" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M4 11.2 12 4l8 7.2v8.3a.5.5 0 0 1-.5.5h-5v-5.4h-5V20h-5a.5.5 0 0 1-.5-.5v-8.3Z" fill="currentColor"/>
            </svg>
          </span>
        `;

        const hotelPopup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          closeOnMove: false,
          offset: 14,
          className: "oltra-map-popup",
        }).setHTML(`
            <div class="oltra-map-popup__box">
              ${
                hotel.thumbnail
                  ? `<img class="oltra-map-popup__image" src="${hotel.thumbnail}" alt="" />`
                  : ""
              }
              <div class="oltra-map-popup__title">${hotel.hotel_name}</div>
              <div class="oltra-map-popup__meta">${match.city.city}, ${match.city.country}</div>
            </div>
          `);

        hotelEl.addEventListener("mouseenter", () => {
          hotelPopup.setLngLat([hotel.lng, hotel.lat]).addTo(map);
        });

        hotelEl.addEventListener("mouseleave", () => {
          hotelPopup.remove();
        });

        hotelEl.addEventListener("click", () => {
          window.location.href = `/hotels/${encodeURIComponent(hotel.hotelid)}`;
        });

        hotelMarkersRef.current.push(
          new maplibregl.Marker({ element: hotelEl })
            .setLngLat([hotel.lng, hotel.lat])
            .setPopup(hotelPopup)
            .addTo(map)
        );
      }
    }

    const clampLat = (lat: number) => Math.max(-85, Math.min(85, lat));
    const bounds = new maplibregl.LngLatBounds();
    const safeExtend = (lng: unknown, lat: unknown) => {
      const lngN = Number(lng);
      const latN = Number(lat);
      if (!Number.isFinite(lngN) || !Number.isFinite(latN)) return;
      bounds.extend([lngN, clampLat(latN)]);
    };

    // Include origin + every matched city/hotel marker, so the viewport fits
    // exactly the points the user is looking at — no extra flight-radius padding.
    safeExtend(origin.lng, origin.lat);
    for (const match of matches) {
      safeExtend(match.city.lng, match.city.lat);
      for (const hotel of match.city.hotels) {
        safeExtend(hotel.lng, hotel.lat);
      }
    }

    if (!bounds.isEmpty()) {
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const valid =
        sw &&
        ne &&
        Number.isFinite(sw.lng) &&
        Number.isFinite(sw.lat) &&
        Number.isFinite(ne.lng) &&
        Number.isFinite(ne.lat);
      if (valid) {
        try {
          map.fitBounds(bounds, {
            padding: { top: 72, right: 72, bottom: 72, left: 72 },
            maxZoom: 6.5,
            duration: 650,
          });
        } catch {
          /* skip on transient invalid bounds */
        }
      }
    }

    syncMarkerVisibility();
    // activeCityId intentionally NOT in deps — clicking a marker should not
    // re-trigger a fitBounds and override the user's manual zoom level.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, origin, maxFlightHours]);

  useEffect(() => {
    cityMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      el.dataset.selected = String(el.dataset.cityId === activeCityId);
    });

    hotelMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      el.dataset.selected = String(el.dataset.cityId === activeCityId);
    });
  }, [activeCityId]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="oltra-map-canvas" />
      <div className="oltra-temp-controls">
        <div className="oltra-temp-controls__heading">Temperature map</div>
        <div className="oltra-temp-controls__row">
          <button
            type="button"
            className={`oltra-temp-controls__toggle ${
              tempsVisible ? "is-on" : ""
            }`}
            aria-pressed={tempsVisible}
            onClick={() => setTempsVisible((v) => !v)}
          >
            <span className="oltra-temp-controls__toggle-track" aria-hidden="true">
              <span className="oltra-temp-controls__toggle-knob" />
            </span>
            <span>{tempsVisible ? "On" : "Off"}</span>
          </button>
          <div
            className={`oltra-temp-controls__unit ${
              tempsVisible ? "" : "is-disabled"
            }`}
            role="group"
            aria-label="Temperature unit"
          >
            <button
              type="button"
              className={tempUnit === "C" ? "is-active" : ""}
              onClick={() => setTempUnit("C")}
              disabled={!tempsVisible}
            >
              °C
            </button>
            <button
              type="button"
              className={tempUnit === "F" ? "is-active" : ""}
              onClick={() => setTempUnit("F")}
              disabled={!tempsVisible}
            >
              °F
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
