"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import type { CascadeEvent, Payload } from "@/lib/api";
import { COURSE, KIND_SHORT, STATE_FILL, SYSTEMS, clock } from "@/lib/risk";
import { useStore } from "@/lib/store";

/** Swimlane knowledge graph: one row per city system, time runs left to
 * right, so a cascade reads as a path that drops through the systems it
 * reaches. Line style carries provenance: dashed = forecast mechanism,
 * dotted = dependency learned from data. */
export function CascadeGraph({ payload, width, height }: { payload: Payload; width: number; height: number }) {
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const { nodes, edges, lanes, x } = useMemo(() => layout(payload, width, height), [payload, width, height]);
  const course = useMemo(() => new Set(payload.course), [payload.course]);
  const focus = selection?.type === "event" ? selection.id : hoverId;
  const reach = useMemo(() => {
    if (!focus) return null;
    const down = new Set<string>([focus]);
    const up = new Set<string>([focus]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of payload.links) {
        if (down.has(e.from) && !down.has(e.to)) {
          down.add(e.to);
          grew = true;
        }
        if (up.has(e.to) && !up.has(e.from)) {
          up.add(e.from);
          grew = true;
        }
      }
    }
    return { down, up };
  }, [focus, payload.links]);

  const nodeById = new Map(nodes.map((n) => [n.e.id, n]));
  const courseLegs = payload.course.slice(1).map((id, i) => [payload.course[i], id]);
  const ticks = width > 900 ? [0, 3, 6, 12, 24, 36, 48, 72] : width > 600 ? [0, 6, 12, 24, 48, 72] : [0, 12, 72];

  return (
    <svg width={width} height={height} role="img" aria-label="Cascade graph by system and time" className="select-none">
      {lanes.map((l) => (
        <g key={l.key}>
          <rect x={0} y={l.y0} width={width} height={l.y1 - l.y0} fill={l.i % 2 ? "transparent" : "var(--paper-sunk)"} opacity={0.55} />
          <text x={10} y={l.y0 + 15} fontSize={10.5} fontWeight={700} fill="var(--ink-3)" letterSpacing="0.06em">
            {l.label.toUpperCase()}
          </text>
        </g>
      ))}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={24} y2={height - 18} stroke="var(--rule)" strokeDasharray={t === 0 ? undefined : "2 4"} />
          <text x={x(t)} y={height - 5} fontSize={10} fill="var(--ink-3)" textAnchor="middle">
            {t === 0 ? "now" : width > 900 ? `+${t}h · ${clock(payload.time, t)}` : `+${t}h`}
          </text>
        </g>
      ))}
      <line x1={x(0)} x2={x(0)} y1={20} y2={height - 18} stroke="var(--ink)" strokeWidth={1.5} />

      {edges.map((ed) => {
        const a = nodeById.get(ed.from);
        const b = nodeById.get(ed.to);
        if (!a || !b) return null;
        const onCourse = courseLegs.some(([f, t]) => f === ed.from && t === ed.to);
        const lit = reach ? reach.down.has(ed.from) && reach.down.has(ed.to) : false;
        const lit2 = reach ? reach.up.has(ed.from) && reach.up.has(ed.to) : false;
        const dim = reach && !lit && !lit2;
        const mx = (a.x + b.x) / 2;
        const d = `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
        return (
          <path
            key={`${ed.from}>${ed.to}`}
            d={d}
            fill="none"
            stroke={onCourse ? COURSE : ed.rule === "feedback" ? "var(--risk-critical)" : "var(--ink-2)"}
            strokeWidth={onCourse ? 3 : lit ? 2 : 1}
            strokeDasharray={ed.rule === "learned" ? "1.5 3" : onCourse ? undefined : "5 3"}
            opacity={dim ? 0.05 : onCourse ? 0.95 : lit || lit2 ? 0.85 : 0.14}
          />
        );
      })}

      {nodes.map((n) => {
        const isCourse = course.has(n.e.id);
        const sel = selection?.type === "event" && selection.id === n.e.id;
        const dim = reach && !reach.down.has(n.e.id) && !reach.up.has(n.e.id);
        const sev = n.e.p >= 0.6 ? 3 : n.e.p >= 0.3 ? 2 : 1;
        const r = 5 + 9 * Math.sqrt(n.e.p);
        return (
          <motion.g
            key={n.e.id}
            initial={false}
            animate={{ x: n.x, y: n.y, opacity: dim ? 0.18 : 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            onMouseEnter={() => setHoverId(n.e.id)}
            onMouseLeave={() => setHoverId(null)}
            onClick={() => select(sel ? null : { type: "event", id: n.e.id })}
            style={{ cursor: "pointer" }}
          >
            {isCourse ? <circle r={r + 5} fill="none" stroke={COURSE} strokeWidth={2.4} /> : null}
            <NodeShape system={n.e.system} r={r} fill={n.e.kind.startsWith("hazard") ? "var(--paper-raised)" : STATE_FILL[sev]} occurred={n.e.p_occurred > 0.5} />
            {sel ? <circle r={r + 9} fill="none" stroke="var(--ink)" strokeWidth={1.5} /> : null}
          </motion.g>
        );
      })}
      {/* labels in their own pass so later nodes never cover them */}
      {nodes.map((n) => {
        const isCourse = course.has(n.e.id);
        const sel = selection?.type === "event" && selection.id === n.e.id;
        if (!(isCourse || sel || n.e.id === hoverId || n.labelled)) return null;
        const dim = reach && !reach.down.has(n.e.id) && !reach.up.has(n.e.id);
        const r = 5 + 9 * Math.sqrt(n.e.p);
        return (
          <text
            key={`l-${n.e.id}`}
            x={n.x + r + 7}
            y={n.y - r - 3}
            fontSize={11}
            fontWeight={isCourse ? 700 : 600}
            fill={isCourse ? COURSE : "var(--ink)"}
            opacity={dim ? 0.25 : 1}
            paintOrder="stroke"
            stroke="var(--paper)"
            strokeWidth={4}
            pointerEvents="none"
          >
            {short(n.e)}
          </text>
        );
      })}
    </svg>
  );
}

function short(e: CascadeEvent) {
  const name = e.name.length > 26 ? `${e.name.slice(0, 25)}…` : e.name;
  return e.kind.startsWith("hazard") ? e.label.slice(0, 34) : `${KIND_SHORT[e.kind]} · ${name}`;
}

function NodeShape({ system, r, fill, occurred }: { system: string; r: number; fill: string; occurred: boolean }) {
  const stroke = "var(--ink)";
  const sw = occurred ? 2.2 : 1.2;
  switch (system) {
    case "hazard":
      return <path d={`M0,${-r * 1.2} L${r * 1.1},${r * 0.8} L${-r * 1.1},${r * 0.8} Z`} fill={fill} stroke={COURSE} strokeWidth={2.4} />;
    case "power":
      return <path d={`M0,${-r} L${r},${r * 0.8} L${-r},${r * 0.8} Z`} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case "health":
      return <rect x={-r} y={-r} width={r * 2} height={r * 2} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case "mobility":
    case "transit":
      return <rect x={-r} y={-r * 0.65} width={r * 2} height={r * 1.3} rx={r * 0.3} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case "telecom":
      return <path d={`M0,${-r} L${r},0 L0,${r} L${-r},0 Z`} fill={fill} stroke={stroke} strokeWidth={sw} />;
    default:
      return <circle r={r} fill={fill} stroke={stroke} strokeWidth={sw} />;
  }
}

type Node = { e: CascadeEvent; x: number; y: number; labelled: boolean };

function layout(payload: Payload, width: number, height: number) {
  const perLane = new Map<string, number>();
  const keep = payload.events
    .filter((e) => e.p >= 0.3 || payload.course.includes(e.id))
    .sort((a, b) => Number(payload.course.includes(b.id)) - Number(payload.course.includes(a.id)) || b.score - a.score)
    .filter((e) => {
      const n = perLane.get(e.system) ?? 0;
      perLane.set(e.system, n + 1);
      return n < 7;
    });
  const ids = new Set(keep.map((e) => e.id));
  const systems = Object.entries(SYSTEMS)
    .sort((a, b) => a[1].order - b[1].order)
    .filter(([k]) => keep.some((e) => e.system === k));
  const top = 26;
  const bottom = 22;
  const laneH = (height - top - bottom) / Math.max(1, systems.length);
  const lanes = systems.map(([k, v], i) => ({ key: k, label: v.label, i, y0: top + i * laneH, y1: top + (i + 1) * laneH }));
  const left = 34;
  const right = Math.min(190, width * 0.22);
  // piecewise time axis: the next 12 h get half the width, where decisions live
  const span = width - left - right;
  const x = (t: number) => {
    const c = Math.max(0, Math.min(72, t));
    const f = c <= 12 ? (c / 12) * 0.5 : c <= 24 ? 0.5 + ((c - 12) / 12) * 0.22 : 0.72 + ((c - 24) / 48) * 0.28;
    return left + f * span;
  };
  const nodes: Node[] = [];
  for (const lane of lanes) {
    const members = keep
      .filter((e) => e.system === lane.key)
      .map((e) => ({ e, t: e.p_occurred > 0.5 ? 0 : e.t50 ?? 72 }))
      .sort((a, b) => a.t - b.t || b.e.p - a.e.p);
    const rows = Math.max(1, Math.min(3, Math.floor((laneH - 22) / 18)));
    const lastX = Array(rows).fill(-1e9);
    members.forEach(({ e, t }, k) => {
      const want = x(t);
      // beeswarm along time: take the row where the node can sit closest to its true time
      let best = 0;
      let bestX = Infinity;
      for (let r = 0; r < rows; r++) {
        const px = Math.max(want, lastX[r] + 24);
        if (px < bestX) {
          bestX = px;
          best = r;
        }
      }
      lastX[best] = bestX;
      const y = lane.y0 + 26 + best * ((laneH - 34) / Math.max(1, rows - 1 || 1));
      nodes.push({ e, x: Math.min(bestX, width - 12), y: Math.min(y, lane.y1 - 10), labelled: k === 0 });
    });
  }
  const edges = payload.links.filter((l) => ids.has(l.from) && ids.has(l.to));
  return { nodes, edges, lanes, x };
}
