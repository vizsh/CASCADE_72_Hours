"""Constrained counterfactual interventions.

Every action is a do()-style edit of the mechanics (Overrides). Options are
compared on the *same* simulated futures (same particles, same weather
members, same random draws) so differences come from the action, not noise.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .sim import CRITICAL, Overrides

RESOURCES = {
    "pumps": {"label": "Mobile dewatering pumps", "total": 6},
    "crews": {"label": "Drain-clearing crews", "total": 3},
    "sandbags": {"label": "Flood-barrier teams", "total": 2},
    "generators": {"label": "Mobile generators", "total": 4},
    "diesel": {"label": "Diesel tankers", "total": 3},
    "ambulances": {"label": "Ambulances to stage", "total": 12},
    "buses": {"label": "Evacuation buses", "total": 20},
    "police": {"label": "Traffic police units", "total": 6},
}


@dataclass
class Action:
    id: str
    kind: str
    label: str
    target: str
    target_name: str
    resource: str
    units: int
    start: float  # hours from now
    why: str

    def public(self) -> dict:
        return dict(self.__dict__)


def to_overrides(actions: list[Action], now: int, st) -> Overrides:
    ov = Overrides()
    for a in actions:
        t0 = now + a.start
        if a.kind == "pumps":
            ov.pumps[int(a.target)] = (9.0 * a.units, t0)
        elif a.kind == "clear_drain":
            ov.clear_drain[int(a.target)] = t0
        elif a.kind == "protect_sub":
            ov.protect_sub[st.sub_index[a.target]] = t0
        elif a.kind == "shutdown_sub":
            ov.shutdown_sub[st.sub_index[a.target]] = (t0, t0 + 6)
        elif a.kind == "generator":
            ov.generator[a.target] = t0
        elif a.kind == "diesel":
            ov.diesel[next(i for i, h in enumerate(st.hosp) if h.id == a.target)] = t0
        elif a.kind == "ambulances":
            ov.ambulances[int(a.target)] = (a.units, t0)
        elif a.kind == "close_underpass":
            ov.close_underpass[next(i for i, u in enumerate(st.under) if u.id == a.target)] = t0
        elif a.kind == "evacuate":
            ov.evacuate[int(a.target)] = t0
        elif a.kind == "surge":
            ov.surge[next(i for i, h in enumerate(st.hosp) if h.id == a.target)] = t0
        elif a.kind == "advisory":
            ov.advisory = t0
    return ov


def candidates(session, now: int, payload: dict) -> list[Action]:
    st, city = session.st, session.city
    ev = payload["events"]
    acts: list[Action] = []

    def top(kind, n, min_p=0.15):
        return [e for e in ev if e["kind"] == kind and e["p"] >= min_p][:n]

    flood_zones = top("zone_flood", 4, 0.2)
    for e in flood_zones[:3]:
        z = e["zone_idx"]
        acts.append(Action(f"pumps:{z}", "pumps", f"Deploy 2 mobile pumps to {e['name']}", str(z), e["name"],
                           "pumps", 2, 0, f"{e['p']:.0%} chance of >0.3 m flooding; adds ~18 mm/h drainage"))
    for e in flood_zones[:2]:
        z = e["zone_idx"]
        acts.append(Action(f"clear:{z}", "clear_drain", f"Clear blocked drains in {e['name']}", str(z), e["name"],
                           "crews", 1, 0, "Restores nominal capacity where debris has reduced it"))
    for e in top("substation_down", 2, 0.12):
        acts.append(Action(f"protect:{e['asset']}", "protect_sub", f"Flood barrier around {e['name']}", e["asset"],
                           e["name"], "sandbags", 1, 0, f"{e['p']:.0%} chance it loses supply; raises effective plinth by 0.6 m"))
    hosp_risk = sorted([e for e in ev if e["kind"] in ("hospital_generator", "hospital_blackout") and e["p"] >= 0.12],
                       key=lambda e: -e["score"])
    seen = set()
    for e in hosp_risk:
        if e["asset"] in seen or len(seen) >= 2:
            continue
        seen.add(e["asset"])
        acts.append(Action(f"gen:{e['asset']}", "generator", f"Stage a mobile generator at {e['name']}", e["asset"],
                           e["name"], "generators", 1, 0, "Keeps the hospital on full power if its feeder drops"))
        acts.append(Action(f"diesel:{e['asset']}", "diesel", f"Top up diesel at {e['name']}", e["asset"], e["name"],
                           "diesel", 1, 0, "Extends on-site backup by 24 h, if the tanker can still get through"))
    for e in top("pump_unpowered", 1, 0.15):
        acts.append(Action(f"gen:{e['asset']}", "generator", f"Generator for {e['name']}", e["asset"], e["name"],
                           "generators", 1, 0, "Breaks the power-loss to flooding feedback loop"))
    for e in top("zone_ems", 2, 0.3):
        z = e["zone_idx"]
        acts.append(Action(f"amb:{z}", "ambulances", f"Stage 4 ambulances in {e['name']}", str(z), e["name"],
                           "ambulances", 4, 0, f"{e['p']:.0%} chance response exceeds limits here"))
    for e in top("underpass_flooded", 2, 0.25):
        acts.append(Action(f"close:{e['asset']}", "close_underpass", f"Close {e['name']} before it floods", e["asset"],
                           e["name"], "police", 1, 0, "Prevents vehicles entering; traffic diverts onto neighbouring roads"))
    if flood_zones:
        e = max(flood_zones, key=lambda e: e["p"] * st.vuln[e["zone_idx"]] * st.pop[e["zone_idx"]])
        z = e["zone_idx"]
        acts.append(Action(f"evac:{z}", "evacuate", f"Evacuate low-lying blocks of {e['name']}", str(z), e["name"],
                           "buses", 8, 0, "Moves the most exposed residents out; buses load the surrounding roads for 4 h"))
    for e in top("hospital_overload", 2, 0.25):
        acts.append(Action(f"surge:{e['asset']}", "surge", f"Open surge capacity at {e['name']}", e["asset"], e["name"],
                           "police", 0, 0, "Cancels elective admissions; +15% usable beds for 24 h"))
    acts.append(Action("advisory", "advisory", "Issue a city-wide travel advisory", "city", city.name, "police", 0, 0,
                       "Fewer trips: less congestion on routes ambulances need"))
    uniq = {}
    for a in acts:
        uniq.setdefault(a.id, a)
    return list(uniq.values())


def metrics(run, st) -> dict:
    now, H = run.now, run.horizon
    P = run.ens.P
    popw = st.pop / st.pop.sum()
    crit_share = (np.isfinite(run.reach_crit) * popw[None, :]).sum(1)
    hosp_fail = np.zeros(P)
    for k in ("hospital_overload", "hospital_blackout"):
        arr = run.ens.first.get(k)
        if arr is not None:
            hosp_fail += ((arr >= now) & (arr < now + H)).sum(1)
    flood = run.ens.first.get("zone_flood")
    ems = run.ens.first.get("zone_ems")
    return {
        "person_hours_high": float(run.person_hours.mean()),
        "p_city_critical": float((crit_share >= 0.03).mean()),
        "hospital_failures": float(hosp_fail.mean()),
        "zones_flooded": float((np.isfinite(flood) & (flood >= now)).sum(1).mean()) if flood is not None else 0.0,
        "zones_ems": float((np.isfinite(ems) & (ems >= now)).sum(1).mean()) if ems is not None else 0.0,
        "ems_vulnerable_min": float(np.median(run.ems_track.max(0))),
        "_zone_ph": run.zone_ph,
        "_mult": run.mult_mean,
    }


def evaluate(session, now: int, actions: list[Action], horizon: int = 72) -> dict:
    st = session.st
    base_run = session.baseline_run(now, horizon)
    base = metrics(base_run, st)
    run = session.forecaster_at(now).forecast(now, horizon, ov=to_overrides(actions, now, st), base=session.base_ens(now))
    m = metrics(run, st)
    dz = m["_zone_ph"] - base["_zone_ph"]
    worse = np.nonzero(dz > 400)[0]
    better = np.nonzero(dz < -400)[0]
    vul = st.vuln > 0.55
    reduction = -dz.clip(max=0)
    equity = float(reduction[vul].sum() / max(reduction.sum(), 1e-6))
    dmult = m["_mult"] - base["_mult"]
    congested = np.nonzero(dmult > 0.08)[0]
    # which predicted events got less likely
    ev_base = {e["id"]: e for e in session.payload(now)["events"]}
    changes = []
    for kind, arr in run.ens.first.items():
        barr = base_run.ens.first.get(kind)
        if barr is None:
            continue
        pb = ((barr >= now) & (barr < now + horizon)).mean(0)
        pa = ((arr >= now) & (arr < now + horizon)).mean(0)
        for i in np.nonzero(np.abs(pa - pb) >= 0.1)[0]:
            eid = next((k for k, e in ev_base.items() if e["kind"] == kind and e["_i"] == i), None)
            if eid:
                changes.append({"id": eid, "label": ev_base[eid]["label"], "before": round(float(pb[i]), 3),
                                "after": round(float(pa[i]), 3)})
    changes.sort(key=lambda c: c["after"] - c["before"])
    clean = {k: round(v, 3) for k, v in m.items() if not k.startswith("_")}
    clean_b = {k: round(v, 3) for k, v in base.items() if not k.startswith("_")}
    return {
        "now": now, "actions": [a.public() for a in actions], "baseline": clean_b, "with": clean,
        "delta": {k: round(clean[k] - clean_b[k], 3) for k in clean},
        "broken_links": changes[:12],
        "side_effects": {
            "zones_worse": [{"zone": st.city.zones[i].id, "name": st.city.zones[i].locality,
                             "person_hours": round(float(dz[i]))} for i in worse[np.argsort(-dz[worse])][:8]],
            "zones_better": [{"zone": st.city.zones[i].id, "name": st.city.zones[i].locality,
                              "person_hours": round(float(dz[i]))} for i in better[np.argsort(dz[better])][:8]],
            "congested_zones": [{"zone": st.city.zones[i].id, "name": st.city.zones[i].locality,
                                 "added_delay_pct": round(float(dmult[i] * 100))} for i in congested[np.argsort(-dmult[congested])][:8]],
        },
        "equity_share_vulnerable": round(equity, 3),
        "resources": _usage(actions),
    }


def _usage(actions):
    use = {}
    for a in actions:
        use[a.resource] = use.get(a.resource, 0) + a.units
    return {k: {"used": v, "total": RESOURCES[k]["total"], "label": RESOURCES[k]["label"]} for k, v in use.items()}


def _feasible(actions):
    use = {}
    for a in actions:
        use[a.resource] = use.get(a.resource, 0) + a.units
        if use[a.resource] > RESOURCES[a.resource]["total"]:
            return False
    return True


def benefit(res: dict) -> float:
    d = res["delta"]
    return -(d["person_hours_high"] / 1e4) - 4.0 * d["p_city_critical"] - 1.5 * d["hospital_failures"] - 0.2 * d["zones_ems"]


def optimize(session, now: int, max_actions: int = 4) -> dict:
    cands = candidates(session, now, session.payload(now))
    singles = []
    for a in cands:
        r = evaluate(session, now, [a], horizon=48)
        singles.append((benefit(r), a, r))
    singles.sort(key=lambda x: -x[0])
    portfolios = []
    for seed in range(min(3, len(singles))):
        chosen = [singles[seed][1]]
        for b, a, _ in singles:
            if len(chosen) >= max_actions:
                break
            if a in chosen or b <= 0 or not _feasible(chosen + [a]):
                continue
            chosen.append(a)
        key = tuple(sorted(x.id for x in chosen))
        if key in {tuple(sorted(x["ids"])) for x in portfolios}:
            continue
        full = evaluate(session, now, chosen, horizon=72)
        portfolios.append({"ids": [x.id for x in chosen], "benefit": round(benefit(full), 3), "result": full})
    portfolios.sort(key=lambda p: -p["benefit"])
    return {
        "now": now,
        "candidates": [{"action": a.public(), "benefit": round(b, 3), "delta": r["delta"],
                        "broken_links": r["broken_links"][:4], "side_effects": r["side_effects"]} for b, a, r in singles],
        "portfolios": portfolios,
        "resources": RESOURCES,
    }


def deadline(session, now: int, action: Action, offsets=(0, 2, 4, 6, 9, 12, 18)) -> dict:
    rows = []
    for off in offsets:
        a = Action(**{**action.__dict__, "start": off})
        r = evaluate(session, now, [a], horizon=48)
        rows.append({"start_in_h": off, "benefit": round(benefit(r), 3), "delta": r["delta"]})
    best = max(r["benefit"] for r in rows) if rows else 0
    latest = None
    for r in rows:
        if best > 0 and r["benefit"] >= 0.5 * best:
            latest = r["start_in_h"]
    return {"action": action.public(), "curve": rows, "latest_useful_start_h": latest,
            "max_benefit": round(best, 3)}
