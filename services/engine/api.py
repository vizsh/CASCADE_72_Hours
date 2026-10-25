"""HTTP API for the CASCADE 72 website.

    uvicorn api:app --port 8072
"""

from __future__ import annotations

import subprocess
import sys

sys.setswitchinterval(0.002)  # keep requests responsive while the walker thread runs
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel

from cascade import scenarios
from cascade.city import load_city
from cascade.fetch import DATA_DIR, slugify
from cascade.interventions import RESOURCES
from cascade.live import live_session
from cascade.service import SESSIONS, get_session
from cascade.validation import validate

app = FastAPI(title="CASCADE 72 engine", version="0.1")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=2000)

_city_cache: dict[str, dict] = {}
_builds: dict[str, dict] = {}


@app.get("/api/health")
def health():
    return {"ok": True, "sessions": {k: s.status() for k, s in SESSIONS.items()}}


@app.get("/api/scenarios")
def list_scenarios():
    return [s.public() for s in scenarios.SCENARIOS.values()]


@app.get("/api/cities")
def list_cities():
    out = []
    for d in sorted(DATA_DIR.iterdir()):
        if (d / "meta.json").exists():
            out.append({"slug": d.name, "ready": True})
    for slug, b in _builds.items():
        if slug not in {c["slug"] for c in out}:
            out.append({"slug": slug, "ready": False, **b})
    return out


@app.get("/api/city/{slug}")
def city(slug: str):
    if slug not in _city_cache:
        try:
            _city_cache[slug] = load_city(slug).to_public()
        except FileNotFoundError:
            raise HTTPException(404, f"city {slug} not built")
    return _city_cache[slug]


class BuildReq(BaseModel):
    name: str


@app.post("/api/cities/build")
def build_city(req: BuildReq):
    slug = slugify(req.name)
    if (DATA_DIR / slug / "meta.json").exists():
        return {"slug": slug, "status": "ready"}
    if slug in _builds and _builds[slug]["status"] == "running":
        return {"slug": slug, **_builds[slug]}
    _builds[slug] = {"status": "running", "log": ""}

    def work():
        proc = subprocess.run([sys.executable, "-m", "cascade.fetch", req.name], cwd=Path(__file__).parent,
                              capture_output=True, text=True)
        _builds[slug]["log"] = (proc.stdout + proc.stderr)[-2000:]
        if proc.returncode == 0:
            try:
                load_city(slug)
                _builds[slug]["status"] = "ready"
            except Exception as err:  # noqa: BLE001
                _builds[slug].update(status="failed", log=str(err))
        else:
            _builds[slug]["status"] = "failed"

    threading.Thread(target=work, daemon=True).start()
    return {"slug": slug, **_builds[slug]}


@app.get("/api/cities/build/{slug}")
def build_status(slug: str):
    if (DATA_DIR / slug / "meta.json").exists() and _builds.get(slug, {}).get("status") != "running":
        return {"slug": slug, "status": "ready"}
    return {"slug": slug, **_builds.get(slug, {"status": "unknown"})}


@app.post("/api/session/{sid}")
def start(sid: str):
    if sid not in scenarios.SCENARIOS:
        raise HTTPException(404, "unknown scenario")
    return get_session(sid).status()


@app.get("/api/session/{sid}/status")
def status(sid: str):
    return get_session(sid).status()


@app.get("/api/session/{sid}/at/{hour}")
def at(sid: str, hour: int):
    s = get_session(sid)
    hour = max(0, min(hour, s.sc.hours - 1))
    if not s.wait(hour, timeout=90):
        raise HTTPException(202, "still computing")
    return s.payload(hour)


@app.get("/api/session/{sid}/timeline")
def timeline(sid: str):
    s = get_session(sid)
    rows = []
    for h in sorted(s.payloads):
        p = s.payloads[h]
        z = p["zones"]["state"]
        rows.append({"hour": h, "time": p["time"], "city_state": p["city_state"], "r": p["cascade_r"][0],
                     "high": sum(1 for x in z if x >= 2), "crit": sum(1 for x in z if x >= 3),
                     "watch": sum(1 for x in z if x == 1),
                     "truth_crit": None if not p["truth"] else sum(1 for x in p["truth"]["state"] if x >= 3),
                     "rain": round(float(s.sc.rain[h]), 1), "temp": round(float(s.sc.temp[h]), 1)})
    return {"hours": s.sc.hours, "ready": len(rows), "rows": rows}


@app.get("/api/session/{sid}/observations/{hour}")
def observations(sid: str, hour: int, kind: str | None = None, limit: int = 300):
    s = get_session(sid)
    obs = [o for o in s.fc.store.all if o.known <= hour and (kind is None or o.kind == kind)]
    return [o.public(s.city) for o in obs[-limit:]]


@app.get("/api/session/{sid}/actions/{hour}")
def actions(sid: str, hour: int):
    s = get_session(sid)
    return {"actions": [a.public() for a in s.action_list(hour)], "resources": RESOURCES}


class EvalReq(BaseModel):
    hour: int
    actions: list[str]
    starts: dict[str, float] | None = None


@app.post("/api/session/{sid}/evaluate")
def evaluate(sid: str, req: EvalReq):
    return get_session(sid).evaluate(req.hour, req.actions, req.starts)


class HourReq(BaseModel):
    hour: int


@app.post("/api/session/{sid}/optimize")
def optimize(sid: str, req: HourReq):
    return get_session(sid).optimize(req.hour)


class DeadlineReq(BaseModel):
    hour: int
    action: str


@app.post("/api/session/{sid}/deadline")
def deadline(sid: str, req: DeadlineReq):
    return get_session(sid).deadline(req.hour, req.action)


@app.get("/api/session/{sid}/validation")
def validation(sid: str):
    s = get_session(sid)
    if s.validation:
        return s.validation
    if len(s.payloads) < s.sc.hours:
        return {"pending": True, **s.status()}
    s.validation = validate(s)
    return s.validation


class ReportReq(BaseModel):
    zone: str
    text: str
    lang: str = "en"


_reports: list[dict] = []


@app.post("/api/report")
def report(req: ReportReq):
    """Score a citizen report the same way the forecaster scores clusters:
    independent wording, plausibility for the ground it describes, and how many
    near-identical reports arrived just before it."""
    import math
    import time as _t

    now = _t.time()
    recent = [r for r in _reports if now - r["at"] < 3600]
    dup = sum(1 for r in recent if r["text"].strip().lower() == req.text.strip().lower())
    same_zone = sum(1 for r in recent if r["zone"] == req.zone)
    city = load_city("nagpur")
    z = next((z for z in city.zones if z.id == req.zone), None)
    hand = z.hand if z else 3.0
    words = len(req.text.split())
    score = 0.4 + 0.25 * min(1.0, words / 8) - 0.9 * min(1.0, dup / 3) - 0.35 * max(0.0, (hand - 5) / 6) + 0.15 * min(1.0, same_zone / 4)
    cred = 1 / (1 + math.exp(-4 * (score - 0.4)))
    _reports.append({"zone": req.zone, "text": req.text, "lang": req.lang, "at": now, "credibility": cred})
    return {"accepted": True, "credibility": round(cred, 3), "duplicates_last_hour": dup}


@app.get("/api/live/{slug}")
def live(slug: str):
    try:
        s = live_session(slug)
    except FileNotFoundError:
        raise HTTPException(404, f"city {slug} not built")
    return s.payload(0)
