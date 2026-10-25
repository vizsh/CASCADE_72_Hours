"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import CountUp from "@/components/CountUp";
import { ControlNumber } from "@/components/app/bits";
import { MapClient } from "@/components/app/MapClient";
import { courseEvents } from "@/components/atlas/AtlasMap";
import { useCity, usePayload, useScenarios, useValidation, type Validation } from "@/lib/api";
import { timeWindow } from "@/lib/risk";

const HERO_SID = "monsoon-2023";
const HERO_HOUR = 24; // 06:00 on 22 Sep 2023, nineteen hours before the lake overflowed

export function HomeHero() {
  const payload = usePayload(HERO_SID, HERO_HOUR);
  const city = useCity("nagpur");
  const p = payload.data;
  const course = courseEvents(p);

  return (
    <section className="relative">
      <div className="mx-auto grid max-w-[1320px] gap-8 px-5 pt-10 pb-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:pt-14">
        <div className="flex flex-col justify-center">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-[44px] font-extrabold leading-[0.98] tracking-[-0.02em] wdth-condensed sm:text-[56px]"
          >
            A flood warning tells you where the rain falls. This tells you what fails next.
          </motion.h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-2">
            CASCADE 72 forecasts how one disruption travels through a city&rsquo;s drains, roads, power, telecom and hospitals over the next 72 hours, learns the
            dependencies nobody wrote down, and tests which action breaks the chain before the window closes.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/app/${HERO_SID}?t=${HERO_HOUR}`} className="flex items-center gap-2 rounded-sm bg-ink px-4 py-2.5 text-[14px] font-semibold text-paper-raised hover:bg-ink-2">
              Replay Nagpur, 23 Sep 2023 <ArrowRight size={16} />
            </Link>
            <Link href="/live" className="rounded-sm border border-ink px-4 py-2.5 text-[14px] font-semibold hover:bg-paper-sunk">
              Today&rsquo;s live forecast
            </Link>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            <div className="rounded-sm border border-rule-strong bg-paper-raised p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">A conventional warning</div>
              <p className="mt-2 text-[14px] leading-snug">&ldquo;Heavy to very heavy rainfall is likely at isolated places in Nagpur district.&rdquo;</p>
            </div>
            <div className="rounded-sm border-2 border-course bg-paper-raised p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-course">CASCADE 72, same morning</div>
              <p className="mt-2 text-[14px] leading-snug">
                {course.length > 2 ? (
                  <>
                    {course[1].label} ({Math.round(course[1].p * 100)}%), {timeWindow(p!.time, course[1].t10, course[1].t90)}; then{" "}
                    {course[2].label.charAt(0).toLowerCase() + course[2].label.slice(1)}.
                  </>
                ) : (
                  "Loading the issued forecast…"
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="relative min-h-[460px] overflow-hidden rounded-sm border border-rule-strong bg-paper-raised lg:min-h-[600px]">
          {city.data && p ? <MapClient city={city.data} payload={p} interactive={false} initialZoom={11.6} /> : <div className="h-full animate-pulse bg-paper-sunk" />}
          {p ? (
            <div className="absolute top-3 right-3 w-[300px] rounded-sm border border-rule-strong bg-paper-raised/96 shadow-[0_4px_14px_-6px_rgba(21,23,26,0.25)]">
              <div className="border-b border-rule px-3 py-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-ink">Predicted course</div>
                <div className="text-[11px] text-ink-3">Issued 22 Sep 2023, 06:00 · from data available then</div>
              </div>
              <ol className="divide-y divide-rule">
                {course.slice(0, 5).map((e, i) => (
                  <li key={e.id} className="grid grid-cols-[28px_1fr] gap-2 px-3 py-2">
                    <ControlNumber n={i} start={i === 0} finish={i === Math.min(course.length, 5) - 1 && i > 0} />
                    <div>
                      <div className="text-[12.5px] font-semibold leading-snug">{e.label}</div>
                      <div className="text-[11px] text-ink-3 tabular">
                        {timeWindow(p.time, e.t10, e.t90)} · {Math.round(e.p * 100)}%
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <div className="absolute bottom-3 left-3 max-w-[340px] rounded-sm bg-paper-raised/95 px-2.5 py-1.5 text-[11px] leading-snug text-ink-3">
            Real Nagpur geography. The lake overflowed at 01:00 the next night; this course was issued 19 hours earlier.
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomeScenarios() {
  const scenarios = useScenarios();
  return (
    <section id="scenarios" className="border-t border-rule bg-paper-raised">
      <div className="mx-auto max-w-[1320px] px-5 py-16">
        <h2 className="text-[34px] font-extrabold leading-[1.05] tracking-tight wdth-condensed">Five crises, one engine.</h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Each hazard is a plug-in that says how it stresses city systems. Everything downstream (propagation, discovery, interventions, validation) is shared.
        </p>
        <table className="mt-8 w-full text-left text-[14px]">
          <thead>
            <tr className="border-b-2 border-ink text-[11.5px] uppercase tracking-wider text-ink-3">
              <th className="py-2 font-semibold">Scenario</th>
              <th className="hidden py-2 font-semibold md:table-cell">Systems it reaches</th>
              <th className="hidden py-2 font-semibold lg:table-cell">Adversarial inputs</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {(scenarios.data ?? []).map((s) => (
              <tr key={s.id} className="align-top">
                <td className="py-4 pr-4">
                  <div className="font-bold">{s.title}</div>
                  <div className="mt-1 max-w-xl text-[13px] leading-snug text-ink-3">{s.summary}</div>
                </td>
                <td className="hidden py-4 pr-4 capitalize md:table-cell">{s.hazards.join(" · ")}</td>
                <td className="hidden py-4 pr-4 text-[13px] text-ink-2 lg:table-cell">{s.adversarial.map((a) => a.label).join("; ") || "none"}</td>
                <td className="py-4 text-right">
                  <Link href={`/app/${s.id}`} className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-ink hover:text-course">
                    Open <ArrowRight size={15} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HomeProof() {
  const mon = useValidation("monsoon-2023");
  const comms = useValidation("comms-blackout");
  const m = mon.data && !mon.data.pending ? (mon.data as Validation) : null;
  const c = comms.data && !comms.data.pending ? (comms.data as Validation) : null;
  return (
    <section id="proof" className="border-t border-rule">
      <div className="mx-auto max-w-[1320px] px-5 py-16">
        <h2 className="text-[34px] font-extrabold leading-[1.05] tracking-tight wdth-condensed">Scored on replays, with the future locked away.</h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Every hourly forecast reads only observations that had arrived by that hour, including late telemetry, then is scored against the hidden world model.
          Numbers below come straight from the engine.
        </p>
        <div className="mt-10 grid gap-8 border-t-2 border-ink pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <Num label="Median warning lead, monsoon replay" value={m?.warnings.median_lead_h ?? null} suffix=" h" note="HIGH RISK issued before a zone turned CRITICAL" />
          <Num label="Critical zones warned in advance" value={m?.warnings.probability_of_detection != null ? m.warnings.probability_of_detection * 100 : null} suffix="%" note={m ? `${m.warnings.episodes} critical zone episodes` : ""} />
          <Num
            label="Hidden feeder links found, blackout replay"
            value={c?.dependencies.hidden_links_found ?? null}
            suffix={c ? ` of ${c.dependencies.hidden_links_total}` : ""}
            note="never told to the forecaster; learned from outages"
          />
          <Num label="Reads from the future" value={0} suffix="" note="every input has arrival time ≤ issue time" />
        </div>
      </div>
    </section>
  );
}

function Num({ label, value, suffix, note }: { label: string; value: number | null; suffix: string; note: string }) {
  return (
    <div>
      <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="mt-1 text-[44px] font-extrabold leading-none tabular wdth-condensed">
        {value == null ? "—" : <CountUp to={Math.round(value)} duration={1.2} />}
        <span className="text-[22px] font-bold">{value == null ? "" : suffix}</span>
      </div>
      <div className="mt-1 text-[12.5px] text-ink-3">{note}</div>
    </div>
  );
}
