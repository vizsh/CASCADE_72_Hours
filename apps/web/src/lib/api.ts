"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:8072";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${ENGINE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${ENGINE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

// ---------------------------------------------------------------- types
export type Zone = {
  id: string;
  idx: number;
  lat: number;
  lon: number;
  elev: number;
  hand: number;
  pop: number;
  vuln: number;
  built: number;
  locality: string;
  lake: boolean;
  river: boolean;
  road_class: string;
  cross_min: number;
  flow_to: number;
};

export type Asset = {
  id: string;
  kind: AssetKind;
  name: string;
  lat: number;
  lon: number;
  zone: number;
  attrs: Record<string, number | string | boolean>;
  provenance: "osm" | "synthetic";
};

export type AssetKind =
  | "hospital"
  | "substation"
  | "pump"
  | "tower"
  | "metro"
  | "water"
  | "underpass"
  | "lake"
  | "shelter"
  | "fuel"
  | "fire_station";

export type City = {
  slug: string;
  name: string;
  center: [number, number];
  zones: Zone[];
  assets: Asset[];
  power_candidates: Record<string, string[]>;
  population: number;
  layers: {
    roads: { c: string; n: string; g: [number, number][] }[];
    rivers: { m: boolean; n: string; g: [number, number][] }[];
    lakes: { n: string; g: [number, number][] }[];
    contours: { e: number; g: [number, number][] }[];
  };
};

export type Scenario = {
  id: string;
  title: string;
  short: string;
  hazards: string[];
  city: string;
  start: string;
  hours: number;
  now: number;
  summary: string;
  provenance: Record<string, string>;
  events: { type: string; hour: number; duration?: number; label: string }[];
  adversarial: { type: string; hour: number; label: string }[];
};

export type EventKind =
  | "hazard_rain"
  | "hazard_heat"
  | "hazard_crowd"
  | "hazard_plume"
  | "hazard_grid"
  | "lake_overflow"
  | "zone_flood"
  | "underpass_flooded"
  | "substation_down"
  | "pump_unpowered"
  | "tower_dead"
  | "metro_closed"
  | "water_out"
  | "zone_ems"
  | "zone_isolated"
  | "hospital_generator"
  | "hospital_access"
  | "hospital_overload"
  | "hospital_blackout";

export type CascadeEvent = {
  id: string;
  kind: EventKind;
  system: string;
  asset: string | null;
  zone: string;
  zone_idx: number;
  name: string;
  label: string;
  lat: number;
  lon: number;
  p: number;
  p24: number;
  p6: number;
  p_occurred: number;
  t10: number | null;
  t50: number | null;
  t90: number | null;
  weight: number;
  score: number;
};

export type Link = {
  from: string;
  to: string;
  rule: "physical" | "learned" | "feedback" | "interaction";
  why: string;
  p_given: number;
  lift: number;
  lag_h: number | null;
};

export type Sensor = {
  id: string;
  kind: string;
  name: string;
  zone: string;
  series: [number, number][];
  trust: number;
  last_known: number;
};

export type Cluster = {
  t: number;
  zone: string;
  locality: string;
  n: number;
  devices: number;
  new_accounts: number;
  duplicate_text: number;
  hazard: string;
  credibility: number;
  coordinated: boolean;
  sample: string;
  planted: boolean;
};

export type Dependency = {
  consumer: string;
  name: string;
  kind: string;
  candidates: string[];
  posterior: number[];
  evidence: { t: number; status: string; supply_up: Record<string, number>; posterior: Record<string, number> }[];
};

export type Discovery = {
  t: number;
  consumer: string;
  consumer_name: string;
  kind: string;
  supplier: string;
  supplier_name: string;
  confidence: number;
  nearest: boolean;
};

export type Obs = {
  id: string;
  source: string;
  kind: string;
  target: string;
  zone: string | null;
  valid: number;
  known: number;
  value: number;
  text: string;
  meta: Record<string, unknown>;
};

export type Payload = {
  scenario: string;
  now: number;
  time: string;
  city_state: number;
  city_state_name: string;
  cascade_r: number[];
  series: { hi_q: number[][]; counts: number[][]; pop_high: number[] };
  zones: {
    state: number[];
    p_now_crit: number[];
    p_crit3: number[];
    p_crit24: number[];
    p_crit72: number[];
    p_high6: number[];
    p_high24: number[];
    p_high72: number[];
    horizons: Record<string, [number[], number[], number[]]>;
    ttc: Record<string, [number, number, number]>;
    person_hours: number[];
  };
  events: CascadeEvent[];
  links: Link[];
  course: string[];
  branches: { sequence: string[]; p: number }[];
  dependencies: Dependency[];
  discoveries: Discovery[];
  trust: Record<string, number>;
  clusters: Cluster[];
  weather: { rain_q: number[][]; temp_q: number[][]; members: number };
  sensors: Sensor[];
  alarms: Obs[];
  fence: { observations_used: number; withheld_not_yet_arrived: number; future_reads: number };
  truth: { state: number[]; depth: number[] } | null;
  live?: { current: Record<string, number | string>; timezone: string; model: string; issued: string };
};

export type TimelineRow = {
  hour: number;
  time: string;
  city_state: number;
  r: number;
  high: number;
  crit: number;
  watch: number;
  truth_crit: number | null;
  rain: number;
  temp: number;
};

export type Action = {
  id: string;
  kind: string;
  label: string;
  target: string;
  target_name: string;
  resource: string;
  units: number;
  start: number;
  why: string;
};

export type Metrics = {
  person_hours_high: number;
  p_city_critical: number;
  hospital_failures: number;
  zones_flooded: number;
  zones_ems: number;
  ems_vulnerable_min: number;
};

export type Evaluation = {
  now: number;
  actions: Action[];
  baseline: Metrics;
  with: Metrics;
  delta: Metrics;
  broken_links: { id: string; label: string; before: number; after: number }[];
  side_effects: {
    zones_worse: { zone: string; name: string; person_hours: number }[];
    zones_better: { zone: string; name: string; person_hours: number }[];
    congested_zones: { zone: string; name: string; added_delay_pct: number }[];
  };
  equity_share_vulnerable: number;
  resources: Record<string, { used: number; total: number; label: string }>;
  zone_delta: number[];
};

export type Optimisation = {
  now: number;
  candidates: { action: Action; benefit: number; delta: Metrics; broken_links: Evaluation["broken_links"]; side_effects: Evaluation["side_effects"] }[];
  portfolios: { ids: string[]; benefit: number; result: Evaluation }[];
  resources: Record<string, { label: string; total: number }>;
};

export type Deadline = {
  action: Action;
  curve: { start_in_h: number; benefit: number; delta: Metrics }[];
  latest_useful_start_h: number | null;
  max_benefit: number;
};

export type Validation = {
  pending?: boolean;
  scenario: string;
  issuances: number;
  calibration: {
    brier: number | null;
    brier_climatology: number | null;
    skill: number | null;
    reliability: { bin: number; predicted: number; observed: number; n: number }[];
    n: number;
  };
  warnings: {
    false_alarm_ratio: number | null;
    probability_of_detection: number | null;
    episodes: number;
    median_lead_h: number | null;
    lead_hours: number[];
  };
  asset_leads: { kind: string; index: number; event_hour: number; warned_hour: number; lead_h: number }[];
  dependencies: {
    consumers: number;
    with_evidence: number;
    confident: number;
    confident_correct: number;
    hidden_links_total: number;
    hidden_links_found: number;
    precision_hidden: number | null;
    recall_hidden: number | null;
  };
  adversarial: { label: string; hour: number; source?: string; trust_now?: number; trust_min?: number; clusters?: number; max_credibility?: number; flagged_coordinated?: boolean }[];
  fence: { future_reads: number; withheld_total: number; rule: string };
};

// ---------------------------------------------------------------- hooks
export function useScenarios() {
  return useQuery({ queryKey: ["scenarios"], queryFn: () => get<Scenario[]>("/api/scenarios") });
}

export function useCity(slug: string | undefined) {
  return useQuery({ queryKey: ["city", slug], queryFn: () => get<City>(`/api/city/${slug}`), enabled: !!slug });
}

export function useSession(sid: string) {
  return useQuery({
    queryKey: ["session", sid],
    queryFn: () => post<{ ready_hours: number; hours: number; whatif_ready_hours: number }>(`/api/session/${sid}`),
    refetchInterval: (q) => (q.state.data && q.state.data.whatif_ready_hours >= q.state.data.hours ? false : 4000),
    staleTime: 0,
  });
}

export function usePayload(sid: string, hour: number) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["payload", sid, hour],
    queryFn: () => get<Payload>(`/api/session/${sid}/at/${hour}`),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    for (const h of [hour + 1, hour - 1, hour + 2]) {
      if (h < 0) continue;
      qc.prefetchQuery({ queryKey: ["payload", sid, h], queryFn: () => get<Payload>(`/api/session/${sid}/at/${h}`) });
    }
  }, [qc, sid, hour]);
  return q;
}

