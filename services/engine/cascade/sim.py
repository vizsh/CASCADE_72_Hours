"""Vectorised city mechanics shared by the hidden world (one particle, true
parameters) and the forecaster (hundreds of particles, uncertain parameters).

Every array is shaped (P, ...) so a whole ensemble advances with one call.
Systems: rain/heat/plume/crowd drivers -> drainage & lakes -> flood depth ->
roads & underpasses -> power (substations, feeders, backup) -> telecom ->
transit -> water supply -> ambulances -> hospitals -> zone risk states.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from scipy import sparse

from .city import CityModel

NORMAL, WATCH, HIGH, CRITICAL = 0, 1, 2, 3
STATE_NAMES = ["NORMAL", "WATCH", "HIGH RISK", "CRITICAL"]
SUBSTEPS = 4


@dataclass
class Overrides:
    """Interventions expressed as changes to the mechanics. Each entry carries
    the hour it takes effect so deadlines can be evaluated."""

    pumps: dict[int, tuple[float, float]] = field(default_factory=dict)  # zone -> (mm/h, start)
    clear_drain: dict[int, float] = field(default_factory=dict)  # zone -> start
    protect_sub: dict[int, float] = field(default_factory=dict)  # sub idx -> start
    shutdown_sub: dict[int, tuple[float, float]] = field(default_factory=dict)  # sub -> (start, end)
    generator: dict[str, float] = field(default_factory=dict)  # asset id -> start
    diesel: dict[int, float] = field(default_factory=dict)  # hospital idx -> start
    ambulances: dict[int, tuple[int, float]] = field(default_factory=dict)  # zone -> (n, start)
    close_underpass: dict[int, float] = field(default_factory=dict)  # underpass idx -> start
    evacuate: dict[int, float] = field(default_factory=dict)  # zone -> start
    surge: dict[int, float] = field(default_factory=dict)  # hospital idx -> start
    advisory: float | None = None  # start hour of a public travel advisory

    def empty(self) -> bool:
        return not any(
            [self.pumps, self.clear_drain, self.protect_sub, self.shutdown_sub, self.generator,
             self.diesel, self.ambulances, self.close_underpass, self.evacuate, self.surge,
             self.advisory is not None]
        )


class Statics:
    """Precomputed city arrays (shared, read-only)."""

    def __init__(self, city: CityModel):
        self.city = city
        Z = city.Z
        zs = city.zones
        self.Z = Z
        self.pop = np.array([z.pop for z in zs], dtype=float)
        self.vuln = np.array([z.vuln for z in zs])
        self.built = np.array([z.built for z in zs])
        self.hand = np.array([z.hand for z in zs])
        self.runoff = np.array([z.runoff for z in zs])
        self.drain_nominal = np.array([z.drain_mmph for z in zs])
        self.lake = np.array([z.lake for z in zs])
        self.river = np.array([z.river for z in zs])
        self.river_adj = np.array([z.river or any(zs[j].river for j in city.neighbors[z.idx]) for z in zs])
        self.major_road = np.array([z.road_class in ("motorway", "trunk", "primary", "secondary") for z in zs])
        self.lat = np.array([z.lat for z in zs])
        self.lon = np.array([z.lon for z in zs])
        self.has_down = np.array([z.flow_to >= 0 for z in zs])
        self.edge = np.array([len(city.neighbors[i]) < 6 for i in range(Z)])
        spill_to = []
        for i, z in enumerate(zs):
            if z.flow_to >= 0:
                spill_to.append(z.flow_to)
            elif not self.edge[i] and city.neighbors[i]:
                spill_to.append(min(city.neighbors[i], key=lambda j: zs[j].elev))
            else:
                spill_to.append(-1)
        self.sink = np.array([z.flow_to < 0 and spill_to[i] >= 0 for i, z in enumerate(zs)])
        self.outlet = np.array([z.flow_to < 0 and spill_to[i] < 0 for i, z in enumerate(zs)])
        rows = [i for i in range(Z) if spill_to[i] >= 0]
        cols = [spill_to[i] for i in rows]
        self.flowT = sparse.csr_matrix((np.ones(len(rows)), (cols, rows)), shape=(Z, Z))  # inflow = flowT @ out
        self.base_conc = 1.4 + 5.0 * (1 - np.clip(self.hand / 6.0, 0, 1))
        self.base_conc[self.lake] = 0.0

        self.subs = city.of_kind("substation")
        self.sub_index = {a.id: i for i, a in enumerate(self.subs)}
        self.sub_zone = np.array([a.zone for a in self.subs])
        self.sub_plinth = np.array([a.attrs["plinth_m"] for a in self.subs])
        self.sub_trans = np.array([a.attrs["level"] == "transmission" for a in self.subs])
        dist = [a for a in city.assets if a.kind == "substation" and a.attrs["level"] == "distribution"] or self.subs
        self.zone_sub = np.array([self.sub_index[dist[i].id] for i in city.zone_substation])
        self.sub_parent = np.array(
            [self.sub_index[city.power_truth[a.id]] if a.id in city.power_truth else -1 for a in self.subs]
        )

        # consumers whose feeder is uncertain to the forecaster
        self.consumers = [a for a in city.assets if a.id in city.power_candidates and a.kind != "substation"]
        self.cons_index = {a.id: i for i, a in enumerate(self.consumers)}
        cand = np.zeros((len(self.consumers), 3), dtype=int)
        for i, a in enumerate(self.consumers):
            c = [self.sub_index[s] for s in city.power_candidates[a.id]]
            while len(c) < 3:
                c.append(c[-1])
            cand[i] = c[:3]
        self.cand = cand
        self.truth_pick = np.array(
            [city.power_candidates[a.id].index(city.power_truth[a.id]) for a in self.consumers]
        )

        def cons_of(kind):
            return np.array([self.cons_index[a.id] for a in city.of_kind(kind)], dtype=int)

        self.hosp = city.of_kind("hospital")
        self.H = len(self.hosp)
        self.hosp_cons = cons_of("hospital")
        self.hosp_zone = np.array([a.zone for a in self.hosp])
        self.beds = np.array([a.attrs["beds"] for a in self.hosp], dtype=float)
        self.backup = np.array([a.attrs["backup_hours"] for a in self.hosp])
        self.base_occ = np.array([a.attrs["base_occupancy"] for a in self.hosp])
        hz = np.array([[a.lat, a.lon] for a in self.hosp])
        d = np.hypot(self.lat[:, None] - hz[None, :, 0], (self.lon[:, None] - hz[None, :, 1]) * 0.93)
        order = np.argsort(d, axis=1)
        self.zone_hosp1 = order[:, 0]
        self.zone_hosp2 = order[:, 1]

        self.pumps = city.of_kind("pump")
        self.pump_cons = cons_of("pump")
        self.pump_zone = np.array([a.zone for a in self.pumps], dtype=int)
        self.pump_cap = np.array([a.attrs["capacity_mmph"] for a in self.pumps])

        self.towers = city.of_kind("tower")
        self.tower_cons = cons_of("tower")
        self.tower_batt = np.array([a.attrs["battery_hours"] for a in self.towers])
        tz = np.array([[a.lat, a.lon] for a in self.towers])
        d = np.hypot(self.lat[:, None] - tz[None, :, 0], (self.lon[:, None] - tz[None, :, 1]) * 0.93)
        self.zone_tower = np.argsort(d, axis=1)[:, :2]

        self.metro = city.of_kind("metro")
        self.metro_cons = cons_of("metro")
        self.metro_zone = np.array([a.zone for a in self.metro], dtype=int)
        near = np.zeros((len(self.metro), Z))
        for i, a in enumerate(self.metro):
            near[i, a.zone] = 1
            for j in city.neighbors[a.zone]:
                near[i, j] = 0.6
        self.metro_near = near

        self.water = city.of_kind("water")
        self.water_cons = cons_of("water")
        self.water_store = np.array([a.attrs["storage_hours"] for a in self.water])
        wz = np.array([[a.lat, a.lon] for a in self.water])
        d = np.hypot(self.lat[:, None] - wz[None, :, 0], (self.lon[:, None] - wz[None, :, 1]) * 0.93)
        self.zone_water = np.argmin(d, axis=1)

        self.under = city.of_kind("underpass")
        self.under_zone = np.array([a.zone for a in self.under], dtype=int)
        self.under_factor = np.array([a.attrs["depth_factor"] for a in self.under])

        self.lakes = city.of_kind("lake")
        self.lake_zone = np.array([a.zone for a in self.lakes], dtype=int)
        self.lake_freeboard = np.array([a.attrs["freeboard_mm"] for a in self.lakes], dtype=float)
        self.lake_area = np.array([a.attrs["area_km2"] for a in self.lakes])
        down = []
        for a in self.lakes:
            path, cur = [], a.zone
            for _ in range(6):
                path.append(cur)
                nxt = city.zones[cur].flow_to
                if nxt < 0:
                    break
                cur = nxt
            down.append(path)
        self.lake_down = down

        self.cross = np.array([z.cross_min for z in zs])
        self.p1 = city.ems_p1
        self.p2 = city.ems_p2
        self.ems_base = np.minimum(self.p1 @ np.ones(Z), self.p2 @ np.ones(Z)) + 2.0
        self.access = city.hosp_access
        self.access_base = np.maximum(self.access.sum(1), 1e-3)
        self.supply = city.hosp_supply
        self.supply_base = np.maximum(self.supply.sum(1), 1e-3)
        ring2 = []
        for z in range(Z):
            s = {z, *city.neighbors[z]}
            for j in list(s):
                s.update(city.neighbors[j])
            ring2.append(np.array(sorted(s)))
        self.ring2 = ring2


class Ensemble:
    """A set of P particles: parameters + state."""

    def __init__(self, st: Statics, P: int, rng: np.random.Generator, truth: bool = False, seed_key: int = 0):
        self.st, self.P, self.rng, self.truth = st, P, rng, truth
        Z = st.Z
        if truth:
            r = np.random.default_rng(1000 + seed_key)
            self.drain_cap = st.drain_nominal * np.exp(r.normal(0, 0.18, Z))[None, :]
            self.conc = st.base_conc * np.exp(r.normal(0, 0.15, Z))[None, :]
            self.rain_field = self._field(r, 1)
            self.plinth = st.sub_plinth[None, :].copy()
            self.pick = st.truth_pick[None, :].copy()
            self.freeboard = st.lake_freeboard[None, :].copy()
            self.batt0 = st.tower_batt[None, :].copy()
        else:
            self.drain_cap = st.drain_nominal[None, :] * np.exp(rng.normal(0, 0.25, (P, Z)))
            self.conc = st.base_conc[None, :] * np.exp(rng.normal(0, 0.22, (P, Z)))
            self.rain_field = self._field(rng, P)
            self.plinth = st.sub_plinth[None, :] + rng.normal(0, 0.08, (P, len(st.subs)))
            prior = np.array([0.62, 0.25, 0.13])
            self.pick = rng.choice(3, size=(P, len(st.consumers)), p=prior)
            self.freeboard = st.lake_freeboard[None, :] * np.exp(rng.normal(0, 0.25, (P, len(st.lakes))))
            self.batt0 = st.tower_batt[None, :] * np.exp(rng.normal(0, 0.2, (P, len(st.towers))))
        self.block = np.ones((self.P, Z))  # drain blockage multiplier (concept drift in the world)
        self.reset_state()

    def _field(self, rng, P):
        st = self.st
        f = np.ones((P, st.Z))
        for p in range(P):
            acc = np.zeros(st.Z)
            for _ in range(3):
                k = rng.integers(st.Z)
                amp = rng.uniform(0.3, 1.1)
                rad = rng.uniform(0.03, 0.07)
                d2 = (st.lat - st.lat[k]) ** 2 + ((st.lon - st.lon[k]) * 0.93) ** 2
                acc += amp * np.exp(-d2 / (2 * rad**2))
            g = 0.55 + acc
            f[p] = g / g.mean()
        return f

    def reset_state(self):
        st, P = self.st, self.P
        self.S = np.zeros((P, st.Z))
        self.lake = -self.freeboard.copy()
        self.rain_hist = np.zeros((P, 6))
        self.wet = np.zeros((P, st.Z))
        self.sub_down_until = np.full((P, len(st.subs)), -1.0)
        self.sub_cause = np.zeros((P, len(st.subs)), dtype=np.int8)  # 0 up,1 flood,2 overload,3 forced,4 parent,5 shutdown
        self.diesel = np.tile(st.backup, (P, 1)).astype(float)
        self.batt = self.batt0.copy()
        self.store = np.tile(st.water_store, (P, 1)).astype(float)
        self.patients = np.tile(st.beds * st.base_occ, (P, 1))
        self.staff = np.ones((P, st.H))
        self.topped = np.zeros((P, st.H), dtype=bool)
        self.t = 0
        self.first = {}

    def clone_rows(self, idx: np.ndarray):
        """Resample particles (used by the particle filter)."""
        for name in ("drain_cap", "conc", "rain_field", "plinth", "pick", "freeboard", "batt0", "block",
                     "S", "lake", "rain_hist", "wet", "sub_down_until", "sub_cause", "diesel", "batt",
                     "store", "patients", "staff", "topped"):
            arr = getattr(self, name)
            if arr.shape[0] == self.P:
                setattr(self, name, arr[idx].copy())

    def copy(self) -> "Ensemble":
        new = object.__new__(Ensemble)
        new.__dict__ = {k: (v.copy() if isinstance(v, np.ndarray) else v) for k, v in self.__dict__.items()}
        new.first = {k: v.copy() for k, v in self.first.items()}
        return new


def plume_field(st: Statics, src_zone: int, wind_from_deg: float, wind_ms: float, rate: float) -> np.ndarray:
    """Ground-level Gaussian plume (Pasquill-Gifford class D) on zone centroids,
    returned as a relative concentration where 1.0 ~ evacuation threshold."""
    lat0, lon0 = st.lat[src_zone], st.lon[src_zone]
    dx = (st.lon - lon0) * 111.0 * 0.93
    dy = (st.lat - lat0) * 111.0
    to = math.radians((wind_from_deg + 180) % 360)
    ux, uy = math.sin(to), math.cos(to)
    x = dx * ux + dy * uy  # downwind km
    y = -dx * uy + dy * ux  # crosswind km
    x_m = np.maximum(x * 1000, 1.0)
    sig_y = 0.08 * x_m / np.sqrt(1 + 0.0001 * x_m)
    sig_z = 0.06 * x_m / np.sqrt(1 + 0.0015 * x_m)
    c = rate / (math.pi * max(wind_ms, 0.5) * sig_y * sig_z) * np.exp(-0.5 * (y * 1000 / sig_y) ** 2)
    c[x <= 0] = 0
    c = c / (c.max() + 1e-12) * 6.0  # normalised: 6 at the plant fence line
    c[src_zone] = 6.0
    return c


def step(ens: Ensemble, t: int, rain: np.ndarray, temp: np.ndarray, ov: Overrides | None = None,
         plume: np.ndarray | None = None, crowd: np.ndarray | None = None,
         forced_down: np.ndarray | None = None, transit_fault: bool = False) -> dict:
    """Advance one hour. `rain` and `temp` are (P,) city-mean drivers."""
    st, P, Z = ens.st, ens.P, ens.st.Z
    ov = ov or Overrides()
    rng = ens.rng

    # ---- drainage capacity with interventions --------------------------------
    cap = ens.drain_cap * ens.block
    for z, start in ov.clear_drain.items():
        if t >= start:
            cap[:, z] = ens.drain_cap[:, z]
    stage = ens.rain_hist.sum(1) / 55.0
    backwater = np.clip((stage - 0.7) / 1.4, 0, 0.6)
    cap = cap * (1 - backwater[:, None] * st.river_adj[None, :])
    cap = cap + st.river[None, :] * 35.0 * (1 - backwater[:, None])

    # ---- power (evaluated before hydrology so pumps reflect current state) ---
    nsub = len(st.subs)
    depth_prev = np.maximum(ens.S - 6.0, 0) / 1000.0 * ens.conc
    sub_depth = depth_prev[:, st.sub_zone]
    plinth = ens.plinth + np.array([0.6 if (i in ov.protect_sub and t >= ov.protect_sub[i]) else 0 for i in range(nsub)])
    flooded = sub_depth > plinth
    load = 0.72 * (1 + 0.032 * np.maximum(temp - 34, 0))
    trip_p = np.clip((load - 1.0) * 1.2, 0, 0.3)[:, None] * (~st.sub_trans)[None, :]
    trips = rng.random((P, nsub)) < trip_p * 0.25
    down_now = ens.sub_down_until > t
    cause = ens.sub_cause.copy()
    newly = (flooded | trips) & ~down_now
    cause[newly & flooded] = 1
    cause[newly & trips & ~flooded] = 2
    ens.sub_down_until = np.where(flooded, t + 4.0, ens.sub_down_until)
    ens.sub_down_until = np.where(trips & ~down_now, t + rng.uniform(2, 6, (P, nsub)), ens.sub_down_until)
    down = ens.sub_down_until > t
    if forced_down is not None and forced_down.any():
        cause[:, forced_down & ~down.any(0)] = 3
        down = down | forced_down[None, :]
    for i, (s0, s1) in ov.shutdown_sub.items():
        if s0 <= t < s1:
            down[:, i] = True
            cause[:, i] = 5
    parent = st.sub_parent
    has_parent = parent >= 0
    par_down = np.zeros_like(down)
    par_down[:, has_parent] = down[:, parent[has_parent]] & st.sub_trans[parent[has_parent]][None, :]
    cause[par_down & ~down] = 4
    down = down | par_down
    cause[~down] = 0
    ens.sub_cause = cause
    sub_up = ~down
    zone_power = sub_up[:, st.zone_sub]

    sup = st.cand[np.arange(len(st.consumers))[None, :], ens.pick]  # (P, Nc) substation index
    grid_ok = np.take_along_axis(sub_up, sup, axis=1)

    def gen(asset_list, idx_list):
        out = np.zeros(len(asset_list), dtype=bool)
        for k, a in enumerate(asset_list):
            s = ov.generator.get(a.id)
            out[k] = s is not None and t >= s
        return out

    pump_ok = grid_ok[:, st.pump_cons] | gen(st.pumps, st.pump_cons)[None, :]

    # ---- hydrology (4 substeps) --------------------------------------------
    r = rain[:, None] * ens.rain_field
    ens.wet = np.clip(ens.wet * 0.97 + r * 0.04, 0, 1)
    q = r * (st.runoff + (1 - st.runoff) * 0.45 * ens.wet)
    q[:, st.lake] = 0
    extra = np.zeros((P, Z))
    if len(st.pumps):
        np.add.at(extra, (slice(None), st.pump_zone), st.pump_cap[None, :] * pump_ok)
    for z, (mm, start) in ov.pumps.items():
        if t >= start:
            extra[:, z] += mm
    cap_eff = cap + extra
    dt = 1.0 / SUBSTEPS
    lake_in = np.zeros((P, len(st.lakes)))
    for li, lz in enumerate(st.lake_zone):
        lake_in[:, li] = r[:, lz] * 6.0  # catchment-to-lake area ratio
    spill_total = np.zeros((P, len(st.lakes)))
    for _ in range(SUBSTEPS):
        ens.lake += lake_in * dt - 3.0 * dt * (ens.lake < 0)
        spill = np.maximum(ens.lake, 0) * 0.5
        ens.lake -= spill
        spill_total += spill
        out = 0.32 * np.maximum(ens.S - 6.0, 0)
        out[:, st.sink] = 0.32 * np.maximum(ens.S[:, st.sink] - 160.0, 0)
        inflow = (st.flowT @ out.T).T
        for li, path in enumerate(st.lake_down):
            share = spill[:, li] * st.lake_area[li] * 1.2 / (0.74 * len(path))
            for z in path:
                inflow[:, z] += share
        drain = np.minimum(ens.S + q * dt + inflow, cap_eff * dt)
        ens.S = np.maximum(ens.S + q * dt + inflow - out - drain, 0)
        ens.S[:, st.outlet] *= 0.6
    ens.S[:, st.lake] = 0
    ens.rain_hist = np.roll(ens.rain_hist, 1, axis=1)
    ens.rain_hist[:, 0] = rain
    depth = np.minimum(np.maximum(ens.S - 6.0, 0) / 1000.0 * ens.conc, 2.0)
    under_depth = depth[:, st.under_zone] * st.under_factor[None, :]
    drain_ratio = np.minimum((q + 1e-6) / np.maximum(cap_eff, 1e-3), 3.0)

    # ---- telecom, transit, water -----------------------------------------------
    t_grid = grid_ok[:, st.tower_cons] | gen(st.towers, st.tower_cons)[None, :]
    ens.batt = np.where(t_grid, np.minimum(ens.batt + 0.5, ens.batt0), ens.batt - 1.0)
    tower_up = t_grid | (ens.batt > 0)
    comms = (tower_up[:, st.zone_tower[:, 0]] * 0.75 + tower_up[:, st.zone_tower[:, 1]] * 0.25)

    m_grid = grid_ok[:, st.metro_cons]
    metro_closed = ~m_grid | (depth[:, st.metro_zone] > 0.25) | transit_fault
    transit_load = np.clip(metro_closed.astype(float) @ st.metro_near * 0.12, 0, 0.6)

    w_grid = grid_ok[:, st.water_cons]
    ens.store = np.where(w_grid, np.minimum(ens.store + 1, st.water_store[None, :]), ens.store - 1)
    water_ok_node = w_grid | (ens.store > 0)
    water_ok = water_ok_node[:, st.zone_water]

    # ---- roads -------------------------------------------------------------------
    road_d = depth * 0.6
    m = np.ones((P, Z))
    m = np.where(road_d > 0.05, 1 + (road_d - 0.05) / 0.10 * 0.8, m)
    m = np.where(road_d > 0.15, 1.8 + (road_d - 0.15) / 0.15 * 2.2, m)
    m = np.where(road_d > 0.30, 12.0, m)
    closed_u = np.array([ov.close_underpass.get(i, 1e9) <= t for i in range(len(st.under))])
    u_block = (under_depth > 0.3) | closed_u[None, :]
    for k, z in enumerate(st.under_zone):
        m[:, z] = np.where(u_block[:, k], np.maximum(m[:, z], 6.0 if not closed_u[k] else 3.5), m[:, z])
    m = m * np.where(~zone_power & (st.built[None, :] > 0.35), 1.3, 1.0)
    m = m * (1 + transit_load)
    if crowd is not None:
        m = m * (1 + np.clip(crowd / 1.8, 0, 4))[None, :]
    if plume is not None:
        m = np.where(plume[None, :] > 1.0, np.maximum(m, 8.0), m)
    evac_load = np.zeros(Z)
    for z, start in ov.evacuate.items():
        if start <= t < start + 4:
            evac_load[st.ring2[z]] += 0.45
    m = m * (1 + evac_load)[None, :]
    if ov.advisory is not None and t >= ov.advisory:
        m = 1 + (m - 1) * 0.78
    m[:, st.lake] = 60.0

    ems1 = m @ st.p1.T
    ems2 = m @ st.p2.T
    ems = np.minimum(ems1, ems2) + 2.0 + 7.0 * (1 - comms)
    for z, (n, start) in ov.ambulances.items():
        if t >= start:
            local = 4.0 + st.cross[st.ring2[z]][None, :] * m[:, st.ring2[z]] * 1.2 + 7.0 * (1 - comms[:, st.ring2[z]])
            ems[:, st.ring2[z]] = np.minimum(ems[:, st.ring2[z]], local)

    acc = (m @ st.access.T) / st.access_base[None, :]
    sup_ratio = (m @ st.supply.T) / st.supply_base[None, :]
    hour = t % 24
    shift = hour in (6, 7, 13, 14, 20, 21)
    if shift:
        target = np.clip(1.55 - 0.55 * acc, 0.35, 1.0)
        ens.staff = 0.5 * ens.staff + 0.5 * target
    else:
        ens.staff = np.minimum(1.0, ens.staff + 0.01)

    # ---- hospitals ------------------------------------------------------------
    h_grid = grid_ok[:, st.hosp_cons] | gen(st.hosp, st.hosp_cons)[None, :]
    for h, start in ov.diesel.items():
        if t >= start:
            ok = (sup_ratio[:, h] < 3.0) & ~ens.topped[:, h]
            ens.diesel[:, h] += 24 * ok
            ens.topped[:, h] |= ok
    ens.diesel = np.where(h_grid, ens.diesel, ens.diesel - 1.0)
    on_gen = ~h_grid & (ens.diesel > 0)
    blackout = ~h_grid & (ens.diesel <= 0)

    flood_rate = st.pop[None, :] * 5.0e-5 * np.clip((depth - 0.2) / 0.5, 0, 1.5)
    heat_rate = st.pop[None, :] * 4.0e-7 * np.maximum(temp[:, None] - 40, 0) ** 1.5 * np.where(zone_power, 1.0, 2.2)
    heat_rate = heat_rate * np.where(water_ok, 1.0, 1.4)
    rate = flood_rate + heat_rate
    if plume is not None:
        rate = rate + st.pop[None, :] * 3.0e-4 * np.clip(plume, 0, 3)[None, :]
    if crowd is not None:
        rate = rate + np.maximum(crowd - 4.5, 0)[None, :] * 6.0
    stranded = ems > 60
    arriving = rate * ~stranded
    cap_h = st.beds[None, :] * ens.staff * np.where(blackout, 0.25, 1.0)
    for h, start in ov.surge.items():
        if t >= start:
            cap_h[:, h] *= 1.15
    occ_prev = ens.patients / np.maximum(cap_h, 1)
    failing = (occ_prev > 1.15) | blackout
    to1 = np.zeros((P, st.H))
    np.add.at(to1, (slice(None), st.zone_hosp1), arriving)
    f1 = failing[:, st.zone_hosp1]
    redirect = np.zeros((P, st.H))
    np.add.at(redirect, (slice(None), st.zone_hosp2), arriving * f1)
    np.add.at(to1, (slice(None), st.zone_hosp1), -arriving * f1)
    baseline_in = st.beds * st.base_occ * 0.0105
    ens.patients = ens.patients + baseline_in[None, :] + to1 + redirect - ens.patients * 0.0105
    occ = ens.patients / np.maximum(cap_h, 1)

    # ---- zone risk states --------------------------------------------------------
    hosp_crit = (occ > 1.0) | blackout
    zone_hcrit = np.zeros((P, Z), dtype=bool)
    zone_hcrit[:, st.hosp_zone] = hosp_crit
    pz = st.pop[None, :] > 300
    crit = (pz & (depth > 0.45)) | (ems > np.maximum(38, 2.2 * st.ems_base)[None, :]) | zone_hcrit
    high = (depth > 0.2) | (ems > np.maximum(26, 1.6 * st.ems_base)[None, :]) | (comms < 0.3)
    high |= ~zone_power & (temp[:, None] > 40)
    high |= ~water_ok & (temp[:, None] > 40)
    watch = (depth > 0.06) | (drain_ratio > 0.85) | (ems > 1.35 * st.ems_base[None, :]) | ~zone_power | (temp[:, None] > 44)
    if plume is not None:
        crit |= plume[None, :] > 2.0
        high |= plume[None, :] > 0.7
        watch |= plume[None, :] > 0.2
    if crowd is not None:
        crit |= crowd[None, :] > 6.0
        high |= crowd[None, :] > 4.5
        watch |= crowd[None, :] > 3.0
    state = np.where(crit, CRITICAL, np.where(high, HIGH, np.where(watch, WATCH, NORMAL))).astype(np.int8)
    state[:, st.lake] = NORMAL

    obs = {
        "t": t, "rain": r, "depth": depth, "under_depth": under_depth, "drain_ratio": drain_ratio,
        "lake": ens.lake.copy(), "spill": spill_total, "sub_up": sub_up, "sub_cause": cause.copy(),
        "zone_power": zone_power, "grid_ok": grid_ok, "pump_ok": pump_ok, "tower_up": tower_up,
        "comms": comms, "metro_closed": metro_closed, "water_ok": water_ok, "mult": m, "ems": ems,
        "access": acc, "supply": sup_ratio, "staff": ens.staff.copy(), "on_gen": on_gen,
        "blackout": blackout, "diesel": ens.diesel.copy(), "occ": occ, "state": state,
        "stranded": stranded, "temp": temp, "u_block": u_block,
    }
    _record_events(ens, t, obs)
    ens.t = t + 1
    return obs


EVENT_KINDS = [
    "lake_overflow", "underpass_flooded", "substation_down", "pump_unpowered", "tower_dead",
    "metro_closed", "water_out", "hospital_generator", "hospital_access", "hospital_overload",
    "hospital_blackout", "zone_flood", "zone_ems", "zone_isolated",
]


def _first(ens, key, mask, t):
    arr = ens.first.get(key)
    if arr is None:
        arr = np.full(mask.shape, np.inf)
        ens.first[key] = arr
    arr[(arr == np.inf) & mask] = t


def _record_events(ens: Ensemble, t: int, o: dict) -> None:
    _first(ens, "lake_overflow", o["spill"] > 2.0, t)
    _first(ens, "underpass_flooded", o["under_depth"] > 0.3, t)
    _first(ens, "substation_down", ~o["sub_up"], t)
    _first(ens, "pump_unpowered", ~o["pump_ok"], t)
    _first(ens, "tower_dead", ~o["tower_up"], t)
    _first(ens, "metro_closed", o["metro_closed"], t)
    _first(ens, "water_out", ~_water_nodes(ens, o), t)
    _first(ens, "hospital_generator", o["on_gen"], t)
    _first(ens, "hospital_access", o["staff"] < 0.65, t)
    _first(ens, "hospital_overload", o["occ"] > 1.0, t)
    _first(ens, "hospital_blackout", o["blackout"], t)
    st = ens.st
    _first(ens, "zone_flood", (o["depth"] > 0.3) & (st.pop[None, :] > 300), t)
    _first(ens, "zone_ems", o["ems"] > np.maximum(26, 1.6 * st.ems_base)[None, :], t)
    _first(ens, "zone_isolated", o["stranded"] & (st.pop[None, :] > 300), t)


def _water_nodes(ens, o):
    st = ens.st
    w_grid = o["grid_ok"][:, st.water_cons]
    return w_grid | (ens.store > 0)
