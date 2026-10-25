# Product

<!-- impeccable:product-schema 1 -->

> Written from the user's explicit brief across the planning sessions (25 Oct 2026) without a separate interview round; the user asked to skip further questions and build. Facts marked *(inferred)* were not stated verbatim.

## Platform

web

## Stack

delegated: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui for the website, Motion (motion.dev) for animation, React Bits for public-page components, MapLibre + deck.gl for the map, Cytoscape.js for the dependency graph; Python FastAPI engine. Chosen in docs/PROTOTYPE_PLAN.md and not objected to.

## Users

- **Primary:** a city emergency operations centre / municipal disaster-management cell (duty officer, commissioner, district collector) deciding where to send limited resources before a disruption becomes a crisis.
- **Operational partners:** hospital administrators, utility operators (power, water, drainage, telecom), traffic police and transport authorities, 108/112 dispatch. Each needs the slice of the cascade that reaches their assets.
- **Beneficiaries:** residents, especially vulnerable groups (low-lying settlements, elderly, people with disabilities, daily-wage workers, people on regular treatment), who need plain, local, trilingual guidance.
- **Evaluators right now:** CASCADE '26 hackathon judges at IIIT Nagpur, watching a live demo on a projector.

## Product Purpose

Predict how one urban disruption propagates across interdependent city systems up to 72 hours ahead, and show what to do now to break the chain. It answers one question: *what is likely to fail next, what will that failure affect, and what can we do now to prevent the cascade?* Success means a decision-maker acts earlier on a smaller problem, with evidence they can defend.

## Positioning

Consequence-first, not hazard-first. Competing tools show where the hazard is (rain, flood polygons, outages). This product shows the predicted chain of failures with probabilities and time windows, discovers dependencies from data instead of assuming them, compares interventions with their side effects and deadlines, and keeps every crisis distinct while modelling how crises interact. All-hazard: floods, heat, grid failure, telecom blackout, hospital access, gas leaks, outbreaks, crowd crushes, compound crises.

## Operating Context

- Control-room use under time pressure, often at night, on large shared screens and laptops *(inferred)*; partners open deep links to a single crisis or asset.
- Data is heterogeneous, late, missing, contradictory and sometimes malicious. Every item carries a timestamp, source, reliability, and whether it is an observation, forecast, report or inference.
- Prototype city: Nagpur. Prototype data: real drivers and geography (weather, terrain, roads, facilities, population) plus simulated city telemetry from a hidden world simulator the predictor never sees.
- Four risk states, per zone and city-wide: NORMAL · WATCH · HIGH RISK · CRITICAL, defined by transparent, hazard-specific rules.
- Three horizon bands: 0–6 h respond, 6–24 h prepare, 24–72 h plan.

## Capabilities and Constraints

- Multi-horizon calibrated forecasts with time-to-critical windows; dependency discovery; cascade prediction with branching, feedback and interacting cascades; online updating; adversarial-input handling; causal explanation with evidence per link; constrained counterfactual interventions with side effects; generalisation to an unseen city; temporal validation by replay with strict future-data isolation.
- Human in the loop: the system proposes; authorised people decide. Nothing auto-dispatches.
- Free and open-source tools only.
- Built in a 24-hour hackathon by a 3–4 person team.
- Countdowns appear only when data supports them; otherwise "insufficient data".

## Brand Commitments

- Working name **CASCADE 72** (alternatives PRAHARI-72, DOMINO; undecided).
- Visual direction pinned by the user: **Civic Atlas (light)**, with a dark night mode reserved for the full-screen twin.
- Languages: English, Hindi, Marathi for citizen-facing text.

## Evidence on Hand

- Problem statement: CASCADE '26 Theme 2 Problem 2 (C:/Users/jeeve/Downloads/CASCADE26_Problem_Statements_Reflowed.pdf, p.7).
- Team research doc: C:/Users/jeeve/Downloads/THE 72 HOURS base.pdf.
- Plan: docs/PROTOTYPE_PLAN.md.
- No real customers, deployments, partner agencies, testimonials or accuracy figures exist. Validation numbers must come from the replay harness, and synthetic data must be labelled as synthetic.

## Product Principles

1. Consequences before hazards: lead with what fails next and who it reaches.
2. Every claim carries its evidence, its provenance and its uncertainty.
3. Propose, never impose: options, trade-offs and deadlines for a human to decide.
4. Each crisis keeps its identity; interactions between crises are first-class.
5. Honest about data: observed, forecast, reported and inferred are never blurred.

## Accessibility & Inclusion

Colour-blind-safe risk encoding always paired with text or shape; WCAG AA contrast; keyboard operable; reduced-motion respected; citizen view in English, Hindi and Marathi with large, clear type.
