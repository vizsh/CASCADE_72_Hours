"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { useCity, usePayload, useScenarios, useSession, useTimeline, type City, type Payload, type Scenario, type TimelineRow } from "@/lib/api";
import { useStore } from "@/lib/store";

type Ctx = {
  sid: string;
  scenario?: Scenario;
  scenarios: Scenario[];
  city?: City;
  hour: number;
  payload?: Payload;
  loading: boolean;
  timeline: TimelineRow[];
  readyHours: number;
  whatIfReady: number;
  error?: string;
};

const ScenarioCtx = createContext<Ctx | null>(null);

export function ScenarioProvider({ sid, children }: { sid: string; children: React.ReactNode }) {
  const scenarios = useScenarios();
  const scenario = scenarios.data?.find((s) => s.id === sid);
  const city = useCity(scenario?.city);
  const session = useSession(sid);
  const hourState = useStore((s) => s.hour);
  const setHour = useStore((s) => s.setHour);
  const select = useStore((s) => s.select);

  useEffect(() => {
    if (scenario) {
      const fromUrl = new URLSearchParams(window.location.search).get("t");
      setHour(fromUrl !== null ? Math.min(scenario.hours - 1, Math.max(0, Number(fromUrl))) : scenario.now);
      select(null);
    }
  }, [scenario, setHour, select]);

  const hour = hourState ?? scenario?.now ?? 0;
  const payload = usePayload(sid, hour);
  const timeline = useTimeline(sid);

  useEffect(() => {
    if (hourState == null) return;
    const url = new URL(window.location.href);
    url.searchParams.set("t", String(hourState));
    window.history.replaceState(null, "", url.toString());
  }, [hourState]);

  const value = useMemo<Ctx>(
    () => ({
      sid,
      scenario,
      scenarios: scenarios.data ?? [],
      city: city.data,
      hour,
      payload: payload.data,
      loading: payload.isFetching,
      timeline: timeline.data?.rows ?? [],
      readyHours: session.data?.ready_hours ?? 0,
      whatIfReady: session.data?.whatif_ready_hours ?? 0,
      error: (scenarios.error || city.error || payload.error)?.toString(),
    }),
    [sid, scenario, scenarios.data, city.data, hour, payload.data, payload.isFetching, timeline.data, session.data, scenarios.error, city.error, payload.error],
  );
  return <ScenarioCtx.Provider value={value}>{children}</ScenarioCtx.Provider>;
}

export function useScenario() {
  const ctx = useContext(ScenarioCtx);
  if (!ctx) throw new Error("useScenario outside ScenarioProvider");
  return ctx;
}
