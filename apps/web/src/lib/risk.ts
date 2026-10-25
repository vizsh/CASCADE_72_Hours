import type { EventKind } from "./api";

export const STATES = ["NORMAL", "WATCH", "HIGH RISK", "CRITICAL"] as const;

/** Fill colours for maps and marks. Never use alone: pair with a label or shape. */
export const STATE_FILL = ["#6f8f7e", "#c99a0e", "#db5a0b", "#b4121d"];
/** Text colours that pass contrast on the paper ground. */
export const STATE_INK = ["#3e5c4f", "#775a00", "#9c3f00", "#9e0f19"];
export const STATE_RGB: [number, number, number][] = [
  [111, 143, 126],
  [201, 154, 14],
  [219, 90, 11],
  [180, 18, 29],
];
export const COURSE = "#8e2a8b";
export const COURSE_RGB: [number, number, number] = [142, 42, 139];

export const SYSTEMS: Record<string, { label: string; order: number }> = {
  hazard: { label: "Hazard", order: 0 },
  water: { label: "Water & drainage", order: 1 },
  mobility: { label: "Roads", order: 2 },
  power: { label: "Power", order: 3 },
  telecom: { label: "Telecom", order: 4 },
  transit: { label: "Transit", order: 5 },
  utilities: { label: "Water supply", order: 6 },
  ems: { label: "Ambulances", order: 7 },
  health: { label: "Hospitals", order: 8 },
};

export const KIND_SHORT: Record<EventKind, string> = {
  hazard_rain: "Extreme rain",
  hazard_heat: "Extreme heat",
  hazard_crowd: "Crowd surge",
  hazard_plume: "Toxic release",
  hazard_grid: "Grid fault",
  lake_overflow: "Lake overflow",
  zone_flood: "Flooding",
  underpass_flooded: "Underpass shut",
  substation_down: "Substation out",
  pump_unpowered: "Pump unpowered",
  tower_dead: "Mobile site down",
  metro_closed: "Metro closed",
  water_out: "Water supply lost",
  zone_ems: "Ambulance delay",
  zone_isolated: "Area cut off",
  hospital_generator: "On generator",
  hospital_access: "Staff can't reach",
  hospital_overload: "Over capacity",
  hospital_blackout: "Backup exhausted",
};

export const RULE_LABEL: Record<string, string> = {
  physical: "Physical link",
  learned: "Discovered from data",
  feedback: "Feedback loop",
  interaction: "Interacting failures",
};

export function clock(iso: string, plusHours = 0): string {
  const d = new Date(iso);
  d.setHours(d.getHours() + plusHours);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function dayClock(iso: string, plusHours = 0): string {
  const d = new Date(iso);
  d.setHours(d.getHours() + plusHours);
  return d.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function timeWindow(iso: string, t10: number | null, t90: number | null): string {
  if (t10 == null || t90 == null) return "insufficient data";
  if (t90 - t10 < 1) return clock(iso, t10);
  return `${clock(iso, t10)}–${clock(iso, t90)}`;
}

export function inHours(t: number | null): string {
  if (t == null) return "—";
  if (t < 1) return "now";
  if (t < 24) return `in ${Math.round(t)} h`;
  return `in ${(t / 24).toFixed(1)} d`;
}

export function pct(p: number, digits = 0): string {
  return `${(p * 100).toFixed(digits)}%`;
}

export function compact(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return `${Math.round(n)}`;
}
