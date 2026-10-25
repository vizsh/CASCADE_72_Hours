"use client";

import { AnimatePresence, motion } from "motion/react";
import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { CascadeRChart } from "@/components/app/CascadeR";
import { ControlSheet, OtherFailures } from "@/components/app/ControlSheet";
import { Inspector } from "@/components/app/Inspector";
import { Legend } from "@/components/app/Legend";
import { MapClient } from "@/components/app/MapClient";
import { useScenario } from "@/components/app/ScenarioProvider";
import { SectionTitle, Skeleton } from "@/components/app/bits";
import { compact, inHours, timeWindow } from "@/lib/risk";
import { useStore, type MapMetric } from "@/lib/store";
import { cn } from "@/lib/utils";

const METRICS: { id: MapMetric; label: string }[] = [
  { id: "state", label: "Risk state" },
  { id: "p_crit24", label: "P(critical, 24 h)" },
  { id: "p_high72", label: "P(high risk, 72 h)" },
  { id: "truth", label: "Replay truth" },
];

export function CommandView() {
  const { city, payload, sid, scenario, error } = useScenario();
  const selection = useStore((s) => s.selection);
  const metric = useStore((s) => s.metric);
  const setMetric = useStore((s) => s.setMetric);

  if (error) return <EngineDown error={error} />;
  if (!city || !payload || !scenario)
    return (
      <div className="grid h-full grid-cols-[1fr_400px]">
        <Skeleton className="h-full rounded-none" />
        <div className="space-y-3 border-l border-rule p-4">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
    );

  const popHigh = payload.series.pop_high;
  const peakIdx = popHigh.indexOf(Math.max(...popHigh));
  const next = payload.events
    .filter((e) => !e.kind.startsWith("hazard") && e.p >= 0.5 && e.p_occurred < 0.5 && e.t50 != null)
    .sort((a, b) => (a.t50 ?? 0) - (b.t50 ?? 0))[0];
  const target = payload.course.find((id) => !id.startsWith("hazard")) ?? payload.course[0];
  const metrics = METRICS.filter((m) => m.id !== "truth" || payload.truth);

  return (
    <div className="grid h-full grid-cols-[1fr_400px]">
      <section className="relative min-w-0">
        <MapClient city={city} payload={payload} metric={metric} />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
          <div className="pointer-events-auto grid grid-cols-[auto_auto_auto] gap-x-6 gap-y-1 rounded-sm border border-rule-strong bg-paper-raised/95 px-4 py-3">
            <Stat label="People in HIGH RISK+ now" value={compact(popHigh[0] ?? 0)} />
            <Stat label={`Peak, ${peakIdx === 0 ? "now" : inHours(peakIdx)}`} value={compact(popHigh[peakIdx] ?? 0)} />
            <div className="row-span-2">
              <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Cascade-R, next 72 h</div>
              <CascadeRChart r={payload.cascade_r} width={200} height={50} />
            </div>
            <div className="col-span-2 text-[12px] text-ink-2">
              {next ? (
                <>
                  Next likely failure: <span className="font-semibold text-ink">{next.label}</span>, {timeWindow(payload.time, next.t10, next.t90)}
                </>
              ) : (
                "No failure above 50% in the next 72 hours."
              )}
            </div>
          </div>
          <div className="pointer-events-auto flex rounded-sm border border-rule-strong bg-paper-raised text-[12px] font-semibold" role="tablist" aria-label="Map layer">
            {metrics.map((m) => (
              <button
                key={m.id}
                role="tab"
                aria-selected={metric === m.id}
                onClick={() => setMetric(m.id)}
                className={cn("px-2.5 py-1.5 text-ink-2 hover:bg-paper-sunk", metric === m.id && "bg-ink text-paper-raised hover:bg-ink")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3">
          <Legend showTruth={metric === "truth"} />
        </div>
      </section>

      <aside className="flex min-h-0 flex-col border-l border-rule bg-paper-raised">
        <AnimatePresence mode="wait" initial={false}>
          {selection ? (
            <motion.div key="inspector" className="min-h-0 flex-1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }}>
              <Inspector city={city} payload={payload} sid={sid} />
            </motion.div>
          ) : (
            <motion.div key="sheet" className="flex min-h-0 flex-1 flex-col" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
              <div className="border-b border-rule px-4 pt-4 pb-3">
                <SectionTitle aside={`${payload.course.length} controls`}>Predicted course</SectionTitle>
                <p className="mt-1 text-[12px] leading-snug text-ink-3">
                  The most consequential chain the ensemble expects from here. Each control is a failure, each leg the mechanism that carries it to the next.
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ControlSheet payload={payload} />
                <div className="border-t border-rule px-4 pt-4 pb-1">
                  <SectionTitle>Other likely failures</SectionTitle>
                </div>
                <OtherFailures payload={payload} />
              </div>
              <div className="border-t border-rule p-3">
                <Link
                  href={`/app/${sid}/lab${target ? `?target=${encodeURIComponent(target)}` : ""}`}
                  className="flex items-center justify-center gap-2 rounded-sm bg-ink px-3 py-2.5 text-sm font-semibold text-paper-raised hover:bg-ink-2"
                >
                  <FlaskConical size={15} /> Break this chain
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-2xl font-bold tabular wdth-semi">{value}</div>
    </div>
  );
}

export function EngineDown({ error }: { error: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-sm border border-rule-strong bg-paper-raised p-5">
        <h2 className="text-base font-bold">The forecasting engine is not reachable</h2>
        <p className="mt-2 text-sm text-ink-2">
          Start it from <code className="rounded-sm bg-paper-sunk px-1">services/engine</code> with{" "}
          <code className="rounded-sm bg-paper-sunk px-1">uvicorn api:app --port 8072</code>, then reload.
        </p>
        <p className="mt-2 text-xs text-ink-3">{error}</p>
      </div>
    </div>
  );
}
