"use client";

import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ControlSheet } from "@/components/app/ControlSheet";
import { MapClient } from "@/components/app/MapClient";
import { SectionTitle, StateChip } from "@/components/app/bits";
import { SiteHeader } from "@/components/site/SiteChrome";
import { ENGINE, useCity, useLive } from "@/lib/api";
import { STATES, clock } from "@/lib/risk";
import { useSize } from "@/lib/useSize";

export default function LivePage() {
  const [slug, setSlug] = useState("nagpur");
  const city = useCity(slug);
  const live = useLive(slug);
  const p = live.data;
  const counts = p ? [0, 1, 2, 3].map((s) => p.zones.state.filter((x) => x === s).length) : [];
  const cur = p?.live?.current as Record<string, number> | undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-[1320px] flex-1 gap-6 px-5 py-6 lg:grid-cols-[1fr_400px]">
        <section className="flex min-h-[560px] flex-col">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[30px] font-extrabold leading-tight tracking-tight wdth-condensed">Live: {city.data?.name ?? slug}, next 72 hours</h1>
              <p className="text-[13px] text-ink-3">
                {p?.live ? `Issued ${new Date(p.live.issued).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })} · ${p.live.model} · no simulated telemetry` : "Fetching the real ensemble forecast…"}
              </p>
            </div>
            {cur ? (
              <div className="flex gap-5 text-[13px]">
                <Cur label="Temperature" value={`${cur.temperature_2m?.toFixed?.(1) ?? cur.temperature_2m} °C`} />
                <Cur label="Rain now" value={`${cur.precipitation ?? 0} mm`} />
                <Cur label="Wind" value={`${cur.wind_speed_10m ?? "—"} km/h`} />
              </div>
            ) : null}
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-sm border border-rule-strong">
            {city.data && p ? (
              <MapClient key={slug} city={city.data} payload={p} />
            ) : (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-2">
                <Loader2 size={16} className="animate-spin" /> Running the ensemble over {slug}…
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          {p ? (
            <>
              <div>
                <SectionTitle>City state</SectionTitle>
                <div className="mt-2 flex items-center gap-3">
                  <StateChip state={p.city_state} size="lg" />
                </div>
                <ul className="mt-3 grid grid-cols-4 gap-2 text-center text-[11.5px]">
                  {counts.map((n, i) => (
                    <li key={i} className="rounded-sm border border-rule bg-paper-raised py-2">
                      <div className="text-lg font-bold tabular">{n}</div>
                      <div className="text-ink-3">{STATES[i]}</div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <SectionTitle aside={`${p.weather.members} members`}>Rain, next 72 h (mm/h)</SectionTitle>
                <Fan data={p.weather.rain_q} time={p.time} />
              </div>
              <div>
                <SectionTitle aside="°C">Temperature, next 72 h</SectionTitle>
                <Fan data={p.weather.temp_q} time={p.time} />
              </div>
              <div className="rounded-sm border border-rule bg-paper-raised">
                <div className="border-b border-rule px-4 py-2.5">
                  <SectionTitle>Predicted course</SectionTitle>
                </div>
                <ControlSheet payload={p} compact />
              </div>
            </>
          ) : null}
          <CityBuilder onReady={setSlug} />
        </aside>
      </main>
    </div>
  );
}

function Cur({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-lg font-bold tabular">{value}</div>
    </div>
  );
}

function Fan({ data, time }: { data: number[][]; time: string }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const w = size.width || 360;
  const h = 90;
  const n = data[0]?.length ?? 0;
  const x = scaleLinear().domain([0, Math.max(1, n - 1)]).range([26, w - 4]);
  const lo = Math.min(...data[0]);
  const hi = Math.max(1, ...data[2]);
  const y = scaleLinear().domain([Math.min(0, lo), hi]).nice().range([h - 16, 4]);
  const pts = data[0].map((_, i) => [data[0][i], data[1][i], data[2][i]]);
  const band = area<number[]>().x((_, i) => x(i)).y0((d) => y(d[0])).y1((d) => y(d[2]))(pts) ?? "";
  const med = line<number[]>().x((_, i) => x(i)).y((d) => y(d[1]))(pts) ?? "";
  return (
    <div ref={ref} className="mt-2">
      <svg width={w} height={h}>
        {y.ticks(3).map((t) => (
          <g key={t}>
            <line x1={26} x2={w - 4} y1={y(t)} y2={y(t)} stroke="var(--rule)" />
            <text x={22} y={y(t) + 3} fontSize={9} fill="var(--ink-3)" textAnchor="end">{t}</text>
          </g>
        ))}
        <path d={band} fill="var(--ink)" opacity={0.12} />
        <path d={med} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 2.5" />
        {[0, 24, 48].filter((t) => t < n).map((t) => (
          <text key={t} x={x(t)} y={h - 2} fontSize={9} fill="var(--ink-3)" textAnchor="start">{t === 0 ? "now" : clock(time, t)}</text>
        ))}
      </svg>
    </div>
  );
}

function CityBuilder({ onReady }: { onReady: (slug: string) => void }) {
  const [name, setName] = useState("");
  const [job, setJob] = useState<{ slug: string; status: string } | null>(null);
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const id = setInterval(async () => {
      const r = await fetch(`${ENGINE}/api/cities/build/${job.slug}`).then((r) => r.json());
      setJob(r);
      if (r.status === "ready") onReady(r.slug);
    }, 3000);
    return () => clearInterval(id);
  }, [job, onReady]);
  return (
    <div className="rounded-sm border border-rule-strong bg-paper-raised p-4">
      <SectionTitle>Build another city</SectionTitle>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-3">
        Type any city. The engine pulls its roads, hospitals, substations, rivers and terrain from open data, builds the dependency network, and forecasts it live.
      </p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const r = await fetch(`${ENGINE}/api/cities/build`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).then((r) => r.json());
          setJob(r);
          if (r.status === "ready") onReady(r.slug);
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pune, Indore, Guwahati…" className="h-10 flex-1 rounded-sm border border-ink bg-paper px-3 text-[14px] outline-none" />
        <button className="rounded-sm bg-ink px-3 text-[13.5px] font-semibold text-paper-raised">Build</button>
      </form>
      {job ? (
        <p className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-2">
          {job.status === "running" ? <Loader2 size={13} className="animate-spin" /> : null}
          {job.status === "running" ? `Fetching ${job.slug} from OpenStreetMap and Open-Meteo…` : job.status === "ready" ? `${job.slug} is ready.` : `Build ${job.status}.`}
        </p>
      ) : null}
    </div>
  );
}
