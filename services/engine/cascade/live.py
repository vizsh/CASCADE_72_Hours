"""Live mode: today's real forecast for a real city. Rain and temperature
ensembles come from Open-Meteo (GFS ensemble, 31 members); no simulated
telemetry is involved, so the forecaster starts from current weather alone."""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import httpx
import numpy as np

from .city import load_city
from .scenarios import Scenario
from .service import Session
from .sim import Statics

_CACHE: dict[str, tuple[float, "LiveSession"]] = {}


def fetch_live(lat: float, lon: float, hours: int = 96) -> dict:
    c = httpx.Client(timeout=30)
    ens = c.get("https://ensemble-api.open-meteo.com/v1/ensemble", params={
        "latitude": lat, "longitude": lon, "models": "gfs_seamless", "hourly": "precipitation,temperature_2m",
        "forecast_hours": hours, "timezone": "auto",
    }).json()
    h = ens["hourly"]
    rain = np.array([v for k, v in h.items() if k.startswith("precipitation")], dtype=float)
    temp = np.array([v for k, v in h.items() if k.startswith("temperature_2m")], dtype=float)
    rain = np.nan_to_num(rain)
    temp = np.where(np.isnan(temp), np.nanmean(temp), temp)
    cur = c.get("https://api.open-meteo.com/v1/forecast", params={
        "latitude": lat, "longitude": lon, "current": "temperature_2m,precipitation,wind_speed_10m,wind_direction_10m",
        "timezone": "auto",
    }).json()
    return {"times": h["time"], "rain": rain, "temp": temp, "current": cur.get("current", {}),
            "timezone": ens.get("timezone", "UTC"), "model": "GFS ensemble (Open-Meteo)"}


class _NoWorld:
    frames: list = []
    events: list = []
    first: dict = {}
    sensors: dict = {}
    observations: list = []


class LiveSession(Session):
    def __init__(self, slug: str, P: int = 128):
        city = load_city(slug)
        data = fetch_live(city.lat, city.lon)
        n = data["rain"].shape[1]
        sc = Scenario(
            id=f"live-{slug}", title=f"Live: {city.name}", short="Live", hazards=["weather"], city=slug,
            start=data["times"][0], hours=1, now=0,
            summary="Today's real ensemble forecast. No simulated telemetry; zone states come from weather alone.",
            rain=data["rain"].mean(0), temp=data["temp"].mean(0),
            provenance={"weather": data["model"], "geography": "OpenStreetMap + Open-Meteo elevation"},
        )
        sc.live_rain = data["rain"]
        sc.live_temp = data["temp"]
        self.live = data
        self.sid = sc.id
        self.sc = sc
        self.city = city
        self.st = Statics(city)
        self.world = _NoWorld()
        from .predictor import Forecaster
        import threading
        from collections import OrderedDict

        self.fc = Forecaster(city, self.st, sc, [], [], P=P)
        self.payloads, self.snaps, self.runs = {}, {}, OrderedDict()
        self.cv = threading.Condition()
        self.started = time.time()
        self.error = None
        self.opt_cache = {}
        self.fc_lock = threading.Lock()
        self._walk()
        p = self.payloads[0]
        p["live"] = {"current": data["current"], "timezone": data["timezone"], "model": data["model"],
                     "issued": datetime.now(timezone.utc).isoformat(timespec="minutes")}


def live_session(slug: str) -> LiveSession:
    hit = _CACHE.get(slug)
    if hit and time.time() - hit[0] < 1800:
        return hit[1]
    s = LiveSession(slug)
    _CACHE[slug] = (time.time(), s)
    return s
