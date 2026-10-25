"use client";

import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { ShieldAlert } from "lucide-react";
import { useScenario } from "@/components/app/ScenarioProvider";
import { ProbBar, SectionTitle, Skeleton } from "@/components/app/bits";
import type { Sensor } from "@/lib/api";
import { pct } from "@/lib/risk";
import { cn } from "@/lib/utils";
import { EngineDown } from "../CommandView";

const KIND_LABEL: Record<string, string> = { rain: "Rain gauges (mm/h)", water_level: "Water-level sensors (m)", lake_level: "Lake level vs crest (mm)", temp: "Temperature (°C)" };

export default function EvidencePage() {
  const { payload, city, error, hour } = useScenario();
  if (error) return <EngineDown error={error} />;
  if (!payload || !city) return <Skeleton className="h-full rounded-none" />;
  const kinds = ["rain", "water_level", "lake_level", "temp"].filter((k) => payload.sensors.some((s) => s.kind === k));
  const names = new Map(city.assets.map((a) => [a.id, a.name]));
  const clusters = [...payload.clusters].sort((a, b) => b.n - a.n).slice(0, 14);
  const lowTrust = Object.entries(payload.trust).filter(([, v]) => v < 0.7).sort((a, b) => a[1] - b[1]);

  return (
    <div className="grid h-full grid-cols-[1.25fr_1fr] overflow-hidden">
      <div className="min-h-0 space-y-6 overflow-y-auto border-r border-rule p-5">
        <div className="grid grid-cols-3 gap-4 rounded-sm border border-rule-strong bg-paper-raised p-4">
          <Fence label="Observations used" value={payload.fence.observations_used.toLocaleString()} />
          <Fence label="Sent but not yet arrived" value={payload.fence.withheld_not_yet_arrived.toLocaleString()} note="delayed telemetry the forecast could not see" />
          <Fence label="Reads from the future" value="0" note="every input has arrival time ≤ now" />
        </div>
        {lowTrust.length ? (
          <section>
            <SectionTitle>Sources the system has stopped believing</SectionTitle>
            <ul className="mt-2 divide-y divide-rule rounded-sm border border-rule bg-paper-raised">
              {lowTrust.map(([k, v]) => {
                const s = payload.sensors.find((x) => x.id === k);
                return (
                  <li key={k} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                    <span className="flex items-center gap-2">
                      <ShieldAlert size={14} className="text-critical-ink" />
                      <span className="font-semibold">{s?.name ?? k}</span>
                      <span className="text-ink-3">{k}</span>
                    </span>
                    <ProbBar p={v} state={v < 0.4 ? 3 : 2} width={70} />
                  </li>
                );
              })}
            </ul>
            <p className="mt-1.5 text-[11.5px] text-ink-3">
              Trust falls when a source disagrees with physics or with independent sources (a gauge reading zero while others see a storm, deep water on a hilltop). Low-trust
              sources still arrive; they just move the forecast less.
            </p>
          </section>
        ) : null}
        {kinds.map((k) => (
          <section key={k}>
            <SectionTitle aside="last 24 h · line weight = trust">{KIND_LABEL[k]}</SectionTitle>
            <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-3 xl:grid-cols-3">
              {payload.sensors
                .filter((s) => s.kind === k)
                .slice(0, 12)
                .map((s) => (
                  <SensorTile key={s.id} s={s} hour={hour} />
                ))}
            </div>
          </section>
        ))}
      </div>
      <div className="min-h-0 space-y-6 overflow-y-auto p-5">
        <section>
          <SectionTitle aside="last 12 h">Citizen reports, clustered</SectionTitle>
          {clusters.length ? (
            <ul className="mt-2 space-y-2">
              {clusters.map((c, i) => (
                <li key={i} className={cn("rounded-sm border bg-paper-raised p-2.5 text-[12.5px]", c.coordinated ? "border-critical" : "border-rule")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {c.locality} · {c.n} report{c.n > 1 ? "s" : ""} · {c.devices} device{c.devices > 1 ? "s" : ""}
                    </span>
                    <ProbBar p={c.credibility} width={50} state={c.credibility < 0.3 ? 3 : 0} />
                  </div>
                  <p className="mt-1 text-ink-2">“{c.sample}”</p>
                  <p className="mt-1 text-[11px] text-ink-3">
                    {pct(c.new_accounts)} new accounts · {pct(c.duplicate_text)} duplicate text · hazard: {c.hazard}
                    {c.coordinated ? <span className="ml-1 font-semibold text-critical-ink">· flagged as coordinated, weight near zero</span> : null}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12.5px] text-ink-3">No citizen reports in the last 12 hours.</p>
          )}
        </section>
        <section>
          <SectionTitle>Dependencies discovered from data</SectionTitle>
          {payload.discoveries.length ? (
            <ul className="mt-2 space-y-1.5 text-[12.5px]">
              {payload.discoveries.slice(-12).reverse().map((d, i) => (
                <li key={i} className="rounded-sm border border-rule bg-paper-raised px-2.5 py-2">
                  <span className="font-semibold">{d.consumer_name}</span> is fed by <span className="font-semibold">{d.supplier_name}</span>
                  <span className="ml-1 text-ink-3">
                    ({pct(d.confidence)}{d.nearest ? ", confirms the nearest-feeder assumption" : ", not the nearest substation"})
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12.5px] text-ink-3">
              No outages yet to learn from. The feeder of each hospital, pump, tower and metro station is still the prior: nearest substation, 62%.
            </p>
          )}
          {payload.dependencies.length ? (
            <p className="mt-2 text-[11.5px] text-ink-3">{payload.dependencies.length} assets have moved away from their prior so far.</p>
          ) : null}
        </section>
        <section>
          <SectionTitle>Operational alarms</SectionTitle>
          <ul className="mt-2 divide-y divide-rule text-[12.5px]">
            {payload.alarms.slice(0, 14).map((a) => (
              <li key={a.id} className="flex justify-between gap-2 py-1.5">
                <span className="truncate">
                  {a.kind === "substation" ? "Substation lost supply" : a.kind === "tower_mains" ? "Mobile site on battery" : a.kind === "hospital_power" ? "Hospital on backup power" : a.kind === "metro_status" ? "Metro station closed" : "Pump without power"}
                  : {names.get(a.target) ?? a.target}
                </span>
                <span className="shrink-0 text-ink-3 tabular">h{a.valid}{a.known > a.valid ? ` (arrived h${a.known})` : ""}</span>
              </li>
            ))}
            {!payload.alarms.length ? <li className="py-1.5 text-ink-3">No alarms.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Fence({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-2xl font-bold tabular">{value}</div>
      {note ? <div className="text-[11px] text-ink-3">{note}</div> : null}
    </div>
  );
}

function SensorTile({ s, hour }: { s: Sensor; hour: number }) {
  const w = 200;
  const h = 46;
  const xs = s.series.map((d) => d[0]);
  const x = scaleLinear().domain([Math.min(hour - 24, ...xs), hour]).range([0, w]);
  const vals = s.series.map((d) => d[1]);
  const y = scaleLinear().domain([Math.min(0, ...vals), Math.max(1, ...vals)]).range([h - 2, 2]);
  const path = line<[number, number]>().x((d) => x(d[0])).y((d) => y(d[1]))(s.series) ?? "";
  const last = s.series.at(-1)?.[1];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="truncate font-semibold">{s.name}</span>
        <span className={cn("tabular", s.trust < 0.6 ? "font-semibold text-critical-ink" : "text-ink-3")}>trust {pct(s.trust)}</span>
      </div>
      <svg width={w} height={h} className="mt-0.5 block">
        <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--rule)" />
        <path d={path} fill="none" stroke={s.trust < 0.6 ? "var(--risk-critical)" : "var(--ink)"} strokeWidth={0.6 + 1.6 * s.trust} />
      </svg>
      <div className="text-[11px] text-ink-3 tabular">now {last != null ? last.toFixed(1) : "—"}</div>
    </div>
  );
}
