"use client";

import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { Clock, Loader2, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapClient } from "@/components/app/MapClient";
import { useScenario } from "@/components/app/ScenarioProvider";
import { ProbBar, SectionTitle, Skeleton } from "@/components/app/bits";
import { useActions, useDeadline, useEvaluate, useOptimise, type Action, type Deadline, type Evaluation, type Metrics } from "@/lib/api";
import { COURSE_RGB, STATE_RGB, compact, pct } from "@/lib/risk";
import { cn } from "@/lib/utils";
import { EngineDown } from "../CommandView";

const METRIC_ROWS: { key: keyof Metrics; label: string; fmt: (v: number) => string; better: "lower" }[] = [
  { key: "p_city_critical", label: "Chance the city reaches CRITICAL", fmt: (v) => pct(v), better: "lower" },
  { key: "person_hours_high", label: "Person-hours at HIGH RISK or worse", fmt: (v) => compact(v), better: "lower" },
  { key: "hospital_failures", label: "Hospitals expected to fail (overload or blackout)", fmt: (v) => v.toFixed(1), better: "lower" },
  { key: "zones_ems", label: "Zones where ambulances breach limits", fmt: (v) => v.toFixed(1), better: "lower" },
  { key: "zones_flooded", label: "Zones flooding above 0.3 m", fmt: (v) => v.toFixed(1), better: "lower" },
  { key: "ems_vulnerable_min", label: "Worst median ambulance time, vulnerable zones (min)", fmt: (v) => v.toFixed(1), better: "lower" },
];

