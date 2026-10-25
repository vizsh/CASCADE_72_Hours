# CASCADE 72 — Prototype Plan

*Working name (alternatives: PRAHARI-72, DOMINO). Built for CASCADE '26 · Theme 2 · Problem 2 "The 72-Hour Warning", a 24-hour build at IIIT Nagpur, 25–26 Oct 2026.*

Inputs to this plan: the official problem statement, the team's base research doc (`THE 72 HOURS base.pdf`, 47 pages), the earlier ideation sessions, and a UI/UX reference sweep (sources at the end).

---

## 0. Positioning

**A consequence-first, all-hazard urban cascade simulator.** It answers one question for every crisis in the city at once:

> **What is likely to fail next, what will that failure affect, and what can we do now to stop the cascade?**

The contrast that sells it (use it as the home-page hero):

| Conventional warning | CASCADE 72 |
|---|---|
| "Heavy rainfall is expected in the next 24 hours." | "Drainage in Zone 14 is likely to overflow between 01:30 and 03:00 (68%). Wardha Road then becomes impassable, ambulance response to Zones 14 and 22 rises by ~14 min, and Hospital B loses staff access before the 07:00 shift. Two pumps deployed before 01:40 break this chain in most simulated futures." |

---

## 1. What the base doc gets right (we keep all of it)

- **The north-star question** above.
- **Four prediction levels:** Hazard → Exposure & vulnerability → Cascade → Intervention & consequence. These become the engine's stages *and* the UI's layers of detail.
- **Twelve assessment dimensions** for every potential problem: hazard, exposure, vulnerability, dependency, capacity, time to impact, probability, severity, propagation, recoverability, intervention, confidence. These become the fields of every crisis and asset risk record. No single score is allowed to hide a low-probability, catastrophic outcome.
- **Five stages of a problem:** initiating hazard → exposed asset → service degradation → cascading failure → critical outcome.
- **Three horizon bands:** 0–6 h *Respond*, 6–24 h *Prepare*, 24–72 h *Plan*. These become three working modes in the app.
- **Capacity and time-to-failure, not open/closed.** A hospital with 2 h of backup power is a different risk from one with 2 days.
- **Six hard cases:**
  1. feedback loop;
  2. failures that interact;
  3. hidden dependency;
  4. forecasts and observations disagree;
  5. an intervention fixes one problem and creates another;
  6. the crisis evolves beyond the forecast.

  The demo is scripted to prove each one (§11).
- **Five scenarios A–E:** monsoon cascade, heatwave and grid stress, hospital access crisis, communication blackout, competing priorities.
- **Provenance discipline:** every item is timestamped, sourced, scored for reliability, and labelled *observation vs forecast vs AI inference*.
- **Five outputs:** dynamic risk map, cascading-failure graph, time-to-criticality timeline, intervention simulator, evidence and action log.
- **Human oversight:** options go to authorised decision-makers; nothing auto-dispatches.
- **Honest validation:** historical replay with no future leakage; calibration, lead time, false alarms, intervention value, robustness.

## 2. Where the base doc falls short, and the fix

