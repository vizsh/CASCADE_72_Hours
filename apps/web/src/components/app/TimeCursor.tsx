"use client";

import { Pause, Play, StepBack, StepForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { STATE_FILL } from "@/lib/risk";
import { useStore } from "@/lib/store";
import { useScenario } from "./ScenarioProvider";

/** Global time cursor. Bars show how many zones each hourly issuance put at
 * HIGH RISK or CRITICAL; the tick strip shows the city-wide state. Dragging
 * moves "now" for every page: the forecaster only ever saw data that had
 * arrived by that hour. */
export function TimeCursor() {
  const { scenario, timeline, hour, readyHours } = useScenario();
  const setHour = useStore((s) => s.setHour);
  const playing = useStore((s) => s.playing);
  const setPlaying = useStore((s) => s.setPlaying);
  const track = useRef<HTMLDivElement>(null);
  const H = scenario?.hours ?? 1;
  const maxBar = useMemo(() => Math.max(10, ...timeline.map((r) => r.high + r.crit)), [timeline]);
  const rows = useMemo(() => new Map(timeline.map((r) => [r.hour, r])), [timeline]);

  const clamp = useCallback((h: number) => Math.max(0, Math.min(H - 1, h)), [H]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const cur = useStore.getState().hour ?? 0;
      if (cur >= H - 1 || cur >= readyHours - 1) {
        setPlaying(false);
        return;
      }
      setHour(cur + 1);
    }, 900);
    return () => clearInterval(id);
  }, [playing, H, readyHours, setHour, setPlaying]);

  const fromPointer = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    setHour(clamp(Math.round(((clientX - r.left) / r.width) * (H - 1))));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setHour(clamp(hour + (e.shiftKey ? 6 : 1)));
    if (e.key === "ArrowLeft") setHour(clamp(hour - (e.shiftKey ? 6 : 1)));
    if (e.key === " ") {
      e.preventDefault();
      setPlaying(!playing);
    }
  };

  if (!scenario) return <div className="h-[76px] border-t border-rule bg-paper-raised" />;
  const start = new Date(scenario.start);
  const days: { h: number; label: string }[] = [];
  for (let h = 0; h < H; h++) {
    const d = new Date(start.getTime() + h * 3600_000);
    if (d.getHours() === 0 || h === 0) days.push({ h, label: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) });
  }

  return (
    <div className="flex h-[76px] items-stretch gap-3 border-t border-rule bg-paper-raised px-3">
      <div className="flex items-center gap-1">
        <button aria-label="Previous hour" onClick={() => setHour(clamp(hour - 1))} className="rounded-sm p-1.5 text-ink-2 hover:bg-paper-sunk">
          <StepBack size={16} />
        </button>
        <button
          aria-label={playing ? "Pause replay" : "Play replay"}
          onClick={() => setPlaying(!playing)}
          className="rounded-sm border border-ink bg-ink p-1.5 text-paper-raised hover:bg-ink-2"
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button aria-label="Next hour" onClick={() => setHour(clamp(hour + 1))} className="rounded-sm p-1.5 text-ink-2 hover:bg-paper-sunk">
          <StepForward size={16} />
        </button>
      </div>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Issued forecast time"
        aria-valuemin={0}
        aria-valuemax={H - 1}
        aria-valuenow={hour}
        aria-valuetext={new Date(start.getTime() + hour * 3600_000).toLocaleString("en-IN")}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && fromPointer(e.clientX)}
        className="relative my-2 flex-1 cursor-ew-resize select-none touch-none"
      >
        <div className="absolute inset-x-0 top-0 bottom-[18px] flex items-end gap-px">
          {Array.from({ length: H }, (_, h) => {
            const r = rows.get(h);
            const ready = h < readyHours;
            const hiH = r ? (r.high / maxBar) * 100 : 0;
            const crH = r ? (r.crit / maxBar) * 100 : 0;
            return (
              <div key={h} className="relative flex h-full flex-1 flex-col justify-end" title={r ? `${r.time}: ${r.crit} critical, ${r.high} high` : undefined}>
                {!ready ? <div className="h-full bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--rule)_3px_4px)] opacity-60" /> : null}
                {ready && r ? (
                  <>
                    <div style={{ height: `${hiH}%`, background: STATE_FILL[2], opacity: 0.75 }} />
                    <div style={{ height: `${crH}%`, background: STATE_FILL[3] }} />
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="absolute inset-x-0 bottom-[12px] flex h-[4px] gap-px">
          {Array.from({ length: H }, (_, h) => {
            const r = rows.get(h);
            return <div key={h} className="flex-1" style={{ background: r && r.city_state > 0 ? STATE_FILL[r.city_state] : "var(--rule)" }} />;
          })}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[11px] text-[10px] font-medium text-ink-3">
          {days.map((d) => (
            <span key={d.h} className="absolute whitespace-nowrap" style={{ left: `${(d.h / (H - 1)) * 100}%` }}>
              <span className="mr-1 inline-block h-[9px] w-px translate-y-[1px] bg-rule-strong" />
              {d.label}
            </span>
          ))}
        </div>
        <div className="pointer-events-none absolute top-[-4px] bottom-[10px] w-0" style={{ left: `${(hour / Math.max(1, H - 1)) * 100}%` }}>
          <div className="absolute inset-y-0 -left-px w-[2px] bg-ink" />
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 rounded-sm bg-ink px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-paper-raised">NOW</div>
        </div>
      </div>
      <div className="hidden w-[150px] flex-col justify-center border-l border-rule pl-3 text-xs md:flex">
        <div className="font-semibold text-ink tabular">
          {new Date(start.getTime() + hour * 3600_000).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
        </div>
        <div className="text-ink-3">
          Hour {hour} of {H}
          {readyHours < H ? ` · ${readyHours} issued` : ""}
        </div>
      </div>
    </div>
  );
}
