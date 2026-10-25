"use client";

import { scaleLinear } from "d3-scale";
import { Loader2 } from "lucide-react";
import { useScenario } from "@/components/app/ScenarioProvider";
import { SectionTitle, Skeleton } from "@/components/app/bits";
import { useValidation, type Validation } from "@/lib/api";
import { pct } from "@/lib/risk";
import { useStore } from "@/lib/store";
import { EngineDown } from "../CommandView";

export default function ReplayPage() {
  const { sid, scenario, timeline, error, readyHours } = useScenario();
  const v = useValidation(sid);
  const setHour = useStore((s) => s.setHour);
  const setMetric = useStore((s) => s.setMetric);
  if (error) return <EngineDown error={error} />;
  if (!scenario) return <Skeleton className="h-full rounded-none" />;
  const data = v.data && !v.data.pending ? (v.data as Validation) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] space-y-8 px-6 py-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold leading-tight wdth-semi">Replay & validation: {scenario.title}</h1>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
              Every hourly forecast was issued from observations that had arrived by that hour, then scored against the hidden world model it never saw. Delayed
              telemetry stays invisible until it arrives.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setMetric("truth");
                setHour(0);
                useStore.getState().setPlaying(true);
              }}
              className="rounded-sm bg-ink px-3 py-2 text-sm font-semibold text-paper-raised hover:bg-ink-2"
            >
              Replay from the start with truth overlay
            </button>
          </div>
        </header>

        {!data ? (
          <div className="flex items-center gap-2 text-sm text-ink-2">
            <Loader2 size={15} className="animate-spin" /> Scoring needs every issuance: {readyHours}/{scenario.hours} ready.
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-6 lg:grid-cols-4">
              <Big label="Median warning lead" value={data.warnings.median_lead_h != null ? `${data.warnings.median_lead_h} h` : "—"} note="HIGH RISK issued before the zone turned CRITICAL" />
              <Big label="Detection" value={data.warnings.probability_of_detection != null ? pct(data.warnings.probability_of_detection) : "—"} note={`${data.warnings.episodes} critical zone episodes`} />
              <Big label="False-alarm ratio" value={data.warnings.false_alarm_ratio != null ? pct(data.warnings.false_alarm_ratio) : "—"} note="HIGH RISK warnings where the zone never reached HIGH within 24 h" />
              <Big label="Brier skill vs climatology" value={data.calibration.skill != null ? data.calibration.skill.toFixed(2) : "—"} note={`Brier ${data.calibration.brier ?? "—"} on ${data.calibration.n.toLocaleString()} zone-forecasts`} />
            </section>

            <section className="grid gap-8 lg:grid-cols-2">
              <div>
                <SectionTitle aside="P(CRITICAL within 24 h)">Reliability</SectionTitle>
                <Reliability rel={data.calibration.reliability} />
                <p className="mt-1 text-[11.5px] text-ink-3">Points on the diagonal mean that when the system said 30%, it happened about 30% of the time.</p>
              </div>
              <div>
                <SectionTitle aside="forecast vs hidden truth">Critical zones per hour</SectionTitle>
                <TruthChart rows={timeline} />
              </div>
            </section>

            <section className="grid gap-8 lg:grid-cols-2">
              <div>
                <SectionTitle>Hidden dependencies recovered</SectionTitle>
                <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
                  <Small label="Assets with evidence" value={`${data.dependencies.with_evidence}/${data.dependencies.consumers}`} />
                  <Small label="Confident & correct" value={`${data.dependencies.confident_correct}/${data.dependencies.confident}`} />
                  <Small label="Non-nearest feeders found" value={`${data.dependencies.hidden_links_found}/${data.dependencies.hidden_links_total}`} />
                </dl>
                <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
                  The world model wires some hospitals, pumps and stations to a feeder other than the nearest one. The forecaster starts from &ldquo;nearest&rdquo; and
                  can only learn otherwise when an outage reveals it, so links never exercised by this scenario stay at the prior, by design.
                </p>
              </div>
              <div>
                <SectionTitle>Adversarial inputs</SectionTitle>
                <ul className="mt-2 divide-y divide-rule text-[13px]">
                  {data.adversarial.map((a, i) => (
                    <li key={i} className="py-2">
                      <div className="font-semibold">{a.label}</div>
                      <div className="text-[12px] text-ink-3">
                        hour {a.hour}
                        {a.trust_now != null ? ` · trust now ${pct(a.trust_now)}` : ""}
                        {a.trust_min != null ? ` · trust fell to ${pct(a.trust_min)}` : ""}
                        {a.clusters != null ? ` · ${a.clusters} clusters, max credibility ${pct(a.max_credibility ?? 0)}${a.flagged_coordinated ? ", flagged coordinated" : ""}` : ""}
                      </div>
                    </li>
                  ))}
                  {!data.adversarial.length ? <li className="py-2 text-ink-3">None scripted for this scenario.</li> : null}
                </ul>
              </div>
            </section>

            {data.asset_leads.length ? (
              <section>
                <SectionTitle aside="first issuance with ≥ 40% chance within 24 h">Asset failures warned in advance</SectionTitle>
                <table className="mt-2 w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-rule text-left text-[11px] uppercase tracking-wider text-ink-3">
                      <th className="py-1.5">Failure</th>
                      <th className="py-1.5 text-right">Warned at</th>
                      <th className="py-1.5 text-right">Happened at</th>
                      <th className="py-1.5 text-right">Lead</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule tabular">
                    {data.asset_leads.slice(0, 12).map((r, i) => (
                      <tr key={i}>
                        <td className="py-1.5">{r.kind.replaceAll("_", " ")} #{r.index + 1}</td>
                        <td className="py-1.5 text-right">h{r.warned_hour}</td>
                        <td className="py-1.5 text-right">h{r.event_hour}</td>
                        <td className="py-1.5 text-right font-semibold">{r.lead_h} h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
            <p className="border-t border-rule pt-3 text-[12px] text-ink-3">{data.fence.rule}. Future reads: {data.fence.future_reads}. Delayed observations withheld across issuances: {data.fence.withheld_total.toLocaleString()}.</p>
          </>
        )}
      </div>
    </div>
  );
}

function Big({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-t-2 border-ink pt-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-3xl font-bold tabular wdth-semi">{value}</div>
      <div className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{note}</div>
    </div>
  );
}

function Small({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd className="text-xl font-bold tabular">{value}</dd>
    </div>
  );
}

function Reliability({ rel }: { rel: Validation["calibration"]["reliability"] }) {
  const s = 260;
  const x = scaleLinear().domain([0, 1]).range([30, s - 10]);
  const y = scaleLinear().domain([0, 1]).range([s - 24, 8]);
  return (
    <svg width={s} height={s} className="mt-2" role="img" aria-label="Reliability diagram">
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--rule-strong)" strokeDasharray="3 3" />
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <text x={x(t)} y={s - 8} fontSize={9} fill="var(--ink-3)" textAnchor="middle">{t * 100}%</text>
          <text x={24} y={y(t) + 3} fontSize={9} fill="var(--ink-3)" textAnchor="end">{t * 100}%</text>
        </g>
      ))}
      <polyline points={rel.map((r) => `${x(r.predicted)},${y(r.observed)}`).join(" ")} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
      {rel.map((r) => (
        <circle key={r.bin} cx={x(r.predicted)} cy={y(r.observed)} r={2 + Math.min(6, Math.sqrt(r.n) / 6)} fill="var(--ink)" opacity={0.8} />
      ))}
      <text x={x(0.5)} y={s} fontSize={9} fill="var(--ink-3)" textAnchor="middle" dy={-0}>forecast probability →</text>
    </svg>
  );
}

