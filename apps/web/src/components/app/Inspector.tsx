"use client";

import { ArrowLeft, ArrowRight, FlaskConical } from "lucide-react";
import Link from "next/link";
import { ASSET_LABEL } from "@/components/atlas/symbols";
import type { CascadeEvent, City, Payload } from "@/lib/api";
import { KIND_SHORT, RULE_LABEL, STATES, SYSTEMS, compact, inHours, pct, timeWindow } from "@/lib/risk";
import { useStore } from "@/lib/store";
import { ProbBar, SectionTitle, StateChip } from "./bits";
import { RiskRibbon } from "./RiskRibbon";

export function Inspector({ city, payload, sid }: { city: City; payload: Payload; sid: string }) {
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  if (!selection) return null;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
        <button onClick={() => select(null)} className="flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink">
          <ArrowLeft size={14} /> Back to course
        </button>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{selection.type}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {selection.type === "event" ? <EventPanel id={selection.id} payload={payload} city={city} sid={sid} /> : null}
        {selection.type === "zone" ? <ZonePanel id={selection.id} payload={payload} city={city} /> : null}
        {selection.type === "asset" ? <AssetPanel id={selection.id} payload={payload} city={city} /> : null}
      </div>
    </div>
  );
}

function EventRow({ e, payload }: { e: CascadeEvent; payload: Payload }) {
  const select = useStore((s) => s.select);
  return (
    <button onClick={() => select({ type: "event", id: e.id })} className="flex w-full items-center justify-between gap-3 py-1.5 text-left hover:text-course">
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{e.label}</span>
        <span className="text-[11px] text-ink-3 tabular">{e.p_occurred > 0.5 ? "happening" : timeWindow(payload.time, e.t10, e.t90)}</span>
      </span>
      <ProbBar p={e.p} width={36} />
    </button>
  );
}

