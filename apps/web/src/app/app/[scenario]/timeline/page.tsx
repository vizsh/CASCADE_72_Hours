"use client";

import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useMemo } from "react";
import { useScenario } from "@/components/app/ScenarioProvider";
import { SectionTitle, Skeleton } from "@/components/app/bits";
import type { CascadeEvent, Payload } from "@/lib/api";
import { COURSE, STATE_FILL, SYSTEMS, clock, pct } from "@/lib/risk";
import { useStore } from "@/lib/store";
import { useSize } from "@/lib/useSize";
import { EngineDown } from "../CommandView";

/** The 72-hour criticality clock: every predicted failure as a window from
 * its 10th to 90th percentile arrival time, grouped by system. */
export default function TimelinePage() {
  const { payload, error } = useScenario();
  const [ref, size] = useSize<HTMLDivElement>();
  if (error) return <EngineDown error={error} />;
  if (!payload) return <Skeleton className="h-full rounded-none" />;
  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <div className="grid grid-cols-2 gap-6 border-b border-rule bg-paper-raised px-5 py-4">
        <div>
          <SectionTitle aside="P10–P90 band, dashed median">Zones at HIGH RISK or worse</SectionTitle>
          <FanChart data={payload.series.hi_q} time={payload.time} height={110} unit="zones" />
        </div>
        <div>
          <SectionTitle aside={`${payload.weather.members} ensemble members`}>Rainfall forecast (mm/h)</SectionTitle>
          <FanChart data={payload.weather.rain_q[0].map((_, i) => [payload.weather.rain_q[0][i], payload.weather.rain_q[1][i], payload.weather.rain_q[2][i]])} time={payload.time} height={110} unit="mm/h" />
        </div>
      </div>
      <div ref={ref} className="min-h-0 overflow-y-auto">
        {size.width ? <Gantt payload={payload} width={size.width} /> : null}
      </div>
    </div>
  );
}

function FanChart({ data, time, height, unit }: { data: number[][]; time: string; height: number; unit: string }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const w = size.width || 400;
  const x = scaleLinear().domain([0, Math.max(1, data.length - 1)]).range([30, w - 8]);
  const y = scaleLinear().domain([0, Math.max(1, ...data.map((d) => d[2]))]).nice().range([height - 18, 6]);
  const band = area<number[]>().x((_, i) => x(i)).y0((d) => y(d[0])).y1((d) => y(d[2]))(data) ?? "";
  const med = line<number[]>().x((_, i) => x(i)).y((d) => y(d[1]))(data) ?? "";
  return (
    <div ref={ref} className="mt-2 w-full">
      <svg width={w} height={height} role="img" aria-label={`Forecast ${unit}`}>
        {y.ticks(3).map((t) => (
          <g key={t}>
            <line x1={30} x2={w - 8} y1={y(t)} y2={y(t)} stroke="var(--rule)" />
            <text x={26} y={y(t) + 3} fontSize={9} fill="var(--ink-3)" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <path d={band} fill="var(--ink)" opacity={0.12} />
        <path d={med} fill="none" stroke="var(--ink)" strokeWidth={1.6} strokeDasharray="4 2.5" />
        {[0, 12, 24, 36, 48, 60, 72].filter((h) => h < data.length).map((h) => (
          <text key={h} x={x(h)} y={height - 3} fontSize={9} fill="var(--ink-3)" textAnchor="middle">
            {h === 0 ? "now" : clock(time, h)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Gantt({ payload, width }: { payload: Payload; width: number }) {
  const select = useStore((s) => s.select);
  const selection = useStore((s) => s.selection);
  const course = useMemo(() => new Set(payload.course), [payload.course]);
  const groups = useMemo(() => {
    const evs = payload.events.filter((e) => !e.kind.startsWith("hazard") && e.p >= 0.2 && (e.t50 != null || e.p_occurred > 0.5));
    const by = new Map<string, CascadeEvent[]>();
    evs.forEach((e) => by.set(e.system, [...(by.get(e.system) ?? []), e]));
    return [...by.entries()]
      .sort((a, b) => (SYSTEMS[a[0]]?.order ?? 9) - (SYSTEMS[b[0]]?.order ?? 9))
      .map(([k, list]) => ({ k, list: list.sort((a, b) => (a.t50 ?? 0) - (b.t50 ?? 0)).slice(0, 12) }));
  }, [payload]);
  const labelW = 300;
  const x = scaleLinear().domain([0, 72]).range([labelW, width - 60]);
  const rowH = 24;
  let yCursor = 30;
  const rows: { e: CascadeEvent; y: number }[] = [];
  const heads: { k: string; y: number }[] = [];
  groups.forEach((g) => {
    heads.push({ k: g.k, y: yCursor });
    yCursor += 22;
    g.list.forEach((e) => {
      rows.push({ e, y: yCursor });
      yCursor += rowH;
    });
    yCursor += 8;
  });
  const height = yCursor + 10;
  return (
    <svg width={width} height={height} role="img" aria-label="Criticality clock">
      {[0, 6, 12, 24, 36, 48, 60, 72].map((h) => (
        <g key={h}>
          <line x1={x(h)} x2={x(h)} y1={20} y2={height} stroke="var(--rule)" strokeDasharray={h === 0 ? undefined : "2 4"} />
          <text x={x(h)} y={14} fontSize={10} fill="var(--ink-3)" textAnchor="middle">
            {h === 0 ? "now" : `+${h}h · ${clock(payload.time, h)}`}
          </text>
        </g>
      ))}
      <line x1={x(0)} x2={x(0)} y1={18} y2={height} stroke="var(--ink)" strokeWidth={1.6} />
      {heads.map((h) => (
        <text key={h.k} x={16} y={h.y + 14} fontSize={10.5} fontWeight={700} letterSpacing="0.06em" fill="var(--ink-3)">
          {(SYSTEMS[h.k]?.label ?? h.k).toUpperCase()}
        </text>
      ))}
      {rows.map(({ e, y }) => {
        const occurred = e.p_occurred > 0.5;
        const t10 = occurred ? 0 : e.t10 ?? 0;
        const t90 = occurred ? Math.min(72, (e.t90 ?? 2) + 0) : e.t90 ?? t10;
        const sev = e.p >= 0.6 ? 3 : e.p >= 0.35 ? 2 : 1;
        const sel = selection?.type === "event" && selection.id === e.id;
        const onCourse = course.has(e.id);
        return (
          <g key={e.id} onClick={() => select({ type: "event", id: e.id })} style={{ cursor: "pointer" }}>
            <rect x={0} y={y} width={width} height={rowH} fill={sel ? "var(--course-wash)" : "transparent"} />
            <text x={16} y={y + 16} fontSize={12} fontWeight={onCourse ? 700 : 500} fill={onCourse ? COURSE : "var(--ink)"}>
              {e.label.length > 44 ? `${e.label.slice(0, 43)}…` : e.label}
            </text>
            <rect x={x(t10)} y={y + 7} width={Math.max(3, x(t90) - x(t10))} height={10} fill={STATE_FILL[sev]} opacity={0.35 + 0.6 * e.p} rx={1} />
            {e.t50 != null && !occurred ? <line x1={x(e.t50)} x2={x(e.t50)} y1={y + 4} y2={y + 20} stroke="var(--ink)" strokeWidth={2} /> : null}
            <text x={width - 54} y={y + 16} fontSize={11} fontWeight={600} fill="var(--ink-2)">
              {pct(e.p)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
