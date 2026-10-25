"use client";

import { CascadeGraph } from "@/components/app/CascadeGraph";
import { Inspector } from "@/components/app/Inspector";
import { MapClient } from "@/components/app/MapClient";
import { useScenario } from "@/components/app/ScenarioProvider";
import { SectionTitle, Skeleton } from "@/components/app/bits";
import { useStore } from "@/lib/store";
import { useSize } from "@/lib/useSize";
import { EngineDown } from "../CommandView";

export default function ExplorePage() {
  const { city, payload, sid, error } = useScenario();
  const selection = useStore((s) => s.selection);
  const [ref, size] = useSize<HTMLDivElement>();
  if (error) return <EngineDown error={error} />;
  if (!city || !payload) return <Skeleton className="h-full rounded-none" />;
  const branches = payload.branches.slice(0, 4);

  return (
    <div className="grid h-full grid-cols-[minmax(260px,27%)_1fr_330px] grid-rows-[1fr_auto]">
      <section className="relative row-span-2 min-w-0 border-r border-rule">
        <MapClient city={city} payload={payload} />
      </section>
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="flex items-baseline justify-between border-b border-rule px-4 py-2.5">
          <SectionTitle>Cascade graph · systems × time</SectionTitle>
          <span className="text-[11.5px] text-ink-3">Hover a failure to trace what causes it and what it sets off. Click to pin it everywhere.</span>
        </div>
        <div ref={ref} className="min-h-0 flex-1">
          {size.width > 0 ? <CascadeGraph payload={payload} width={size.width} height={size.height} /> : null}
        </div>
      </section>
      <aside className="row-span-2 flex min-h-0 flex-col border-l border-rule bg-paper-raised">
        {selection ? (
          <Inspector city={city} payload={payload} sid={sid} />
        ) : (
          <div className="space-y-4 overflow-y-auto p-4">
            <SectionTitle>How the ensemble branches</SectionTitle>
            <p className="text-[12.5px] leading-snug text-ink-3">
              Order in which systems fail across {payload.weather.members} weather members and the simulated futures they drive. Each line is a distinct sequence.
            </p>
            <ol className="space-y-3">
              {branches.map((b, i) => (
                <li key={i} className="text-[12.5px]">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-semibold">Path {i + 1}</span>
                    <span className="font-bold tabular">{Math.round(b.p * 100)}%</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {b.sequence.length ? (
                      b.sequence.map((s, k) => (
                        <span key={k} className="flex items-center gap-1">
                          {k > 0 ? <span className="text-ink-4">→</span> : null}
                          <span className="rounded-sm border border-rule-strong bg-paper px-1.5 py-0.5 text-[11.5px] font-medium capitalize">{s}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-ink-3">no failure in 72 h</span>
                    )}
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-paper-sunk">
                    <div className="h-1 rounded-full bg-ink" style={{ width: `${b.p * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
            <div className="border-t border-rule pt-3 text-[12px] leading-snug text-ink-3">
              <p>
                <span className="font-semibold text-ink">Line styles.</span> Violet: the predicted course. Dashed: a forecast mechanism. Dotted: a dependency
                learned from data. Red: a feedback loop.
              </p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