function TruthChart({ rows }: { rows: { hour: number; crit: number; truth_crit: number | null }[] }) {
  const w = 480;
  const h = 200;
  const x = scaleLinear().domain([0, Math.max(1, rows.length - 1)]).range([30, w - 8]);
  const y = scaleLinear().domain([0, Math.max(5, ...rows.map((r) => Math.max(r.crit, r.truth_crit ?? 0)))]).nice().range([h - 20, 8]);
  const fc = rows.map((r) => `${x(r.hour)},${y(r.crit)}`).join(" ");
  const tr = rows.filter((r) => r.truth_crit != null).map((r) => `${x(r.hour)},${y(r.truth_crit ?? 0)}`).join(" ");
  return (
    <svg width={w} height={h} className="mt-2 max-w-full" role="img" aria-label="Forecast and truth critical zones">
      {y.ticks(4).map((t) => (
        <g key={t}>
          <line x1={30} x2={w - 8} y1={y(t)} y2={y(t)} stroke="var(--rule)" />
          <text x={26} y={y(t) + 3} fontSize={9} fill="var(--ink-3)" textAnchor="end">{t}</text>
        </g>
      ))}
      <polyline points={tr} fill="none" stroke="var(--ink)" strokeWidth={1.8} />
      <polyline points={fc} fill="none" stroke="var(--risk-critical)" strokeWidth={1.6} strokeDasharray="4 2.5" />
      <g fontSize={10} fill="var(--ink-2)">
        <line x1={40} x2={60} y1={14} y2={14} stroke="var(--ink)" strokeWidth={1.8} />
        <text x={64} y={17}>truth (observed by the world)</text>
        <line x1={220} x2={240} y1={14} y2={14} stroke="var(--risk-critical)" strokeWidth={1.6} strokeDasharray="4 2.5" />
        <text x={244} y={17}>zones issued CRITICAL</text>
      </g>
    </svg>
  );
}