function EventPanel({ id, payload, city, sid }: { id: string; payload: Payload; city: City; sid: string }) {
  const e = payload.events.find((x) => x.id === id);
  if (!e) return <p className="p-4 text-sm text-ink-3">This failure is no longer in the forecast at the selected hour.</p>;
  const byId = new Map(payload.events.map((x) => [x.id, x]));
  const causes = payload.links.filter((l) => l.to === id).sort((a, b) => b.p_given - a.p_given);
  const effects = payload.links.filter((l) => l.from === id).sort((a, b) => b.p_given - a.p_given);
  const zone = city.zones[e.zone_idx];
  const dep = e.asset ? payload.dependencies.find((d) => d.consumer === e.asset) : undefined;
  const sensors = payload.sensors.filter((s) => s.zone === e.zone);
  const occurred = e.p_occurred > 0.5;
  return (
    <div className="space-y-5 p-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">{SYSTEMS[e.system]?.label} · {KIND_SHORT[e.kind]}</div>
        <h3 className="mt-1 text-lg font-bold leading-tight">{e.label}</h3>
        <p className="mt-1 text-sm text-ink-2">{zone?.locality}</p>
      </div>
      <dl className="grid grid-cols-3 gap-3 border-y border-rule py-3 text-sm">
        <div>
          <dt className="text-[11px] text-ink-3">Within 72 h</dt>
          <dd className="text-xl font-bold tabular">{pct(e.p)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-ink-3">Within 24 h</dt>
          <dd className="text-xl font-bold tabular">{pct(e.p24)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-ink-3">{occurred ? "Status" : "Likely window"}</dt>
          <dd className="text-sm font-semibold leading-tight tabular">{occurred ? "Happening now" : timeWindow(payload.time, e.t10, e.t90)}</dd>
          {!occurred ? <dd className="text-[11px] text-ink-3">median {inHours(e.t50)}</dd> : null}
        </div>
      </dl>
      {causes.length ? (
        <section>
          <SectionTitle>Why: what leads here</SectionTitle>
          <ul className="mt-2 space-y-2">
            {causes.slice(0, 5).map((l) => {
              const from = byId.get(l.from);
              return (
                <li key={l.from} className="rounded-sm border border-rule bg-paper-raised p-2.5 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{from?.label ?? l.from}</span>
                    <span className="text-xs font-semibold text-ink-2 tabular">{pct(l.p_given)}</span>
                  </div>
                  <div className="mt-1 text-[12px] text-ink-3">
                    <span className="font-semibold text-course">{RULE_LABEL[l.rule]}</span> · {l.why}
                    {l.lag_h != null ? ` · lag ~${l.lag_h} h` : ""} · {l.lift.toFixed(1)}× more likely
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {effects.length ? (
        <section>
          <SectionTitle>What it sets off</SectionTitle>
          <ul className="mt-1 divide-y divide-rule">
            {effects.slice(0, 6).map((l) => {
              const to = byId.get(l.to);
              return to ? (
                <li key={l.to}>
                  <EventRow e={to} payload={payload} />
                </li>
              ) : null;
            })}
          </ul>
        </section>
      ) : null}
      {dep ? (
        <section>
          <SectionTitle>Which feeder supplies it (learned)</SectionTitle>
          <FeederBars dep={dep} city={city} />
        </section>
      ) : null}
      {sensors.length ? (
        <section>
          <SectionTitle>Sensors in this zone</SectionTitle>
          <ul className="mt-2 space-y-1 text-[13px]">
            {sensors.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span className="truncate">{s.name}</span>
                <span className="tabular text-ink-2">
                  {s.series.at(-1)?.[1]} · trust {pct(s.trust)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!e.kind.startsWith("hazard") ? (
        <Link href={`/app/${sid}/lab?target=${encodeURIComponent(e.id)}`} className="flex items-center justify-center gap-2 rounded-sm bg-ink px-3 py-2.5 text-sm font-semibold text-paper-raised hover:bg-ink-2">
          <FlaskConical size={15} /> Break the chain here <ArrowRight size={15} />
        </Link>
      ) : null}
    </div>
  );
}

function FeederBars({ dep, city }: { dep: Payload["dependencies"][0]; city: City }) {
  const names = new Map(city.assets.map((a) => [a.id, a.name]));
  return (
    <div className="mt-2 space-y-1.5">
      {dep.candidates.map((c, k) => (
        <div key={c} className="grid grid-cols-[1fr_auto] items-center gap-2 text-[12.5px]">
          <span className="truncate">
            {names.get(c) ?? c}
            {k === 0 ? <span className="ml-1 text-ink-3">(nearest)</span> : null}
          </span>
          <ProbBar p={dep.posterior[k]} width={60} state={0} />
        </div>
      ))}
      <p className="text-[11.5px] leading-snug text-ink-3">
        Prior assumed the nearest substation. Each time this site reported running on backup or on grid while candidate feeders were up or down, the belief moved.
      </p>
    </div>
  );
}

function ZonePanel({ id, payload, city }: { id: string; payload: Payload; city: City }) {
  const z = city.zones.find((x) => x.id === id);
  if (!z) return null;
  const st = payload.zones.state[z.idx];
  const ttc = payload.zones.ttc[z.id];
  const evs = payload.events.filter((e) => e.zone === z.id || (e.asset && city.assets.find((a) => a.id === e.asset)?.zone === z.idx));
  const assets = city.assets.filter((a) => a.zone === z.idx && a.kind !== "fuel");
  const truth = payload.truth?.state[z.idx];
  return (
    <div className="space-y-5 p-4">
      <div>
        <h3 className="text-lg font-bold leading-tight">{z.locality}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StateChip state={st} />
          {truth != null ? <span className="text-xs text-ink-3">replay truth now: {STATES[truth]}</span> : null}
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-3 border-y border-rule py-3 text-sm">
        <div>
          <dt className="text-[11px] text-ink-3">People</dt>
          <dd className="font-bold tabular">{compact(z.pop)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-ink-3">Height above drain</dt>
          <dd className="font-bold tabular">{z.hand.toFixed(1)} m</dd>
        </div>
        <div>
          <dt className="text-[11px] text-ink-3">Vulnerability</dt>
          <dd className="font-bold tabular">{pct(z.vuln)}</dd>
        </div>
      </dl>
      <section>
        <SectionTitle aside={ttc ? `critical ${timeWindow(payload.time, ttc[0], ttc[2])}` : "no critical window"}>Risk over 72 hours</SectionTitle>
        <div className="mt-2">
          <RiskRibbon horizons={payload.zones.horizons} idx={z.idx} width={320} />
        </div>
        <p className="mt-1 text-[11.5px] text-ink-3">
          {pct(payload.zones.p_crit24[z.idx])} chance of CRITICAL within 24 h; {pct(payload.zones.p_high72[z.idx])} of HIGH RISK or worse within 72 h.
        </p>
      </section>
      {evs.length ? (
        <section>
          <SectionTitle>Predicted failures here</SectionTitle>
          <ul className="mt-1 divide-y divide-rule">
            {evs.slice(0, 8).map((e) => (
              <li key={e.id}>
                <EventRow e={e} payload={payload} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {assets.length ? (
        <section>
          <SectionTitle>Assets in this zone</SectionTitle>
          <ul className="mt-2 space-y-1 text-[13px]">
            {assets.map((a) => (
              <li key={a.id} className="flex justify-between gap-2">
                <span className="truncate">{a.name}</span>
                <span className="text-ink-3">{ASSET_LABEL[a.kind]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function AssetPanel({ id, payload, city }: { id: string; payload: Payload; city: City }) {
  const a = city.assets.find((x) => x.id === id);
  if (!a) return null;
  const evs = payload.events.filter((e) => e.asset === a.id);
  const dep = payload.dependencies.find((d) => d.consumer === a.id);
  const cands = city.power_candidates[a.id];
  const attrs = Object.entries(a.attrs).filter(([k]) => !k.endsWith("_estimated") && k !== "name_from_osm");
  return (
    <div className="space-y-5 p-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">{ASSET_LABEL[a.kind]}</div>
        <h3 className="mt-1 text-lg font-bold leading-tight">{a.name}</h3>
        <p className="mt-1 text-xs text-ink-3">
          {a.provenance === "osm" ? "Location from OpenStreetMap" : "Synthetic placement: no open registry connected"}
          {a.attrs.beds_estimated ? " · bed count estimated" : ""}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-rule py-3 text-sm">
        {attrs.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] text-ink-3">{k.replaceAll("_", " ")}</dt>
            <dd className="font-semibold tabular">{String(v)}</dd>
          </div>
        ))}
      </dl>
      {evs.length ? (
        <section>
          <SectionTitle>Predicted failures</SectionTitle>
          <ul className="mt-1 divide-y divide-rule">
            {evs.map((e) => (
              <li key={e.id}>
                <EventRow e={e} payload={payload} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-ink-3">No failure of this asset clears 12% in the next 72 hours.</p>
      )}
      {dep ? (
        <section>
          <SectionTitle>Which feeder supplies it (learned)</SectionTitle>
          <FeederBars dep={dep} city={city} />
        </section>
      ) : cands ? (
        <section>
          <SectionTitle>Feeder candidates</SectionTitle>
          <p className="mt-1 text-[12.5px] text-ink-3">No evidence yet; the prior assumes the nearest substation ({city.assets.find((x) => x.id === cands[0])?.name}).</p>
        </section>
      ) : null}
    </div>
  );
}
