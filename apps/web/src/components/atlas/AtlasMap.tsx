"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { IconLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef } from "react";
import type { CascadeEvent, City, Payload } from "@/lib/api";
import { COURSE_RGB, STATE_RGB } from "@/lib/risk";
import { useStore, type MapMetric } from "@/lib/store";
import { COURSE_SVG, SYMBOL_SVG, dataUrl } from "./symbols";

type Props = {
  city: City;
  payload?: Payload;
  metric?: MapMetric;
  showCourse?: boolean;
  showAssets?: boolean;
  assetKinds?: string[];
  highlight?: string[]; // event ids to emphasise
  interactive?: boolean;
  initialZoom?: number;
  className?: string;
  zoneColor?: (idx: number) => [number, number, number, number];
  zoneKey?: string;
};

const ROAD_WIDTH: Record<string, number> = { motorway: 2.4, trunk: 2.2, primary: 1.7, secondary: 1.2, tertiary: 0.7 };

function baseStyle(city: City): maplibregl.StyleSpecification {
  const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
  return {
    version: 8,
    sources: {
      contours: {
        type: "geojson",
        data: fc(city.layers.contours.map((c) => ({ type: "Feature", properties: { e: c.e, idx: c.e % 25 === 0 ? 1 : 0 }, geometry: { type: "LineString", coordinates: c.g } }))),
      },
      lakes: {
        type: "geojson",
        data: fc(city.layers.lakes.filter((l) => l.g.length > 3).map((l) => ({ type: "Feature", properties: { n: l.n }, geometry: { type: "Polygon", coordinates: [l.g] } }))),
      },
      rivers: {
        type: "geojson",
        data: fc(city.layers.rivers.map((r) => ({ type: "Feature", properties: { m: r.m ? 1 : 0 }, geometry: { type: "LineString", coordinates: r.g } }))),
      },
      roads: {
        type: "geojson",
        data: fc(city.layers.roads.map((r) => ({ type: "Feature", properties: { c: r.c, w: ROAD_WIDTH[r.c] ?? 0.6 }, geometry: { type: "LineString", coordinates: r.g } }))),
      },
    },
    layers: [
      { id: "paper", type: "background", paint: { "background-color": "#f2f3ee" } },
      { id: "hex-anchor", type: "background", paint: { "background-opacity": 0 } },
      {
        id: "contours",
        type: "line",
        source: "contours",
        paint: {
          "line-color": "#a8693b",
          "line-opacity": ["case", ["==", ["get", "idx"], 1], 0.75, 0.42],
          "line-width": ["case", ["==", ["get", "idx"], 1], 1.1, 0.6],
        },
      },
      { id: "lakes", type: "fill", source: "lakes", paint: { "fill-color": "#d3e4f0", "fill-outline-color": "#2c78b5" } },
      {
        id: "rivers",
        type: "line",
        source: "rivers",
        paint: { "line-color": "#2c78b5", "line-width": ["case", ["==", ["get", "m"], 1], 2.2, 0.9], "line-opacity": 0.9 },
      },
      {
        id: "roads-minor",
        type: "line",
        source: "roads",
        filter: ["in", ["get", "c"], ["literal", ["tertiary"]]],
        paint: { "line-color": "#8a9097", "line-width": 0.6 },
      },
      {
        id: "roads-major",
        type: "line",
        source: "roads",
        filter: ["in", ["get", "c"], ["literal", ["motorway", "trunk", "primary", "secondary"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#2c2f33", "line-width": ["get", "w"] },
      },
    ],
  };
}

function hexColor(metric: MapMetric, payload: Payload | undefined, idx: number): [number, number, number, number] {
  if (!payload) return [0, 0, 0, 0];
  if (metric === "truth") {
    const s = payload.truth?.state[idx] ?? 0;
    return s === 0 ? [0, 0, 0, 0] : [...STATE_RGB[s], [0, 70, 130, 185][s]] as [number, number, number, number];
  }
  if (metric === "p_crit24") {
    const p = payload.zones.p_crit24[idx];
    return p < 0.05 ? [0, 0, 0, 0] : [...STATE_RGB[3], Math.round(30 + 190 * p)] as [number, number, number, number];
  }
  if (metric === "p_high72") {
    const p = payload.zones.p_high72[idx];
    return p < 0.05 ? [0, 0, 0, 0] : [...STATE_RGB[2], Math.round(30 + 190 * p)] as [number, number, number, number];
  }
  const s = payload.zones.state[idx];
  return s === 0 ? [0, 0, 0, 0] : [...STATE_RGB[s], [0, 62, 120, 175][s]] as [number, number, number, number];
}

export function courseEvents(payload?: Payload): CascadeEvent[] {
  if (!payload) return [];
  const byId = new Map(payload.events.map((e) => [e.id, e]));
  return payload.course.map((id) => byId.get(id)).filter(Boolean) as CascadeEvent[];
}

export function AtlasMap({
  city,
  payload,
  metric = "state",
  showCourse = true,
  showAssets = true,
  assetKinds = ["hospital", "substation", "pump", "underpass", "lake", "fire_station", "metro", "tower"],
  highlight,
  interactive = true,
  initialZoom = 11.4,
  className,
  zoneColor,
  zoneKey,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const setHover = useStore((s) => s.setHover);
  const hover = useStore((s) => s.hover);

  useEffect(() => {
    if (!el.current || map.current) return;
    if (maplibregl.getWorkerUrl() !== "/maplibre/maplibre-gl-worker.mjs") maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const m = new maplibregl.Map({
      container: el.current,
      style: baseStyle(city),
      center: city.center,
      zoom: initialZoom,
      minZoom: 9.5,
      maxZoom: 15.5,
      attributionControl: false,
      interactive,
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: "© OpenStreetMap contributors · Elevation: Copernicus DEM via Open-Meteo",
      }),
    );
    if (interactive) m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    const ov = new MapboxOverlay({ interleaved: false, layers: [] });
    m.addControl(ov as unknown as maplibregl.IControl);
    map.current = m;
    overlay.current = ov;
    return () => {
      m.remove();
      map.current = null;
      overlay.current = null;
    };
  }, [city, initialZoom, interactive]);

  const hexData = useMemo(() => city.zones.filter((z) => !z.lake), [city]);
  // linework drawn above the risk fill so the atlas stays legible under heavy risk
  const topRoads = useMemo(() => city.layers.roads.filter((r) => r.c !== "tertiary"), [city]);
  const topRivers = useMemo(() => city.layers.rivers.filter((r) => r.m), [city]);
  const topLakes = useMemo(() => city.layers.lakes.filter((l) => l.g.length > 3), [city]);
  const assetData = useMemo(() => city.assets.filter((a) => assetKinds.includes(a.kind)), [city, assetKinds]);
  const atRisk = useMemo(() => {
    const m = new Map<string, number>();
    payload?.events.forEach((e) => {
      if (e.asset) m.set(e.asset, Math.max(m.get(e.asset) ?? 0, e.p));
    });
    return m;
  }, [payload]);
  const course = useMemo(() => courseEvents(payload), [payload]);
  const hi = useMemo(() => new Set(highlight ?? []), [highlight]);

  useEffect(() => {
    const ov = overlay.current;
    if (!ov) return;
    const selZone = selection?.type === "zone" ? selection.id : null;
    const selAsset = selection?.type === "asset" ? selection.id : null;
    const selEvent = selection?.type === "event" ? selection.id : null;
    const layers: unknown[] = [
      new H3HexagonLayer({
        id: "zones",
        data: hexData,
        getHexagon: (d) => d.id,
        getFillColor: (d) => (zoneColor ? zoneColor(d.idx) : hexColor(metric, payload, d.idx)),
        getLineColor: (d) => (d.id === selZone ? [21, 23, 26, 255] : d.id === hover ? [21, 23, 26, 160] : [255, 255, 255, 0]),
        getLineWidth: (d) => (d.id === selZone ? 3 : d.id === hover ? 2 : 0),
        lineWidthUnits: "pixels",
        stroked: true,
        filled: true,
        extruded: false,
        pickable: interactive,
        highPrecision: false,
        updateTriggers: { getFillColor: [metric, payload?.now, payload?.scenario, zoneKey], getLineColor: [selZone, hover], getLineWidth: [selZone, hover] },
        transitions: { getFillColor: 260 },
        onHover: (i) => setHover(i.object ? (i.object as { id: string }).id : null),
        onClick: (i) => i.object && select({ type: "zone", id: (i.object as { id: string }).id }),
      }),
      new PolygonLayer({
        id: "lakes-top",
        data: topLakes,
        getPolygon: (d) => d.g,
        getFillColor: [211, 228, 240, 255],
        getLineColor: [44, 120, 181, 255],
        getLineWidth: 1,
        lineWidthUnits: "pixels",
        stroked: true,
      }),
      new PathLayer({
        id: "rivers-top",
        data: topRivers,
        getPath: (d) => d.g,
        getColor: [44, 120, 181, 230],
        getWidth: 2,
        widthUnits: "pixels",
      }),
      new PathLayer({
        id: "roads-top",
        data: topRoads,
        getPath: (d) => d.g,
        getColor: (d) => (d.c === "secondary" ? [44, 47, 51, 120] : [44, 47, 51, 200]),
        getWidth: (d) => ROAD_WIDTH[d.c] ?? 1,
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
      }),
    ];
    if (showAssets) {
      layers.push(
        new ScatterplotLayer({
          id: "asset-risk",
          data: assetData.filter((a) => (atRisk.get(a.id) ?? 0) >= 0.25),
          getPosition: (d) => [d.lon, d.lat],
          getRadius: 13,
          radiusUnits: "pixels",
          stroked: true,
          filled: false,
          getLineColor: (d) => ((atRisk.get(d.id) ?? 0) >= 0.5 ? [...STATE_RGB[3], 230] : [...STATE_RGB[2], 220]) as [number, number, number, number],
          getLineWidth: 2.5,
          lineWidthUnits: "pixels",
          updateTriggers: { getLineColor: [payload?.now] },
        }),
        new IconLayer({
          id: "assets",
          data: assetData,
          getPosition: (d) => [d.lon, d.lat],
          getIcon: (d) => ({ url: dataUrl(SYMBOL_SVG[d.kind] ?? SYMBOL_SVG.shelter), width: 32, height: 32, id: d.kind }),
          getSize: (d) => (d.id === selAsset ? 26 : d.kind === "hospital" || d.kind === "lake" ? 18 : d.kind === "tower" ? 11 : 14),
          sizeUnits: "pixels",
          pickable: interactive,
          updateTriggers: { getSize: [selAsset] },
          onClick: (i) => i.object && select({ type: "asset", id: (i.object as { id: string }).id }),
        }),
      );
    }
    if (showCourse && course.length > 1) {
      const pts = course.map((e) => [e.lon, e.lat] as [number, number]);
      layers.push(
        new PathLayer({
          id: "course-legs",
          data: pts.slice(1).map((p, i) => ({ path: [pts[i], p], i })),
          getPath: (d) => d.path,
          getColor: [...COURSE_RGB, 235],
          getWidth: 3,
          widthUnits: "pixels",
          capRounded: true,
        }),
      );
    }
    if (showCourse && course.length) {
      layers.push(
        new IconLayer({
          id: "course-ends",
          data: [
            { kind: "start", e: course[0] },
            ...(course.length > 1 ? [{ kind: "finish", e: course[course.length - 1] }] : []),
          ],
          getPosition: (d) => [d.e.lon, d.e.lat],
          getIcon: (d) => ({ url: dataUrl(COURSE_SVG[d.kind as "start" | "finish"]), width: 32, height: 32, id: d.kind }),
          getSize: 38,
          sizeUnits: "pixels",
        }),
        new ScatterplotLayer({
          id: "course-controls",
          data: course.slice(1, -1),
          getPosition: (d) => [d.lon, d.lat],
          getRadius: (d) => (d.id === selEvent ? 18 : 15),
          radiusUnits: "pixels",
          stroked: true,
          filled: true,
          getFillColor: (d) => (d.p_occurred > 0.5 ? [...COURSE_RGB, 200] : [255, 255, 255, 0]) as [number, number, number, number],
          getLineColor: [...COURSE_RGB, 255],
          getLineWidth: (d) => (d.id === selEvent || hi.has(d.id) ? 4 : 2.8),
          lineWidthUnits: "pixels",
          pickable: interactive,
          updateTriggers: { getRadius: [selEvent], getLineWidth: [selEvent, highlight] },
          onClick: (i) => i.object && select({ type: "event", id: (i.object as CascadeEvent).id }),
        }),
        new TextLayer({
          id: "course-numbers",
          data: course.map((e, i) => ({ e, i })),
          getPosition: (d) => [d.e.lon, d.e.lat],
          getText: (d) => (d.i === 0 ? "S" : String(d.i)),
          getPixelOffset: [17, -17],
          getSize: 17,
          getColor: [...COURSE_RGB, 255],
          fontFamily: "Archivo, sans-serif",
          fontWeight: 700,
          outlineWidth: 4,
          outlineColor: [242, 243, 238, 255],
          fontSettings: { sdf: true },
        }),
      );
    }
    ov.setProps({ layers: layers as never[] });
  }, [topRoads, topRivers, topLakes, hexData, assetData, payload, metric, showCourse, showAssets, course, selection, hover, atRisk, interactive, select, setHover, hi, highlight, zoneColor, zoneKey]);

  // fly to a selection
  useEffect(() => {
    const m = map.current;
    if (!m || !selection || !interactive) return;
    let target: [number, number] | null = null;
    if (selection.type === "zone") {
      const z = city.zones.find((z) => z.id === selection.id);
      if (z) target = [z.lon, z.lat];
    } else if (selection.type === "asset") {
      const a = city.assets.find((a) => a.id === selection.id);
      if (a) target = [a.lon, a.lat];
    } else if (selection.type === "event") {
      const e = payload?.events.find((e) => e.id === selection.id);
      if (e) target = [e.lon, e.lat];
    }
    if (target) m.easeTo({ center: target, zoom: Math.max(m.getZoom(), 12.4), duration: 450 });
  }, [selection, city, payload, interactive]);

  return <div ref={el} className={className ?? "h-full w-full"} aria-label={`Map of ${city.name}`} role="application" />;
}
