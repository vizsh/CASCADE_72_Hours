"""Fetch the real geography for a city: assets and roads from OpenStreetMap,
terrain from the Open-Meteo elevation API. Everything is cached on disk so the
demo runs offline once a city has been fetched.

    python -m cascade.fetch nagpur --lat 21.1458 --lon 79.0882 --radius-km 10.5
    python -m cascade.fetch "Pune"            # geocodes the name first
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import h3
import httpx

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "cities"
OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
H3_RES = 8

# One query, many feature families. `out geom` returns coordinates for ways.
OVERPASS_QUERY = """
[out:json][timeout:180];
(
  nwr["amenity"="hospital"](around:{r},{lat},{lon});
  nwr["healthcare"="hospital"](around:{r},{lat},{lon});
  nwr["power"="substation"](around:{r},{lat},{lon});
  nwr["amenity"="fire_station"](around:{r},{lat},{lon});
  nwr["amenity"="police"](around:{r},{lat},{lon});
  nwr["man_made"~"^(water_works|pumping_station|wastewater_plant|water_tower)$"](around:{r},{lat},{lon});
  nwr["man_made"~"^(mast|tower)$"]["tower:type"="communication"](around:{r},{lat},{lon});
  nwr["communication:mobile_phone"="yes"](around:{r},{lat},{lon});
  nwr["amenity"="fuel"](around:{r},{lat},{lon});
  nwr["amenity"~"^(school|college|university|community_centre)$"](around:{r},{lat},{lon});
  nwr["railway"="station"](around:{r},{lat},{lon});
  nwr["station"="subway"](around:{r},{lat},{lon});
  nwr["public_transport"="station"](around:{r},{lat},{lon});
  way["natural"="water"](around:{r},{lat},{lon});
  way["waterway"~"^(river|canal|drain|stream)$"](around:{r},{lat},{lon});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](around:{r},{lat},{lon});
  way["highway"]["tunnel"="yes"](around:{r},{lat},{lon});
  way["highway"]["layer"~"^-"](around:{r},{lat},{lon});
  node["place"~"^(suburb|neighbourhood|quarter)$"](around:{r},{lat},{lon});
);
out geom;
"""


def slugify(name: str) -> str:
    return "".join(c.lower() if c.isalnum() else "-" for c in name).strip("-")


def geocode(name: str, client: httpx.Client) -> tuple[float, float, str]:
    res = client.get(
        "https://geocoding-api.open-meteo.com/v1/search",
        params={"name": name, "count": 1, "language": "en", "format": "json"},
    ).json()
    if not res.get("results"):
        raise SystemExit(f"Could not geocode {name!r}")
    hit = res["results"][0]
    return hit["latitude"], hit["longitude"], hit["name"]


def fetch_osm(lat: float, lon: float, radius_m: int, client: httpx.Client) -> dict:
    query = OVERPASS_QUERY.format(r=radius_m, lat=lat, lon=lon)
    last_err: Exception | None = None
    for url in OVERPASS:
        try:
            resp = client.post(url, data={"data": query}, timeout=240)
            resp.raise_for_status()
            return resp.json()
        except Exception as err:  # try the next mirror
            last_err = err
            time.sleep(2)
    raise RuntimeError(f"All Overpass mirrors failed: {last_err}")


def city_cells(lat: float, lon: float, radius_km: float) -> list[str]:
    center = h3.latlng_to_cell(lat, lon, H3_RES)
    # ring distance between res-8 centroids is ~0.92 km
    k = int(radius_km / 0.92) + 1
    cells = []
    for cell in h3.grid_disk(center, k):
        clat, clon = h3.cell_to_latlng(cell)
        if h3.great_circle_distance((lat, lon), (clat, clon), unit="km") <= radius_km:
            cells.append(cell)
    return sorted(cells)


def fetch_elevation(cells: list[str], client: httpx.Client) -> dict[str, float]:
    out: dict[str, float] = {}
    for i in range(0, len(cells), 100):
        batch = cells[i : i + 100]
        coords = [h3.cell_to_latlng(c) for c in batch]
        resp = client.get(
            "https://api.open-meteo.com/v1/elevation",
            params={
                "latitude": ",".join(f"{la:.5f}" for la, _ in coords),
                "longitude": ",".join(f"{lo:.5f}" for _, lo in coords),
            },
        )
        resp.raise_for_status()
        for cell, elev in zip(batch, resp.json()["elevation"]):
            out[cell] = float(elev)
        time.sleep(0.2)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lon", type=float)
    ap.add_argument("--radius-km", type=float, default=10.5)
    args = ap.parse_args()

    client = httpx.Client(timeout=60, headers={"User-Agent": "cascade72-hackathon/0.1"})
    if args.lat is None or args.lon is None:
        lat, lon, display = geocode(args.name, client)
    else:
        lat, lon, display = args.lat, args.lon, args.name.title()

    out_dir = DATA_DIR / slugify(args.name)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[fetch] {display} @ {lat:.4f},{lon:.4f} r={args.radius_km} km")
    cells = city_cells(lat, lon, args.radius_km)
    print(f"[fetch] {len(cells)} H3 res-{H3_RES} cells")

    osm_path = out_dir / "osm.json"
    if not osm_path.exists():
        osm = fetch_osm(lat, lon, int(args.radius_km * 1000), client)
        osm_path.write_text(json.dumps(osm))
    print(f"[fetch] OSM elements: {len(json.loads(osm_path.read_text())['elements'])}")

    elev_path = out_dir / "elevation.json"
    if not elev_path.exists():
        elev_path.write_text(json.dumps(fetch_elevation(cells, client)))
    print("[fetch] elevation cached")

    meta = {
        "name": display,
        "slug": slugify(args.name),
        "lat": lat,
        "lon": lon,
        "radius_km": args.radius_km,
        "h3_res": H3_RES,
        "cells": cells,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sources": {
            "assets_roads": "OpenStreetMap contributors via Overpass API (ODbL)",
            "elevation": "Open-Meteo Elevation API (Copernicus DEM GLO-90)",
        },
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    print(f"[fetch] wrote {out_dir}")


if __name__ == "__main__":
    main()