| # | Gap in the base doc | Why it matters for judging | Our fix |
|---|---|---|---|
| 1 | Dependencies are curated, then traversed ("encode known dependencies… graph traversal"). That is lookup, not discovery. | The problem statement says the structure "is not provided. Infer it from data and update it as the city changes." | A **hidden world simulator** whose true graph the predictor never sees, plus **online discovery** from data streams. We report how many true links were recovered and how many found links are real. Unknown links are flagged as unknown, never invented. |
| 2 | Calibrated probabilities are asked for, but there's no method. | "Calibrated probabilities and time-to-critical estimates, not just labels." | Run the rule/physics propagation as a **Monte Carlo ensemble** (≈500 runs). New observations reweight the runs, and calibration is checked on replays. |
| 3 | Only "transparent source-quality rules". | "Deliberately misleading inputs (sensor failures, false citizen reports)." | Trust scores learned from agreement with other sources, physical plausibility checks, fake-account detection, and a **Red-Team console**. |
| 4 | No definition of the *city-wide* state. | Four states are required "per zone and city-wide". | **Cascade-R**: the reproduction number of failures (≥1 means the cascade sustains itself), combined with the population-weighted share of zones at HIGH RISK and critical-facility status. |
| 5 | Flood-first. | The team wants all-hazard; the statement says "cascading urban crises". | **Hazard plug-in modules**, a **crisis registry** that keeps each crisis distinct, and a **compound view** for how crises interact. |
| 6 | No path to generalisation. | "Perform on a city or scenario not seen during development." | **City-in-a-minute builder** from OpenStreetMap, elevation and population data, plus inputs on relative scales (rain as a percentile of normal, height above nearest drain). |
| 7 | The Criticality Clock covers assets only. | Decisions expire too. | **Decision deadlines:** the latest moment each intervention still breaks the chain. |
| 8 | Equity is named but not designed. | "Identify who may be disproportionately affected." | A **"Who bears the cost"** lens on zone pages and in the Intervention Lab (vulnerable population, informal settlements, essential workers). |
| 9 | Assumes one operator. | Real response involves many agencies. | Role views, **deep links to every crisis, asset and link**, acknowledgements, and a shared decision log. |
| 10 | No citizen channel. | Residents are "among the most important beneficiaries". | A **citizen web app**: in Marathi, Hindi and English, low-noise alerts, report-an-incident, help nearby. |

## 3. UI/UX references: borrow and avoid

| Reference | What it is | Borrow | Avoid or improve |
|---|---|---|---|
| **Google Flood Hub** (doc p.35) | Global flood forecasting map | Location search; a hydrograph with a "now" line and warning/danger/extreme threshold lines; confidence labels per gauge; plain layer panel | Hazard-first; stops at the water. We attach downstream consequences to the same view. |
| **Copernicus EFAS / GloFAS** (doc p.37) | Flood forecast viewer | Date and run selector; source and version stamped on every layer; current state kept separate from forecasts | Dense GIS chrome, orange header noise |
| **Infrastructure interdependency twin** (doc pp.30, 44; likely the UK **CReDo** demonstrator) | Flood → power/water/telecom networks | **An asset inspector listing "supplies power to / power supplied by"**, criticality, flood depth and state; scenario and timestep selectors; a network overlay | Spaghetti edges across the whole map. We show only the selected asset's neighbourhood. |
| **One Concern "Domino"** (doc p.42) | Business-continuity risk from infrastructure | **Downtime per dependency type** (community, power, airport, road, port); arcs from a site to the infrastructure it depends on | Purple glow everywhere; little sense of time |
| **Palantir Foundry Vertex** | Cause-and-effect on a digital twin | System graph plus "scenarios" that run proposed actions through linked models and trace the effects end to end | Enterprise complexity |
| **Dynatrace Smartscape** | IT dependency topology | **Tiered layout**: the vertical axis is dependencies *across* tiers, the horizontal axis is relationships *within* a tier, and each tier carries a health indicator. This maps directly onto city systems (Weather → Water → Roads → Ambulances → Hospitals → Power → Comms). | IT jargon |
| **Probabilistic impact timeline** (doc p.33) | Weather-impact product | **10–90% and 25–75% bands, a threshold line, start/end windows**, a "show probabilities" toggle, and criteria chips | The rainbow vertical colour bar |
| **3D flood scenario concept** (doc p.31) | Concept UI | **Scenario cards showing their chance %**, a timeline scrubber with play, loss and damage counts | Grey 3D clutter, unreadable small text |
| **3Di Live in a 3D city model** (doc p.39) | Flood what-if on a Cesium city | **Set parameters → draw an area → "Start simulation"** with processing time shown | Form-heavy side panel |
| **Snap4City 3D twin** (doc p.38) | Smart-city twin | Clickable assets and a heatmap time control | Marker confetti, "No Value" labels floating everywhere, no hierarchy |
| **Hawk Eye — Jakarta flood** (doc p.41) | Hackathon-style ops UI on Cesium + Earth Engine | Data layer list, an **incident log with severity**, analysis provenance (sensor, pass, baseline dates) | A wall of "system status" API lights, fake HUD styling |
| **Emergency Command Center** (doc p.40) | Hackathon incident triage | Filterable incident queue, triage panel, "missing fields" prompts, mode presets | A different category of product: reactive triage, not prediction |
| **Overglass fusion center** (doc p.44) | Open-source intelligence ops screen | Threat-condition summary, layer groups, a "stale feed" indicator in the footer | Crammed sci-fi density, tickers |
| **CrisisOps** (doc p.36) | Disaster platform concept | **Navigation grouped by lifecycle**: Pre-disaster / During / Post / Communications | Generic cards, dispatch-first focus |
| **Watch Duty** | Wildfire alert app | Information **verified by trained humans**; notifications only past a threat-to-life threshold; people keep getting updates until the danger passes. Low noise is the feature. | Volunteer-run; not a forecaster |
| **NERV Disaster Prevention** (Japan) | Official-alert app | Colour schemes safe for colour-blind users, large clear type, bilingual, fastest delivery of official data | Anime styling (keep the discipline, not the look) |
| **Generic smart-city dashboard** (doc p.32) | Dribbble-style concept | — | **Anti-reference:** KPI-card soup, vanity metrics ("citizen satisfaction 4.6"), no consequences |
| **GridMind AI** (doc p.43) | AI-generated poster | — | **Anti-reference:** gauge dials, neon glow, decorative percentages |
| **LLM recovery predictions** (doc p.45) | Hackathon project | — | **Anti-reference:** asking several LLMs for competing risk scores. LLMs narrate and parse; models predict. |

