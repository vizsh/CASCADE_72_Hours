# CASCADE 72

**What is likely to fail next, what will that failure affect, and what can we do now to stop the cascade?**

CASCADE 72 is a consequence-first urban crisis forecaster built for CASCADE '26 (Theme 2 · Problem 2, *The 72-Hour Warning*). It predicts how one disruption propagates across a city's drainage, roads, power, telecom, transit, water supply, ambulances and hospitals up to 72 hours ahead. It learns the dependencies nobody wrote down, and compares interventions on the same simulated futures, with their side effects and decision deadlines.

The prototype runs on real Nagpur geography: 449 H3 zones, 22 major hospitals, 18 substations, 31 underpasses, 34 metro stations, the Nag and Pili rivers, and Ambazari, Gorewada, Gandhi Sagar and Sonegaon lakes. It ships five all-hazard scenarios and a live mode driven by today's real weather ensemble.

## Run it

Two processes: the Python engine (port 8072) and the Next.js website (port 3000).

```bash
# engine
cd services/engine
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt      # macOS/Linux: .venv/bin/python
.venv/Scripts/python -m uvicorn api:app --port 8072
```

```bash
# website
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000. Precomputed forecasts for every scenario hour ship in `services/engine/data/baked`, so the time machine is instant. The engine rebuilds ensemble snapshots in the background for what-if questions; the Lab says when an hour is ready. Set `NEXT_PUBLIC_ENGINE_URL` if the engine runs elsewhere.

## What is on the site

| Route | What it does |
|---|---|
| `/` | Landing: conventional warning vs consequence-first, the 2023 replay course, validation numbers straight from the engine |
| `/app/[scenario]` | **Command**: atlas map with zone risk and the predicted cascade drawn as an orienteering course, plus a control description sheet (what fails, where, P10–P90 window, probability, the mechanism on each leg) |
| `/app/[scenario]/explore` | Map + swimlane cascade graph (systems × time) + inspector; hover traces causes and consequences, click pins a failure across all views |
| `/app/[scenario]/lab` | Intervention lab: compare actions against doing nothing, the optimiser's plans within resource limits, decision deadlines, side effects, equity share, Ghost City exposure map |
| `/app/[scenario]/timeline` | 72-hour criticality clock: every predicted failure as a P10–P90 window; city risk and rain fans |
| `/app/[scenario]/evidence` | Sensors and trust, citizen-report clusters with credibility, learned feeder dependencies, alarms, the future-data fence |
| `/app/[scenario]/replay` | Temporal validation: lead time, detection, false alarms, reliability diagram, recovered hidden links, adversarial inputs |
| `/live` | Today's real GFS ensemble (Open-Meteo) over Nagpur; build any other city from open data |
| `/my-area` | Citizen view in English, हिन्दी and मराठी: status, worsening window, what to do, nearest hospital expected to stay open, shelter, report form |

A global time cursor moves "now" for every page. The forecast at hour *h* only ever reads observations whose arrival time is ≤ *h*.

## How the engine works

```
real inputs (OSM, elevation, weather)      hidden world simulator (true parameters + true feeder graph)
              │                                          │ noisy, late, missing, adversarial streams
              ▼                                          ▼
 city model ──────────────▶  forecaster: particle filter over the same mechanics
 zones · assets · road paths        • trust scores, plausibility checks, report credibility
                                    • Bayesian feeder discovery from outage evidence
                                    • 72 h ensemble forecast → zone states, time-to-critical,
                                      cascade course, branching, Cascade-R
                                    • counterfactual interventions on common random numbers
```

- **Mechanics** (`cascade/sim.py`), vectorised over particles:
  - rain → runoff → drains (with river backwater) → downhill routing and lake spill → flood depth;
  - flood depth → road travel time and underpass closures;
  - substations (flood, heat overload, grid faults, upstream trips) → feeders → pumps (feedback loop), towers (batteries), metro, water works, hospitals (diesel);
  - ambulance response over the damaged road network;
  - hospital load with staff access at shift change and diversion between hospitals;
  - zone risk states NORMAL · WATCH · HIGH RISK · CRITICAL from explicit rules.
- **Hazards are drivers, not separate models.** Rain, heat, a Gaussian chlorine plume, crowd density and grid faults all push the same mechanics.
- **Dependency discovery.** Which substation really feeds each hospital, pump, tower and metro station is unknown to the forecaster (prior: nearest, 62%). A per-asset Bayesian filter updates from "on backup / on grid" reports against substation telemetry.
- **Cascade-R.** Propagated failures in the next 3 h per failure in the last 3 h. Above 1, the cascade feeds itself.
- **Validation** (`cascade/validation.py`) scores every issued forecast against the hidden world: Brier and reliability, warning lead time, detection, false-alarm ratio, recovered hidden links, response to adversarial inputs.

### Replay results (from the engine)

| Scenario | Median lead | Detection | False-alarm ratio | Brier skill |
|---|---|---|---|---|
| Monsoon cloudburst, 23 Sep 2023 | 25 h | 59/59 critical zone episodes | 0.24 | 0.64 |
| Grid fault & comms blackout | 3 h | 10/10 | 0.20 | 0.10 |
| Festival crowds + storm | 7 h | 3/3 | 0.19 | 0.66 |

In the monsoon replay, a gauge stuck at zero falls to 22% trust. A hilltop sensor reporting a 0.9 m spike drops to 53% trust. 140 planted "dam breached" reports are flagged as coordinated, with credibility at or below 2%. In the blackout replay, 33 of 36 confident feeder assignments are correct.

## Real vs simulated

| Real | Simulated (labelled in the UI) |
|---|---|
| Roads, hospitals, substations, underpasses, lakes, rivers, metro (OpenStreetMap, ODbL) | Drain, feeder, tower, hospital and ambulance telemetry |
| Terrain and drainage lines (Copernicus DEM via Open-Meteo) | The true feeder graph (hidden from the forecaster) |
| Live weather ensembles (Open-Meteo GFS, 31 members) | Citizen reports, including planted false ones |
| 2023 storm timing and totals (IMD-reported ~106 mm in four hours) | Mobile-site and stormwater-pump placement; hospital bed counts where OSM has none |

As-issued forecasts for September 2023 are not public in Open-Meteo, so the replay uses a synthetic forecast-error model whose spread grows with lead time. ERA5 reanalysis shows only 11.5 mm/h for the same night, because reanalysis smooths convective extremes.

## Repository

```
apps/web/             Next.js 16 website (MapLibre + deck.gl atlas, React, Motion, React Bits)
services/engine/      FastAPI engine
  cascade/fetch.py    OSM + elevation fetcher (any city by name)
  cascade/city.py     zones, assets, road paths, hidden feeder graph
  cascade/sim.py      vectorised mechanics shared by world and forecaster
  cascade/world.py    hidden world + observation streams (faults, delays, adversaries)
  cascade/predictor.py particle filter, discovery, forecasts, course, Cascade-R
  cascade/interventions.py what-ifs, optimiser, deadlines
  cascade/validation.py temporal validation
  data/cities/nagpur  cached OSM + elevation (offline-safe)
  data/baked/         precomputed hourly issuances
docs/PROTOTYPE_PLAN.md  plan and UI research
PRODUCT.md, DESIGN.md   product truth and design system
```

Decision support only: the system proposes, authorised people decide.
