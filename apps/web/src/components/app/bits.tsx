"use client";

import { motion } from "motion/react";
import { STATES, STATE_FILL, STATE_INK } from "@/lib/risk";
import { cn } from "@/lib/utils";

/** Risk state as a chip: colour is always paired with the word and a shape
 * whose fill grows with severity, so the state reads without colour. */
export function StateChip({ state, size = "md", className }: { state: number; size?: "sm" | "md" | "lg"; className?: string }) {
  const pad = size === "lg" ? "px-3 py-1.5 text-base" : size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs";
  return (
    <motion.span
      key={state}
      initial={{ opacity: 0.4, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={cn("inline-flex items-center gap-1.5 rounded-sm border font-semibold uppercase tracking-wide wdth-semi", pad, className)}
      style={{ color: STATE_INK[state], borderColor: STATE_FILL[state], background: state === 0 ? "transparent" : `${STATE_FILL[state]}1f` }}
    >
      <StateGlyph state={state} />
      {STATES[state]}
    </motion.span>
  );
}

export function StateGlyph({ state, size = 10 }: { state: number; size?: number }) {
  const c = STATE_FILL[state];
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden>
      {state === 0 && <circle cx="5" cy="5" r="3.6" fill="none" stroke={c} strokeWidth="1.4" />}
      {state === 1 && <path d="M5 1.2 L8.8 8.6 H1.2 Z" fill="none" stroke={c} strokeWidth="1.4" />}
      {state === 2 && <path d="M5 1.2 L8.8 8.6 H1.2 Z" fill={c} />}
      {state === 3 && <rect x="1.2" y="1.2" width="7.6" height="7.6" fill={c} />}
    </svg>
  );
}

export function ProbBar({ p, state = 3, width = 64 }: { p: number; state?: number; width?: number }) {
  return (
    <span className="inline-flex items-center gap-2 tabular">
      <span className="relative block h-1.5 overflow-hidden rounded-full bg-paper-sunk" style={{ width }}>
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: STATE_FILL[state] }}
          initial={false}
          animate={{ width: `${Math.round(p * 100)}%` }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        />
      </span>
      <span className="w-9 text-right text-xs font-semibold text-ink-2">{Math.round(p * 100)}%</span>
    </span>
  );
}

export function ControlNumber({ n, occurred, start, finish }: { n: number; occurred?: boolean; start?: boolean; finish?: boolean }) {
  if (start)
    return (
      <svg width="26" height="26" viewBox="0 0 26 26" aria-label="Start">
        <path d="M13 3 L23.5 22 H2.5 Z" fill="none" stroke="var(--course)" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
    );
  return (
    <span
      className="relative inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border-[2.2px] text-[12px] font-bold"
      style={{ borderColor: "var(--course)", color: occurred ? "#fff" : "var(--course)", background: occurred ? "var(--course)" : "transparent" }}
    >
      {finish ? <span className="absolute inset-[3px] rounded-full border-[2px]" style={{ borderColor: occurred ? "#fff" : "var(--course)" }} /> : null}
      <span className="relative">{n}</span>
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-sm border border-rule-strong bg-paper-raised px-1 text-[10px] font-semibold text-ink-3">{children}</kbd>;
}

export function Rule({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-rule", className)} />;
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink wdth-semi">{children}</h2>
      {aside ? <div className="text-xs text-ink-3">{aside}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-sm bg-paper-sunk", className)} />;
}