**What the references tell us:**
1. Almost every crisis UI defaults to **dark neon command-centre styling**. The judges will see ten of these, so the look alone can set us apart (§8).
2. Two strong patterns exist only *separately*: map + inspector (CReDo, Flood Hub) and graph + scenario (Vertex). **Nobody synchronises map, dependency graph, probabilistic timeline and evidence around one selection.** That synchronised workspace is our core interaction.
3. The research frontier (Fraunhofer co-simulation 2025, a city-scale flood digital twin 2025, a multi-hazard framework 2026) still describes *frameworks*, not deployed multi-hazard cascade products. That gap is real.

## 4. Product concept

### 4.1 The loop
**Detect → Understand → Anticipate → Decide → Learn**

| Stage | What happens | Where in the site |
|---|---|---|
| Detect | Signals arrive, crises are identified, reports are checked against each other | Signals, Crisis Registry |
| Understand | Exposure, dependencies, what drives each crisis | Crisis page, Cascade Explorer, Asset pages |
| Anticipate | 72-hour ensemble forecast, Criticality Clock, Cascade-R | City Pulse, Timeline |
| Decide | Compare interventions, see side effects and deadlines, record decisions | Intervention Lab, Decision log |
| Learn | Replay, validation, newly discovered links, model staleness | Evidence & Replay, Validation |

### 4.2 Crisis model: individuality and correlation

**Each crisis is its own record** (`CR-NGP-0412`) with a type from a standard hazard list (UNDRR Hazard Information Profiles), a lifecycle stage (Precursor → Emerging → Active → Peaking → Recovering → Closed), an area of hexagons that changes over time, and its own forecast, evidence, affected assets, owning agency and decision history.

**Each record carries a 12-dimension risk profile** (from the base doc) instead of one score: hazard · exposure · vulnerability · dependency · capacity · time to impact · probability · severity · propagation · recoverability · intervention · confidence.

**Problem stages on the graph:** a node moves from *Hazard → Exposed → Degraded → Failed → Critical outcome*.

**Correlations are typed links in the knowledge graph:**

| Link | Meaning | Example |
|---|---|---|
| `AFFECTS` | crisis → system/asset (strength, delay, probability) | Flood → Wardha Rd (impassable, +40 min, 0.7) |
| `DEPENDS_ON` | asset → asset | Hospital B → Substation S3; Pump P2 → S3 |
| `TRIGGERS` | crisis → a new crisis | Flood → cholera cluster (+5–10 days) |
| `AMPLIFIES` | a crisis worsens another's impact | Heatwave amplifies blackout health load |
| `COMPETES_FOR` | two crises need the same resource | Flood and fire both need Ambulance Base 2 |
| `SHARES_CAUSE` | common driver | Cyclone → wind damage + flooding |
| `MASKS` | a crisis hides another's signals | Telecom outage hides emergency calls |

