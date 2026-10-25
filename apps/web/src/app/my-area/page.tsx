"use client";

import { Building2, Cross, Loader2, MapPin, Send } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Mark } from "@/components/app/AppShell";
import { StateGlyph } from "@/components/app/bits";
import { ENGINE, useCity, useLive, usePayload, type City, type Payload } from "@/lib/api";
import { ADVICE, KIND_TEXT, LANGS, STATUS, T, type Lang } from "@/lib/i18n";
import { STATE_FILL, STATE_INK, clock } from "@/lib/risk";
import { cn } from "@/lib/utils";

const REPLAY = { sid: "monsoon-2023", hour: 40 };

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dx = (a.lon - b.lon) * 111 * Math.cos((a.lat * Math.PI) / 180);
  const dy = (a.lat - b.lat) * 111;
  return Math.hypot(dx, dy);
}

export default function MyAreaPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [mode, setMode] = useState<"replay" | "live">("replay");
  const [query, setQuery] = useState("");
  const [zoneId, setZoneId] = useState<string | null>(null);
  const city = useCity("nagpur");
  const replay = usePayload(REPLAY.sid, REPLAY.hour);
  const live = useLive("nagpur");
  const payload = mode === "replay" ? replay.data : live.data;

  const localities = useMemo(() => {
    if (!city.data) return [];
    const best = new Map<string, City["zones"][0]>();
    for (const z of city.data.zones) {
      if (z.lake || z.pop < 500 || z.locality.startsWith("Outer") || z.locality.startsWith("Zone")) continue;
      const cur = best.get(z.locality);
      if (!cur || z.pop > cur.pop) best.set(z.locality, z);
    }
    return [...best.values()].sort((a, b) => a.locality.localeCompare(b.locality));
  }, [city.data]);
  const matches = query ? localities.filter((z) => z.locality.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : [];
  const zone = city.data?.zones.find((z) => z.id === zoneId);

  const deva = lang !== "en";
  return (
    <div className={cn("min-h-dvh bg-paper", deva && "font-deva")}>
      <header className="border-b border-rule bg-paper-raised">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2" aria-label="Home">
            <Mark size={20} />
          </Link>
          <h1 className="text-lg font-bold">{T.title[lang]}</h1>
          <div className="ml-auto flex rounded-sm border border-rule-strong text-[13px]" role="group" aria-label="Language">
            {LANGS.map((l) => (
              <button key={l.id} onClick={() => setLang(l.id)} className={cn("px-2 py-1", lang === l.id && "bg-ink text-paper-raised")} lang={l.id}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg space-y-5 px-4 py-5">
        <div className="flex rounded-sm border border-rule-strong text-[13px] font-semibold" role="group">
          {(["replay", "live"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn("flex-1 px-3 py-2", mode === m && "bg-ink text-paper-raised")}>
              {m === "replay" ? T.replay[lang] : T.live[lang]}
            </button>
          ))}
        </div>

        <div className="relative">
          <label className="mb-1 block text-[14px] font-semibold" htmlFor="area">
            {T.search[lang]}
          </label>
          <div className="flex items-center gap-2 rounded-sm border border-ink bg-paper-raised px-3">
            <MapPin size={18} className="text-ink-3" />
            <input
              id="area"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setZoneId(null);
              }}
              placeholder="Dharampeth, Mominpura, Ramdaspeth…"
              className="h-12 w-full bg-transparent text-[17px] outline-none placeholder:text-ink-4"
              autoComplete="off"
            />
          </div>
          {matches.length && !zoneId ? (
            <ul className="absolute z-10 mt-1 w-full divide-y divide-rule rounded-sm border border-rule-strong bg-paper-raised shadow-[0_6px_20px_-8px_rgba(21,23,26,0.3)]">
              {matches.map((z) => (
                <li key={z.id}>
                  <button
                    className="w-full px-3 py-2.5 text-left text-[16px] hover:bg-paper-sunk"
                    onClick={() => {
                      setZoneId(z.id);
                      setQuery(z.locality);
                    }}
                  >
                    {z.locality}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {zone && payload && city.data ? (
          <AreaCard lang={lang} zone={zone} payload={payload} city={city.data} />
        ) : mode === "live" && live.isLoading ? (
          <p className="flex items-center gap-2 text-[15px] text-ink-2">
            <Loader2 size={16} className="animate-spin" /> Fetching today&rsquo;s forecast…
          </p>
        ) : null}

        <p className="border-t border-rule pt-4 text-[13px] leading-relaxed text-ink-3">{T.official[lang]}</p>
      </main>
    </div>
  );
}

function AreaCard({ lang, zone, payload, city }: { lang: Lang; zone: City["zones"][0]; payload: Payload; city: City }) {
  const state = payload.zones.state[zone.idx];
  const ttc = payload.zones.ttc[zone.id];
  const nearZones = new Set([zone.id]);
  const events = payload.events
    .filter((e) => (nearZones.has(e.zone) || km(e, zone) < 1.6) && KIND_TEXT[e.kind] && e.p >= 0.25)
    .sort((a, b) => (a.t50 ?? 99) - (b.t50 ?? 99))
    .filter((e, i, arr) => arr.findIndex((x) => x.kind === e.kind) === i)
    .slice(0, 4);
  const systems = new Set(events.map((e) => e.system));
  const hazards = payload.events.filter((e) => e.kind.startsWith("hazard")).map((e) => e.kind);
  const adviceKeys = [
    ...(hazards.includes("hazard_heat") ? ["heat"] : []),
    ...(hazards.includes("hazard_plume") ? ["hazmat"] : []),
    ...(hazards.includes("hazard_crowd") ? ["crowd"] : []),
    ...["water", "mobility", "power", "telecom", "ems", "health"].filter((s) => systems.has(s)),
  ];
  const advice = state === 0 && !adviceKeys.length ? ["none"] : adviceKeys.length ? adviceKeys.slice(0, 3) : ["none"];
  const failing = new Set(payload.events.filter((e) => (e.kind === "hospital_overload" || e.kind === "hospital_blackout") && e.p >= 0.5).map((e) => e.asset));
  const hospital = city.assets
    .filter((a) => a.kind === "hospital" && !failing.has(a.id))
    .map((a) => ({ a, d: km(a, zone) }))
    .sort((x, y) => x.d - y.d)[0];
  const shelter = city.assets
    .filter((a) => a.kind === "shelter")
    .map((a) => ({ a, d: km(a, zone) }))
    .sort((x, y) => x.d - y.d)[0];

  return (
    <div className="space-y-5">
      <section className="rounded-sm border-2 p-4" style={{ borderColor: STATE_FILL[state], background: state ? `${STATE_FILL[state]}14` : "var(--paper-raised)" }}>
        <div className="text-[13px] font-semibold text-ink-3">
          {T.status[lang]} · {zone.locality}
        </div>
        <div className="mt-1 flex items-center gap-3">
          <StateGlyph state={state} size={22} />
          <span className="text-[30px] font-extrabold leading-tight" style={{ color: STATE_INK[state] }}>
            {STATUS[state][lang]}
          </span>
        </div>
        <p className="mt-2 text-[15px] text-ink-2">
          {ttc ? (
            <>
              {T.changes[lang]} <b className="tabular">{clock(payload.time, ttc[0])}–{clock(payload.time, ttc[2])}</b>
            </>
          ) : (
            T.noChange[lang]
          )}
        </p>
      </section>

      {events.length ? (
        <section>
          <h2 className="text-[16px] font-bold">{T.next[lang]}</h2>
          <ul className="mt-2 divide-y divide-rule rounded-sm border border-rule bg-paper-raised">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[15px]">
                <span>{KIND_TEXT[e.kind][lang]}</span>
                <span className="shrink-0 text-[13px] text-ink-3 tabular">
                  {e.p_occurred > 0.5 ? "●" : e.t10 != null ? `${clock(payload.time, e.t10)}–${clock(payload.time, e.t90 ?? e.t10)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-[16px] font-bold">{T.todo[lang]}</h2>
        <ul className="mt-2 space-y-2">
          {advice.map((k) => (
            <li key={k} className="rounded-sm border-l-[3px] border-ink bg-paper-raised px-3 py-2.5 text-[15.5px] leading-snug">
              {ADVICE[k][lang]}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        {hospital ? (
          <div className="flex items-start gap-3 rounded-sm border border-rule bg-paper-raised p-3">
            <Cross size={20} className="mt-0.5 shrink-0" />
            <div>
              <div className="text-[12.5px] text-ink-3">{T.hospital[lang]}</div>
              <div className="text-[15.5px] font-semibold">{hospital.a.name}</div>
              <div className="text-[13px] text-ink-3 tabular">
                {hospital.d.toFixed(1)} {T.away[lang]}
              </div>
            </div>
          </div>
        ) : null}
        {shelter ? (
          <div className="flex items-start gap-3 rounded-sm border border-rule bg-paper-raised p-3">
            <Building2 size={20} className="mt-0.5 shrink-0" />
            <div>
              <div className="text-[12.5px] text-ink-3">{T.shelter[lang]}</div>
              <div className="text-[15.5px] font-semibold">{shelter.a.name}</div>
              <div className="text-[13px] text-ink-3 tabular">
                {shelter.d.toFixed(1)} {T.away[lang]}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <ReportForm lang={lang} zone={zone.id} />
    </div>
  );
}

function ReportForm({ lang, zone }: { lang: Lang; zone: string }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [cred, setCred] = useState<number | null>(null);
  const send = async () => {
    if (!text.trim()) return;
    setState("sending");
    try {
      const r = await fetch(`${ENGINE}/api/report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ zone, text, lang }) });
      const d = await r.json();
      setCred(d.credibility ?? null);
    } catch {
      setCred(null);
    }
    setState("sent");
    setText("");
  };
  return (
    <section>
      <h2 className="text-[16px] font-bold">{T.report[lang]}</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={T.reportHint[lang]}
        rows={3}
        className="mt-2 w-full rounded-sm border border-ink bg-paper-raised p-3 text-[16px] outline-none"
      />
      <button
        onClick={send}
        disabled={state === "sending" || !text.trim()}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-sm bg-ink px-3 py-3 text-[16px] font-semibold text-paper-raised disabled:opacity-40"
      >
        {state === "sending" ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} {T.send[lang]}
      </button>
      {state === "sent" ? (
        <p className="mt-2 text-[14px] text-ink-2">
          {T.thanks[lang]}
          {cred != null ? <span className="ml-1 text-ink-3 tabular">({Math.round(cred * 100)}%)</span> : null}
        </p>
      ) : null}
    </section>
  );
}
