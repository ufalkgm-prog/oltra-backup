"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { InspireCityMatch } from "@/lib/inspire/types";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = {
  matches: InspireCityMatch[];
  activeCityId: string | null;
  onSelectCity: (match: InspireCityMatch) => void;
};

const DEFAULT_FALLBACK_CENTER: [number, number] = [12.5683, 55.6761];

const SOURCE_ID = "inspire-cities";
const CIRCLE_LAYER_ID = "inspire-city-circles";
const LABEL_LAYER_ID = "inspire-city-labels";
const DIM_LAYER_ID = "inspire-dim-layer";

function buildGeoJson(
  matches: InspireCityMatch[]
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: matches.map((match) => {
      const avgDay = Math.round(match.selectedMonthTempC + 4);
      const avgNight = Math.round(match.selectedMonthTempC - 4);

      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [match.city.lng, match.city.lat],
        },
        properties: {
          id: match.city.id,
          city: match.city.city,
          country: match.city.country,
          region: match.city.region,
          hotelCount: match.city.hotelCount,
          avgTemp: match.selectedMonthTempC,
          avgDay,
          avgNight,
          flightHours: match.estimatedFlightHours,
          label: `${match.city.city} · ${match.city.hotelCount}`,
        },
      };
    }),
  };
}

function getCircleColorExpression(activeCityId: string | null) {
  return [
    "case",
    ["==", ["get", "id"], activeCityId ?? ""],
    "rgba(255,255,255,0.28)",
    [
      "interpolate",
      ["linear"],
      ["get", "hotelCount"],
      1,
      "rgba(214, 221, 226, 0.24)",
      10,
      "rgba(214, 221, 226, 0.30)",
      40,
      "rgba(214, 221, 226, 0.36)",
    ],
  ] as maplibregl.ExpressionSpecification;
}

function getCircleStrokeColorExpression(activeCityId: string | null) {
  return [
    "case",
    ["==", ["get", "id"], activeCityId ?? ""],
    "rgba(255,255,255,1)",
    "rgba(255,255,255,0.92)",
  ] as maplibregl.ExpressionSpecification;
}

function getCircleStrokeWidthExpression(activeCityId: string | null) {
  return [
    "case",
    ["==", ["get", "id"], activeCityId ?? ""],
    3.2,
    [
      "interpolate",
      ["linear"],
      ["get", "hotelCount"],
      1,
      1.1,
      40,
      1.7,
    ],
  ] as maplibregl.ExpressionSpecification;
}

function getCircleRadiusExpression(activeCityId: string | null) {
  return [
    "case",
    ["==", ["get", "id"], activeCityId ?? ""],
    [
      "interpolate",
      ["linear"],
      ["get", "hotelCount"],
      1,
      13,
      5,
      17,
      10,
      22,
      20,
      29,
      40,
      39,
    ],
    [
      "interpolate",
      ["linear"],
      ["get", "hotelCount"],
      1,
      10,
      5,
      14,
      10,
      19,
      20,
      26,
      40,
      36,
    ],
  ] as maplibregl.ExpressionSpecification;
}

