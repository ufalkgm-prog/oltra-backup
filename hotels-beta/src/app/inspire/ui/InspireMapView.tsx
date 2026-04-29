"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { InspireCityMatch } from "@/lib/inspire/types";
import "maplibre-gl/dist/maplibre-gl.css";

type Origin = {
  label: string;
  lat: number;
  lng: number;
};

type Props = {
  matches: InspireCityMatch[];
  origin: Origin;
  maxFlightHours: number;
  activeCityId: string | null;
  onSelectCity: (match: InspireCityMatch) => void;
};

const DEFAULT_FALLBACK_CENTER: [number, number] = [12.5683, 55.6761];
const HOTEL_MARKER_ZOOM = 8.2;
const FLIGHT_SPEED_KMH = 850;
const FLIGHT_RADIUS_SOURCE_ID = "inspire-flight-radius-shadow";
const FLIGHT_RADIUS_LAYER_ID = "inspire-flight-radius-shadow-layer";

function buildFlightRadiusShadow(
  origin: Origin,
  maxFlightHours: number
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const radiusKm = maxFlightHours * FLIGHT_SPEED_KMH;
  const earthRadiusKm = 6371;
  const points = 128;

  const lat = (origin.lat * Math.PI) / 180;
  const lng = (origin.lng * Math.PI) / 180;
  const angularDistance = radiusKm / earthRadiusKm;

  const circle: number[][] = [];

  for (let i = 0; i <= points; i += 1) {
    const bearing = (2 * Math.PI * i) / points;

    const pointLat = Math.asin(
      Math.sin(lat) * Math.cos(angularDistance) +
        Math.cos(lat) * Math.sin(angularDistance) * Math.cos(bearing)
    );

    const pointLng =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat),
        Math.cos(angularDistance) - Math.sin(lat) * Math.sin(pointLat)
      );

    circle.push([(pointLng * 180) / Math.PI, (pointLat * 180) / Math.PI]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-180, -85],
              [180, -85],
              [180, 85],
              [-180, 85],
              [-180, -85],
            ],
            circle.reverse(),
          ],
        },
      },
    ],
  };
}

export default function InspireMapView({
  matches,
  origin,
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

  useEffect(() => {
    onSelectCityRef.current = onSelectCity;
  }, [onSelectCity]);

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
      center: DEFAULT_FALLBACK_CENTER,
      zoom: 4,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource(FLIGHT_RADIUS_SOURCE_ID, {
        type: "geojson",
        data: buildFlightRadiusShadow(origin, maxFlightHours),
      });

      map.addLayer({
        id: FLIGHT_RADIUS_LAYER_ID,
        type: "fill",
        source: FLIGHT_RADIUS_SOURCE_ID,
        paint: {
          "fill-color": "rgba(8, 14, 20, 0.34)",
          "fill-opacity": 1,
        },
      });

      map.resize();
      window.setTimeout(() => map.resize(), 100);
      window.setTimeout(() => map.resize(), 350);
    });

    map.on("zoom", syncMarkerVisibility);
    map.on("moveend", syncMarkerVisibility);

    const onWindowResize = () => map.resize();
    window.addEventListener("resize", onWindowResize);

    if (typeof ResizeObserver !== "undefined" && mapRef.current) {
      const observer = new ResizeObserver(() => map.resize());
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
  }, [origin, maxFlightHours]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource(
      FLIGHT_RADIUS_SOURCE_ID
    ) as maplibregl.GeoJSONSource | undefined;

    source?.setData(buildFlightRadiusShadow(origin, maxFlightHours));
  }, [origin, maxFlightHours]);

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

    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([origin.lng, origin.lat]);

    for (const match of matches) {
      bounds.extend([match.city.lng, match.city.lat]);
    }

    if (matches.length) {
      map.fitBounds(bounds, {
        padding: { top: 72, right: 72, bottom: 72, left: 72 },
        maxZoom: 5.8,
        duration: 650,
      });
    } else {
      map.easeTo({
        center: [origin.lng, origin.lat],
        zoom: 5,
        duration: 500,
      });
    }

    syncMarkerVisibility();
  }, [matches, origin, activeCityId]);

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

  return <div ref={mapRef} className="oltra-map-canvas" />;
}
