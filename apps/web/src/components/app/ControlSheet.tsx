"use client";

import { motion } from "motion/react";
import type { CascadeEvent, Link as CLink, Payload } from "@/lib/api";
import { KIND_SHORT, RULE_LABEL, SYSTEMS, inHours, timeWindow } from "@/lib/risk";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ControlNumber, ProbBar } from "./bits";

/** The control description sheet: one numbered row per leg of the predicted
 * course, in the same order and ink as the map overprint. */
export function ControlSheet({ payload, compact = false }: { payload: Payload; compact?: boolean }) {
  const byId = new Map(payload.events.map((e) => [e.id, e]));
  const course = payload.course.map((id) => byId.get(id)).filter(Boolean) as CascadeEvent[];
  const links = new Map(payload.links.map((l) => [`${l.from}>${l.to}`, l]));
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);

  if (!course.length)
    return (
      <div className="px-4 py-6 text-sm text-ink-3">
        No propagating chain clears the 12% threshold in the next 72 hours. Zone risk on the map still updates as observations arrive.
      </div>
    );

  return (
    <ol className="divide-y divide-rule">
      {course.map((e, i) => {
        const leg: CLink | undefined = i > 0 ? links.get(`${course[i - 1].id}>${e.id}`) : undefined;
        const active = selection?.type === "event" && selection.id === e.id;
        const occurred = e.p_occurred > 0.5;
        return (
          <motion.li
            key={e.id}
            layout
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              onClick={() => select(active ? null : { type: "event", id: e.id })}
              className={cn(
                "grid w-full grid-cols-[30px_1fr_auto] items-start gap-x-3 px-4 py-2.5 text-left transition-colors hover:bg-paper-sunk",
                active && "bg-course-wash hover:bg-course-wash",
              )}
            >
              <ControlNumber n={i} start={i === 0} finish={i === course.length - 1 && i > 0} occurred={occurred} />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold leading-snug text-ink">{e.label}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-3">
                  <span className="font-semibold uppercase tracking-wide text-ink-2 wdth-semi">{SYSTEMS[e.system]?.label ?? e.system}</span>
                  <span>·</span>
                  <span className="tabular">{occurred ? "already happening" : timeWindow(payloadTime(payload), e.t10, e.t90)}</span>
                  {!occurred && e.t50 != null ? <span className="text-ink-2">({inHours(e.t50)})</span> : null}
                </span>
                {leg && !compact ? (
                  <span className="mt-1 block text-[11.5px] leading-snug text-ink-3">
                    <span className="font-semibold text-course">{RULE_LABEL[leg.rule]}:</span> {leg.why}
                    {leg.lag_h != null ? ` · lag ~${leg.lag_h} h` : ""} · {Math.round(leg.p_given * 100)}% given the previous control
                  </span>
                ) : null}
              </span>
              <span className="pt-0.5">
                {e.kind.startsWith("hazard") ? <span className="text-xs font-semibold text-ink-3 tabular">{Math.round(e.p * 100)}%</span> : <ProbBar p={e.p} width={46} />}
              </span>
            </button>
          </motion.li>
        );
      })}
    </ol>
  );
}

export function payloadTime(p: Payload) {
  return p.time;
}

export function OtherFailures({ payload, limit = 8 }: { payload: Payload; limit?: number }) {
  const inCourse = new Set(payload.course);
  const select = useStore((s) => s.select);
  const rest = payload.events.filter((e) => !inCourse.has(e.id) && !e.kind.startsWith("hazard") && e.p >= 0.2).slice(0, limit);
  if (!rest.length) return null;
  return (
    <ul className="divide-y divide-rule">
      {rest.map((e) => (
        <li key={e.id}>
          <button onClick={() => select({ type: "event", id: e.id })} className="grid w-full grid-cols-[1fr_auto] gap-3 px-4 py-2 text-left hover:bg-paper-sunk">
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-ink">{e.label}</span>
              <span className="text-[11px] text-ink-3 tabular">
                {KIND_SHORT[e.kind]} · {e.p_occurred > 0.5 ? "happening" : timeWindow(payload.time, e.t10, e.t90)}
              </span>
            </span>
            <ProbBar p={e.p} width={40} state={e.p >= 0.5 ? 3 : 2} />
          </button>
        </li>
      ))}
    </ul>
  );
}
