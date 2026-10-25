"""City model: zones, assets, road paths and the *true* dependency network.

Everything here is derived from cached real data (OpenStreetMap + elevation).
Where open data does not exist (telecom towers, stormwater pumps, bed counts,
backup hours), values are generated deterministically from the city's slug and
tagged ``provenance="synthetic"`` so the UI can say so.
"""

from __future__ import annotations

import hashlib
import heapq
import json
import math
from dataclasses import asdict, dataclass, field
from functools import lru_cache
from pathlib import Path

import h3
import numpy as np

from .fetch import DATA_DIR

CELL_KM = 0.92  # centroid spacing of H3 res-8 cells
ROAD_SPEED_KMH = {"motorway": 45, "trunk": 38, "primary": 30, "secondary": 24, "tertiary": 18}
OFFROAD_KMH = 11
CITY_POPULATION = {"nagpur": 2_950_000}
MAJOR_HOSPITAL_HINTS = (
    "medical college", "mayo", "super speciality", "superspeciality", "aiims", "wockhardt",
    "orange city", "kingsway", "alexis", "care hospital", "meditrina", "lata mangeshkar",
    "daga", "shalinitai", "esic", "railway hospital", "military", "kims", "suretech",
    "hope hospital", "arneja", "midas", "spandan", "avanti", "government",
)
RIVER_HINTS = ("naag", "nag ", "nag", "pivli", "pili", "pohara", "pora")