**Compound view:** every asset shows how much of its stress comes from each crisis, plus the extra stress that exists only because the crises coincide. For example: Hospital B load = flood 55% + outbreak 40% + interaction 22% = 117% of capacity.

**Provenance on everything:** `OBSERVED` · `FORECAST` · `REPORTED` · `INFERRED` · `STALE`.

### 4.3 Engine (the feasible version)

1. **City builder:** H3 hexagons (resolution 8) plus OSM assets, elevation (terrain, where water collects), land cover and population. Physical "candidate" links come from geography.
2. **Signal intake:** every reading carries `valid_time` and `known_time`. The predictor can only read data where `known_time ≤ now` (DuckDB ASOF joins). Trust layer: plausibility checks, learned source reputation, robust error model, fake-account checks on reports.
3. **Crisis detection:** anomaly detection per stream and zone (EWMA/z-score); a *signature* per hazard type across streams; an LLM sorts free text into the hazard list. Reports are merged into or split from crises by type plus overlap in space and time.
4. **Hazard modules (plug-ins):**
   - flood: runoff → drain capacity → overflow downhill;
   - heat–grid: temperature → demand vs capacity → transformer failure;
   - outbreak: SEIR epidemic model, rising with flood exposure;
   - gas leak: Gaussian plume driven by live wind;
   - crowd: density vs exit capacity;
   - telecom: tower battery drain after power loss;
   - hospital access: travel time on the damaged road network.
5. **Propagation:** transfer rules on the dependency graph (threshold + delay + probability), run as a **Monte Carlo ensemble** fed by Open-Meteo ensemble weather members. New observations reweight the runs, so forecasts update without retraining. Outputs:
   - the probability of each state per zone, system and time horizon;
   - time to critical as P10/P50/P90;
   - the most likely failure sequence;
   - a branching tree of alternative sequences.
6. **Dependency discovery:** time-lagged regression updated with each reading (recursive least squares with a forgetting factor), giving Granger-style link strengths. A drift detector speeds up forgetting when the city changes. The results are scored against the world simulator's hidden graph. *Stretch:* Hawkes process for discrete failure events, PCMCI.
7. **Risk states:** clear rules per hazard (e.g. CRITICAL = threshold crossed, or ≥60% chance within 3 h) with hysteresis so states don't flicker. City-wide: **Cascade-R**. Thresholds are tuned on replays.
8. **Interventions:** an action library (pumps, drain crews, ambulance stationing, hospital surge, diesel, early substation shutdown, closures, evacuation, advisories). Each action has a cost, a resource pool, its effect on the model and its side effects. Every option is compared against the same simulated futures, then a greedy optimiser picks under budget, adds deadlines, and reports who bears the cost.
9. **Explanation:** an evidence card on every link; "what moved this risk" attribution by leaving out one piece of evidence at a time; an LLM writes narrative and situation reports only from structured outputs, citing evidence IDs.
10. **Validation:** a replay harness with the time fence, using forecasts as they were published (Open-Meteo Historical Forecast API). Metrics: lead time, detection rate, false-alarm rate, Brier score, reliability chart, edge recovery, and **intervention value** (harm reduced vs doing nothing).

## 5. Website information architecture

