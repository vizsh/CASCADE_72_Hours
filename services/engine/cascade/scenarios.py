"""Scenario library. A scenario supplies the *drivers* (rain, heat, plume,
crowds, forced faults) and the adversarial script. The same mechanics run for
every hazard, which is what makes the engine all-hazard."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import numpy as np


@dataclass
class Scenario:
    id: str
    title: str
    short: str
    hazards: list[str]
    city: str
    start: str  # ISO local time of hour 0
    hours: int
    now: int  # default "now" hour for the operator view
    summary: str
    rain: np.ndarray  # truth, city-mean mm/h, length hours+72
    temp: np.ndarray  # truth, deg C
    events: list[dict] = field(default_factory=list)
    adversarial: list[dict] = field(default_factory=list)
    provenance: dict = field(default_factory=dict)
    # forecast skill model: how wrong an issued forecast is at a given lead
    fc_timing_sd: float = 1.2  # hours at lead 0, grows with lead
    fc_intensity_sd: float = 0.25
    fc_miss_prob: float = 0.25  # chance a member misses a convective peak at long lead

    def time_at(self, hour: float) -> str:
        t = datetime.fromisoformat(self.start) + timedelta(hours=hour)
        return t.strftime("%Y-%m-%dT%H:%M")

    def public(self) -> dict:
        return {
            "id": self.id, "title": self.title, "short": self.short, "hazards": self.hazards,
            "city": self.city, "start": self.start, "hours": self.hours, "now": self.now,
            "summary": self.summary, "provenance": self.provenance,
            "events": [e for e in self.events if not e.get("hidden")],
            "adversarial": self.adversarial,
        }


def _diurnal_temp(n: int, start_hour: int, low: float, high: float, peak_hour: int = 15) -> np.ndarray:
    hours = (np.arange(n) + start_hour) % 24
    return low + (high - low) * (0.5 + 0.5 * np.cos((hours - peak_hour) / 24 * 2 * math.pi))


def _pad(arr, n):
    out = np.zeros(n)
    out[: min(n, len(arr))] = arr[:n]
    return out


def monsoon_2023() -> Scenario:
    # hour 0 = 2023-09-21 06:00 IST. Cloudburst 01:00-05:00 on 23 Sep (hours 43-46)
    n = 96 + 72
    rain = np.zeros(n)
    rain[7:9] = [4.5, 2.0]  # 21 Sep afternoon shower
    rain[32:35] = [6.0, 9.0, 3.0]  # 22 Sep 14:00
    rain[38:43] = [2.0, 4.0, 7.5, 11.0, 14.0]  # 22 Sep 20:00 - 00:00 build-up
    rain[43:47] = [24.0, 34.0, 31.0, 17.0]  # 106 mm in four hours (IMD-reported total)
    rain[47:51] = [8.0, 4.0, 2.0, 1.0]
    rain[60:62] = [3.0, 1.5]
    temp = _diurnal_temp(n, 6, 24.5, 31.0)
    return Scenario(
        id="monsoon-2023",
        title="Monsoon cloudburst, 23 Sep 2023",
        short="Monsoon cascade",
        hazards=["flood", "power", "mobility", "health", "telecom"],
        city="nagpur",
        start="2023-09-21T06:00",
        hours=96,
        now=30,
        summary=(
            "Reconstruction of the pre-dawn cloudburst over Nagpur: about 106 mm in four hours, "
            "Ambazari Lake overflowing into the Nag river, flooded low-lying neighbourhoods. "
            "Rain timing and totals follow IMD-reported figures; city telemetry is simulated."
        ),
        rain=rain,
        temp=temp,
        events=[
            # concept drift: debris blocks a trunk drain near the Ambazari outfall before the storm
            {"type": "drain_block", "near": "Ambazari", "hour": 36, "factor": 0.45, "hidden": True},
            # interacting failure: metro traction fault shifts riders onto roads in the morning
            {"type": "transit_fault", "hour": 49, "duration": 8, "label": "Metro traction fault, Line 1"},
        ],
        adversarial=[
            {"type": "gauge_stuck", "gauge": "Itwari", "hour": 38, "label": "Rain gauge stuck at zero"},
            {"type": "sensor_spoof", "hour": 34, "near": "Seminary Hills", "value_m": 0.9,
             "label": "Water-level sensor reports a 0.9 m spike on a hilltop"},
            {"type": "fake_reports", "hour": 44, "near": "Gorewada", "count": 140,
             "text": "Gorewada dam has breached, water coming to Katol Road", "label": "Bot burst: false dam-breach rumour"},
        ],
        provenance={
            "rain": "Reconstructed from IMD-reported totals (~106 mm, 01:00-05:00 IST, 23 Sep 2023). ERA5 reanalysis for the same window shows 11.5 mm/h peak; reanalysis smooths convective extremes.",
            "geography": "OpenStreetMap + Open-Meteo elevation (real)",
            "telemetry": "Simulated by the hidden world model; the forecaster never sees its parameters",
            "forecasts": "Synthetic as-issued ensemble with lead-dependent timing and intensity error (as-issued archives for Sep 2023 are not public in Open-Meteo)",
        },
        fc_timing_sd=1.5, fc_intensity_sd=0.3, fc_miss_prob=0.35,
    )


def heatwave_2024() -> Scenario:
    n = 96 + 72
    # hour 0 = 2024-05-28 06:00; daily highs 45-47.5 C, nights 32-34 C
    highs = np.array([45.2, 46.8, 47.4, 46.1, 44.0, 43.0, 42.0, 41.0])
    lows = np.array([32.5, 33.4, 34.0, 33.0, 31.5, 30.0, 29.5, 29.0])
    temp = np.zeros(n)
    for d in range(n // 24 + 1):
        seg = _diurnal_temp(24, 6, lows[min(d, 7)], highs[min(d, 7)])
        temp[d * 24 : d * 24 + 24] = seg[: max(0, min(24, n - d * 24))]
    return Scenario(
        id="heatwave-2024",
        title="Vidarbha heatwave and grid stress",
        short="Heatwave & grid",
        hazards=["heat", "power", "water", "health"],
        city="nagpur",
        start="2024-05-28T06:00",
        hours=96,
        now=20,
        summary=(
            "Three days near 47 C. Night-time cooling demand keeps feeders loaded, transformers trip, "
            "pumping for the water network stops, and heat illness arrives at hospitals whose own "
            "cooling depends on the same grid. Temperatures follow the late-May 2024 Vidarbha heatwave; "
            "loads and outages are simulated."
        ),
        rain=np.zeros(n),
        temp=temp,
        events=[{"type": "grid_fault", "sub_rank": 0, "hour": 57, "duration": 7, "label": "220 kV transformer trips at evening peak"}],
        adversarial=[
            {"type": "fake_reports", "hour": 33, "near": "Mahal", "count": 60, "text": "Water supply poisoned, do not drink", "label": "False contamination rumour"},
        ],
        provenance={
            "temperature": "Shaped on the late-May 2024 Vidarbha heatwave (Nagpur ~47 C); synthetic hourly profile",
            "telemetry": "Simulated by the hidden world model",
        },
        fc_timing_sd=0.6, fc_intensity_sd=0.04, fc_miss_prob=0.0,
    )


def comms_blackout() -> Scenario:
    n = 72 + 72
    return Scenario(
        id="comms-blackout",
        title="Grid fault and communication blackout",
        short="Comms blackout",
        hazards=["power", "telecom", "health"],
        city="nagpur",
        start="2025-11-14T18:00",
        hours=72,
        now=2,
        summary=(
            "A transmission fault drops a cluster of distribution substations for most of a night. "
            "Mobile sites run on batteries that empty at different times, emergency calls stop "
            "arriving from dark areas, and hospitals burn through diesel. Synthetic scenario."
        ),
        rain=np.zeros(n),
        temp=_diurnal_temp(n, 18, 16.0, 29.0),
        events=[{"type": "grid_fault", "sub_rank": "transmission", "hour": 3, "duration": 11, "label": "400/220 kV fault at Koradi"}],
        adversarial=[{"type": "feed_drop", "source": "telecom", "hour": 6, "duration": 4, "label": "Operator status feed goes silent"}],
        provenance={"all": "Synthetic scenario on real Nagpur geography"},
        fc_timing_sd=0.5, fc_intensity_sd=0.05, fc_miss_prob=0.0,
    )


def gas_leak() -> Scenario:
    n = 48 + 72
    return Scenario(
        id="chlorine-leak",
        title="Chlorine leak at a water treatment plant",
        short="Industrial gas leak",
        hazards=["hazmat", "mobility", "health"],
        city="nagpur",
        start="2025-03-09T10:00",
        hours=48,
        now=1,
        summary=(
            "A chlorine cylinder fails at a water treatment plant. The plume follows the wind across "
            "dense neighbourhoods; evacuation clears exposure but loads the roads ambulances need, and "
            "breathing complaints arrive at the nearest hospitals. Synthetic scenario."
        ),
        rain=np.zeros(n),
        temp=_diurnal_temp(n, 10, 19.0, 33.0),
        events=[{"type": "plume", "source_kind": "water", "hour": 1, "duration": 5, "rate": 1.0,
                 "wind_from_deg": 250, "wind_ms": 3.2, "label": "Cl2 release, ~1 t over 5 h"}],
        adversarial=[{"type": "fake_reports", "hour": 3, "near": "Sitabuldi", "count": 50, "text": "Gas spreading to Sitabuldi, everyone leave", "label": "Panic rumour upwind of the plume"}],
        provenance={"all": "Synthetic release on real Nagpur geography; Gaussian plume dispersion"},
        fc_timing_sd=0.5, fc_intensity_sd=0.05, fc_miss_prob=0.0,
    )


def festival_rain() -> Scenario:
    n = 48 + 72
    rain = np.zeros(n)
    rain[8:12] = [6.0, 16.0, 22.0, 9.0]
    return Scenario(
        id="festival-rain",
        title="Immersion-day crowds meet an evening storm",
        short="Crowd + rain",
        hazards=["crowd", "flood", "mobility", "health"],
        city="nagpur",
        start="2025-09-06T12:00",
        hours=48,
        now=3,
        summary=(
            "Processions converge on the lakes for immersion while a thunderstorm builds. Crowds fill "
            "the same streets that flood first, ambulances slow down, and exits near the ghats tighten. "
            "Synthetic scenario."
        ),
        rain=rain,
        temp=_diurnal_temp(n, 12, 24.0, 32.0),
        events=[{"type": "crowd", "near_lake": "Gandhi Sagar", "hour": 4, "duration": 9, "peak_per_m2": 5.5,
                 "label": "Immersion procession, Gandhi Sagar"},
                {"type": "crowd", "near_lake": "Sonegaon", "hour": 5, "duration": 7, "peak_per_m2": 3.8,
                 "label": "Immersion procession, Sonegaon"}],
        adversarial=[],
        provenance={"all": "Synthetic scenario on real Nagpur geography"},
        fc_timing_sd=1.0, fc_intensity_sd=0.35, fc_miss_prob=0.25,
    )


SCENARIOS = {s.id: s for s in (monsoon_2023(), heatwave_2024(), comms_blackout(), gas_leak(), festival_rain())}


def get(sid: str) -> Scenario:
    return SCENARIOS[sid]


def forecast_members(sc: Scenario, issue_hour: int, horizon: int, members: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """As-issued ensemble for rain and temperature: truth smeared by an error
    model whose spread grows with lead time."""
    live_rain = getattr(sc, "live_rain", None)
    if live_rain is not None:
        # real ensemble members: cycle them to the requested member count
        idx = np.arange(members) % live_rain.shape[0]
        r = np.zeros((members, horizon))
        tt = np.zeros((members, horizon))
        k = min(horizon, live_rain.shape[1] - issue_hour)
        r[:, :k] = live_rain[idx, issue_hour : issue_hour + k]
        tt[:, :k] = sc.live_temp[idx, issue_hour : issue_hour + k]
        tt[:, k:] = tt[:, k - 1 : k]
        return r, tt
    n = len(sc.rain)
    hours = np.arange(issue_hour, issue_hour + horizon)
    rain = np.zeros((members, horizon))
    temp = np.zeros((members, horizon))
    for m in range(members):
        shift = rng.normal(0, sc.fc_timing_sd)
        scale = math.exp(rng.normal(0, sc.fc_intensity_sd))
        miss_draw = rng.random()
        tbias = rng.normal(0, 0.8)
        for k, h in enumerate(hours):
            lead = h - issue_hour
            sd_shift = shift * (1 + lead / 18)
            src = h - sd_shift
            i0 = int(np.clip(math.floor(src), 0, n - 1))
            i1 = min(i0 + 1, n - 1)
            frac = src - math.floor(src)
            r = (1 - frac) * sc.rain[i0] + frac * sc.rain[i1]
            # far-lead members may miss or under-forecast convective peaks
            miss_p = sc.fc_miss_prob * min(1.0, lead / 30)
            if miss_draw < miss_p and r > 8:
                r *= 0.35
            intensity_sd = scale ** (1 + lead / 36)
            rain[m, k] = max(0.0, r * intensity_sd)
            t = sc.temp[min(h, n - 1)]
            temp[m, k] = t + tbias * min(1.0, lead / 24) * 1.5
    return rain, temp