def _h(seed: str) -> float:
    """Deterministic pseudo-random number in [0, 1) from a string."""
    return int(hashlib.sha1(seed.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


@dataclass
class Zone:
    id: str
    idx: int
    lat: float
    lon: float
    elev: float
    hand: float  # height above the nearest drainage line (m)
    pop: int
    vuln: float  # 0..1 structural vulnerability proxy
    built: float  # 0..1
    locality: str
    lake: bool
    river: bool
    flow_to: int  # index of downstream zone, -1 for sink/outlet
    road_class: str
    cross_min: float  # minutes to cross the zone by road
    runoff: float  # runoff coefficient
    drain_mmph: float  # nominal drainage capacity (mm/h) - the predictor's prior


@dataclass
class Asset:
    id: str
    kind: str
    name: str
    lat: float
    lon: float
    zone: int
    attrs: dict = field(default_factory=dict)
    provenance: str = "osm"


@dataclass
class CityModel:
    slug: str
    name: str
    lat: float
    lon: float
    zones: list[Zone]
    assets: list[Asset]
    neighbors: list[list[int]]
    # power supplier of each consumer asset: prior candidates (nearest first) and truth
    power_candidates: dict[str, list[str]]
    power_truth: dict[str, str]
    zone_substation: np.ndarray  # zone idx -> substation asset index (into substations list)
    layers: dict  # GeoJSON for the atlas base map
    # road path matrices, filled by build_paths()
    ems_p1: np.ndarray = field(default=None, repr=False)
    ems_p2: np.ndarray = field(default=None, repr=False)
    ems_base_of: np.ndarray = field(default=None, repr=False)
    hosp_access: np.ndarray = field(default=None, repr=False)
    hosp_supply: np.ndarray = field(default=None, repr=False)

    # convenience views -------------------------------------------------
    def of_kind(self, kind: str) -> list[Asset]:
        return [a for a in self.assets if a.kind == kind]

    def asset(self, asset_id: str) -> Asset:
        return self._by_id[asset_id]

    def __post_init__(self):
        self._by_id = {a.id: a for a in self.assets}

    @property
    def Z(self) -> int:
        return len(self.zones)

    def to_public(self) -> dict:
        return {
            "slug": self.slug,
            "name": self.name,
            "center": [self.lon, self.lat],
            "zones": [
                {k: v for k, v in asdict(z).items() if k not in ("flow_to",)} | {"flow_to": z.flow_to}
                for z in self.zones
            ],
            "assets": [asdict(a) for a in self.assets],
            "power_candidates": self.power_candidates,
            "layers": self.layers,
            "population": int(sum(z.pop for z in self.zones)),
        }


# ---------------------------------------------------------------------------
# geometry helpers


def _point_in_poly(lat: float, lon: float, poly: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        yi, xi = poly[i]
        yj, xj = poly[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def _centroid(el: dict) -> tuple[float, float] | None:
    if el["type"] == "node":
        return el["lat"], el["lon"]
    geom = el.get("geometry")
    if geom:
        return (
            sum(p["lat"] for p in geom) / len(geom),
            sum(p["lon"] for p in geom) / len(geom),
        )
    if "bounds" in el:
        b = el["bounds"]
        return (b["minlat"] + b["maxlat"]) / 2, (b["minlon"] + b["maxlon"]) / 2
    return None


def _area_m2(el: dict) -> float:
    if "bounds" not in el:
        return 0.0
    b = el["bounds"]
    dy = (b["maxlat"] - b["minlat"]) * 111_000
    dx = (b["maxlon"] - b["minlon"]) * 111_000 * math.cos(math.radians(b["minlat"]))
    return dx * dy


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    return h3.great_circle_distance(a, b, unit="km")


# ---------------------------------------------------------------------------
# build


def load_city(slug: str) -> CityModel:
    return _build(slug)


@lru_cache(maxsize=8)
def _build(slug: str) -> CityModel:
    root = DATA_DIR / slug
    meta = json.loads((root / "meta.json").read_text(encoding="utf-8"))
    osm = json.loads((root / "osm.json").read_text(encoding="utf-8"))["elements"]
    elev = json.loads((root / "elevation.json").read_text(encoding="utf-8"))
    cells: list[str] = meta["cells"]
    index = {c: i for i, c in enumerate(cells)}
    Z = len(cells)

    # --- rasterise OSM features onto cells ---------------------------------
    road_pts = np.zeros((Z, 5))
    road_classes = list(ROAD_SPEED_KMH)
    river_pts = np.zeros(Z)
    amenity_pts = np.zeros(Z)
    lakes: list[tuple[str, list[tuple[float, float]]]] = []
    places: list[tuple[str, float, float, str]] = []
    layers = {"roads": [], "rivers": [], "lakes": [], "rail": []}

    def cell_of(lat, lon):
        return index.get(h3.latlng_to_cell(lat, lon, meta["h3_res"]))

    for el in osm:
        t = el.get("tags", {})
        hw = t.get("highway")
        geom = el.get("geometry")
        if el["type"] == "way" and hw in ROAD_SPEED_KMH and geom:
            ci = road_classes.index(hw)
            for p in geom:
                z = cell_of(p["lat"], p["lon"])
                if z is not None:
                    road_pts[z, ci] += 1
            layers["roads"].append(
                {"c": hw, "n": t.get("name", ""), "g": [[round(p["lon"], 5), round(p["lat"], 5)] for p in geom[::2] + [geom[-1]]]}
            )
        ww = t.get("waterway")
        if el["type"] == "way" and ww in ("river", "stream", "drain", "canal") and geom:
            name = (t.get("name") or "").lower()
            major = ww == "river" or any(hint in name for hint in RIVER_HINTS)
            for p in geom:
                z = cell_of(p["lat"], p["lon"])
                if z is not None:
                    river_pts[z] += 3 if major else 1
            layers["rivers"].append(
                {"m": major, "n": t.get("name", ""), "g": [[round(p["lon"], 5), round(p["lat"], 5)] for p in geom]}
            )
        if el["type"] == "way" and t.get("natural") == "water" and geom and len(geom) > 3:
            poly = [(p["lat"], p["lon"]) for p in geom]
            nm = t.get("name", "")
            if _area_m2(el) > 40_000:
                lakes.append((nm, poly))
            layers["lakes"].append({"n": nm, "g": [[round(lo, 5), round(la, 5)] for la, lo in poly]})
        if t.get("amenity") or t.get("shop"):
            c = _centroid(el)
            if c:
                z = cell_of(*c)
                if z is not None:
                    amenity_pts[z] += 1
        if el["type"] == "node" and t.get("place") in ("suburb", "neighbourhood", "quarter") and t.get("name"):
            places.append((t.get("name:en") or t["name"], el["lat"], el["lon"], t["place"]))

    # --- zone attributes ------------------------------------------------------
    latlng = [h3.cell_to_latlng(c) for c in cells]
    elevs = np.array([elev[c] for c in cells], dtype=float)
    is_lake = np.array(
        [any(_point_in_poly(la, lo, poly) for _, poly in lakes) for la, lo in latlng], dtype=bool
    )
    neighbors = [
        [index[n] for n in h3.grid_ring(c, 1) if n in index] for c in cells
    ]
    road_score = road_pts @ np.array([3.0, 2.5, 2.0, 1.4, 1.0])
    built = road_score / (np.percentile(road_score, 95) + 1e-6) * 0.7 + amenity_pts / (
        np.percentile(amenity_pts, 95) + 1e-6
    ) * 0.3
    built = np.clip(built, 0, 1.2) / 1.2
    built[is_lake] = 0
    is_river = (river_pts >= 3) & ~is_lake

    # D8-style flow direction on the hex grid
    flow_to = np.full(Z, -1, dtype=int)
    for i in range(Z):
        best, best_e = -1, elevs[i]
        for j in neighbors[i]:
            if elevs[j] < best_e - 0.01:
                best, best_e = j, elevs[j]
        flow_to[i] = best

    # HAND: follow the flow path to the first river/lake cell
    hand = np.zeros(Z)
    for i in range(Z):
        cur, seen = i, 0
        while cur != -1 and not (is_river[cur] or is_lake[cur]) and seen < 60:
            cur = flow_to[cur]
            seen += 1
        base = elevs[cur] if cur != -1 else elevs[i] - 2.0
        hand[i] = max(0.0, elevs[i] - base)

    total_pop = CITY_POPULATION.get(meta["slug"], 1_500_000)
    weight = np.power(built + 0.03, 1.25)
    weight[is_lake] = 0
    pop = np.round(weight / weight.sum() * total_pop).astype(int)

    river_near = np.array([is_river[i] or any(is_river[j] for j in neighbors[i]) for i in range(Z)])
    vuln = np.clip(
        0.45 * (1 - np.clip(hand / 8, 0, 1)) + 0.35 * built + 0.2 * river_near, 0, 1
    )
    vuln[is_lake] = 0

    def locality(lat, lon):
        best, dist = None, 1e9
        for name, pla, plo, kind in places:
            d = _km((lat, lon), (pla, plo)) * (0.8 if kind == "suburb" else 1.0)
            if d < dist:
                best, dist = name, d
        if not best:
            return None
        return best if dist < 1.6 else f"Outer {best}"

    zones: list[Zone] = []
    for i, c in enumerate(cells):
        cls_idx = int(np.argmax(road_pts[i])) if road_pts[i].sum() > 0 else -1
        road_class = road_classes[cls_idx] if cls_idx >= 0 and road_pts[i, cls_idx] >= 3 else "local"
        speed = ROAD_SPEED_KMH.get(road_class, OFFROAD_KMH)
        la, lo = latlng[i]
        name = locality(la, lo) or f"Zone {i + 1}"
        runoff = float(np.clip(0.35 + 0.55 * built[i], 0.3, 0.92))
        # nominal drainage: better in planned, higher zones; worse in old low-lying cores
        drain = float(np.clip(14 + 10 * (hand[i] / 8) - 4 * built[i] + 3 * _h(c + "d"), 8, 26))
        zones.append(
            Zone(
                id=c, idx=i, lat=la, lon=lo, elev=float(elevs[i]), hand=round(float(hand[i]), 2),
                pop=int(pop[i]), vuln=round(float(vuln[i]), 3), built=round(float(built[i]), 3),
                locality=name, lake=bool(is_lake[i]), river=bool(is_river[i]), flow_to=int(flow_to[i]),
                road_class=road_class, cross_min=round(CELL_KM / speed * 60, 2),
                runoff=round(runoff, 3), drain_mmph=round(drain, 1),
            )
        )

    # contour-like lines along hex edges between 5 m elevation bands
    contours = []
    for i, c in enumerate(cells):
        for j in neighbors[i]:
            if j <= i:
                continue
            bi, bj = int(elevs[i] // 5), int(elevs[j] // 5)
            if bi != bj:
                edge = h3.cells_to_directed_edge(c, cells[j])
                pts = h3.directed_edge_to_boundary(edge)
                contours.append(
                    {"e": int(max(bi, bj) * 5), "g": [[round(p[1], 5), round(p[0], 5)] for p in pts]}
                )
    layers["contours"] = contours

    assets = _build_assets(meta["slug"], osm, zones, cell_of, is_lake, hand, built, neighbors, river_near)
    power_candidates, power_truth, zone_sub = _build_power(meta["slug"], zones, assets)

    city = CityModel(
        slug=meta["slug"], name=meta["name"], lat=meta["lat"], lon=meta["lon"], zones=zones,
        assets=assets, neighbors=neighbors, power_candidates=power_candidates,
        power_truth=power_truth, zone_substation=zone_sub, layers=layers,
    )
    _build_paths(city)
    return city


def _build_assets(slug, osm, zones, cell_of, is_lake, hand, built, neighbors, river_near) -> list[Asset]:
    assets: list[Asset] = []
    taken: list[tuple[str, float, float]] = []

    names_taken: set[tuple[str, str]] = set()

    def near_taken(kind, lat, lon, km):
        return any(k == kind and _km((lat, lon), (a, b)) < km for k, a, b in taken)

    def add(kind, name, lat, lon, attrs=None, provenance="osm", dedup_km=0.25):
        z = cell_of(lat, lon)
        if z is None or zones[z].lake:
            return None
        if near_taken(kind, lat, lon, dedup_km):
            return None
        stem = (kind, " ".join(name.lower().replace("&", " ").split()[:3]))
        if kind == "hospital" and stem in names_taken:
            return None
        names_taken.add(stem)
        n = sum(1 for a in assets if a.kind == kind)
        a = Asset(id=f"{kind[:3].upper()}-{n + 1:02d}", kind=kind, name=name, lat=lat, lon=lon, zone=z,
                  attrs=attrs or {}, provenance=provenance)
        assets.append(a)
        taken.append((kind, lat, lon))
        return a

    # hospitals: keep the large / well-known ones
    cands = []
    for el in osm:
        t = el.get("tags", {})
        if (t.get("amenity") == "hospital" or t.get("healthcare") == "hospital") and t.get("name"):
            c = _centroid(el)
            if not c:
                continue
            name = t["name"].strip()
            low = name.lower()
            if any(x in low for x in ("department", "opd", "ward", "block", "clinic", "dental", "eye", "nursing home", "proposed", "site")):
                continue
            score = _area_m2(el) / 1000 + (60 if any(hint in low for hint in MAJOR_HOSPITAL_HINTS) else 0)
            if "medical college" in low or "mayo" in low:
                score += 600
            beds_tag = t.get("beds")
            cands.append((score, name, c, beds_tag))
    cands.sort(key=lambda x: -x[0])
    for score, name, (lat, lon), beds_tag in cands:
        if sum(1 for a in assets if a.kind == "hospital") >= 22:
            break
        low = name.lower()
        if beds_tag and str(beds_tag).isdigit():
            beds, est = int(beds_tag), False
        elif "medical college" in low:
            beds, est = 1100 + int(400 * _h(name)), True
        elif "super" in low or "aiims" in low:
            beds, est = 420, True
        else:
            beds, est = int(np.clip(80 + score * 2.2, 60, 380)), True
        add("hospital", name, lat, lon, {
            "beds": beds, "beds_estimated": est,
            "backup_hours": round(6 + 30 * _h(name + "bk"), 1),  # diesel on site
            "base_occupancy": round(0.68 + 0.15 * _h(name + "oc"), 2),
            "icu": max(6, beds // 12),
        }, dedup_km=0.35)

    # substations
    for el in osm:
        t = el.get("tags", {})
        if t.get("power") != "substation":
            continue
        c = _centroid(el)
        if not c:
            continue
        name = t.get("name")
        volt = (name or t.get("voltage") or "").lower()
        level = "transmission" if ("400" in volt or "220" in volt) else "distribution"
        mva = 630 if "400" in volt else 315 if "220" in volt else 100 if "132" in volt else 25
        z = cell_of(*c)
        loc = zones[z].locality if z is not None else ""
        add("substation", name or f"33/11 kV {loc} s/s", c[0], c[1], {
            "level": level, "mva": mva,
            "plinth_m": round(0.25 + 0.5 * _h(f"{c}pl"), 2),
            "name_from_osm": bool(name),
        }, dedup_km=0.3)

    for el in osm:
        t = el.get("tags", {})
        c = _centroid(el)
        if not c:
            continue
        if t.get("amenity") == "fire_station":
            add("fire_station", t.get("name") or "Fire station", c[0], c[1], {"ambulances": 2, "tenders": 3})
        elif t.get("amenity") == "police" and "control" in (t.get("name") or "").lower():
            add("fire_station", t["name"], c[0], c[1], {"ambulances": 2, "tenders": 0})
        elif t.get("station") == "subway" and t.get("name"):
            add("metro", t.get("name:en") or t["name"], c[0], c[1], {"line": t.get("line", "")}, dedup_km=0.4)
        elif t.get("man_made") in ("water_works", "water_tower"):
            add("water", t.get("name") or ("Water treatment plant" if t["man_made"] == "water_works" else "Water tank"),
                c[0], c[1], {"storage_hours": 10 if t["man_made"] == "water_tower" else 4}, dedup_km=0.6)
        elif t.get("amenity") in ("school", "college", "university", "community_centre") and t.get("name"):
            add("shelter", t["name"], c[0], c[1], {"capacity": int(250 + 900 * _h(t["name"]))}, dedup_km=0.9)
        elif t.get("amenity") == "fuel":
            add("fuel", t.get("name") or "Fuel station", c[0], c[1], {}, dedup_km=0.8)

    # underpasses: road tunnels / negative layers that are not water culverts
    for el in osm:
        t = el.get("tags", {})
        if el["type"] != "way" or "highway" not in t or t.get("tunnel") == "culvert" or "waterway" in t:
            continue
        if t.get("tunnel") == "yes" or str(t.get("layer", "")).startswith("-"):
            geom = el.get("geometry")
            if not geom:
                continue
            mid = geom[len(geom) // 2]
            uz = cell_of(mid["lat"], mid["lon"])
            uname = t.get("name") or (f"Underpass, {zones[uz].locality}" if uz is not None else "Road underpass")
            add("underpass", uname, mid["lat"], mid["lon"],
                {"depth_factor": round(2.4 + 1.2 * _h(str(el["id"])), 2), "sump_m": 0.0}, dedup_km=0.5)

    # lakes with spillways (dams) - Ambazari is the one that overflowed in 2023
    for el in osm:
        t = el.get("tags", {})
        nm = t.get("name", "")
        if el["type"] == "way" and t.get("natural") == "water" and nm and _area_m2(el) > 150_000 and not any(
            w in nm.lower() for w in ("river", "naag", "nadi", "nallah")
        ):
            geom = el["geometry"]
            # spill point: lowest-latitude-ish edge; approximate with the southern-most vertex
            sp = min(geom, key=lambda p: p["lat"])
            z = cell_of(sp["lat"], sp["lon"])
            if z is None:
                continue
            # move the asset to the nearest non-lake neighbour so it sits on the shore
            if zones[z].lake:
                land = [j for j in neighbors[z] if not zones[j].lake]
                if not land:
                    continue
                z = min(land, key=lambda j: zones[j].elev)
            zz = zones[z]
            n = sum(1 for a in assets if a.kind == "lake")
            assets.append(Asset(
                id=f"LAK-{n + 1:02d}", kind="lake", name=nm, lat=zz.lat, lon=zz.lon, zone=z,
                attrs={"area_km2": round(_area_m2(el) / 1e6, 2),
                       "freeboard_mm": 420 if "ambazari" in nm.lower() else int(950 + 450 * _h(nm)),
                       "catchment_zones": 14},
            ))

    # synthetic: stormwater pumping stations in low, river-adjacent, populated zones
    low = sorted(
        [z for z in zones if not z.lake and river_near[z.idx] and z.pop > 1500],
        key=lambda z: (z.hand, -z.pop),
    )
    for z in low:
        if sum(1 for a in assets if a.kind == "pump") >= 9:
            break
        if near_taken("pump", z.lat, z.lon, 1.8):
            continue
        add("pump", f"Stormwater pump, {z.locality}", z.lat, z.lon,
            {"capacity_mmph": round(6 + 6 * _h(z.id + "p"), 1)}, provenance="synthetic", dedup_km=1.8)

    # synthetic: mobile towers (no open tower registry connected)
    for z in sorted(zones, key=lambda z: -z.built):
        if sum(1 for a in assets if a.kind == "tower") >= 70:
            break
        if z.lake or z.built < 0.18 or near_taken("tower", z.lat, z.lon, 1.25):
            continue
        add("tower", f"Mobile site {z.id[-5:].upper()}", z.lat + 0.0015, z.lon + 0.0015,
            {"battery_hours": round(3 + 5 * _h(z.id + "b"), 1), "covers_km": 1.6},
            provenance="synthetic", dedup_km=1.25)

    # ambulance bases: fire stations + the four largest hospitals
    hosp = sorted([a for a in assets if a.kind == "hospital"], key=lambda a: -a.attrs["beds"])[:4]
    for a in hosp:
        a.attrs["ambulance_base"] = True
    return assets


def _build_power(slug, zones, assets):
    subs = [a for a in assets if a.kind == "substation" and a.attrs["level"] == "distribution"]
    trans = [a for a in assets if a.kind == "substation" and a.attrs["level"] == "transmission"]
    if not subs:
        subs = [a for a in assets if a.kind == "substation"]
    sub_xy = np.array([[a.lat, a.lon] for a in subs])

    def nearest(lat, lon, k=3):
        d = np.hypot(sub_xy[:, 0] - lat, (sub_xy[:, 1] - lon) * math.cos(math.radians(lat)))
        return list(np.argsort(d)[:k])

    zone_sub = np.array([nearest(z.lat, z.lon, 1)[0] for z in zones])
    candidates: dict[str, list[str]] = {}
    truth: dict[str, str] = {}
    for a in assets:
        if a.kind in ("hospital", "pump", "tower", "metro", "water", "fire_station"):
            near = nearest(a.lat, a.lon, 3)
            candidates[a.id] = [subs[i].id for i in near]
            # hidden truth: most assets hang off the nearest feeder, a few do not
            r = _h(slug + a.id + "feeder")
            pick = 0
            if a.kind == "hospital" and r < 0.28:
                pick = 1 if r < 0.2 else 2
            elif a.kind in ("pump", "metro") and r < 0.18:
                pick = 1
            truth[a.id] = candidates[a.id][min(pick, len(near) - 1)]
    for s in subs:
        if trans:
            t = min(trans, key=lambda t: _km((s.lat, s.lon), (t.lat, t.lon)))
            candidates[s.id] = [t.id]
            truth[s.id] = t.id
    return candidates, truth, zone_sub


def _dijkstra(neighbors, cost, sources):
    Z = len(cost)
    dist = np.full(Z, np.inf)
    prev = np.full(Z, -1, dtype=int)
    pq = []
    for s in sources:
        dist[s] = cost[s] / 2
        heapq.heappush(pq, (dist[s], s))
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v in neighbors[u]:
            nd = d + (cost[u] + cost[v]) / 2
            if nd < dist[v]:
                dist[v], prev[v] = nd, u
                heapq.heappush(pq, (nd, v))
    return dist, prev


def _path(prev, z):
    out = []
    while z != -1:
        out.append(z)
        z = prev[z]
    return out


def _build_paths(city: CityModel) -> None:
    """Primary and alternate ambulance paths, hospital staff-access and supply
    paths, stored as zone-crossing matrices so travel times can be evaluated
    for every particle at once with a matrix product."""
    Z = city.Z
    cost = np.array([z.cross_min if not z.lake else 1e4 for z in city.zones])
    bases = [a.zone for a in city.assets if a.kind == "fire_station" or a.attrs.get("ambulance_base")]
    dist, prev = _dijkstra(city.neighbors, cost, bases)
    p1 = np.zeros((Z, Z), dtype=np.float32)
    p2 = np.zeros((Z, Z), dtype=np.float32)
    base_of = np.zeros(Z, dtype=int)
    for z in range(Z):
        path = _path(prev, z)
        base_of[z] = path[-1]
        for j in path:
            p1[z, j] = cost[j]
    # alternate: penalise the primary path's interior and re-run per zone group
    for z in range(Z):
        interior = np.nonzero(p1[z])[0]
        pen = cost.copy()
        pen[interior] *= 6
        pen[z] = cost[z]
        d2, pv2 = _dijkstra(city.neighbors, pen, bases)
        for j in _path(pv2, z):
            p2[z, j] = cost[j]
    city.ems_p1, city.ems_p2, city.ems_base_of = p1, p2, base_of

    hosp = city.of_kind("hospital")
    fuel = [a.zone for a in city.of_kind("fuel")] or bases
    by_pop = sorted(range(Z), key=lambda i: -city.zones[i].pop)
    access = np.zeros((len(hosp), Z), dtype=np.float32)
    supply = np.zeros((len(hosp), Z), dtype=np.float32)
    for hi, h in enumerate(hosp):
        dist_h, prev_h = _dijkstra(city.neighbors, cost, [h.zone])
        origins = [i for i in by_pop if dist_h[i] < 35][:6] or [h.zone]
        for o in origins:
            for j in _path(prev_h, o):
                access[hi, j] += cost[j] / len(origins)
        f = min(fuel, key=lambda fz: dist_h[fz])
        for j in _path(prev_h, f):
            supply[hi, j] = cost[j]
    city.hosp_access, city.hosp_supply = access, supply


if __name__ == "__main__":
    import sys, time

    t0 = time.time()
    c = load_city(sys.argv[1] if len(sys.argv) > 1 else "nagpur")
    kinds = {}
    for a in c.assets:
        kinds[a.kind] = kinds.get(a.kind, 0) + 1
    print(f"{c.name}: {c.Z} zones, pop {sum(z.pop for z in c.zones):,}, assets {kinds} in {time.time() - t0:.1f}s")
    print("lakes:", [a.name for a in c.of_kind("lake")])
    print("hospitals:", [(a.name, a.attrs["beds"]) for a in c.of_kind("hospital")][:12])
    print("underpasses:", [a.name for a in c.of_kind("underpass")][:12])
    hidden = [k for k, v in c.power_truth.items() if c.power_candidates[k][0] != v]
    print("hidden feeders:", len(hidden), hidden[:8])
    print("ems baseline median min:", float(np.median(c.ems_p1.sum(1))))
