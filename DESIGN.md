# Design system: Civic Atlas

Survey-map cartography for an operations room. A printed city atlas crossed with orienteering notation: the predicted cascade is the course, drawn in one reserved ink over the city.

*Written by hand from the built world (`apps/web/src/app/globals.css`, `components/atlas/*`, `components/app/*`). impeccable's shipped documenter agent was not available in this session.*

## Colour

Colour is a scarce resource. It encodes risk state, the predicted course and water, and nothing else.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#f2f3ee` | page and map ground (cool survey white, not cream) |
| `--paper-raised` | `#fafaf7` | panels, sheets, inputs |
| `--paper-sunk` | `#e8eae3` | wells, alternate lanes, skeletons |
| `--ink` | `#15171a` | text, primary buttons, major roads |
| `--ink-2` / `--ink-3` | `#3a3f45` / `#5c636a` | secondary and tertiary text (both pass AA on paper) |
| `--rule` / `--rule-strong` | `#d3d6cd` / `#a9aea4` | hairlines and borders |
| `--contour` | `#a8693b` | 5 m contours from real elevation |
| `--water` / `--water-fill` | `#2c78b5` / `#d3e4f0` | rivers, lakes, pumps |
| `--course` | `#8e2a8b` | **reserved** for the predicted course, focus rings and selection |
| `--risk-watch` / `-ink` | `#c99a0e` / `#775a00` | WATCH |
| `--risk-high` / `-ink` | `#db5a0b` / `#9c3f00` | HIGH RISK |
| `--risk-critical` / `-ink` | `#b4121d` / `#9e0f19` | CRITICAL |

Rules:
- Risk colour never appears alone. It always comes with the state word and a glyph whose fill grows with severity: open circle, open triangle, filled triangle, filled square.
- Crisis and asset *type* is encoded by symbol shape, never by colour.
- Map fills are translucent (WATCH 62, HIGH 120, CRITICAL 175 alpha). Roads, rivers and lakes are drawn above them.

## Line style = provenance

| Style | Meaning |
|---|---|
| solid | observed (truth series, sensor history, course legs) |
| dashed | forecast mechanism, forecast medians |
| dotted | inferred or learned from data (discovered feeder links) |
| red | feedback loop |

## Type

- **Archivo** (variable `wdth` axis) for everything. Condensed (`wdth 72`) for display and the wordmark, semi (`86`) for small caps labels, regular for UI and body.
- **Mukta** for Devanagari on the citizen view.
- Tabular, lining figures everywhere (`font-feature-settings: "tnum", "lnum"`).
- Section labels: 13 px bold uppercase, +0.06 em tracking. No eyebrows above headings.

## Notation

- **Course:** a start triangle at the hazard root, numbered control circles for each failure (filled once it is already happening), a double circle at the finish, and legs in course ink.
- **Control description sheet:** the same numbers in the same order, with system, what fails, P10–P90 clock window, probability, and the mechanism on the leg into it.
- **Asset symbols:** single-weight survey glyphs:
  - hospital: square with cross;
  - substation: triangle with bolt;
  - pump: water ring;
  - mobile site: mast;
  - metro: rounded M;
  - underpass: tunnel brackets;
  - ambulance base: diamond;
  - lake: waves;
  - shelter: house;
  - fuel: pump.
- **Swimlane graph:** one lane per system and a piecewise time axis (the next 12 h take half the width). Node shape follows the system and size follows probability.

## Components

`StateChip`, `StateGlyph`, `ProbBar`, `ControlNumber`, `ControlSheet`, `Inspector`, `RiskRibbon`, `CascadeRChart`, `CascadeGraph`, `TimeCursor`, `Legend`, `AtlasMap`. Shape language: 2–4 px radii, hairline rules, no shadows except one soft shadow on floating sheets over the map.

## Motion

Motion is used only where it means something:
- state chips settle when the state changes;
- course rows stagger in on a new issuance;
- the inspector slides in from the side it replaces;
- graph nodes spring to their new times.

Transitions take 180–300 ms with exponential ease-out, and everything respects `prefers-reduced-motion`. React Bits (`CountUp`) appears only on the public landing page.