```
PUBLIC SITE  (persuade / read)
/                     Hero: conventional vs consequence-first warning · live cascade replay · role entry
/how-it-works         Scroll story through the 4 levels + the doc's "Scenario Playground"
                      (hazard × horizon × intervention toggles)
/scenarios            Library: A–E from the doc + gas leak, outbreak, crowd crush, earthquake aftermath
/scenarios/[slug]     Story page with an embedded replay
/trust                Methodology · validation results · data sources (live status) · limitations
/citizen              Explainer + link to the citizen app

OPERATOR APP  (operate)  — shared shell: time cursor · city switcher · role switcher · ⌘K copilot
/app                  CITY PULSE: Cascade-R, city state, active crises, next critical events,
                      decisions due
/app/crises           CRISIS REGISTRY: table and board by type, stage, severity, agency
/app/crises/[id]      CRISIS PAGE: 12-dimension profile, area, timeline, cascade, evidence,
                      actions, history
/app/compound         COMPOUND VIEW: crisis × system grid, interactions, resource contention
/app/explore          CASCADE EXPLORER: synchronised Map + Graph + Inspector workspace
                      (the core screen)
/app/timeline         72-HOUR TIMELINE: Criticality Clock across assets, Respond/Prepare/Plan bands
/app/lab              INTERVENTION LAB: Cascade Breaker, Ghost City compare, side effects,
                      deadlines, equity
/app/evidence         EVIDENCE & SIGNALS: streams, trust, conflicts, report checking,
                      Signal Confidence Radar
/app/replay           REPLAY & VALIDATION: historical replays, metrics, leak counter,
                      edge recovery
/app/redteam          RED TEAM: inject attacks, data blackouts, contradictions
/app/assets/[id]      ASSET PAGE: dependencies up and down, endurance buffers, stress by crisis
/app/zones/[h3]       ZONE PAGE: risk band, who is affected, assets, actions
/app/log              DECISION & EVIDENCE LOG: approvals with reasons, situation reports,
                      CAP alert export

CITIZEN APP  (mobile-first, Marathi / Hindi / English)
/my-area              Area status in plain words, what to do, when it may change
/alerts               Low-noise alerts (Watch Duty-style threshold), until the danger passes
/report               Report with photo and location → enters the trust pipeline
/help                 Nearest open hospital or shelter, safe route
```

**Shared rules:**
- **One selection, synchronised everywhere.** Selecting an asset on the map highlights its graph node, filters the timeline and opens its inspector. The base doc calls this the interaction that makes the product feel cohesive.
- **A global time cursor** that every page follows.
- A shareable link for every crisis, zone, asset and graph link.
- Lifecycle grouping in the navigation (borrowed from CrisisOps): *Respond (0–6 h) · Prepare (6–24 h) · Plan (24–72 h) · Learn*.

## 6. Signature moments (what judges remember)

1. **"What fails next?"** Click a flood zone and the downstream roads, hospitals, substations and neighbourhoods appear, ranked by consequence and confidence.
2. **One selection, four views.** Map, graph, timeline and evidence move together.
3. **Criticality Clock.** Each threatened service shows a time window to its threshold, plus the deadline after which each fix stops working. When the data can't support a countdown, it says "insufficient data".
4. **Break the cascade.** Choose *do nothing / protect the pump station / reroute ambulances*. The **Ghost City** comparison shows the chain breaking, the new risks the action creates, and who pays.
5. **A link gets discovered live.** *"New dependency: Ambazari underpass → +14 min ambulance delay to Zone 22 (40 min lag, confidence 0.83)."*
6. **Two crises collide.** A flood and an industrial fire both need Hospital B and Ambulance Base 2; the compound view shows the combined overload.
7. **Attack it.** A fake water-level spike plus 200 bot reports: trust drops, uncertainty bands widen, and the state stays correct.
8. **Replay with a time fence.** Nagpur, 23 Sept 2023, at 60× speed: when we would have warned vs when it happened, with zero future-data leaks.
9. **The judges' city.** Type a name and the twin builds.

## 7. Component inventory (build once, compose into pages)