export default function LabPage() {
  const { sid, hour, payload, city, error, whatIfReady } = useScenario();
  const actionsQ = useActions(sid, hour);
  const evaluate = useEvaluate(sid);
  const optimise = useOptimise(sid);
  const deadline = useDeadline(sid);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [starts, setStarts] = useState<Record<string, number>>({});
  const [target, setTarget] = useState<string | null>(null);
  const [deadlines, setDeadlines] = useState<Record<string, Deadline>>({});

  useEffect(() => {
    setTarget(new URLSearchParams(window.location.search).get("target"));
  }, []);
  useEffect(() => {
    setChosen(new Set());
    evaluate.reset();
    optimise.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hour, sid]);

  const actions = actionsQ.data?.actions ?? [];
  const resources = actionsQ.data?.resources ?? {};
  const usage = useMemo(() => {
    const u: Record<string, number> = {};
    actions.filter((a) => chosen.has(a.id)).forEach((a) => (u[a.resource] = (u[a.resource] ?? 0) + a.units));
    return u;
  }, [actions, chosen]);
  const over = Object.entries(usage).some(([k, v]) => v > (resources[k]?.total ?? Infinity));
  const toggle = (id: string) => setChosen((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const run = useCallback(() => evaluate.mutate({ hour, actions: [...chosen], starts }), [evaluate, hour, chosen, starts]);

  if (error) return <EngineDown error={error} />;
  if (!payload || !city) return <Skeleton className="h-full rounded-none" />;
  const tgt = target ? payload.events.find((e) => e.id === target) : undefined;
  const ready = whatIfReady > hour;
  const result: Evaluation | undefined = evaluate.data;

  return (
    <div className="grid h-full grid-cols-[440px_1fr]">
      <aside className="flex min-h-0 flex-col border-r border-rule bg-paper-raised">
        <div className="border-b border-rule px-4 pt-4 pb-3">
          <SectionTitle aside={`as of ${new Date(payload.time).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}`}>
            Intervention lab
          </SectionTitle>
          <p className="mt-1 text-[12px] leading-snug text-ink-3">
            Every option runs on the same simulated futures as doing nothing, so differences come from the action, not chance. Nothing here dispatches anything.
          </p>
          {tgt ? (
            <div className="mt-3 rounded-sm border border-course bg-course-wash px-3 py-2 text-[12.5px]">
              <span className="font-semibold text-course">Chain to break: </span>
              {tgt.label} ({pct(tgt.p)} within 72 h)
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(resources).map(([k, r]) => {
              const used = usage[k] ?? 0;
              return (
                <span key={k} className={cn("rounded-sm border px-1.5 py-0.5 text-[11px] tabular", used > r.total ? "border-critical text-critical-ink" : "border-rule-strong text-ink-2")}>
                  {r.label}: {used}/{r.total}
                </span>
              );
            })}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!ready ? (
            <div className="m-4 flex items-start gap-2 rounded-sm border border-rule-strong bg-paper px-3 py-2 text-[12px] text-ink-2">
              <Loader2 size={14} className="mt-0.5 animate-spin" /> Rebuilding the ensemble for this hour ({whatIfReady}/{hour + 1} hours ready). What-ifs unlock when it arrives.
            </div>
          ) : null}
          {actionsQ.isLoading ? <Skeleton className="m-4 h-40" /> : null}
          <ul className="divide-y divide-rule">
            {actions.map((a) => (
              <ActionRow
                key={a.id}
                a={a}
                on={chosen.has(a.id)}
                start={starts[a.id] ?? 0}
                onToggle={() => toggle(a.id)}
                onStart={(v) => setStarts((s) => ({ ...s, [a.id]: v }))}
                deadline={deadlines[a.id]}
                onDeadline={() =>
                  deadline.mutate({ hour, action: a.id }, { onSuccess: (d) => setDeadlines((s) => ({ ...s, [a.id]: d })) })
                }
                deadlineBusy={deadline.isPending && deadline.variables?.action === a.id}
                disabled={!ready}
              />
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-rule p-3">
          <button
            disabled={!chosen.size || over || evaluate.isPending || !ready}
            onClick={run}
            className="flex items-center justify-center gap-2 rounded-sm bg-ink px-3 py-2.5 text-sm font-semibold text-paper-raised hover:bg-ink-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {evaluate.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
            Compare {chosen.size || ""} with doing nothing
          </button>
          <button
            disabled={optimise.isPending || !ready}
            onClick={() => optimise.mutate(hour)}
            className="flex items-center justify-center gap-2 rounded-sm border border-ink px-3 py-2.5 text-sm font-semibold text-ink hover:bg-paper-sunk disabled:opacity-40"
          >
            {optimise.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {optimise.isPending ? "Searching plans…" : "Find the best plan"}
          </button>
        </div>
      </aside>

      <section className="min-h-0 overflow-y-auto">
        {optimise.data ? (
          <Portfolios
            data={optimise.data.portfolios}
            onApply={(ids) => {
              setChosen(new Set(ids));
              evaluate.mutate({ hour, actions: ids, starts });
            }}
          />
        ) : null}
        {result ? <Result r={result} city={city} payload={payload} /> : !optimise.data ? <Empty busy={evaluate.isPending || optimise.isPending} /> : null}
      </section>
    </div>
  );
}

function ActionRow({ a, on, start, onToggle, onStart, deadline, onDeadline, deadlineBusy, disabled }: {
  a: Action; on: boolean; start: number; onToggle: () => void; onStart: (v: number) => void;
  deadline?: Deadline; onDeadline: () => void; deadlineBusy: boolean; disabled: boolean;
}) {
  return (
    <li className={cn("px-4 py-3", on && "bg-course-wash")}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={on} onChange={onToggle} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--course)]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold leading-snug">{a.label}</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">{a.why}</span>
        </span>
        {a.units ? <span className="text-[11px] font-semibold text-ink-2 tabular">{a.units}×</span> : null}
      </label>
      <div className="mt-2 flex items-center gap-3 pl-7 text-[11.5px] text-ink-3">
        <label className="flex items-center gap-2">
          start in
          <input type="range" min={0} max={12} step={1} value={start} onChange={(e) => onStart(Number(e.target.value))} className="w-24 accent-[var(--ink)]" disabled={disabled} />
          <span className="w-8 font-semibold text-ink-2 tabular">{start} h</span>
        </label>
        <button onClick={onDeadline} disabled={disabled || deadlineBusy} className="ml-auto flex items-center gap-1 font-semibold text-ink-2 hover:text-course disabled:opacity-40">
          {deadlineBusy ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />} When does it stop helping?
        </button>
      </div>
      {deadline ? <DeadlineCurve d={deadline} /> : null}
    </li>
  );
}

function DeadlineCurve({ d }: { d: Deadline }) {
  const w = 330;
  const h = 70;
  const x = scaleLinear().domain([0, 18]).range([10, w - 10]);
  const maxB = Math.max(0.01, ...d.curve.map((c) => c.benefit));
  const y = scaleLinear().domain([Math.min(0, ...d.curve.map((c) => c.benefit)), maxB]).range([h - 16, 6]);
  const path = line<Deadline["curve"][0]>().x((c) => x(c.start_in_h)).y((c) => y(c.benefit))(d.curve) ?? "";
  return (
    <div className="mt-2 ml-7 rounded-sm border border-rule bg-paper p-2">
      <div className="text-[11.5px] font-semibold">
        {d.latest_useful_start_h != null ? (
          <>
            Decision deadline: start within <span className="text-course">{d.latest_useful_start_h} h</span> to keep at least half the benefit
          </>
        ) : (
          "No measurable benefit at any start time in this forecast"
        )}
      </div>
      <svg width={w} height={h}>
        <line x1={10} x2={w - 10} y1={y(0)} y2={y(0)} stroke="var(--rule-strong)" />
        {d.latest_useful_start_h != null ? <line x1={x(d.latest_useful_start_h)} x2={x(d.latest_useful_start_h)} y1={4} y2={h - 14} stroke="var(--course)" strokeDasharray="3 2" /> : null}
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth={1.6} strokeDasharray="4 2.5" />
        {d.curve.map((c) => (
          <circle key={c.start_in_h} cx={x(c.start_in_h)} cy={y(c.benefit)} r={2.5} fill="var(--ink)" />
        ))}
        {[0, 6, 12, 18].map((t) => (
          <text key={t} x={x(t)} y={h - 2} fontSize={9} fill="var(--ink-3)" textAnchor="middle">
            +{t} h
          </text>
        ))}
      </svg>
    </div>
  );
}

function Empty({ busy }: { busy: boolean }) {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="max-w-md text-[13.5px] leading-relaxed text-ink-2">
        {busy ? (
          <p className="flex items-center gap-2">
            <Loader2 className="animate-spin" size={16} /> Running the ensemble with and without the plan…
          </p>
        ) : (
          <>
            <h2 className="text-base font-bold text-ink">Pick actions on the left, then compare them with doing nothing</h2>
            <p className="mt-2">
              You will see which predicted failures become less likely, which neighbourhoods are better or worse off, how much extra congestion the plan creates, and
              what share of the benefit reaches vulnerable residents. Or let the optimiser search plans within the resources you have.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Portfolios({ data, onApply }: { data: { ids: string[]; benefit: number; result: Evaluation }[]; onApply: (ids: string[]) => void }) {
  return (
    <div className="border-b border-rule p-5">
      <SectionTitle aside="ranked by expected harm avoided">Plans found within your resources</SectionTitle>
      <ol className="mt-3 grid gap-3 xl:grid-cols-3">
        {data.map((p, i) => (
          <li key={i} className="flex flex-col rounded-sm border border-rule-strong bg-paper-raised p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] font-bold uppercase tracking-wider text-ink-3">Plan {i + 1}</span>
              <span className="text-[12px] text-ink-3 tabular">benefit {p.benefit.toFixed(2)}</span>
            </div>
            <ul className="mt-2 flex-1 space-y-1 text-[12.5px]">
              {p.result.actions.map((a) => (
                <li key={a.id}>· {a.label}</li>
              ))}
            </ul>
            <div className="mt-2 text-[12px] text-ink-2 tabular">
              City CRITICAL {pct(p.result.baseline.p_city_critical)} → <b>{pct(p.result.with.p_city_critical)}</b>
            </div>
            <button onClick={() => onApply(p.ids)} className="mt-2 rounded-sm border border-ink px-2 py-1.5 text-[12.5px] font-semibold hover:bg-paper-sunk">
              Load this plan
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Result({ r, city, payload }: { r: Evaluation; city: NonNullable<ReturnType<typeof useScenario>["city"]>; payload: NonNullable<ReturnType<typeof useScenario>["payload"]> }) {
  const maxAbs = Math.max(1, ...r.zone_delta.map((v) => Math.abs(v)));
  const zoneColor = (idx: number): [number, number, number, number] => {
    const v = r.zone_delta[idx] ?? 0;
    if (Math.abs(v) < 200) return [0, 0, 0, 0];
    const a = Math.round(40 + 190 * Math.min(1, Math.abs(v) / maxAbs));
    return v < 0 ? [...COURSE_RGB, a] : [...STATE_RGB[3], a];
  };
  const dc = r.delta.p_city_critical;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 p-5">
      <div>
        <h2 className="text-xl font-bold leading-tight">
          {dc < -0.005
            ? `This plan lowers the chance of a city-wide CRITICAL from ${pct(r.baseline.p_city_critical)} to ${pct(r.with.p_city_critical)}.`
            : dc > 0.005
              ? `This plan raises the chance of a city-wide CRITICAL to ${pct(r.with.p_city_critical)}. Check the side effects.`
              : "This plan barely moves the city-wide outcome; look at the local effects below."}
        </h2>
        <p className="mt-1 text-[13px] text-ink-2">
          {compact(-r.delta.person_hours_high)} fewer person-hours at HIGH RISK or worse; {pct(r.equity_share_vulnerable)} of that reduction lands in the most vulnerable zones.
        </p>
      </div>
      <div className="grid gap-6 2xl:grid-cols-[1fr_1fr]">
        <section>
          <SectionTitle>Outcomes over the next 72 h</SectionTitle>
          <table className="mt-2 w-full text-[13px]">
            <thead>
              <tr className="border-b border-rule text-left text-[11px] uppercase tracking-wider text-ink-3">
                <th className="py-1.5 font-semibold">Measure</th>
                <th className="py-1.5 text-right font-semibold">Do nothing</th>
                <th className="py-1.5 text-right font-semibold">With plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule tabular">
              {METRIC_ROWS.map((m) => {
                const b = r.baseline[m.key];
                const w = r.with[m.key];
                const good = w < b - 1e-6;
                const bad = w > b + 1e-6;
                return (
                  <tr key={m.key}>
                    <td className="py-1.5 pr-3 text-ink-2">{m.label}</td>
                    <td className="py-1.5 text-right">{m.fmt(b)}</td>
                    <td className={cn("py-1.5 text-right font-semibold", good && "text-course", bad && "text-critical-ink")}>{m.fmt(w)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section>
          <SectionTitle aside="violet: better · red: worse">Ghost city: change in exposure</SectionTitle>
          <div className="mt-2 h-[300px] overflow-hidden rounded-sm border border-rule">
            <MapClient city={city} payload={payload} showCourse={false} zoneColor={zoneColor} zoneKey={r.actions.map((a) => a.id).join(",") + r.now} initialZoom={10.9} />
          </div>
        </section>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <SectionTitle>Links in the chain that weaken</SectionTitle>
          {r.broken_links.length ? (
            <ul className="mt-2 space-y-2">
              {r.broken_links.map((b) => (
                <li key={b.id} className="text-[12.5px]">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{b.label}</span>
                    <span className="shrink-0 font-semibold tabular">
                      {pct(b.before)} → <span className={b.after < b.before ? "text-course" : "text-critical-ink"}>{pct(b.after)}</span>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <ProbBar p={b.before} width={110} state={2} />
                    <ProbBar p={b.after} width={110} state={b.after < b.before ? 0 : 3} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12.5px] text-ink-3">No predicted failure moves by 10 points or more.</p>
          )}
        </section>
        <section>
          <SectionTitle>Side effects</SectionTitle>
          <div className="mt-2 space-y-3 text-[12.5px]">
            <div>
              <div className="font-semibold">Neighbourhoods worse off</div>
              {r.side_effects.zones_worse.length ? (
                <ul className="mt-1 space-y-0.5">
                  {r.side_effects.zones_worse.map((z) => (
                    <li key={z.zone} className="flex justify-between">
                      <span>{z.name}</span>
                      <span className="text-critical-ink tabular">+{compact(z.person_hours)} person-hours</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-3">None measurably worse.</p>
              )}
            </div>
            <div>
              <div className="font-semibold">Extra congestion</div>
              {r.side_effects.congested_zones.length ? (
                <ul className="mt-1 space-y-0.5">
                  {r.side_effects.congested_zones.map((z) => (
                    <li key={z.zone} className="flex justify-between">
                      <span>{z.name}</span>
                      <span className="text-high-ink tabular">+{z.added_delay_pct}% travel time</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-3">No zone slows down by more than 8%.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
