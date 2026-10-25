"""End-to-end smoke test: world -> forecaster -> forecast summaries."""

import sys
import time

import numpy as np

sys.path.insert(0, ".")
from cascade import scenarios  # noqa: E402
from cascade.city import load_city  # noqa: E402
from cascade.predictor import Forecaster  # noqa: E402
from cascade.sim import Statics  # noqa: E402
from cascade.world import run_world  # noqa: E402

PLAN = {
    "monsoon-2023": (24, 42, 46),
    "comms-blackout": (2, 8),
    "heatwave-2024": (20, 56),
    "chlorine-leak": (2,),
    "festival-rain": (3, 9),
}

city = load_city("nagpur")
st = Statics(city)
only = sys.argv[1:] or list(PLAN)
for sid in only:
    sc = scenarios.get(sid)
    t0 = time.time()
    w = run_world(city, st, sc)
    pub = [e for e in w.events if e["type"] in ("crowd", "plume")]
    f = Forecaster(city, st, sc, w.observations, pub, P=160)
    for now in PLAN[sid]:
        f.assimilate_to(now)
        run = f.forecast(now)
        zs = run.zone_states()
        r = run.cascade_r()
        ev = run.events()
        ln = run.links(ev)
        course = run.course(ev, ln)
        evd = {e["id"]: e for e in ev}
        print(f"\n[{sid}] NOW {now} {sc.time_at(now)} states {np.bincount(zs['state'], minlength=4)} "
              f"city {run.city_state(zs, r[0])} R {r[:12:2]} max {max(r)}")
        print("  course: " + " -> ".join(f"{evd[k]['label'][:38]}@{evd[k]['t50']}" for k in course))
    post = f.pick_posterior()
    wrong = [(a.id, post[i].round(2).tolist(), int(st.truth_pick[i])) for i, a in enumerate(st.consumers)
             if int(np.argmax(post[i])) != st.truth_pick[i] and post[i].max() > 0.7]
    print("  discoveries:", [(d["consumer"], d["supplier"], d["nearest"], d["confidence"]) for d in f.discoveries][:12])
    print("  confident-but-wrong:", wrong[:6])
    print("  low trust:", {k: round(f.tau(k), 2) for k in f.trust if f.tau(k) < 0.7})
    print("  flagged clusters:", [(x["locality"], x["n"], x["credibility"]) for x in f.clusters if x["coordinated"]][:3])
    print(f"  ({time.time() - t0:.1f}s)")