| Component | Used on |
|---|---|
| `CityMap` (MapLibre + deck.gl: risk hexes, assets, flood layer, arcs, Ghost City mode) | Pulse, Explore, Crisis, Zone, Lab, Citizen |
| `CascadeGraph` (Cytoscape.js + ELK tiered layout, Smartscape-style tiers) | Explore, Crisis, Asset, Lab |
| `Inspector` (asset/crisis/link panel: upstream and downstream dependencies, state, evidence) | Everywhere |
| `CriticalityClock` (Gantt of P10–P90 time windows, deadline flags, NOW line) | Pulse, Timeline, Crisis, Lab |
| `RiskRibbon` (probability of each of the 4 states over 72 h) | Crisis, Zone, Asset |
| `ProbabilityBand` (P10–P90 and P25–P75 bands with a threshold line) | Asset, Evidence |
| `RiskProfile12` (compact 12-dimension strip) | Crisis, Asset, Zone |
| `EnduranceBar` (buffer remaining: backup hours, battery, beds, oxygen days) | Asset, Pulse |
| `EvidenceCard` + `ProvenanceBadge` | Explore, Evidence, Log |
| `SignalConfidenceRadar` (agreement between independent sources, freshness, trust) | Evidence, Crisis |
| `CrisisCard`, `ScenarioCard` (with chance %) | Registry, Scenarios, Pulse |
| `ImpactMatrix` (crisis × system grid with interaction cells) | Compound |
| `AttributionWaterfall` (what moved this risk) | Crisis, Zone |
| `InterventionCard` + `CompareSlider` (Ghost City) | Lab |
| `TimeCursor` (global), `CommandPalette` (⌘K + copilot) | App shell |
| `AlertComposer` (CAP + trilingual SMS preview) | Log, Citizen |

## 8. Visual direction (finalised in impeccable `init` → new-work)

Every reference is dark neon. Two directions to choose from:

- **A · Civic Atlas (recommended).** The look of a printed city atlas crossed with an engineering drawing:
  - warm paper-white ground, ink-black type, thin rules;
  - a muted cartographic base map;
  - the **only strong colours are the four risk states**;
  - it projects far better on a venue screen than thin neon on black, and looks like nothing else in the room;
  - a true dark "night operations" theme is still available for the full-screen twin.
- **B · Night Operations, restrained.** Deep ink, no glow, no fake HUD, the same discipline of colour only for risk. Safer, but closer to every other team.

**Encoding rules, whichever direction wins:**
- **Colour = risk state only** (NORMAL · WATCH · HIGH RISK · CRITICAL, safe for colour-blind viewers, always paired with a label or shape).
- **Icon/shape = crisis or asset type** (never colour).
- **Line style = provenance:** solid = observed, dashed = forecast, dotted = inferred, faded = stale. The same rule applies to chart lines, graph links and map outlines.
- **Type:** IBM Plex Sans, Plex Mono with tabular figures for numbers, and **Plex Sans Devanagari**, so Marathi and Hindi match the rest of the site.
- **Motion (motion.dev):** only where it means something: propagation pulses, state changes, a card expanding into its page. Respect reduced-motion settings.
- **React Bits:** public pages only (hero, scroll story). Never in the operator app.

## 9. Tech stack and repo

| Layer | Choice (all free) |
|---|---|
| Website | Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, `motion`, React Bits, next-intl |
| Map | MapLibre GL + OpenFreeMap tiles, deck.gl (H3HexagonLayer, ArcLayer, TripsLayer) |
| Graph | Cytoscape.js + cytoscape-elk (tiered layout); react-force-graph optional on the public hero |
| Charts | ECharts or visx |
| State/data | Zustand (selection, time cursor, city, role), TanStack Query, WebSocket |
| Engine | FastAPI, NumPy, networkx, h3-py, OSMnx, pysheds, `river`, DuckDB (+ spatial); PostGIS optional |
| AI | Gemini or Groq free tier: parsing reports, narratives, copilot tools |
| Hosting | Run locally for the demo; Vercel + Render as backup |

```
cascade72/
  apps/web/              Next.js site (public, app, citizen)
  services/engine/       FastAPI: city builder, world simulator, predictor, interventions, replay
  packages/schema/       Pydantic models → OpenAPI → generated TS types (one source of truth)
  scenarios/             Scenario JSON (A–E + extras), historical timelines
  data/                  Pre-fetched Nagpur layers (offline-safe)
  design-system/         ui-ux-pro-max MASTER.md; PRODUCT.md + DESIGN.md from impeccable
  docs/                  This plan
```

**Core schema entities:** `Zone`, `Asset`, `System`, `Crisis`, `Link` (typed), `Observation`, `Forecast`, `Inference`, `Intervention`, `Decision`, `Alert`. Every one carries provenance and timestamps.

## 10. Data plan (Nagpur prototype)

