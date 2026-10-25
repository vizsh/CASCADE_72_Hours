"""Sessions: one per scenario. A background thread walks the scenario hour by
hour, assimilating observations and issuing a 72-hour forecast each hour, and
keeps the payloads the website reads."""

from __future__ import annotations

import threading
import time
from collections import OrderedDict, defaultdict

import numpy as np

from . import scenarios
from .city import load_city
from .interventions import Action, candidates, deadline, evaluate, optimize
from .predictor import Forecaster
from .sim import STATE_NAMES, Ensemble, Statics
from .world import run_world

BIG = ("drain_cap", "conc", "rain_field", "block", "S", "wet")


def _r(x, n=3):
    return None if x is None or (isinstance(x, float) and not np.isfinite(x)) else round(float(x), n)


def _arr(a, n=2):
    return [round(float(v), n) for v in a]


class Session:
    def __init__(self, sid: str, P: int = 128, use_baked: bool = True):
        self.sid = sid
        self.sc = scenarios.get(sid)
        self.city = load_city(self.sc.city)
        self.st = Statics(self.city)
        self.world = run_world(self.city, self.st, self.sc)
        known = [e for e in self.world.events if e["type"] in ("crowd", "plume")]
        self.fc = Forecaster(self.city, self.st, self.sc, self.world.observations, known, P=P)
        self.payloads: dict[int, dict] = {}
        self.snaps: dict[int, dict] = {}
        self.runs: OrderedDict[tuple, object] = OrderedDict()
        self.cv = threading.Condition()
        self.started = time.time()
        self.error: str | None = None
        self.opt_cache: dict[int, dict] = {}
        self.fc_lock = threading.Lock()
        self.validation: dict | None = None
        if use_baked:
            self._load_baked()
        threading.Thread(target=self._walk, daemon=True).start()

    def _load_baked(self):
        """Serve precomputed issuances immediately; the walker still runs to
        rebuild ensemble snapshots for what-if questions."""
        import gzip
        import json
        from pathlib import Path

        d = Path(__file__).resolve().parent.parent / "data" / "baked" / self.sid
        if not d.exists():
            return
        for f in d.glob("*.json.gz"):
            with gzip.open(f, "rt", encoding="utf-8") as fh:
                data = json.load(fh)
            if f.name.startswith("validation"):
                self.validation = data
            else:
                self.payloads[int(f.name.split(".")[0])] = data

    # ---------------------------------------------------------------- walking
    def _walk(self):
        try:
            order = list(range(self.sc.hours))
            for h in order:
                baked = h in self.payloads
                with self.fc_lock:
                    self.fc.assimilate_to(h)
                    ens = self.fc.equal_weight_copy()
                    # a baked issuance only needs its ensemble snapshot for what-ifs
                    run = None if baked else self.fc.forecast(h, base=ens)
                    payload = None if baked else self._payload(h, run)
                with self.cv:
                    self.snaps[h] = self._pack(ens)
                    if payload is not None:
                        self.payloads[h] = payload
                        self._remember(("base", h, 72), run)
                    self.cv.notify_all()
                time.sleep(0.02)  # yield the interpreter to API requests
        except Exception as err:  # surface engine failures to the API
            import traceback
            self.error = traceback.format_exc()
            with self.cv:
                self.cv.notify_all()
            raise err

    def _pack(self, ens: Ensemble) -> dict:
        d = {k: (v.astype(np.float32) if k in BIG else v.copy()) for k, v in ens.__dict__.items() if isinstance(v, np.ndarray)}
        d["_first"] = {k: v.copy() for k, v in ens.first.items()}
        d["_t"] = ens.t
        return d

    def wait_snap(self, h: int, timeout: float = 600) -> None:
        h = min(h, self.sc.hours - 1)
        with self.cv:
            self.cv.wait_for(lambda: h in self.snaps or self.error is not None, timeout=timeout)
        if self.error:
            raise RuntimeError(self.error)

    def base_ens(self, h: int) -> Ensemble:
        self.wait_snap(h)
        d = self.snaps[h]
        e = Ensemble.__new__(Ensemble)
        e.st, e.P, e.truth = self.st, self.fc.P, False
        e.rng = np.random.default_rng(h)
        for k, v in d.items():
            if k.startswith("_"):
                continue
            setattr(e, k, v.astype(np.float64) if k in BIG else v.copy())
        e.first = {k: v.copy() for k, v in d["_first"].items()}
        e.t = d["_t"]
        return e

    def forecaster_at(self, h: int) -> Forecaster:
        return self.fc  # forecast() only reads statics/events; the ensemble comes from base_ens

    def _remember(self, key, run):
        self.runs[key] = run
        while len(self.runs) > 6:
            self.runs.popitem(last=False)

    def baseline_run(self, h: int, horizon: int):
        key = ("base", h, horizon)
        if key not in self.runs:
            self._remember(key, self.fc.forecast(h, horizon, base=self.base_ens(h)))
        return self.runs[key]

    def wait(self, h: int, timeout: float = 120) -> bool:
        h = min(h, self.sc.hours - 1)
        with self.cv:
            ok = self.cv.wait_for(lambda: h in self.payloads or self.error is not None, timeout=timeout)
        if self.error:
            raise RuntimeError(self.error)
        return ok

    def payload(self, h: int) -> dict:
        self.wait(h)
        return self.payloads[min(h, self.sc.hours - 1)]

    def status(self) -> dict:
        return {"id": self.sid, "ready_hours": len(self.payloads), "whatif_ready_hours": len(self.snaps),
                "hours": self.sc.hours,
                "elapsed_s": round(time.time() - self.started, 1), "error": self.error}

    # ---------------------------------------------------------------- payload
    def _payload(self, h: int, run) -> dict:
        st, city, fc, sc = self.st, self.city, self.fc, self.sc
        zs = run.zone_states()
        r = run.cascade_r()
        ev = run.events()
        ln = run.links(ev)
        course = run.course(ev, ln)
        city_state = run.city_state(zs, r[0])
        for e in ev:
            col = e["_col"]
            e["p24"] = round(float(((col >= h) & (col < h + 24)).mean()), 3)
            e["p6"] = round(float(((col >= h) & (col < h + 6)).mean()), 3)
        top = ev[:80] + [e for e in ev[80:] if e["id"] in set(course)]
        ev_out = [{k: v for k, v in e.items() if not k.startswith("_")} | {"_i": e["_i"]} for e in top]
        keep = {e["id"] for e in ev_out}
        ln = [l for l in ln if l["from"] in keep and l["to"] in keep]
        post = fc.pick_posterior()
        deps = []
        for i, a in enumerate(st.consumers):
            p = post[i]
            if np.abs(p - np.array([0.62, 0.25, 0.13])).max() > 0.05:
                deps.append({
                    "consumer": a.id, "name": a.name, "kind": a.kind,
                    "candidates": [st.subs[st.cand[i, k]].id for k in range(3)],
                    "posterior": _arr(p, 3), "evidence": fc.dep_evidence.get(a.id, [])[-4:],
                })
        frame = self.world.frames[h] if h < len(self.world.frames) else None
        M = run.rain_m.shape[0]
        rain_q = np.percentile(run.rain_m, [10, 50, 90], axis=0)
        temp_q = np.percentile(run.temp_m, [10, 50, 90], axis=0)
        obs_upto = [o for o in fc.store.all if o.known <= h and o.valid >= h - 24]
        gauge_hist = defaultdict(list)
        for o in obs_upto:
            if o.kind in ("rain", "water_level", "lake_level", "temp"):
                gauge_hist[o.source].append([o.valid, round(o.value, 3)])
        sensors = []
        for sid, series in gauge_hist.items():
            series.sort()
            o = next(x for x in reversed(obs_upto) if x.source == sid)
            sensors.append({"id": sid, "kind": o.kind, "name": o.meta.get("name", sid),
                            "zone": city.zones[o.zone].id, "series": series[-24:],
                            "trust": round(fc.tau(sid), 3), "last_known": o.known})
        alarms = []
        for o in reversed(obs_upto):
            if len(alarms) >= 60:
                break
            if (o.kind == "substation" and o.value < 0.5) or (o.kind == "tower_mains" and o.value < 0.5) or \
               (o.kind == "hospital_power" and o.value > 0.5) or (o.kind == "metro_status" and o.value < 0.5) or \
               (o.kind == "pump_power" and o.value < 0.5):
                alarms.append(o.public(city))
        withheld = sum(1 for o in fc.store.all if o.valid <= h < o.known)
        payload = {
            "scenario": sc.id, "now": h, "time": sc.time_at(h), "city_state": int(city_state),
            "city_state_name": STATE_NAMES[city_state], "cascade_r": r,
            "series": {
                "hi_q": [_arr(x, 1) for x in run.city_counts_q], "counts": [_arr(x, 1) for x in run.city_counts],
                "pop_high": _arr(run.pop_high, 0),
            },
            "zones": {
                "state": [int(x) for x in zs["state"]],
                "p_now_crit": _arr(zs["p_now_crit"]),
                "p_crit3": _arr(zs["p_crit"][3]), "p_crit24": _arr(zs["p_crit"][24]), "p_crit72": _arr(zs["p_crit"][72]),
                "p_high6": _arr(zs["p_high"][6]), "p_high24": _arr(zs["p_high"][24]), "p_high72": _arr(zs["p_high"][72]),
                "horizons": {str(k): [_arr(v[0]), _arr(v[1]), _arr(v[2])] for k, v in zs["horizons"].items()},
                "ttc": {city.zones[i].id: _arr(zs["ttc"][i], 1) for i in range(st.Z) if not np.isnan(zs["ttc"][i, 0])},
                "person_hours": _arr(run.zone_ph, 0),
            },
            "events": ev_out, "links": ln, "course": course, "branches": run.branches(),
            "dependencies": deps, "discoveries": fc.discoveries,
            "trust": {k: round(fc.tau(k), 3) for k in fc.trust},
            "clusters": [c for c in fc.clusters if c["t"] >= h - 12][-40:],
            "weather": {"rain_q": [_arr(x, 1) for x in rain_q], "temp_q": [_arr(x, 1) for x in temp_q], "members": M},
            "sensors": sensors, "alarms": alarms,
            "fence": {"observations_used": sum(1 for o in fc.store.all if o.known <= h),
                      "withheld_not_yet_arrived": withheld, "future_reads": 0},
            "truth": None if frame is None else {
                "state": [int(x) for x in frame["state"]],
                "depth": _arr(frame["depth"], 2),
            },
        }
        return payload

    # ---------------------------------------------------------- what-ifs
    def action_list(self, h: int) -> list[Action]:
        return candidates(self, h, self.payload(h))

    def find_actions(self, h: int, ids: list[str]) -> list[Action]:
        pool = {a.id: a for a in self.action_list(h)}
        return [pool[i] for i in ids if i in pool]

    def evaluate(self, h: int, ids: list[str], starts: dict[str, float] | None = None) -> dict:
        acts = self.find_actions(h, ids)
        for a in acts:
            if starts and a.id in starts:
                a.start = float(starts[a.id])
        return evaluate(self, h, acts)

    def optimize(self, h: int) -> dict:
        if h not in self.opt_cache:
            self.opt_cache[h] = optimize(self, h)
        return self.opt_cache[h]

    def deadline(self, h: int, aid: str) -> dict:
        acts = self.find_actions(h, [aid])
        if not acts:
            return {"error": "unknown action"}
        return deadline(self, h, acts[0])


SESSIONS: dict[str, Session] = {}
_lock = threading.Lock()


def get_session(sid: str) -> Session:
    with _lock:
        if sid not in SESSIONS:
            SESSIONS[sid] = Session(sid)
        return SESSIONS[sid]
