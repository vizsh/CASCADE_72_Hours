"use client";

import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";

/** Cascade-R over the next 72 h: propagated failures in the next 3 h per
 * failure in the last 3 h. Above 1 the cascade feeds itself. */
export function CascadeRChart({ r, width = 220, height = 54 }: { r: number[]; width?: number; height?: number }) {
  const x = scaleLinear().domain([0, Math.max(1, r.length - 1)]).range([0, width]);
  const y = scaleLinear().domain([0, Math.max(1.6, ...r)]).range([height - 12, 2]);
  const path = line<number>().x((_, i) => x(i)).y((d) => y(d))(r) ?? "";
  const fill = area<number>().x((_, i) => x(i)).y0(y(1)).y1((d) => y(Math.max(1, d)))(r) ?? "";
  return (
    <svg width={width} height={height} className="overflow-visible" role="img" aria-label="Cascade-R over the next 72 hours">
      <path d={fill} fill="var(--risk-critical)" opacity={0.18} />
      <line x1={0} x2={width} y1={y(1)} y2={y(1)} stroke="var(--risk-critical)" strokeDasharray="3 3" strokeWidth={1} />
      <text x={width} y={y(1) - 3} textAnchor="end" fontSize={9} fill="var(--risk-critical-ink)" fontWeight={600}>
        R = 1 self-sustaining
      </text>
      <path d={path} fill="none" stroke="var(--ink)" strokeWidth={1.6} strokeDasharray="4 2.5" />
      {[0, 24, 48, 72].map((h) => (
        <text key={h} x={x(Math.min(h, r.length - 1))} y={height} fontSize={9} fill="var(--ink-3)" textAnchor={h === 0 ? "start" : h === 72 ? "end" : "middle"}>
          {h === 0 ? "now" : `+${h}h`}
        </text>
      ))}
    </svg>
  );
}