| Real (pre-fetched) | Simulated by the world simulator (calibrated to documented events) |
|---|---|
| Open-Meteo forecasts, ensembles, historical forecasts, river flow (GloFAS) | Drain levels, pump status |
| Open-Meteo / OpenAQ air quality | Power feeder load and outages, substation state |
| OSM roads, hospitals, fire stations, substations, schools, waterways | Traffic speeds, metro/bus status |
| Copernicus elevation (OpenTopography), ESA WorldCover | Hospital census, staff arrival, oxygen and diesel buffers |
| Kontur population (H3), slum or vulnerability proxies | 108/112 calls, ambulance positions |
| OpenCelliD tower locations | Tower battery and connectivity |
| GDELT / ReliefWeb timelines for past events | Citizen reports, including deliberate fakes |
| USGS earthquakes, NASA FIRMS fires (for other scenarios) | Crowd density at events |

Pitch line: *"Real drivers, real geography, simulated telemetry, and a predictor that never sees the simulator's answers."*

## 11. Scenarios and demo script

**Scenario library:**
- From the base doc: A Monsoon cascade · B Heatwave & grid stress · C Hospital access crisis · D Communication blackout · E Competing priorities.
- All-hazard additions: F Industrial gas leak (plume + evacuation side effects) · G Post-flood cholera outbreak (a triggered crisis) · H Festival crowd + rain (compound) · I Earthquake aftermath (the shock is unpredictable; the cascade forecast starts at onset).

**3-minute demo, mapped to the base doc's six hard cases:**

| Time | Beat | Hard case shown |
|---|---|---|
| 0:00 | Hook: conventional vs consequence-first warning, Nagpur 2023 | — |
| 0:25 | City Pulse: WATCH 30 h ahead, Cascade-R climbing | Evolving crisis (6) |
| 0:45 | Click the flood zone: what fails next, synchronised views | Hidden dependency (3) |
| 1:05 | The chain unfolds; pumps lose power, flooding worsens | Feedback loop (1) |
| 1:20 | A metro outage adds to the road closures, ambulances slow down | Failures interact (2) |
| 1:35 | Red team: a fake gauge spike is flagged, forecast vs gauges reconciled | Disagreement (4) |
| 1:55 | Intervention Lab: closing a road reroutes traffic past the hospital; compare 3 options, deadlines, who pays | Side effects (5) |
| 2:25 | Replay metrics: lead time, false alarms, reliability chart, 0 leaks, edges recovered | Validation |
| 2:45 | A second hazard (gas leak) or the judges' city: same engine | Generalisation |

## 12. 24-hour build plan

**Roles:**
- **A** Data & world simulator
- **B** Engine (propagation, discovery, interventions)
- **C** Map + workspace UI
- **D** Graph, timeline, public site, pitch

| Hours | Milestone |
|---|---|
| H0–2 | Run impeccable `init` (PRODUCT.md); persist the ui-ux-pro-max design system; **freeze the schema**; mock-data generator; pre-fetch Nagpur data |
| H2–8 | A: city builder + world simulator (flood + power + roads). B: Monte Carlo propagation on 4 systems. C: app shell, time cursor, `CityMap` on mocks. D: `CascadeGraph`, `CriticalityClock` on mocks |
| H8–14 | A: replay harness + time fence + hazards for scenarios B–E. B: risk states, Cascade-R, discovery, trust layer. C: Explore workspace with synchronised selection, Crisis page. D: Registry, Timeline, evidence components |
| H14–18 | B: interventions + side effects + deadlines. C: Intervention Lab + Ghost City. D: Replay/validation page, Red Team, public home + scroll story |
| H18–21 | Connect end to end over WebSocket; citizen app; LLM narratives; **feature freeze** |
| H21–24 | impeccable critique/audit/polish (one bounded pass) + motion pass; rehearse 3×; backup video; Q&A prep |

**Tiers:**
- **Must:**
  - Pulse, Explore (synchronised workspace), Crisis page, Timeline, Lab + Ghost City, Replay metrics, home page;
  - scenarios A, B, E + one non-weather crisis (F);
  - discovery by live regression only; 2 red-team attacks.