export function useTimeline(sid: string) {
  return useQuery({
    queryKey: ["timeline", sid],
    queryFn: () => get<{ hours: number; ready: number; rows: TimelineRow[] }>(`/api/session/${sid}/timeline`),
    refetchInterval: (q) => (q.state.data && q.state.data.ready >= q.state.data.hours ? false : 5000),
    staleTime: 0,
  });
}

export function useActions(sid: string, hour: number) {
  return useQuery({
    queryKey: ["actions", sid, hour],
    queryFn: () => get<{ actions: Action[]; resources: Record<string, { label: string; total: number }> }>(`/api/session/${sid}/actions/${hour}`),
  });
}

export function useEvaluate(sid: string) {
  return useMutation({
    mutationFn: (body: { hour: number; actions: string[]; starts?: Record<string, number> }) =>
      post<Evaluation>(`/api/session/${sid}/evaluate`, body),
  });
}

export function useOptimise(sid: string) {
  return useMutation({ mutationFn: (hour: number) => post<Optimisation>(`/api/session/${sid}/optimize`, { hour }) });
}

export function useDeadline(sid: string) {
  return useMutation({
    mutationFn: (body: { hour: number; action: string }) => post<Deadline>(`/api/session/${sid}/deadline`, body),
  });
}

export function useValidation(sid: string) {
  return useQuery({
    queryKey: ["validation", sid],
    queryFn: () => get<Validation>(`/api/session/${sid}/validation`),
    refetchInterval: (q) => (q.state.data?.pending ? 8000 : false),
    staleTime: 0,
  });
}

export function useObservations(sid: string, hour: number, kind?: string) {
  return useQuery({
    queryKey: ["obs", sid, hour, kind],
    queryFn: () => get<Obs[]>(`/api/session/${sid}/observations/${hour}${kind ? `?kind=${kind}` : ""}`),
  });
}

export function useLive(slug: string) {
  return useQuery({ queryKey: ["live", slug], queryFn: () => get<Payload>(`/api/live/${slug}`), staleTime: 30 * 60_000 });
}