export default function InspireMapView({
  matches,
  activeCityId,
  onSelectCity,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const matchesRef = useRef<InspireCityMatch[]>(matches);
  const onSelectCityRef = useRef(onSelectCity);

  const geoJson = useMemo(() => buildGeoJson(matches), [matches]);

  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  useEffect(() => {
    onSelectCityRef.current = onSelectCity;
  }, [onSelectCity]);

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
      zoom: 2.2,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addLayer({
        id: DIM_LAYER_ID,
        type: "background",
        paint: {
          "background-color": "rgba(17, 26, 34, 0.42)",
        },
      });

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: buildGeoJson(matchesRef.current),
      });

      map.addLayer({
        id: CIRCLE_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": getCircleRadiusExpression(activeCityId),
          "circle-color": getCircleColorExpression(activeCityId),
          "circle-stroke-color": getCircleStrokeColorExpression(activeCityId),
          "circle-stroke-width": getCircleStrokeWidthExpression(activeCityId),
          "circle-blur": 0.02,
          "circle-opacity": 1,
        },
      });

      map.addLayer({
        id: LABEL_LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-offset": [0, 2.1],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "rgba(255,255,255,0.94)",
          "text-halo-color": "rgba(18, 26, 34, 0.72)",
          "text-halo-width": 1.1,
        },
      });

      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 18,
        className: "inspire-map-popup",
      });

      map.on("mouseenter", CIRCLE_LAYER_ID, (e) => {
        map.getCanvas().style.cursor = "pointer";

        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;

        const coordinates = [...feature.geometry.coordinates] as [number, number];
        const props = feature.properties as Record<string, string | number | undefined>;

        const html = `
          <div style="min-width: 210px; padding: 12px 14px;">
            <div style="font-size: 14px; font-weight: 600; line-height: 1.2; color: rgba(255,255,255,0.96);">
              ${props.city}, ${props.country}
            </div>
            <div style="margin-top: 4px; font-size: 12px; color: rgba(255,255,255,0.65);">
              ${props.region ?? ""}
            </div>
            <div style="margin-top: 8px; font-size: 12px; color: rgba(255,255,255,0.88);">
              ${props.hotelCount} OLTRA hotel${Number(props.hotelCount) === 1 ? "" : "s"}
            </div>
            <div style="margin-top: 4px; font-size: 12px; color: rgba(255,255,255,0.82);">
              Approx. ${props.avgDay}°C day · ${props.avgNight}°C night
            </div>
            <div style="margin-top: 4px; font-size: 12px; color: rgba(255,255,255,0.82);">
              Approx. ${props.flightHours}h direct flight
            </div>
          </div>
        `;

        popupRef.current?.setLngLat(coordinates).setHTML(html).addTo(map);
      });

      map.on("mouseleave", CIRCLE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
        popupRef.current?.remove();
      });

      map.on("click", CIRCLE_LAYER_ID, (e) => {
        const feature = e.features?.[0];
        if (!feature) return;

        const id = String(feature.properties?.id ?? "");
        const match = matchesRef.current.find((item) => item.city.id === id);
        if (match) {
          onSelectCityRef.current(match);
        }
      });

      map.resize();
    });

    mapInstanceRef.current = map;

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;

      try {
        map.remove();
      } catch {}

      mapInstanceRef.current = null;
    };
  }, []);

  /* Update source data + fit bounds only when dropdown selections change */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(geoJson);
    }

    popupRef.current?.remove();

    const bounds = new maplibregl.LngLatBounds();
    let hasBounds = false;

    for (const match of matches) {
      bounds.extend([match.city.lng, match.city.lat]);
      hasBounds = true;
    }

    if (hasBounds) {
      map.fitBounds(bounds, {
        padding: { top: 72, right: 72, bottom: 72, left: 72 },
        maxZoom: 5.5,
        duration: 700,
      });
    } else {
      map.easeTo({
        center: DEFAULT_FALLBACK_CENTER,
        zoom: 2.2,
        duration: 500,
      });
    }
  }, [geoJson, matches]);

  /* Update highlight only when hovering/selecting a city card */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded() || !map.getLayer(CIRCLE_LAYER_ID)) return;

    map.setPaintProperty(
      CIRCLE_LAYER_ID,
      "circle-radius",
      getCircleRadiusExpression(activeCityId)
    );
    map.setPaintProperty(
      CIRCLE_LAYER_ID,
      "circle-color",
      getCircleColorExpression(activeCityId)
    );
    map.setPaintProperty(
      CIRCLE_LAYER_ID,
      "circle-stroke-color",
      getCircleStrokeColorExpression(activeCityId)
    );
    map.setPaintProperty(
      CIRCLE_LAYER_ID,
      "circle-stroke-width",
      getCircleStrokeWidthExpression(activeCityId)
    );
  }, [activeCityId]);

  return (
    <div
      ref={mapRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        borderRadius: 24,
      }}
    />
  );
}