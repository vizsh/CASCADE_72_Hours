"use client";

import { scaleLinear } from "d3-scale";
import { area } from "d3-shape";
import { STATE_FILL } from "@/lib/risk";

const HZ = [0, 1, 3, 6, 12, 24, 48, 72];

/** Probability of each risk state across the horizon for one zone. Bands
 * stack: CRITICAL at the bottom, then HIGH RISK, then WATCH. */
export function RiskRibbon({ horizons, idx, width = 300, height = 96 }: { horizons: Record<string, [number[], number[], number[]]>; idx: number; width?: number; height?: number }) {
  const pts = HZ.filter((h) => horizons[String(h)]).map((h) => {
    const [w, hi, c] = horizons[String(h)];
    return { h, watch: w[idx], high: hi[idx], crit: c[idx] };
  });
  const x = scaleLinear().domain([0, 72]).range([0, width]);
  const y = scaleLinear().domain([0, 1]).range([height - 14, 0]);
  const mk = (lo: (d: (typeof pts)[0]) => number, hi: (d: (typeof pts)[0]) => number) =>
    area<(typeof pts)[0]>().x((d) => x(d.h)).y0((d) => y(lo(d))).y1((d) => y(hi(d)))(pts) ?? "";
  return (
    <svg width={width} height={height} role="img" aria-label="Probability of each risk state over 72 hours">
      {[0.5, 1].map((v) => (
        <line key={v} x1={0} x2={width} y1={y(v)} y2={y(v)} stroke="var(--rule)" strokeWidth={1} />
      ))}
      <path d={mk(() => 0, (d) => d.crit)} fill={STATE_FILL[3]} opacity={0.9} />
      <path d={mk((d) => d.crit, (d) => d.high)} fill={STATE_FILL[2]} opacity={0.75} />
      <path d={mk((d) => d.high, (d) => d.watch)} fill={STATE_FILL[1]} opacity={0.55} />
      {[0, 6, 24, 48, 72].map((h) => (
        <text key={h} x={x(h)} y={height - 2} fontSize={9} fill="var(--ink-3)" textAnchor={h === 0 ? "start" : h === 72 ? "end" : "middle"}>
          {h === 0 ? "now" : `+${h}h`}
        </text>
      ))}
      <text x={2} y={y(1) + 10} fontSize={9} fill="var(--ink-3)">100%</text>
    </svg>
  );
}