- **Should:** Registry, Compound view, Evidence page, Red Team page, citizen `/my-area` + `/alerts`, Asset and Zone pages, CAP export.
- **Could:** city in a minute, copilot, Hawkes/PCMCI, scenarios G–I, 3D buildings, fingerprint search.

## 13. Judging map

| Requirement or criterion | Where it's shown |
|---|---|
| Multi-horizon, calibrated | Criticality Clock, Risk Ribbon, reliability chart |
| Dependency discovery | Discovery feed, edge-recovery score on Replay |
| Cascade prediction (branching, feedback, interacting) | Explorer branching tree, feedback loop, Compound view |
| Online learning, drift | Forecast narrowing during the replay; drain capacity re-estimated |
| Uncertainty and adversity | Red Team, provenance badges, Signal Confidence Radar |
| Causal explainability | Evidence cards, attribution waterfall, decision log |
| Constrained counterfactual intervention | Intervention Lab, side effects, deadlines, equity |
| Generalisation | Second hazard; city in a minute |
| Temporal validation | Replay with time fence; lead time, false alarms, calibration |
| Base doc: intervention value, robustness, cascade accuracy | Replay page metrics |

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Too many pages for 24 h | Build components first; pages are compositions; tiers above |
| Venue Wi-Fi | Every dataset pre-fetched to `data/`; local LLM fallback; recorded backup video |
| "Your data is synthetic" | Real drivers and geography; hidden-graph benchmark; adapter story |
| Fake precision | Countdowns only when the data supports them; otherwise "insufficient data" |
| Looking like every other dashboard | Civic Atlas direction; one synchronised workspace instead of card soup |

## 15. Skills workflow

1. **impeccable `init`:** product interview → `PRODUCT.md` (users, tone, constraints).
2. **ui-ux-pro-max `--design-system --persist`:** baseline density, accessibility checklist. *Replace its suggested generic blue/amber palette with the risk-only colour rule.*
3. **impeccable new-work:** pick Civic Atlas or Night Ops → `DESIGN.md`, tokens.
4. Build with **React Bits** (public pages) and **motion.dev** (transitions) once those MCP servers are connected.
5. **impeccable critique → audit → polish** + detector, one bounded pass at H21.
6. The "taste" skill is **not installed** yet; add it to use it.

---

## Sources

- Problem statement: CASCADE '26 Themes & Problem Statements, p.7
- Team base doc: `THE 72 HOURS base.pdf` (stakeholders, taxonomy, hard cases, scenarios, references pp.29–45)
- [Palantir Foundry Vertex overview](https://www.palantir.com/docs/foundry/vertex/overview) · [Vertex scenarios](https://palantir.com/docs/foundry/vertex/scenarios-overview/)
- [Dynatrace Smartscape docs](https://docs.dynatrace.com/docs/platform/smartscape) · [Smartscape on Grail](https://docs.dynatrace.com/docs/analyze-explore-automate/smartscape/smartscape-views/smartscape-on-grail-view)
- [CReDo — Connected Places Catapult](https://cp.catapult.org.uk/project/climate-resilience-demonstrator-credo/) · [Digital Twin Hub](https://digitaltwinhub.co.uk/?p=3490) · [STFC Hartree report](https://www.hartree.stfc.ac.uk/wp-content/uploads/2022/08/How-digital-twins-can-enhance-climate-resilience-CReDo.pdf)
- [Watch Duty — about](https://watchduty.org/about) · [App Store listing](https://apps.apple.com/app/id1574452924)
- [NERV Disaster Prevention — App Store](https://apps.apple.com/us/app/nerv-disaster-prevention/id1472338480)
- [Fraunhofer co-simulation of critical infrastructure (Springer 2025)](https://link.springer.com/article/10.1007/s10669-025-10035-0) · [City-scale flood digital twin (Univ. of Iowa)](https://iro.uiowa.edu/esploro/outputs/journalArticle/City-scale-digital-twin-framework-for-flood/9985015823102771) · [Emergencity: digital twins for critical infrastructure](https://www.emergencity.de/news/digital-twins-for-more-resilient-critical-infrastructures/)
