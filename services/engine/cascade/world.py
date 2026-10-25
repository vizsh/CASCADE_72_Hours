"""The hidden world: one particle with the *true* parameters and dependency
graph, driven by the scenario's true drivers. It produces the ground truth used
for validation and the messy observation streams the forecaster consumes.
The forecaster never imports anything from here except the observation list."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .city import CityModel
from .scenarios import Scenario
from .sim import Ensemble, Statics, plume_field, step

TEXTS = {
    "flood": [
        "Water entering houses near {loc}", "{loc} main road flooded, bikes stuck",
        "{loc} mein ghutne tak paani", "{loc} madhe pani bharle, gaadi band",
        "Drain overflowing at {loc}, need help", "Knee-deep water at {loc} chowk",
    ],
    "outage": ["No electricity in {loc} since an hour", "{loc} light gayi, inverter bhi khatam"],
    "heat": ["Elderly neighbour collapsed in heat at {loc}", "No water supply at {loc} since morning"],
    "gas": ["Strong chlorine smell at {loc}, eyes burning", "{loc} mein gas ki badbu, saans lene mein dikkat"],
    "crowd": ["Crowd crush risk at {loc}, people pushing", "{loc} ghat par bheed bekaabu"],
}


@dataclass
class Obs:
    id: str
    source: str  # sensor/feed id
    kind: str
    target: str  # zone id or asset id
    zone: int
    valid: int  # hour the observation describes
    known: int  # hour it reached the system
    value: float
    text: str = ""
    meta: dict = field(default_factory=dict)

    def public(self, city: CityModel) -> dict:
        return {
            "id": self.id, "source": self.source, "kind": self.kind, "target": self.target,
            "zone": city.zones[self.zone].id if self.zone >= 0 else None, "valid": self.valid,
            "known": self.known, "value": round(float(self.value), 3), "text": self.text, "meta": self.meta,
        }


@dataclass
class WorldRun:
    scenario: Scenario
    frames: list[dict]  # compact truth per hour
    first: dict[str, np.ndarray]  # first-failure hour per event kind
    observations: list[Obs]
    sensors: dict
    events: list[dict]  # resolved scenario events (zone indices etc.)


def _find_zone(city: CityModel, name: str, default: int) -> int:
    name = name.lower()
    for z in city.zones:
        if name in z.locality.lower() and not z.lake:
            return z.idx
    for a in city.assets:
        if name in a.name.lower():
            return a.zone
    return default


def resolve_events(city: CityModel, st: Statics, sc: Scenario) -> list[dict]:
    out = []
    for ev in sc.events:
        e = dict(ev)
        if ev["type"] == "drain_block":
            z0 = _find_zone(city, ev["near"], 0)
            e["zones"] = [z0, *city.neighbors[z0]]
        elif ev["type"] == "grid_fault":
            if ev["sub_rank"] == "transmission":
                idx = [i for i, s in enumerate(st.subs) if s.attrs["level"] == "transmission"][:1]
                kids = [i for i, p in enumerate(st.sub_parent) if p in idx and i not in idx]
                t0 = st.subs[idx[0]]
                kids.sort(key=lambda i: (st.subs[i].lat - t0.lat) ** 2 + (st.subs[i].lon - t0.lon) ** 2)
                e["subs"] = kids[:7]  # the fault drops the feeders nearest the failed bay
            else:
                ranked = sorted([i for i in range(len(st.subs)) if not st.sub_trans[i]],
                                key=lambda i: -st.subs[i].attrs["mva"])
                e["subs"] = [ranked[ev["sub_rank"]]]
            e["sub_ids"] = [st.subs[i].id for i in e["subs"]]
        elif ev["type"] == "plume":
            src = next((a for a in city.assets if a.kind == ev["source_kind"] and "plant" in a.name.lower()),
                       next(a for a in city.assets if a.kind == ev["source_kind"]))
            e["source_zone"], e["source_id"], e["source_name"] = src.zone, src.id, src.name
            e["field"] = plume_field(st, src.zone, ev["wind_from_deg"], ev["wind_ms"], ev["rate"])
        elif ev["type"] == "crowd":
            lake = next((a for a in city.of_kind("lake") if ev["near_lake"].lower() in a.name.lower()), None)
            z0 = lake.zone if lake else 0
            e["zones"] = [z0, *city.neighbors[z0]]
            e["zone_name"] = city.zones[z0].locality
        out.append(e)
    return out


def drivers_at(st: Statics, events: list[dict], t: int, known_only: bool = False):
    """Plume, crowd, forced outages and transit faults active at hour t."""
    Z = st.Z
    plume = crowd = None
    forced = np.zeros(len(st.subs), dtype=bool)
    transit = False
    block = None
    for e in events:
        on = e["hour"] <= t < e["hour"] + e.get("duration", 10_000)
        if e["type"] == "plume" and on:
            decay = 1.0 if t < e["hour"] + e["duration"] else 0.0
            plume = e["field"] * decay
        elif e["type"] == "plume" and e["hour"] + e["duration"] <= t < e["hour"] + e["duration"] + 3:
            plume = e["field"] * 0.3
        elif e["type"] == "crowd" and on:
            crowd = crowd if crowd is not None else np.zeros(Z)
            phase = (t - e["hour"]) / e["duration"]
            dens = e["peak_per_m2"] * np.sin(np.pi * min(max(phase, 0), 1)) ** 0.7
            for k, z in enumerate(e["zones"]):
                crowd[z] = max(crowd[z], dens * (1.0 if k == 0 else 0.55))
        elif e["type"] == "grid_fault" and on:
            forced[e["subs"]] = True
        elif e["type"] == "transit_fault" and on:
            transit = True
        elif e["type"] == "drain_block" and t >= e["hour"] and not known_only:
            block = (e["zones"], e["factor"])
    return plume, crowd, forced, transit, block


def run_world(city: CityModel, st: Statics, sc: Scenario, seed: int = 0) -> WorldRun:
    rng = np.random.default_rng(seed + 11)
    ens = Ensemble(st, 1, np.random.default_rng(seed + 12), truth=True, seed_key=seed)
    events = resolve_events(city, st, sc)
    sensors = _place_sensors(city, st)
    frames, observations = [], []
    total = sc.hours
    oid = 0

    def emit(**kw):
        nonlocal oid
        oid += 1
        observations.append(Obs(id=f"o{oid}", **kw))

    adv = {a["type"]: a for a in sc.adversarial}
    for t in range(total):
        plume, crowd, forced, transit, block = drivers_at(st, events, t)
        if block:
            ens.block[0, block[0]] = block[1]
        o = step(ens, t, np.array([sc.rain[t]]), np.array([sc.temp[t]]), plume=plume, crowd=crowd,
                 forced_down=forced, transit_fault=transit)
        frames.append({
            "t": t,
            "state": o["state"][0].astype(np.int8),
            "depth": o["depth"][0].astype(np.float32),
            "ems": o["ems"][0].astype(np.float32),
            "sub_up": o["sub_up"][0].copy(),
            "on_gen": o["on_gen"][0].copy(),
            "occ": o["occ"][0].astype(np.float32),
            "tower_up": o["tower_up"][0].copy(),
            "u_block": o["u_block"][0].copy(),
            "plume": plume, "crowd": crowd,
        })

        # --- rain gauges -------------------------------------------------------
        for g in sensors["gauges"]:
            val = float(o["rain"][0, g["zone"]]) * np.exp(rng.normal(0, 0.12)) + rng.normal(0, 0.3)
            if "gauge_stuck" in adv and g["name"] == adv["gauge_stuck"]["gauge"] and t >= adv["gauge_stuck"]["hour"]:
                val = 0.0
            emit(source=g["id"], kind="rain", target=g["id"], zone=g["zone"], valid=t, known=t, value=max(0.0, val),
                 meta={"name": g["name"]})
        # --- temperature ------------------------------------------------------------
        emit(source="IMD-TEMP", kind="temp", target="IMD-TEMP", zone=sensors["gauges"][0]["zone"], valid=t, known=t,
             value=float(sc.temp[t] + rng.normal(0, 0.3)))
        # --- water-level sensors (lose power with their zone) -----------------------
        for w in sensors["water"]:
            z = w["zone"]
            if not o["zone_power"][0, z] and rng.random() < 0.7:
                continue  # sensor offline: data degrades when it matters most
            if rng.random() < 0.06:
                continue
            d = float(o["depth"][0, z]) * w["factor"]
            val = max(0.0, d + rng.normal(0, 0.03 + 0.08 * d))
            if "sensor_spoof" in adv and w["id"] == sensors.get("spoof_target") and adv["sensor_spoof"]["hour"] <= t < adv["sensor_spoof"]["hour"] + 3:
                val = adv["sensor_spoof"]["value_m"] + rng.normal(0, 0.05)
            emit(source=w["id"], kind="water_level", target=w["id"], zone=z, valid=t, known=t, value=val,
                 meta={"name": w["name"], "factor": w["factor"]})
        # --- lake gauges -----------------------------------------------------------------
        for li, lk in enumerate(st.lakes):
            emit(source=f"LG-{li + 1}", kind="lake_level", target=lk.id, zone=lk.zone, valid=t, known=t,
                 value=float(o["lake"][0, li] + rng.normal(0, 15)), meta={"name": lk.name})
        # --- SCADA substations (delayed) ----------------------------------------------------
        for si, s in enumerate(st.subs):
            delay = 1 if rng.random() < 0.3 else 0
            emit(source="SCADA", kind="substation", target=s.id, zone=s.zone, valid=t, known=t + delay,
                 value=float(o["sub_up"][0, si]), meta={"cause": int(o["sub_cause"][0, si])})
        # --- traffic probes ----------------------------------------------------------------------
        for z in sensors["traffic"]:
            if rng.random() < 0.2:
                continue
            speed = 1.0 / float(o["mult"][0, z])
            emit(source=f"TP-{z}", kind="traffic", target=city.zones[z].id, zone=z, valid=t, known=t,
                 value=float(np.clip(speed + rng.normal(0, 0.06), 0.02, 1.2)))
        # --- hospital operations reports ----------------------------------------------------------
        for hi, h in enumerate(st.hosp):
            if t % 3 == hi % 3 and rng.random() < 0.85:
                emit(source=f"HOSP-{hi}", kind="hospital_power", target=h.id, zone=h.zone, valid=t, known=t + 1,
                     value=float(o["on_gen"][0, hi] or o["blackout"][0, hi]))
            if t % 4 == hi % 4 and rng.random() < 0.8:
                emit(source=f"HOSP-{hi}", kind="hospital_occ", target=h.id, zone=h.zone, valid=t, known=t + 1,
                     value=float(o["occ"][0, hi] * np.exp(rng.normal(0, 0.05))))
        # --- telecom operator feed -----------------------------------------------------------------
        drop = adv.get("feed_drop")
        if not (drop and drop["hour"] <= t < drop["hour"] + drop["duration"]):
            mains = o["grid_ok"][0, st.tower_cons]
            for ti, tw in enumerate(st.towers):
                if rng.random() < 0.9:
                    emit(source="TELCO", kind="tower", target=tw.id, zone=tw.zone, valid=t, known=t,
                         value=float(o["tower_up"][0, ti]))
                    emit(source="TELCO", kind="tower_mains", target=tw.id, zone=tw.zone, valid=t, known=t,
                         value=float(mains[ti]))
        for mi, m in enumerate(st.metro):
            if rng.random() < 0.8:
                emit(source="METRO-OPS", kind="metro_power", target=m.id, zone=m.zone, valid=t, known=t + 1,
                     value=float(o["grid_ok"][0, st.metro_cons[mi]]))
        for mi, m in enumerate(st.metro):
            if rng.random() < 0.8:
                emit(source="METRO-OPS", kind="metro_status", target=m.id, zone=m.zone, valid=t, known=t,
                     value=float(not o["metro_closed"][0, mi]))
        for pi, pm in enumerate(st.pumps):
            emit(source="PUMP-SCADA", kind="pump_power", target=pm.id, zone=pm.zone, valid=t, known=t,
                 value=float(o["grid_ok"][0, st.pump_cons[pi]]))
        # --- gas sensors ----------------------------------------------------------------------------
        if plume is not None:
            for g in sensors["gas"]:
                emit(source=g["id"], kind="gas", target=g["id"], zone=g["zone"], valid=t, known=t,
                     value=float(max(0.0, plume[g["zone"]] * np.exp(rng.normal(0, 0.15)))))
        # --- citizen reports ------------------------------------------------------------------------
        devices = sensors.setdefault("_devices", 5000)
        for z in np.nonzero((o["depth"][0] > 0.12) & (st.pop > 300))[0]:
            n = rng.poisson(min(8.0, st.pop[z] * 1.2e-4 * float(o["depth"][0, z])))
            for _ in range(n):
                zz = z if rng.random() > 0.2 else int(rng.choice(city.neighbors[z]))
                tmpl = TEXTS["flood"][rng.integers(len(TEXTS["flood"]))]
                emit(source="CITIZEN", kind="report", target=city.zones[zz].id, zone=zz, valid=t,
                     known=t, value=1.0, text=tmpl.format(loc=city.zones[zz].locality),
                     meta={"device": f"d{rng.integers(devices)}", "account_days": int(rng.integers(30, 2000)), "hazard": "flood"})
        if plume is not None:
            for z in np.nonzero((plume > 0.7) & (st.pop > 300))[0][:25]:
                for _ in range(rng.poisson(2.0)):
                    tmpl = TEXTS["gas"][rng.integers(len(TEXTS["gas"]))]
                    emit(source="CITIZEN", kind="report", target=city.zones[z].id, zone=int(z), valid=t, known=t, value=1.0,
                         text=tmpl.format(loc=city.zones[z].locality),
                         meta={"device": f"d{rng.integers(devices)}", "account_days": int(rng.integers(30, 2000)), "hazard": "gas"})
        if crowd is not None:
            for z in np.nonzero(crowd > 4.0)[0]:
                for _ in range(rng.poisson(2.5)):
                    tmpl = TEXTS["crowd"][rng.integers(len(TEXTS["crowd"]))]
                    emit(source="CITIZEN", kind="report", target=city.zones[z].id, zone=int(z), valid=t, known=t, value=1.0,
                         text=tmpl.format(loc=city.zones[z].locality),
                         meta={"device": f"d{rng.integers(devices)}", "account_days": int(rng.integers(30, 2000)), "hazard": "crowd"})
        if sc.temp[t] > 44 and t % 2 == 0:
            for z in rng.choice(np.nonzero(st.pop > 3000)[0], size=4, replace=False):
                tmpl = TEXTS["heat"][rng.integers(len(TEXTS["heat"]))]
                emit(source="CITIZEN", kind="report", target=city.zones[z].id, zone=int(z), valid=t, known=t, value=1.0,
                     text=tmpl.format(loc=city.zones[z].locality),
                     meta={"device": f"d{rng.integers(devices)}", "account_days": int(rng.integers(30, 2000)), "hazard": "heat"})
        fake = [a for a in sc.adversarial if a["type"] == "fake_reports" and a["hour"] == t]
        for a in fake:
            z0 = _find_zone(city, a["near"], 0)
            for k in range(a["count"]):
                zz = z0 if rng.random() > 0.3 else int(rng.choice(city.neighbors[z0]))
                emit(source="CITIZEN", kind="report", target=city.zones[zz].id, zone=zz, valid=t, known=t, value=1.0,
                     text=a["text"], meta={"device": f"bot{rng.integers(60)}", "account_days": int(rng.integers(0, 3)),
                                           "hazard": "flood", "planted": True})

    first = {k: v[0] for k, v in ens.first.items()}
    return WorldRun(scenario=sc, frames=frames, first=first, observations=observations, sensors=sensors, events=events)


def _place_sensors(city: CityModel, st: Statics) -> dict:
    gauges = []
    for i, name in enumerate(["Sonegaon", "Ambazari", "Itwari", "Pardi", "Hingna", "Koradi", "Mahal", "Dharampeth"]):
        z = _find_zone(city, name, (i * 53) % city.Z)
        gauges.append({"id": f"RG-{i + 1}", "name": name, "zone": z})
    # water-level sensors: deepest-ponding underpasses and river-adjacent lows
    water = []
    for k in np.argsort(-st.under_factor)[:7]:
        u = st.under[k]
        water.append({"id": f"WL-{len(water) + 1:02d}", "name": u.name, "zone": u.zone, "factor": float(st.under_factor[k])})
    lows = sorted([z for z in city.zones if z.river and z.pop > 2000], key=lambda z: z.hand)[:5]
    for z in lows:
        water.append({"id": f"WL-{len(water) + 1:02d}", "name": f"Nag river bank, {z.locality}", "zone": z.idx, "factor": 1.0})
    hill = max([z for z in city.zones if not z.lake and z.pop > 500], key=lambda z: z.hand)
    seminary = _find_zone(city, "Seminary", hill.idx)
    water.append({"id": f"WL-{len(water) + 1:02d}", "name": f"Storm drain, {city.zones[seminary].locality}", "zone": seminary, "factor": 1.0})
    traffic = [z.idx for z in city.zones if z.road_class in ("trunk", "primary", "motorway") and not z.lake][:90]
    gas = []
    rng = np.random.default_rng(5)
    for k in rng.choice(np.nonzero(st.pop > 2000)[0], size=10, replace=False):
        gas.append({"id": f"AQ-{len(gas) + 1:02d}", "zone": int(k)})
    return {"gauges": gauges, "water": water, "traffic": traffic, "gas": gas, "spoof_target": water[-1]["id"]}
