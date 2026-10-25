"""The forecaster: a particle filter over the city mechanics.

It sees only observation streams (with their arrival times), never the world's
parameters or dependency graph. Uncertain structure, such as which substation
really feeds a hospital, is carried *inside* the particles, so the posterior
over those assignments is the discovered dependency graph.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass

import numpy as np

from .city import CityModel
from .scenarios import Scenario, forecast_members
from .sim import CRITICAL, HIGH, WATCH, Ensemble, Overrides, Statics, plume_field, step
from .world import Obs, drivers_at

HORIZONS = [0, 1, 3, 6, 12, 24, 48, 72]
PRIOR_PICK = np.array([0.62, 0.25, 0.13])
SYSTEM_OF = {
    "lake_overflow": "water", "zone_flood": "water", "underpass_flooded": "mobility",
    "substation_down": "power", "pump_unpowered": "power", "tower_dead": "telecom",
    "metro_closed": "transit", "water_out": "utilities", "zone_ems": "ems", "zone_isolated": "ems",
    "hospital_generator": "health", "hospital_access": "health", "hospital_overload": "health",
    "hospital_blackout": "health",
}
WEIGHT = {
    "lake_overflow": 3.0, "zone_flood": 1.0, "underpass_flooded": 1.6, "substation_down": 3.0,
    "pump_unpowered": 2.6, "tower_dead": 1.2, "metro_closed": 1.0, "water_out": 2.0, "zone_ems": 1.2,
    "zone_isolated": 2.0, "hospital_generator": 2.4, "hospital_access": 3.0, "hospital_overload": 4.0,
    "hospital_blackout": 5.0,
}
LABEL = {
    "lake_overflow": "{name} overflows", "zone_flood": "Flooding above 0.3 m in {name}",
    "underpass_flooded": "{name} impassable", "substation_down": "{name} loses supply",
    "pump_unpowered": "{name} loses power", "tower_dead": "{name} battery exhausted",
    "metro_closed": "{name} metro station closed", "water_out": "{name} stops supplying water",
    "zone_ems": "Ambulance response over limit in {name}", "zone_isolated": "{name} cut off from ambulances",
    "hospital_generator": "{name} switches to generator", "hospital_access": "{name} loses staff access",
    "hospital_overload": "{name} over capacity", "hospital_blackout": "{name} runs out of backup power",
}


class ObsStore:
    def __init__(self, obs: list[Obs]):
        self.by_known: dict[int, list[Obs]] = defaultdict(list)
        for o in obs:
            self.by_known[o.known].append(o)
        self.all = obs

    def arrived(self, hour: int) -> list[Obs]:
        return self.by_known.get(hour, [])

    def upto(self, now: int) -> list[Obs]:
        return [o for o in self.all if o.known <= now]


def _student(y, mu, sigma, nu=3.0):
    z = (y - mu) / sigma
    return -(nu + 1) / 2 * np.log1p(z * z / nu)


def _bern(y, pred, eps=0.03):
    match = (pred > 0.5) == (y > 0.5)
    return np.log(np.where(match, 1 - eps, eps))


@dataclass
class Snapshot:
    ens: Ensemble
    trust: dict
    t: int


class Forecaster:
    def __init__(self, city: CityModel, st: Statics, sc: Scenario, observations: list[Obs],
                 public_events: list[dict], P: int = 160, seed: int = 3):
        self.city, self.st, self.sc = city, st, sc
        self.P = P
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        self.ens = Ensemble(st, P, self.rng)
        self.logw = np.zeros(P)
        self.store = ObsStore(observations)
        self.events = public_events  # crowd schedules, announced faults: things an operator would know
        self.t = 0
        self.trust: dict[str, list[float]] = defaultdict(lambda: [8.0, 1.0])
        self.trust_history: list[dict] = []
        self.clusters: list[dict] = []
        self.prev_out: dict | None = None
        self.last_out: dict | None = None
        self.snapshots: dict[int, Snapshot] = {}
        self.pick_history: list[tuple[int, np.ndarray]] = []
        self.gas_detected_at: int | None = None
        self.resamples = 0
        self.recent_rain: list[float] = []
        self.scada_last: dict[str, tuple[int, float, int]] = {}
        self.scada_hist: dict[str, dict[int, float]] = defaultdict(dict)
        # per-consumer Bayesian filter over which substation really feeds it
        self.dep_lp = np.tile(np.log(PRIOR_PICK), (len(st.consumers), 1))
        self.dep_evidence: dict[str, list[dict]] = defaultdict(list)
        self.discoveries: list[dict] = []

    # ------------------------------------------------------------------ helpers
    def tau(self, source: str) -> float:
        a, b = self.trust[source]
        return float(np.clip(a / (a + b), 0.05, 1.0))

    def _penalise(self, source: str, amount: float = 1.0):
        self.trust[source][1] += amount

    def _reward(self, source: str, amount: float = 1.0):
        self.trust[source][0] += amount

    # ------------------------------------------------------------ assimilation
    def assimilate_to(self, now: int) -> None:
        while self.t < now:
            self._hour(self.t)
            self.t += 1

    def _hour(self, t: int) -> None:
        st, P = self.st, self.P
        arrived = self.store.arrived(t)
        gauges = [o for o in arrived if o.kind == "rain" and o.valid == t]
        temps = [o for o in arrived if o.kind == "temp" and o.valid == t]

        # plausibility of gauges: a gauge at zero while most others see rain
        if gauges:
            vals = np.array([g.value for g in gauges])
            med = float(np.median(vals))
            for g in gauges:
                if g.value < 0.3 and med > 4.0:
                    self._penalise(g.source, 2.0)
            w = np.array([self.tau(g.source) for g in gauges])
            est = float(np.sum(w * vals) / w.sum()) if w.sum() > 0 else med
        else:
            est = 0.0
        rain_p = est * np.exp(self.rng.normal(0, 0.12, P))
        temp = temps[0].value if temps else float(self.sc.temp[min(t, len(self.sc.temp) - 1)])
        temp_p = np.full(P, temp)

        plume, crowd, _, _, _ = drivers_at(st, self.events, t, known_only=True)
        metro = [o for o in arrived if o.kind == "metro_status" and o.valid == t]
        transit = bool(metro) and sum(1 for o in metro if o.value < 0.5) / len(metro) > 0.5
        gas = [o for o in arrived if o.kind == "gas" and o.value > 0.4]
        gas_reports = {o.meta.get("device") for o in arrived if o.kind == "report" and o.meta.get("hazard") == "gas"
                       and o.meta.get("account_days", 0) >= 7}
        if (gas or len(gas_reports) >= 4) and self.gas_detected_at is None:
            self.gas_detected_at = t
        if self.gas_detected_at is None:
            plume = None  # the release is unknown until a sensor or report picks it up
        for o in arrived:
            if o.kind == "substation":
                self.scada_hist[o.target][o.valid] = o.value
                last = self.scada_last.get(o.target)
                if last is None or o.valid >= last[0]:
                    self.scada_last[o.target] = (o.valid, o.value, int(o.meta.get("cause", 0)))
        forced = np.zeros(len(st.subs), dtype=bool)
        for sid, (valid, value, cause) in self.scada_last.items():
            if value < 0.5 and cause in (3, 4) and t - valid <= 2:
                forced[st.sub_index[sid]] = True  # telemetry says the grid dropped it: insert directly

        out = step(self.ens, t, rain_p, temp_p, plume=plume, crowd=crowd, forced_down=forced, transit_fault=transit)
        self.prev_out, self.last_out = self.last_out, out
        self.recent_rain = (self.recent_rain + [est])[-3:]

        ll = np.zeros(P)
        # rain gauges inform the spatial rain field
        for g in gauges:
            mu = out["rain"][:, g.zone]
            ll += self.tau(g.source) * _student(g.value, mu, 0.8 + 0.25 * g.value) * 0.5
        for o in arrived:
            ref = out if o.valid == t else self.prev_out
            if ref is None:
                continue
            tau = self.tau(o.source)
            if o.kind == "water_level":
                mu = ref["depth"][:, o.zone] * o.meta.get("factor", 1.0)
                z = st.city.zones[o.zone]
                if o.value > 0.5 and z.hand > 6 and sum(self.recent_rain) < 15:
                    self._penalise(o.source, 3.0)  # deep water on a hilltop without rain
                    tau = self.tau(o.source)
                ll += tau * _student(o.value, mu, 0.06 + 0.12 * max(o.value, float(mu.mean())))
                self._score(o.source, o.value, mu, 0.06 + 0.12 * o.value)
            elif o.kind == "lake_level":
                li = next(i for i, a in enumerate(st.lakes) if a.id == o.target)
                ll += tau * _student(o.value, ref["lake"][:, li], 60.0) * 0.5
            elif o.kind == "substation":
                si = st.sub_index[o.target]
                ll += tau * _bern(o.value, ref["sub_up"][:, si].astype(float), 0.02)
            elif o.kind == "traffic":
                mu = 1.0 / ref["mult"][:, o.zone]
                ll += tau * _student(o.value, mu, 0.1) * 0.3
            elif o.kind in ("hospital_power", "tower_mains", "metro_power", "pump_power"):
                self._dependency(o, ref)
            elif o.kind == "hospital_occ":
                hi = next(i for i, a in enumerate(st.hosp) if a.id == o.target)
                ll += tau * _student(o.value, ref["occ"][:, hi], 0.08) * 0.5
            elif o.kind == "tower":
                ti = next(i for i, a in enumerate(st.towers) if a.id == o.target)
                ll += tau * _bern(o.value, ref["tower_up"][:, ti].astype(float), 0.03) * 0.5
        # citizen reports, clustered per zone and scored for credibility
        reports = [o for o in arrived if o.kind == "report"]
        if reports:
            ll += self._reports(t, reports, out)

        self.logw += ll
        self.logw -= self.logw.max()
        w = np.exp(self.logw)
        w /= w.sum()
        ess = 1.0 / np.sum(w * w)
        if ess < P * 0.5:
            self._resample(w)
        for k in self.trust:
            self.trust[k][0] = 1 + (self.trust[k][0] - 1) * 0.985
            self.trust[k][1] = 1 + (self.trust[k][1] - 1) * 0.985
        if t % 3 == 0:
            self.pick_history.append((t, self.pick_posterior()))
            self.trust_history.append({"t": t, **{k: round(self.tau(k), 3) for k in self.trust}})

    def _score(self, source, y, mu, sigma):
        m, s = float(mu.mean()), float(mu.std())
        z = abs(y - m) / math.sqrt(s * s + sigma * sigma)
        if z < 2.5:
            self._reward(source, 0.5)
        else:
            self._penalise(source, 2.5 if z > 4 else 1.0)

    def _dependency(self, o: Obs, ref: dict) -> None:
        """Update the feeder posterior of one consumer from its power status.
        Running on backup is evidence for whichever candidate substation was down."""
        st = self.st
        ci = st.cons_index.get(o.target)
        if ci is None:
            return
        on_backup = (o.value > 0.5) if o.kind == "hospital_power" else (o.value < 0.5)
        w = np.exp(self.logw - self.logw.max())
        w /= w.sum()
        up = np.array([(w * ref["sub_up"][:, st.cand[ci, k]]).sum() for k in range(3)])
        for k in range(3):
            # direct telemetry about the candidate beats the model's belief; during a
            # transition without telemetry for that exact hour the evidence is ambiguous
            hist = self.scada_hist.get(st.subs[st.cand[ci, k]].id, {})
            v = o.valid
            if v in hist:
                up[k] = hist[v]
            elif hist.get(v - 1) is not None and hist.get(v - 1) != hist.get(v + 1, hist.get(v - 1)):
                return
            elif hist.get(v - 1) is not None:
                up[k] = hist[v - 1]
        lik = (1 - up) if on_backup else up
        before = self.dep_post(ci)
        self.dep_lp[ci] += np.log(0.03 + 0.94 * lik)
        self.dep_lp[ci] -= self.dep_lp[ci].max()
        after = self.dep_post(ci)
        if np.abs(after - before).max() > 0.02:
            subs = [st.subs[st.cand[ci, k]] for k in range(3)]
            self.dep_evidence[o.target].append({
                "t": o.valid, "status": "on backup" if on_backup else "on grid",
                "supply_up": {subs[k].id: round(float(up[k]), 2) for k in range(3)},
                "posterior": {subs[k].id: round(float(after[k]), 3) for k in range(3)},
            })
            top = int(np.argmax(after))
            if after[top] > 0.85 and before[top] <= 0.85:
                self.discoveries.append({
                    "t": o.valid, "consumer": o.target, "consumer_name": st.consumers[ci].name,
                    "kind": st.consumers[ci].kind, "supplier": subs[top].id, "supplier_name": subs[top].name,
                    "confidence": round(float(after[top]), 3), "nearest": top == 0,
                })
            # keep the particles consistent with the updated belief
            self.ens.pick[:, ci] = self.rng.choice(3, size=self.P, p=after)

    def dep_post(self, ci: int) -> np.ndarray:
        p = np.exp(self.dep_lp[ci] - self.dep_lp[ci].max())
        return p / p.sum()

    def _reports(self, t, reports, out) -> np.ndarray:
        st = self.st
        by_zone = defaultdict(list)
        for r in reports:
            by_zone[r.zone].append(r)
        ll = np.zeros(self.P)
        for z, rs in by_zone.items():
            n = len(rs)
            devices = len({r.meta.get("device") for r in rs})
            new_frac = sum(1 for r in rs if r.meta.get("account_days", 999) < 7) / n
            dup_frac = 1 - len({r.text for r in rs}) / n
            hazard = rs[0].meta.get("hazard", "flood")
            zone = st.city.zones[z]
            prior_wet = float((out["depth"][:, z] > 0.1).mean())
            hand_pen = float(np.clip((zone.hand - 4) / 6, 0, 1)) if hazard == "flood" else 0.0
            score = 1.1 * math.log1p(devices) - 3.0 * new_frac - 2.5 * dup_frac - 2.2 * hand_pen + 1.6 * prior_wet - 1.0
            cred = 1 / (1 + math.exp(-score))
            coordinated = new_frac > 0.6 and dup_frac > 0.6
            if coordinated:
                cred = min(cred, 0.08)
            self.clusters.append({
                "t": t, "zone": zone.id, "locality": zone.locality, "n": n, "devices": devices,
                "new_accounts": round(new_frac, 2), "duplicate_text": round(dup_frac, 2),
                "hazard": hazard, "credibility": round(cred, 3), "coordinated": coordinated,
                "sample": rs[0].text, "planted": any(r.meta.get("planted") for r in rs),
            })
            if hazard == "flood":
                lik = cred / (1 + np.exp(-(out["depth"][:, z] - 0.1) / 0.04)) + (1 - cred) * 0.5
                ll += np.log(np.maximum(lik, 1e-6)) * 0.6
        return ll

    def _resample(self, w):
        P = self.P
        positions = (self.rng.random() + np.arange(P)) / P
        idx = np.searchsorted(np.cumsum(w), positions)
        idx = np.minimum(idx, P - 1)
        e = self.ens
        e.clone_rows(idx)
        e.drain_cap *= np.exp(self.rng.normal(0, 0.05, e.drain_cap.shape))
        e.conc *= np.exp(self.rng.normal(0, 0.03, e.conc.shape))
        e.plinth += self.rng.normal(0, 0.02, e.plinth.shape)
        post = self.pick_posterior()
        cum = np.cumsum(post, axis=1)
        u = self.rng.random((self.P, post.shape[0]))
        e.pick = (u[:, :, None] > cum[None, :, :]).sum(2).clip(0, 2)
        self.logw = np.zeros(P)
        self.resamples += 1

    def pick_posterior(self) -> np.ndarray:
        return np.stack([self.dep_post(i) for i in range(len(self.st.consumers))])

    def snapshot(self) -> Snapshot:
        return Snapshot(ens=self.ens.copy(), trust={k: list(v) for k, v in self.trust.items()}, t=self.t)

    # ------------------------------------------------------------------ forecast
    def equal_weight_copy(self) -> Ensemble:
        w = np.exp(self.logw - self.logw.max())
        w /= w.sum()
        P = self.P
        idx = np.minimum(np.searchsorted(np.cumsum(w), (0.5 + np.arange(P)) / P), P - 1)
        e = self.ens.copy()
        e.clone_rows(idx)
        return e

    def forecast(self, now: int, horizon: int = 72, ov: Overrides | None = None, base: Ensemble | None = None,
                 members_seed: int | None = None, fc_issue: int | None = None) -> "ForecastRun":
        st = self.st
        e = (base or self.equal_weight_copy()).copy()
        e.rng = np.random.default_rng(10_000 + now)  # common random numbers across what-ifs
        P = e.P
        mrng = np.random.default_rng(members_seed if members_seed is not None else 777 + (fc_issue if fc_issue is not None else now))
        M = 24
        rain_m, temp_m = forecast_members(self.sc, fc_issue if fc_issue is not None else now, horizon, M, mrng)
        member = np.arange(P) % M
        # known structural disruptions persist for their announced/typical duration
        cause = e.sub_cause
        known_down = ((cause == 3) | (cause == 4)).mean(0) > 0.5
        gas_src = None
        detected = self.gas_detected_at is not None and self.gas_detected_at <= now
        if detected:
            ev = next((x for x in self.events if x["type"] == "plume"), None)
            gas_src = ev
        states = []
        reach_watch = np.full((P, st.Z), np.inf)
        reach_high = np.full((P, st.Z), np.inf)
        reach_crit = np.full((P, st.Z), np.inf)
        person_hours = np.zeros(P)
        zone_ph = np.zeros(st.Z)
        city_counts = np.zeros((horizon, 4))
        city_counts_q = np.zeros((horizon, 3))
        pop_high = np.zeros(horizon)
        mult_mean = np.zeros(st.Z)
        ems_track = np.zeros((horizon, P))
        snaps = {}
        first_before = {k: v.copy() for k, v in e.first.items()}
        vul = st.vuln > 0.55
        for k in range(horizon):
            t = now + k
            plume, crowd, forced, transit, _ = drivers_at(st, self.events, t, known_only=True)
            if gas_src is not None and detected:
                on = gas_src["hour"] <= t < gas_src["hour"] + gas_src["duration"] + 3
                plume = gas_src["field"] * (1.0 if t < gas_src["hour"] + gas_src["duration"] else 0.3) if on else None
            elif any(x["type"] == "plume" for x in self.events):
                plume = None
            fdown = forced | (known_down if k < 6 else np.zeros_like(known_down))
            o = step(e, t, rain_m[member, k], temp_m[member, k], ov=ov, plume=plume, crowd=crowd,
                     forced_down=fdown, transit_fault=transit)
            s = o["state"]
            if k in HORIZONS:
                snaps[k] = s.copy()
            reach_watch[(s >= WATCH) & np.isinf(reach_watch)] = k
            reach_high[(s >= HIGH) & np.isinf(reach_high)] = k
            reach_crit[(s >= CRITICAL) & np.isinf(reach_crit)] = k
            hi = (s >= HIGH)
            person_hours += (hi * st.pop[None, :]).sum(1)
            zone_ph += (hi * st.pop[None, :]).mean(0)
            counts = np.stack([(s == c).sum(1) for c in range(4)], 1)
            city_counts[k] = counts.mean(0)
            hi_counts = counts[:, 2] + counts[:, 3]
            city_counts_q[k] = np.percentile(hi_counts, [10, 50, 90])
            pop_high[k] = (hi * st.pop[None, :]).sum(1).mean()
            mult_mean += o["mult"].mean(0) / horizon
            ems_track[k] = np.median(o["ems"][:, vul], axis=1) if vul.any() else 0
        run = ForecastRun(self, now, horizon, e, snaps, reach_high, reach_crit, person_hours, zone_ph,
                          city_counts, city_counts_q, pop_high, mult_mean, ems_track, first_before, rain_m, temp_m)
        run.reach_watch = reach_watch
        return run


class ForecastRun:
    def __init__(self, fc: Forecaster, now, horizon, ens, snaps, reach_high, reach_crit, person_hours, zone_ph,
                 city_counts, city_counts_q, pop_high, mult_mean, ems_track, first_before, rain_m, temp_m):
        self.fc, self.now, self.horizon, self.ens = fc, now, horizon, ens
        self.snaps, self.reach_high, self.reach_crit = snaps, reach_high, reach_crit
        self.person_hours, self.zone_ph = person_hours, zone_ph
        self.city_counts, self.city_counts_q, self.pop_high = city_counts, city_counts_q, pop_high
        self.mult_mean, self.ems_track, self.first_before = mult_mean, ems_track, first_before
        self.rain_m, self.temp_m = rain_m, temp_m

    # --------------------------------------------------------------- summaries
    def zone_states(self) -> dict:
        st = self.fc.st
        P = self.ens.P
        now_s = self.snaps[0]
        p_now_crit = (now_s >= CRITICAL).mean(0)
        p_crit = {h: (self.reach_crit < h + 1).mean(0) for h in (3, 24, 72)}
        p_high = {h: (self.reach_high < h + 1).mean(0) for h in (6, 24, 72)}
        state = np.zeros(st.Z, dtype=int)
        p_watch24 = (self.reach_watch < 25).mean(0)
        state[(p_high[72] >= 0.35) | (p_crit[72] >= 0.15) | (p_watch24 >= 0.6)] = WATCH
        state[(p_crit[24] >= 0.35) | (p_high[6] >= 0.5)] = HIGH
        state[(p_now_crit >= 0.5) | (p_crit[3] >= 0.5)] = CRITICAL
        state[st.lake] = 0
        horizons = {}
        for h, s in self.snaps.items():
            horizons[h] = [(s >= WATCH).mean(0), (s >= HIGH).mean(0), (s >= CRITICAL).mean(0)]
        ttc = np.full((st.Z, 3), np.nan)
        finite = np.isfinite(self.reach_crit)
        for z in np.nonzero(finite.mean(0) >= 0.1)[0]:
            vals = self.reach_crit[finite[:, z], z]
            ttc[z] = np.percentile(vals, [10, 50, 90])
        return {"state": state, "p_now_crit": p_now_crit, "p_crit": p_crit, "p_high": p_high,
                "horizons": horizons, "ttc": ttc}

    def events(self, min_p: float = 0.12) -> list[dict]:
        fc, st, city = self.fc, self.fc.st, self.fc.city
        now, H = self.now, self.horizon
        post = fc.pick_posterior()
        asset_lists = {
            "lake_overflow": st.lakes, "underpass_flooded": st.under, "substation_down": st.subs,
            "pump_unpowered": st.pumps, "tower_dead": st.towers, "metro_closed": st.metro,
            "water_out": st.water, "hospital_generator": st.hosp, "hospital_access": st.hosp,
            "hospital_overload": st.hosp, "hospital_blackout": st.hosp,
        }
        out = []
        for kind, arr in self.ens.first.items():
            if kind in asset_lists:
                items = asset_lists[kind]
            elif kind.startswith("zone_"):
                items = None
            else:
                continue
            within = arr < now + H
            occurred = arr < now
            p = within.mean(0)
            cand = np.nonzero(p >= min_p)[0]
            if items is None:
                popw = st.pop[cand]
                cand = cand[np.argsort(-(p[cand] * popw))][:18]
            for i in cand:
                col = arr[:, i]
                fut = col[(col >= now) & (col < now + H)] - now
                q = np.percentile(fut, [10, 50, 90]).tolist() if len(fut) >= 3 else [None, None, None]
                if items is None:
                    zone = city.zones[i]
                    name, lat, lon, aid, zidx = zone.locality, zone.lat, zone.lon, zone.id, i
                    weight = WEIGHT[kind] * (1 + min(3.0, zone.pop / 15000))
                else:
                    a = items[i]
                    name, lat, lon, aid, zidx = a.name, a.lat, a.lon, a.id, a.zone
                    weight = WEIGHT[kind]
                out.append({
                    "id": f"{kind}:{aid}", "kind": kind, "system": SYSTEM_OF[kind], "asset": aid,
                    "zone": city.zones[zidx].id, "zone_idx": int(zidx), "name": name,
                    "label": LABEL[kind].format(name=name), "lat": lat, "lon": lon,
                    "p": round(float(p[i]), 3), "p_occurred": round(float(occurred[:, i].mean()), 3),
                    "t10": q[0], "t50": q[1], "t90": q[2], "weight": round(weight, 2),
                    "score": round(float(p[i]) * weight, 3), "_col": col, "_i": int(i),
                })
        out.extend(self._roots())
        out.sort(key=lambda e: -e["score"])
        return out

    def _roots(self) -> list[dict]:
        fc, st, city = self.fc, self.fc.st, self.fc.city
        now = self.now
        roots = []

        def root(kind, label, col, lat, lon, zone_idx, system="hazard"):
            fin = col[np.isfinite(col)]
            p = float(np.isfinite(col).mean())
            if p < 0.12:
                return
            q = np.percentile(fin, [10, 50, 90]).tolist() if len(fin) >= 3 else [None, None, None]
            roots.append({
                "id": f"{kind}:city", "kind": kind, "system": "hazard", "asset": None,
                "zone": city.zones[zone_idx].id, "zone_idx": int(zone_idx), "name": city.name,
                "label": label, "lat": lat, "lon": lon, "p": round(p, 3), "p_occurred": 0.0,
                "t10": q[0], "t50": q[1], "t90": q[2], "weight": 1.0, "score": round(p, 3),
                "_col": np.where(np.isfinite(col), col + now, np.inf), "_i": -1,
            })

        P = self.ens.P
        M = self.rain_m.shape[0]
        member = np.arange(P) % M
        r = self.rain_m[member]
        heavy = np.where((r > 20).any(1), np.argmax(r > 20, axis=1).astype(float), np.inf)
        root("hazard_rain", "Extreme rain over the city (>20 mm/h)", heavy, city.lat, city.lon,
             int(np.argmin((st.lat - city.lat) ** 2 + (st.lon - city.lon) ** 2)))
        tm = self.temp_m[member]
        hot = np.where((tm > 44).any(1), np.argmax(tm > 44, axis=1).astype(float), np.inf)
        root("hazard_heat", "Extreme heat (>44 C)", hot, city.lat, city.lon,
             int(np.argmin((st.lat - city.lat) ** 2 + (st.lon - city.lon) ** 2)))
        for ev in fc.events:
            if ev["type"] == "crowd" and ev["hour"] + ev["duration"] > now:
                z = ev["zones"][0]
                root("hazard_crowd", ev["label"], np.full(P, max(0, ev["hour"] - now), dtype=float),
                     float(st.lat[z]), float(st.lon[z]), z)
            if ev["type"] == "plume" and fc.gas_detected_at is not None and ev["hour"] + ev["duration"] > now - 3:
                z = ev["source_zone"]
                root("hazard_plume", ev["label"], np.full(P, max(0, ev["hour"] - now), dtype=float),
                     float(st.lat[z]), float(st.lon[z]), z)
            if ev["type"] == "grid_fault" and ev["hour"] <= now < ev["hour"] + ev["duration"]:
                z = st.subs[ev["subs"][0]].zone
                root("hazard_grid", ev["label"], np.full(P, 0.0), float(st.lat[z]), float(st.lon[z]), z)
        return roots

    def links(self, events: list[dict]) -> list[dict]:
        """Mechanistic links between predicted events, scored empirically on the
        ensemble: how much more likely B is when A happens, and the typical lag."""
        st, fc = self.fc.st, self.fc
        post = fc.pick_posterior()
        cons = {a.id: i for i, a in enumerate(st.consumers)}
        sub_idx_by_id = st.sub_index
        lake_down = {st.lakes[i].id: set(p) for i, p in enumerate(st.lake_down)}
        zone_of = {e["id"]: e["zone_idx"] for e in events}
        links = []

        def supplier_ids(asset_id):
            ci = cons.get(asset_id)
            if ci is None:
                return []
            return [(st.subs[st.cand[ci, k]].id, float(post[ci, k])) for k in range(3) if post[ci, k] > 0.15]

        for a in events:
            for b in events:
                if a is b:
                    continue
                rule, why = None, ""
                ka, kb = a["kind"], b["kind"]
                za, zb = a["zone_idx"], b["zone_idx"]
                near = zb == za or zb in st.city.neighbors[za]
                if ka == "hazard_rain" and kb in ("lake_overflow", "zone_flood", "underpass_flooded"):
                    rule, why = "physical", "Rainfall exceeds drain and lake capacity"
                elif ka == "hazard_heat" and kb in ("substation_down", "water_out", "hospital_overload"):
                    rule, why = "physical", "Cooling demand overloads feeders; heat illness rises"
                elif ka == "hazard_grid" and kb in ("substation_down", "tower_dead", "hospital_generator", "pump_unpowered", "metro_closed", "water_out"):
                    rule, why = "physical", "Upstream grid fault"
                elif ka == "hazard_plume" and kb in ("zone_ems", "hospital_overload", "zone_isolated"):
                    rule, why = "physical", "Plume closes roads and sends exposed people to hospital"
                elif ka == "hazard_crowd" and kb in ("zone_ems", "zone_isolated", "hospital_overload"):
                    rule, why = "physical", "Crowds block access routes"
                elif ka == "lake_overflow" and kb == "zone_flood" and (zb in lake_down.get(a["asset"], set()) or near):
                    rule, why = "physical", "Overflow runs down the outfall channel into this zone"
                elif ka == "zone_flood" and kb in ("underpass_flooded", "substation_down", "metro_closed") and near:
                    rule, why = "physical", "Same low-lying ground; water reaches the asset"
                elif ka == "zone_flood" and kb == "zone_flood" and st.city.zones[za].flow_to == zb:
                    rule, why = "physical", "Downhill flow path"
                elif ka == "substation_down" and kb in ("hospital_generator", "pump_unpowered", "tower_dead", "metro_closed", "water_out"):
                    sup = dict(supplier_ids(b["asset"]))
                    if a["asset"] in sup:
                        rule = "learned" if st.city.power_candidates[b["asset"]][0] != a["asset"] else "physical"
                        why = f"Feeder dependency (posterior {sup[a['asset']]:.0%})"
                elif ka == "pump_unpowered" and kb == "zone_flood" and near:
                    rule, why = "feedback", "Pump stops, water rises further: feedback loop"
                elif ka in ("underpass_flooded", "zone_flood") and kb == "zone_ems" and st.p1[zb, za] > 0:
                    rule, why = "physical", "Blocks the primary ambulance route into the zone"
                elif ka == "tower_dead" and kb == "zone_ems" and (st.zone_tower[zb, 0] == next((i for i, t in enumerate(st.towers) if t.id == a["asset"]), -1)):
                    rule, why = "physical", "Calls cannot reach dispatch; response delayed"
                elif ka in ("underpass_flooded", "zone_flood") and kb == "hospital_access":
                    hi = next(i for i, h in enumerate(st.hosp) if h.id == b["asset"])
                    if st.access[hi, za] > 0:
                        rule, why = "physical", "On the staff commute route at shift change"
                elif ka == "hospital_access" and kb == "hospital_overload" and a["asset"] == b["asset"]:
                    rule, why = "physical", "Fewer staff on shift lowers usable capacity"
                elif ka == "hospital_generator" and kb == "hospital_blackout" and a["asset"] == b["asset"]:
                    rule, why = "physical", "Diesel runs out before grid supply returns"
                elif ka in ("hospital_overload", "hospital_blackout") and kb == "hospital_overload" and a["asset"] != b["asset"]:
                    ha = next(i for i, h in enumerate(st.hosp) if h.id == a["asset"])
                    hb = next(i for i, h in enumerate(st.hosp) if h.id == b["asset"])
                    if np.any((st.zone_hosp1 == ha) & (st.zone_hosp2 == hb)):
                        rule, why = "physical", "Ambulances divert to the next nearest hospital"
                elif ka == "metro_closed" and kb == "zone_ems" and near:
                    rule, why = "interaction", "Riders shift onto roads; congestion slows ambulances"
                if not rule:
                    continue
                ca, cb = a["_col"], b["_col"]
                hap_a = np.isfinite(ca)
                if hap_a.sum() < 3:
                    continue
                pba = float(np.mean(np.isfinite(cb[hap_a]) & (cb[hap_a] >= ca[hap_a])))
                pb = float(np.isfinite(cb).mean())
                lag = cb[hap_a] - ca[hap_a]
                lag = lag[np.isfinite(lag) & (lag >= 0)]
                if pba < 0.2:
                    continue
                links.append({
                    "from": a["id"], "to": b["id"], "rule": rule, "why": why,
                    "p_given": round(pba, 3), "lift": round(pba / max(pb, 1e-3), 2),
                    "lag_h": round(float(np.median(lag)), 1) if len(lag) else None,
                })
        return links

    def course(self, events, links, max_controls: int = 9) -> list[str]:
        """Most consequential plausible chain: longest weighted path through the
        event DAG, ordered by median time."""
        if not events:
            return []
        evs = {e["id"]: e for e in events}
        t50 = {k: (e["t50"] if e["t50"] is not None else (-1 if e["p_occurred"] > 0.5 else 999)) for k, e in evs.items()}
        out_edges = defaultdict(list)
        for l in links:
            if t50[l["from"]] <= t50[l["to"]]:
                out_edges[l["from"]].append(l)
        order = sorted(evs, key=lambda k: t50[k])
        roots = [k for k in order if evs[k]["kind"].startswith("hazard_")]
        best = {k: (evs[k]["score"] + (5.0 if k in roots else 0.0), [k]) for k in order}
        for k in order:
            sc, path = best[k]
            kinds = [evs[x]["kind"] for x in path]
            for l in out_edges[k]:
                nk = evs[l["to"]]["kind"]
                gain = evs[l["to"]]["score"] * (0.5 + l["p_given"])
                gain *= 0.25 if kinds.count(nk) >= 1 else 1.0
                gain *= 0.5 if l["rule"] == "physical" and nk == evs[k]["kind"] else 1.0
                cand = sc + gain
                if cand > best[l["to"]][0] and len(path) < max_controls:
                    best[l["to"]] = (cand, path + [l["to"]])
        pool = [v for k, v in best.items() if v[1][0] in roots] or list(best.values())
        return max(pool, key=lambda x: x[0])[1]

    def branches(self, top: int = 6) -> list[dict]:
        P = self.ens.P
        now, H = self.now, self.horizon
        seqs = defaultdict(int)
        sys_first = defaultdict(lambda: np.full(P, np.inf))
        for kind, arr in self.ens.first.items():
            sysname = SYSTEM_OF.get(kind)
            if not sysname:
                continue
            col = np.where((arr >= now) & (arr < now + H), arr, np.inf).min(axis=1)
            sys_first[sysname] = np.minimum(sys_first[sysname], col)
        names = list(sys_first)
        mat = np.stack([sys_first[n] for n in names], 1) if names else np.zeros((P, 0))
        for p in range(P):
            row = mat[p]
            idx = [i for i in np.argsort(row) if np.isfinite(row[i])][:5]
            seqs[tuple(names[i] for i in idx)] += 1
        ranked = sorted(seqs.items(), key=lambda kv: -kv[1])[:top]
        return [{"sequence": list(k), "p": round(v / P, 3)} for k, v in ranked]

    def cascade_r(self) -> list[float]:
        P = self.ens.P
        now, H = self.now, self.horizon
        direct = {"lake_overflow", "zone_flood", "underpass_flooded"}
        all_c = np.zeros(H + 6)
        sec_c = np.zeros(H + 6)
        for kind, arr in self.ens.first.items():
            a = arr[np.isfinite(arr)]
            rel = (a - now + 3).astype(int)
            rel = rel[(rel >= 0) & (rel < H + 6)]
            np.add.at(all_c, rel, 1)
            if kind not in direct:
                np.add.at(sec_c, rel, 1)
        all_c /= P
        sec_c /= P
        r = []
        for k in range(H):
            prev = all_c[k : k + 3].sum()
            nxt = sec_c[k + 3 : k + 6].sum()
            # propagated failures in the next 3 h per failure in the last 3 h (one pseudo-failure prior)
            r.append(round(float(np.clip(nxt / (prev + 1.0), 0, 3)), 2))
        return r

    def city_state(self, zs: dict, r_now: float) -> int:
        st = self.fc.st
        pop = st.pop.sum()
        share_crit = st.pop[zs["state"] >= CRITICAL].sum() / pop
        share_high = st.pop[zs["state"] >= HIGH].sum() / pop
        share_watch = st.pop[zs["state"] >= WATCH].sum() / pop
        if share_crit >= 0.03 or (r_now >= 1.0 and share_high >= 0.05):
            return CRITICAL
        if share_high >= 0.04 or r_now >= 1.0:
            return HIGH
        if share_watch >= 0.03:
            return WATCH
        return 0
