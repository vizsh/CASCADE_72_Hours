"use client";

import { STATES } from "@/lib/risk";
import { StateGlyph } from "./bits";

export function Legend({ showTruth = false }: { showTruth?: boolean }) {
  return (
    <div className="pointer-events-auto w-[230px] rounded-sm border border-rule-strong bg-paper-raised/95 p-3 text-[11.5px] text-ink-2 backdrop-blur-[2px]">
      <div className="mb-1.5 font-bold uppercase tracking-wider text-ink">Zone risk</div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {STATES.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <StateGlyph state={i} size={11} />
            {s}
          </li>
        ))}
      </ul>
      <div className="mt-2.5 mb-1 font-bold uppercase tracking-wider text-ink">Predicted course</div>
      <div className="flex items-center gap-2">
        <svg width="70" height="18" aria-hidden>
          <path d="M6 3 L11 13 H1 Z" fill="none" stroke="var(--course)" strokeWidth="1.8" />
          <line x1="11" y1="9" x2="34" y2="9" stroke="var(--course)" strokeWidth="2.2" />
          <circle cx="41" cy="9" r="6" fill="none" stroke="var(--course)" strokeWidth="2" />
          <circle cx="60" cy="9" r="6" fill="var(--course)" />
        </svg>
        <span>start · leg · control · already happening</span>
      </div>
      <div className="mt-2.5 mb-1 font-bold uppercase tracking-wider text-ink">Lines</div>
      <ul className="space-y-0.5">
        <li className="flex items-center gap-2"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--ink)" strokeWidth="1.6" /></svg>observed</li>
        <li className="flex items-center gap-2"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--ink)" strokeWidth="1.6" strokeDasharray="4 3" /></svg>forecast</li>
        <li className="flex items-center gap-2"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--ink)" strokeWidth="1.6" strokeDasharray="1.2 2.6" /></svg>inferred / learned</li>
        <li className="flex items-center gap-2"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--contour)" strokeWidth="1" /></svg>5 m contour</li>
      </ul>
      {showTruth ? <p className="mt-2 text-[10.5px] text-ink-3">Truth layer shows the hidden world model at this hour; the forecaster never sees it.</p> : null}
    </div>
  );
}
